/**
 * Job: scrape.discover.initial
 * Coleta histórica completa de um influenciador.
 *
 * Referência: Seções 4, 5, 6, 7 do Master Plan v3.0
 *
 * Comportamento:
 * - Playwright + playwright-extra + stealth + Proxy Decodo
 * - Comportamento humano sintético: delays distribuição normal, scroll bezier,
 *   fadiga após 20 ações, pausas periódicas (Seção 5 Vetor 3)
 * - Checkpoint a cada 50 vídeos no campo `checkpoint_scraping`
 * - Deduplicação por `tiktok_video_id`
 * - Máximo 500 vídeos por execução
 * - Detecção de CAPTCHA + insert em `captcha_alerts` + Supabase Realtime
 * - Ao concluir: dispara jobs `media.download.normal` para todos os novos vídeos
 */

import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

// Imports de scraper são lazy para evitar bundling de playwright no Vercel
// (esses módulos só rodam no worker da VPS via Inngest, nunca no serverless da Vercel)
type VideoMetadata = import('@/lib/scraper/tiktok-scraper').VideoMetadata

const MAX_VIDEOS_PER_RUN = 500   // Seção 7: limite de segurança
const CHECKPOINT_INTERVAL = 50  // Seção 7: checkpoint a cada 50 vídeos

