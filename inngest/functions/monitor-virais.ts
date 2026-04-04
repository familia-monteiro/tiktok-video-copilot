import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Job: monitor-virais (cron a cada hora)
 * Recalcula viral_score para vídeos com métricas atualizadas recentemente.
 * Dispara viral/detect para cada vídeo que precisa recalcular.
 * Referência: Seção 26, 30 do Master Plan v3.0
 */
export const monitorVirais = inngest.createFunction(
  {
    id: 'monitor-virais',
    name: 'Monitor: Recalcular Viral Scores',
    retries: 1,
    triggers: [{ cron: '30 * * * *' }], // Meia hora de cada hora (não sobrepor com scrape-monitor)
  },
  async ({ step }) => {
    // Buscar vídeos com métricas atualizadas na última hora
    const umAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const videos = await step.run('buscar-videos-atualizados', async () => {
      const { data, error } = await supabaseAdmin
        .from('videos')
        .select('id, influencer_id')
        .gte('metricas_atualizadas_em', umAtras)
        .gt('views', 0)

      if (error) throw error
      return data ?? []
    })

    if (videos.length === 0) return { processados: 0 }

    // Disparar detecção viral para cada vídeo
    await step.run('disparar-deteccoes', async () => {
      const events = videos.map((v) => ({
        name: 'viral/detect' as const,
        data: { video_id: v.id, influencer_id: v.influencer_id },
      }))

      // Inngest aceita batch de eventos
      await inngest.send(events)
    })

    return { processados: videos.length }
  }
)
