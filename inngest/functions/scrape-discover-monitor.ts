/**
 * Job: scrape.discover.monitor
 * Coleta incremental de novos vídeos para todos os influenciadores ativos.
 * Disparado pelo Inngest Cron a cada hora.
 *
 * Referência: Seção 7 (Modo Monitoramento) do Master Plan v3.0
 *
 * Comportamento diferenciado do modo inicial:
 * - Máximo 20 posições de scroll
 * - Para ao encontrar `tiktok_video_id` já existente no banco
 * - Atualiza métricas de vídeos existentes SEM re-download
 * - Nunca re-baixa vídeos já processados
 * - Dispara `viral/detect` para vídeos com métricas atualizadas
 */

import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

// Imports de scraper são lazy para evitar bundling de playwright no Vercel

export const scrapeDiscoverMonitor = inngest.createFunction(
  {
    id: 'scrape-discover-monitor',
    name: 'Scrape: Monitoramento Contínuo',
    retries: 1,
    concurrency: {
      limit: 2, // Máximo 2 sessões simultâneas (Seção 5 Vetor 4)
    },
    triggers: [{ cron: '0 * * * *' }], // A cada hora
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

    // -----------------------------------------------------------------------
    // 2. Processar cada influenciador sequencialmente para respeitar o
    //    limite de 2 sessões simultâneas (cron roda um job por vez)
    // -----------------------------------------------------------------------
    const results = []

    for (const influencer of influencers) {
      const result = await step.run(
        `monitor-${influencer.id}`,
        async () => {
          const knownIdsResult = await supabaseAdmin
            .from('videos')
            .select('tiktok_video_id')
            .eq('influencer_id', influencer.id)

          const knownIds = new Set(
            (knownIdsResult.data || []).map((v: { tiktok_video_id: string }) => v.tiktok_video_id)
          )

          const { launchBrowser, saveProfileState, selectProfile, getProxyConfig } = await import('@/lib/scraper/browser')
          const { scrapeTikTokProfile } = await import('@/lib/scraper/tiktok-scraper')

          const proxyConfig = await getProxyConfig()
          const profileId = selectProfile(influencer.id)
          const { browser, context } = await launchBrowser(profileId, proxyConfig)

          let newVideosCount = 0
          let captchaDetected = false

          try {
            const scrapeResult = await scrapeTikTokProfile(
              context as any,
              influencer.tiktok_handle,
              {
                max_videos: 50, // Monitoramento coleta no máximo 50 novos vídeos por hora
                known_video_ids: knownIds,
                mode: 'monitor',
              }
            )

            captchaDetected = scrapeResult.captcha_detected

            if (scrapeResult.captcha_detected) {
              // Inserir alerta de CAPTCHA
              await supabaseAdmin.from('captcha_alerts').insert({
                influencer_id: influencer.id,
                status: 'aguardando',
                estado_salvo: {
                  modo: 'monitor',
                  handle: influencer.tiktok_handle,
                },
              })
            } else {
              // Inserir novos vídeos
              const newVideos = scrapeResult.videos.filter(
                (v) => !knownIds.has(v.tiktok_video_id)
              )

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

                // Disparar download para novos vídeos
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
              // Seção 7: "Para vídeos existentes: atualizar métricas sem re-download"
              const existingInFeed = scrapeResult.videos.filter((v) =>
                knownIds.has(v.tiktok_video_id)
              )

              for (const v of existingInFeed) {
                if (v.views > 0) {
                  // Dispara metrics.update para recalcular viral_score
                  await inngest.send({
                    name: 'metrics/update' as const,
                    data: {
                      video_id: v.tiktok_video_id, // será resolvido para UUID no job
                      influencer_id: influencer.id,
                      views: v.views,
                      // likes/comments/shares/saves: 0 (não visíveis no feed)
                      // O job metrics.update pode enriquecer com dados adicionais
                      likes: 0,
                      comments: 0,
                      shares: 0,
                      saves: 0,
                    },
                  })
                }
              }

              // Atualizar timestamp de último scraping
              await supabaseAdmin
                .from('influenciadores')
                .update({ ultimo_scraping_at: new Date().toISOString() })
                .eq('id', influencer.id)
            }

            await saveProfileState(context as any, profileId)
          } finally {
            await browser.close()
          }

          return { influencer_id: influencer.id, new_videos: newVideosCount, captcha: captchaDetected }
        }
      )

      results.push(result)
    }

    return { processed: influencers.length, results }
  }
)