export const scrapeDiscoverInitial = inngest.createFunction(
  {
    id: 'scrape-discover-initial',
    name: 'Scrape: Coleta Histórica Inicial',
    retries: 0, // Gerenciado internamente via checkpoint
    concurrency: {
      limit: 2, // Máximo 2 sessões simultâneas (Seção 5 Vetor 4)
    },
    triggers: [{ event: 'scrape/discover.initial' }],
  },
  async ({ event, step }) => {
    const { influencer_id } = event.data as { influencer_id: string }

    // -----------------------------------------------------------------------
    // 1. Carregar influenciador e checkpoint
    // -----------------------------------------------------------------------
    const influencer = await step.run('load-influencer', async () => {
      const { data, error } = await supabaseAdmin
        .from('influenciadores')
        .select('*')
        .eq('id', influencer_id)
        .single()

      if (error || !data) throw new Error(`Influenciador não encontrado: ${influencer_id}`)

      // Atualizar status para 'descobrindo'
      await supabaseAdmin
        .from('influenciadores')
        .update({ status_pipeline: 'descobrindo', modo_atual: 'inicial' })
        .eq('id', influencer_id)

      return data
    })

    // -----------------------------------------------------------------------
    // 2. Carregar IDs de vídeos já existentes no banco (para deduplicação)
    // step.run deve retornar dados serializáveis em JSON — usar array, não Set
    // -----------------------------------------------------------------------
    const existingIdsArray = await step.run('load-existing-ids', async (): Promise<string[]> => {
      const { data } = await supabaseAdmin
        .from('videos')
        .select('tiktok_video_id')
        .eq('influencer_id', influencer_id)

      return (data || []).map((v: { tiktok_video_id: string }) => v.tiktok_video_id)
    })

    // -----------------------------------------------------------------------
    // 3. Executar scraping em batches de CHECKPOINT_INTERVAL vídeos
    //    Cada step.run é uma invocação separada — tolerante a falhas
    // -----------------------------------------------------------------------
    const checkpoint = (influencer.checkpoint_scraping || {}) as Record<string, unknown>
    let totalCollected = 0
    let batchNumber = 0
    let hasMore = true
    let resumeScrollY: number = typeof checkpoint.posicao_scroll === 'number' ? checkpoint.posicao_scroll : 0
    let lastVideoId: string | null = typeof checkpoint.ultimo_video_id === 'string' ? checkpoint.ultimo_video_id : null
    const allKnownIds = new Set<string>(existingIdsArray)

    while (hasMore && totalCollected < MAX_VIDEOS_PER_RUN) {
      batchNumber++
      const batchResult = await step.run(`scrape-batch-${batchNumber}`, async () => {
        const { launchBrowser, saveProfileState, selectProfile, getProxyConfig } = await import('@/lib/scraper/browser')
        const { scrapeTikTokProfile } = await import('@/lib/scraper/tiktok-scraper')
        const { warmupProfile } = await import('@/lib/scraper/human-behavior')

        const proxyConfig = await getProxyConfig()
        const profileId = selectProfile(influencer_id)

        const { browser, context } = await launchBrowser(profileId, proxyConfig)

        try {
          // Aquecimento apenas para perfil novo (sem storage state)
          const isNewProfile = batchNumber === 1
          if (isNewProfile) {
            const page = await context.newPage()
            await warmupProfile(page as any)
            await page.close()
          }

          const result = await scrapeTikTokProfile(
            context as any,
            influencer.tiktok_handle,
            {
              max_videos: CHECKPOINT_INTERVAL,
              resume_scroll_y: resumeScrollY,
              known_video_ids: allKnownIds,
              mode: 'initial',
            }
          )

          // Salvar estado do perfil (cookies, localStorage)
          await saveProfileState(context as any, profileId)

          return result
        } finally {
          await browser.close()
        }
      })

      // -------------------------------------------------------------------
      // 3a. Tratar CAPTCHA
      // -------------------------------------------------------------------
      if (batchResult.captcha_detected) {
        await step.run('handle-captcha', async () => {
          // Salvar estado atual como checkpoint
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

          // Inserir alerta de CAPTCHA
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

          // Supabase Realtime dispara automaticamente para o frontend
        })

        // Pausar job — aguardar resolução manual do CAPTCHA
        // O operador deve resolver o CAPTCHA e re-disparar o evento
        throw new Error(
          `CAPTCHA detectado durante scraping de @${influencer.tiktok_handle}. ` +
          `Checkpoint salvo. Resolva o CAPTCHA no dashboard e o job retomará.`
        )
      }

      // -------------------------------------------------------------------
      // 3b. Inserir novos vídeos no banco e atualizar IDs conhecidos
      // -------------------------------------------------------------------
      const newVideos = batchResult.videos.filter(
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

          // Inserir com upsert — deduplicação garantida pela constraint UNIQUE
          const { error } = await supabaseAdmin
            .from('videos')
            .upsert(rows, { onConflict: 'influencer_id,tiktok_video_id', ignoreDuplicates: true })

          if (error) throw new Error(`Falha ao inserir vídeos: ${error.message}`)

          // Adicionar novos IDs ao conjunto de conhecidos
          for (const v of newVideos) allKnownIds.add(v.tiktok_video_id)

          return newVideos.length
        })
      }

      // -------------------------------------------------------------------
      // 3c. Salvar checkpoint a cada batch (a cada ~50 vídeos — Seção 7)
      // -------------------------------------------------------------------
      totalCollected += newVideos.length
      resumeScrollY = batchResult.page_state.scroll_position
      lastVideoId = batchResult.page_state.last_video_id
      hasMore = batchResult.page_state.has_more

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
      // 3d. Disparar jobs de download para os novos vídeos (em batch)
      //     Referência: Seção 7 — "disparar jobs de download para todos os novos vídeos"
      // -------------------------------------------------------------------
      if (newVideos.length > 0) {
        await step.run(`dispatch-downloads-batch-${batchNumber}`, async () => {
          // Buscar IDs dos vídeos recém inseridos
          const { data: insertedVideos } = await supabaseAdmin
            .from('videos')
            .select('id, tiktok_video_id')
            .eq('influencer_id', influencer_id)
            .in('tiktok_video_id', newVideos.map((v: VideoMetadata) => v.tiktok_video_id))

          if (!insertedVideos || insertedVideos.length === 0) return

          // Disparar evento de download para cada vídeo
          const events = insertedVideos.map((v: { id: string }) => ({
            name: 'media/download.normal' as const,
            data: { video_id: v.id },
          }))

          await inngest.send(events)
        })
      }
    }

    // -----------------------------------------------------------------------
    // 4. Finalizar: atualizar influenciador e limpar checkpoint
    // -----------------------------------------------------------------------
    await step.run('finalize', async () => {
      // Contar total de vídeos no banco
      const { count } = await supabaseAdmin
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('influencer_id', influencer_id)

      await supabaseAdmin
        .from('influenciadores')
        .update({
          status_pipeline: 'processando', // Agora aguarda transcrições
          modo_atual: 'monitoramento',    // Próximas execuções serão monitor
          ultimo_scraping_at: new Date().toISOString(),
          total_videos: count || 0,
          checkpoint_scraping: {},         // Limpar checkpoint
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
