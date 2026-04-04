/**
 * Job: media.download.priority
 * Idêntico ao media.download.normal, mas com prioridade máxima na fila.
 * Usado para vídeos virais (viral_score >= 70).
 *
 * Referência: Seções 8, 26 do Master Plan v3.0
 * Seção 26: "manter duas filas separadas — media.download.priority e media.download.normal.
 *            Vídeos virais vão para priority, os demais para normal."
 */

import { inngest } from '@/lib/inngest/client'
import { runDownloadPipeline } from '@/lib/scraper/download-pipeline'

export const mediaDownloadPriority = inngest.createFunction(
  {
    id: 'media-download-priority',
    name: 'Media: Download Prioritário (Viral)',
    retries: 4,
    triggers: [{ event: 'media/download.priority' }],
  },
  async ({ event, step }) => {
    const { video_id } = event.data as { video_id: string }

    const result = await step.run('download-video-priority', async () => {
      return runDownloadPipeline(video_id)
    })

    if (result.status === 'falha_download') {
      throw new Error(`Download prioritário falhou (tentativa ${result.tentativas}): ${result.erro}`)
    }

    if (result.status === 'baixado') {
      await step.run('dispatch-audio-separate', async () => {
        await inngest.send({
          name: 'audio/separate',
          data: { video_id },
        })
      })
    }

    return result
  }
)
