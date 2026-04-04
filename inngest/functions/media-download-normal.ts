/**
 * Job: media.download.normal
 * Download de vídeo via yt-dlp para vídeos normais (não virais).
 *
 * Referência: Seção 8 do Master Plan v3.0
 *
 * Regras:
 * - SEM proxy — download direto na CDN (Seção 6)
 * - Qualidade máxima 720p
 * - Verificar integridade (tamanho > 0)
 * - Upload para Supabase Storage
 * - HTTP 404/410 → 'indisponivel' imediato, sem retry
 * - Ao concluir com sucesso: disparar evento 'audio/separate'
 *
 * Política de retry (Seção 30):
 *   Tentativa 1: imediata
 *   Tentativa 2: 2 min
 *   Tentativa 3: 8 min
 *   Tentativa 4: 32 min
 */

import { inngest } from '@/lib/inngest/client'
import { runDownloadPipeline } from '@/lib/scraper/download-pipeline'

export const mediaDownloadNormal = inngest.createFunction(
  {
    id: 'media-download-normal',
    name: 'Media: Download Normal',
    retries: 4,
    triggers: [{ event: 'media/download.normal' }],
  },
  async ({ event, step }) => {
    const { video_id } = event.data as { video_id: string }

    const result = await step.run('download-video', async () => {
      return runDownloadPipeline(video_id)
    })

    // Se download falhou (com erro — não indisponível), propagar para retry
    if (result.status === 'falha_download') {
      throw new Error(`Download falhou (tentativa ${result.tentativas}): ${result.erro}`)
    }

    // Se baixado com sucesso: disparar separação de áudio
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
