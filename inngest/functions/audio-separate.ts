/**
 * Job: audio.separate
 * Delega separação vocal ao Worker Python no Railway via HTTP POST.
 * Aguarda callback assíncrono via /api/internal/audio-complete.
 *
 * Referência: Seção 9 do Master Plan v3.0
 *
 * Fluxo:
 * 1. Buscar video_id no banco para obter storage_path do .mp4
 * 2. POST para RAILWAY_WORKER_URL/process com video_id e storage_path
 * 3. Worker processa (Demucs + FFmpeg) e chama de volta /api/internal/audio-complete
 * 4. O endpoint audio-complete dispara o evento 'audio/transcribe'
 *
 * Nota: este job NÃO aguarda o callback via step.waitForEvent porque o
 * worker chama diretamente o endpoint de callback, que então dispara o
 * próximo evento. O job apenas garante que o request chegou ao worker.
 */

import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getConfig } from '@/lib/config/get-config'

export const audioSeparate = inngest.createFunction(
  {
    id: 'audio-separate',
    name: 'Audio: Separação Vocal (Demucs)',
    retries: 2,
    triggers: [{ event: 'audio/separate' }],
  },
  async ({ event, step }) => {
    const { video_id } = event.data as { video_id: string }

    // Buscar dados do vídeo para montar o storage_path
    const video = await step.run('load-video', async () => {
      const { data, error } = await supabaseAdmin
        .from('videos')
        .select('id, influencer_id, tiktok_video_id, status')
        .eq('id', video_id)
        .single()

      if (error || !data) throw new Error(`Vídeo não encontrado: ${video_id}`)
      if (data.status !== 'baixado') {
        throw new Error(`Vídeo ${video_id} não está no status 'baixado' (status: ${data.status})`)
      }

      return data
    })

    const storageVideoPath = `${video.influencer_id}/${video.tiktok_video_id}.mp4`

    // Enviar para o Worker Railway
    await step.run('dispatch-to-worker', async () => {
      const [workerUrl, workerSecret] = await Promise.all([
        getConfig('railway_worker_url'),
        getConfig('railway_worker_secret'),
      ])

      if (!workerUrl || !workerSecret) {
        throw new Error('Railway Worker URL ou Secret não configurados. Configure no painel de Configurações.')
      }

      const response = await fetch(`${workerUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': workerSecret,
        },
        body: JSON.stringify({
          video_id,
          storage_path: storageVideoPath,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Worker respondeu ${response.status}: ${body}`)
      }

      // Atualizar status — processamento iniciado no worker
      await supabaseAdmin
        .from('videos')
        .update({ atualizado_em: new Date().toISOString() })
        .eq('id', video_id)
    })

    return { video_id, dispatched: true }
  }
)
