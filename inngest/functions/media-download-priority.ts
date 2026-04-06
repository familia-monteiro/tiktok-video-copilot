/**
 * Job: media.download.priority
 * Solicitamos à VPS o download prioritário de vídeo (virais).
 *
 * Referência: Seções 8, 26 do Master Plan v3.0
 */

import { inngest } from '@/lib/inngest/client'
import { requestDownloadOnVPS } from '@/lib/scraper/download-pipeline'
import { supabaseAdmin } from '@/lib/supabase/server'

export const mediaDownloadPriority = inngest.createFunction(
  {
    id: 'media-download-priority',
    name: 'Media: Download Prioritário (Viral)',
    retries: 4,
    triggers: [{ event: 'media/download.priority' }],
  },
  async ({ event, step }) => {
    const { video_id } = event.data as { video_id: string }

    const tentativas = await step.run('start-download-vps-priority', async () => {
      return requestDownloadOnVPS(video_id)
    })

    // Aguardar callback assíncrono da VPS (máx 15 minutos)
    const downloadEventPayload = await step.waitForEvent(`wait-priority-download-${video_id}`, {
      event: 'download.complete',
      timeout: '15m',
      if: `async.data.video_id == "${video_id}"`,
    })

    if (!downloadEventPayload) {
      const msg = `Timeout: VPS não enviou callback de download prioritário em 15min para o vídeo ${video_id}`
      await step.run('mark-timeout', async () => {
        await supabaseAdmin.from('videos').update({
          status: 'falha_download',
          erro_log: msg,
          atualizado_em: new Date().toISOString()
        }).eq('id', video_id)
      })
      throw new Error(msg)
    }

    const result = downloadEventPayload.data

    if (!result.success) {
      const msg = `Download prioritário falhou (tentativa ${tentativas}): ${result.error_message || 'erro desconhecido'}`
      await step.run('mark-error', async () => {
        await supabaseAdmin.from('videos').update({
          status: 'falha_download',
          erro_log: result.error_message,
          atualizado_em: new Date().toISOString()
        }).eq('id', video_id)
      })
      throw new Error(msg)
    }

    // Sucesso
    await step.run('mark-success', async () => {
      await supabaseAdmin.from('videos').update({
        status: 'baixado',
        erro_log: null,
        atualizado_em: new Date().toISOString()
      }).eq('id', video_id)
    })

    // Disparar separação de áudio
    await step.run('dispatch-audio-separate', async () => {
      await inngest.send({
        name: 'audio/separate',
        data: { video_id },
      })
    })

    return { status: 'baixado', tentativas }
  }
)
