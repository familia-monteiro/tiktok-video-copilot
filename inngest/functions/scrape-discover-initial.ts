/**
 * Job: scrape.discover.initial
 * Coleta histórica completa de um influenciador via worker VPS.
 *
 * Referência: Seções 4, 5, 6, 7 do Master Plan v3.0
 *
 * Fluxo:
 * 1. Envia requisição de scraping para o worker VPS (https://scraper.superapps.ai)
 * 2. Aguarda callback assíncrono via step.waitForEvent('scrape/batch.complete')
 * 3. Insere vídeos descobertos, salva checkpoint e dispara downloads
 * 4. Repete até esgotar vídeos ou atingir o limite de 500
 *
 * O worker VPS executa Playwright + playwright-extra + stealth + Proxy Decodo
 * com comportamento humano sintético conforme Seção 5 do Master Plan.
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

type PageState = {
  scroll_position: number
  last_video_id: string | null
  has_more: boolean
}

type ScrapeBatchResult = {
  job_id: string
  influencer_id: string
  success: boolean
  videos: VideoMetadata[]
  page_state?: PageState
  captcha_detected: boolean
  error?: string
}

const MAX_VIDEOS_PER_RUN = 500
const CHECKPOINT_INTERVAL = 50

export const scrapeDiscoverInitial = inngest.createFunction(
  {
    id: 'scrape-discover-initial',
    name: 'Scrape: Coleta Histórica Inicial',
    retries: 0,
    concurrency: {
      limit: 2,
    },
    triggers: [{ event: 'scrape/discover.initial' }],
  },
  async ({ event, step }) => {
    const { influencer_id } = event.data as { influencer_id: string }

    // -----------------------------------------------------------------------
    // 1. Carregar influenciador e atualizar status para 'descobrindo'
    // -----------------------------------------------------------------------
    const influencer = await step.run('load-influencer', async () => {
      const { data, error } = await supabaseAdmin
        .from('influenciadores')
        .select('*')
        .eq('id', influencer_id)
        .single()

      if (error || !data) throw new Error(`Influenciador não encontrado: ${influencer_id}`)

      await supabaseAdmin
        .from('influenciadores')
        .update({ status_pipeline: 'descobrindo', modo_atual: 'inicial' })
        .eq('id', influencer_id)

      return data
    })

    // -----------------------------------------------------------------------
    // 2. Carregar IDs já existentes para deduplicação
    // -----------------------------------------------------------------------
    const existingIdsArray = await step.run('load-existing-ids', async (): Promise<string[]> => {
      const { data } = await supabaseAdmin
        .from('videos')
        .select('tiktok_video_id')
        .eq('influencer_id', influencer_id)

      return (data || []).map((v: { tiktok_video_id: string }) => v.tiktok_video_id)
    })

    // -----------------------------------------------------------------------
    // 3. Executar scraping em batches via worker VPS
    // -----------------------------------------------------------------------
    const checkpoint = (influencer.checkpoint_scraping || {}) as Record<string, unknown>
    let totalCollected = 0
    let batchNumber = 0
    let hasMore = true
    let resumeScrollY: number = typeof checkpoint.posicao_scroll === 'number' ? checkpoint.posicao_scroll : 0
    let lastVideoId: string | null = typeof checkpoint.ultimo_video_id === 'string' ? checkpoint.ultimo_video_id : null
    const allKnownIds = new Set<string>(existingIdsArray)

    const scraperUrl = process.env.SCRAPER_WORKER_URL ?? 'https://scraper.superapps.ai'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://roteiros.tiktok.superapps.ai'
    const callbackUrl = `${siteUrl}/api/internal/scrape-complete`

    while (hasMore && totalCollected < MAX_VIDEOS_PER_RUN) {
      batchNumber++

      // Enviar requisição para o worker VPS e obter job_id
      const jobId = await step.run(`call-scraper-${batchNumber}`, async () => {
        const id = crypto.randomUUID()

        const res = await fetch(`${scraperUrl}/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': process.env.SCRAPER_WORKER_SECRET ?? '',
          },
          body: JSON.stringify({
            job_id: id,
            influencer_id,
            handle: influencer.tiktok_handle,
            mode: 'initial',
            max_videos: CHECKPOINT_INTERVAL,
            resume_scroll_y: resumeScrollY,
            known_video_ids: Array.from(allKnownIds),
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
      const batchEvent = await step.waitForEvent(`wait-scraper-${batchNumber}`, {
        event: 'scrape/batch.complete',
        timeout: '15m',
        if: `async.data.job_id == "${jobId}"`,
      })

      if (!batchEvent) {
        throw new Error(
          `Timeout: worker VPS não respondeu em 15min para batch ${batchNumber} ` +
          `de @${influencer.tiktok_handle}`
        )
      }

      const batchResult = batchEvent.data as ScrapeBatchResult

      // -------------------------------------------------------------------
      // 3a. Tratar CAPTCHA
      // -------------------------------------------------------------------
      if (batchResult.captcha_detected) {
        await step.run('handle-captcha', async () => {
          await supabaseAdmin
            .from('influenciadores')
            .update({
              checkpoint_scraping: {
                posicao_scroll: resumeScrollY,
                ultimo_video_id: lastVideoId,
                total_coletados: totalCollected,
              },
            })
            .eq('id', influencer_id)

          const { data: job } = await supabaseAdmin
            .from('jobs_pipeline')
            .select('id')
            .eq('influencer_id', influencer_id)
            .eq('etapa', 'scrape.discover.initial')
            .eq('status', 'processando')
            .maybeSingle()

          await supabaseAdmin
            .from('captcha_alerts')
            .insert({
              influencer_id,
              job_id: job?.id || null,
              status: 'aguardando',
              estado_salvo: {
                posicao_scroll: resumeScrollY,
                ultimo_video_id: lastVideoId,
                total_coletados: totalCollected,
                batch_number: batchNumber,
              },
            })
        })

        throw new Error(
          `CAPTCHA detectado durante scraping de @${influencer.tiktok_handle}. ` +
          `Checkpoint salvo. Resolva o CAPTCHA no dashboard e o job retomará.`
        )
      }

      if (!batchResult.success) {
        throw new Error(
          `Worker VPS reportou falha no batch ${batchNumber}: ${batchResult.error ?? 'erro desconhecido'}`
        )
      }

      // -------------------------------------------------------------------
      // 3b. Inserir novos vídeos
      // -------------------------------------------------------------------
      const newVideos = (batchResult.videos ?? []).filter(
        (v) => !allKnownIds.has(v.tiktok_video_id)
      )

      if (newVideos.length > 0) {
        await step.run(`insert-videos-batch-${batchNumber}`, async () => {
          const rows = newVideos.map((v: VideoMetadata) => ({
            influencer_id,
            tiktok_video_id: v.tiktok_video_id,
            url: v.url,
            thumbnail_url: v.thumbnail_url,
            views: v.views,
            data_publicacao: v.data_publicacao,
            status: 'aguardando',
          }))

          const { error } = await supabaseAdmin
            .from('videos')
            .upsert(rows, { onConflict: 'influencer_id,tiktok_video_id', ignoreDuplicates: true })

          if (error) throw new Error(`Falha ao inserir vídeos: ${error.message}`)

          for (const v of newVideos) allKnownIds.add(v.tiktok_video_id)

          return newVideos.length
        })
      }

      // -------------------------------------------------------------------
      // 3c. Atualizar estado e salvar checkpoint
      // -------------------------------------------------------------------
      totalCollected += newVideos.length

      const pageState = batchResult.page_state ?? {
        scroll_position: resumeScrollY,
        last_video_id: lastVideoId,
        has_more: false,
      }
      resumeScrollY = pageState.scroll_position
      lastVideoId = pageState.last_video_id
      hasMore = pageState.has_more

      await step.run(`checkpoint-batch-${batchNumber}`, async () => {
        await supabaseAdmin
          .from('influenciadores')
          .update({
            checkpoint_scraping: {
              posicao_scroll: resumeScrollY,
              ultimo_video_id: lastVideoId,
              total_coletados: totalCollected,
              batch_number: batchNumber,
            },
          })
          .eq('id', influencer_id)
      })

      // -------------------------------------------------------------------
      // 3d. Disparar downloads para os novos vídeos
      // -------------------------------------------------------------------
      if (newVideos.length > 0) {
        await step.run(`dispatch-downloads-batch-${batchNumber}`, async () => {
          const { data: insertedVideos } = await supabaseAdmin
            .from('videos')
            .select('id, tiktok_video_id')
            .eq('influencer_id', influencer_id)
            .in('tiktok_video_id', newVideos.map((v: VideoMetadata) => v.tiktok_video_id))

          if (!insertedVideos || insertedVideos.length === 0) return

          const events = insertedVideos.map((v: { id: string }) => ({
            name: 'media/download.normal' as const,
            data: { video_id: v.id },
          }))

          await inngest.send(events)
        })
      }
    }

    // -----------------------------------------------------------------------
    // 4. Finalizar
    // -----------------------------------------------------------------------
    await step.run('finalize', async () => {
      const { count } = await supabaseAdmin
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('influencer_id', influencer_id)

      await supabaseAdmin
        .from('influenciadores')
        .update({
          status_pipeline: 'processando',
          modo_atual: 'monitoramento',
          ultimo_scraping_at: new Date().toISOString(),
          total_videos: count || 0,
          checkpoint_scraping: {},
        })
        .eq('id', influencer_id)
    })

    return {
      influencer_id,
      total_collected: totalCollected,
      batches_run: batchNumber,
    }
  }
)
