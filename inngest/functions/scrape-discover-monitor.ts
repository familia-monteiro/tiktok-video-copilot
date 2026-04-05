/**
 * Job: scrape.discover.monitor
 * Coleta incremental de novos vídeos para todos os influenciadores ativos via worker VPS.
 * Disparado pelo Inngest Cron a cada hora.
 *
 * Referência: Seção 7 (Modo Monitoramento) do Master Plan v3.0
 *
 * Comportamento diferenciado do modo inicial:
 * - Máximo 50 vídeos por influenciador por hora
 * - Para ao encontrar tiktok_video_id já existente no banco
 * - Atualiza métricas de vídeos existentes SEM re-download
 * - Nunca re-baixa vídeos já processados
 * - Dispara metrics/update para vídeos com métricas atualizadas
 */

import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

type VideoMetadata = {
  tiktok_video_id: string
  url: string
  thumbnail_url: string
  views: number
  data_publicacao: string | null
}

type ScrapeBatchResult = {
  job_id: string
  influencer_id: string
  success: boolean
  videos: VideoMetadata[]
  page_state?: { scroll_position: number; last_video_id: string | null; has_more: boolean }
  captcha_detected: boolean
  error?: string
}

export const scrapeDiscoverMonitor = inngest.createFunction(
  {
    id: 'scrape-discover-monitor',
    name: 'Scrape: Monitoramento Contínuo',
    retries: 1,
    concurrency: {
      limit: 2,
    },
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    // -----------------------------------------------------------------------
    // 1. Buscar todos os influenciadores ativos para monitorar
    // -----------------------------------------------------------------------
    const influencers = await step.run('load-active-influencers', async () => {
      const { data, error } = await supabaseAdmin
        .from('influenciadores')
        .select('id, tiktok_handle, ultimo_scraping_at')
        .eq('status_pipeline', 'ativo')

      if (error) throw new Error(`Falha ao carregar influenciadores: ${error.message}`)
      return data || []
    })

    if (influencers.length === 0) return { message: 'Nenhum influenciador ativo' }

    const scraperUrl = process.env.SCRAPER_WORKER_URL ?? 'https://scraper.superapps.ai'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://roteiros.tiktok.superapps.ai'
    const callbackUrl = `${siteUrl}/api/internal/scrape-complete`

    // -----------------------------------------------------------------------
    // 2. Processar cada influenciador sequencialmente
    // -----------------------------------------------------------------------
    const results = []

    for (const influencer of influencers) {
      // Carregar IDs conhecidos para deduplicação
      const knownIdsArray = await step.run(`load-known-ids-${influencer.id}`, async () => {
        const { data } = await supabaseAdmin
          .from('videos')
          .select('tiktok_video_id')
          .eq('influencer_id', influencer.id)

        return (data || []).map((v: { tiktok_video_id: string }) => v.tiktok_video_id)
      })

      const knownIds = new Set(knownIdsArray)

      // Enviar requisição para o worker VPS
      const jobId = await step.run(`call-scraper-${influencer.id}`, async () => {
        const id = crypto.randomUUID()

        const res = await fetch(`${scraperUrl}/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': process.env.SCRAPER_WORKER_SECRET ?? '',
          },
          body: JSON.stringify({
            job_id: id,
            influencer_id: influencer.id,
            handle: influencer.tiktok_handle,
            mode: 'monitor',
            max_videos: 50,
            known_video_ids: Array.from(knownIds),
            callback_url: callbackUrl,
          }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Worker VPS retornou ${res.status}: ${text}`)
        }

        return id
      })

      // Aguardar callback assíncrono do worker VPS (máx 15 minutos)
      const batchEvent = await step.waitForEvent(`wait-scraper-${influencer.id}`, {
        event: 'scrape/batch.complete',
        timeout: '15m',
        if: `async.data.job_id == "${jobId}"`,
      })

      if (!batchEvent) {
        results.push({ influencer_id: influencer.id, error: 'timeout' })
        continue
      }

      const scrapeResult = batchEvent.data as ScrapeBatchResult

      if (scrapeResult.captcha_detected) {
        await step.run(`handle-captcha-${influencer.id}`, async () => {
          await supabaseAdmin.from('captcha_alerts').insert({
            influencer_id: influencer.id,
            status: 'aguardando',
            estado_salvo: {
              modo: 'monitor',
              handle: influencer.tiktok_handle,
            },
          })
        })

        results.push({ influencer_id: influencer.id, captcha: true })
        continue
      }

      if (!scrapeResult.success) {
        results.push({ influencer_id: influencer.id, error: scrapeResult.error ?? 'erro desconhecido' })
        continue
      }

      const result = await step.run(`process-results-${influencer.id}`, async () => {
        const newVideos = (scrapeResult.videos ?? []).filter(
          (v) => !knownIds.has(v.tiktok_video_id)
        )

        let newVideosCount = 0

        if (newVideos.length > 0) {
          const rows = newVideos.map((v) => ({
            influencer_id: influencer.id,
            tiktok_video_id: v.tiktok_video_id,
            url: v.url,
            thumbnail_url: v.thumbnail_url,
            views: v.views,
            data_publicacao: v.data_publicacao,
            status: 'aguardando',
          }))

          await supabaseAdmin
            .from('videos')
            .upsert(rows, { onConflict: 'influencer_id,tiktok_video_id', ignoreDuplicates: true })

          const { data: inserted } = await supabaseAdmin
            .from('videos')
            .select('id')
            .eq('influencer_id', influencer.id)
            .in('tiktok_video_id', newVideos.map((v) => v.tiktok_video_id))

          if (inserted && inserted.length > 0) {
            await inngest.send(
              inserted.map((v: { id: string }) => ({
                name: 'media/download.normal' as const,
                data: { video_id: v.id },
              }))
            )
          }

          newVideosCount = newVideos.length
        }

        // Atualizar métricas de vídeos existentes que apareceram no feed
        const existingInFeed = (scrapeResult.videos ?? []).filter((v) =>
          knownIds.has(v.tiktok_video_id)
        )

        for (const v of existingInFeed) {
          if (v.views > 0) {
            await inngest.send({
              name: 'metrics/update' as const,
              data: {
                video_id: v.tiktok_video_id,
                influencer_id: influencer.id,
                views: v.views,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
              },
            })
          }
        }

        await supabaseAdmin
          .from('influenciadores')
          .update({ ultimo_scraping_at: new Date().toISOString() })
          .eq('id', influencer.id)

        return { influencer_id: influencer.id, new_videos: newVideosCount, captcha: false }
      })

      results.push(result)
    }

    return { processed: influencers.length, results }
  }
)
