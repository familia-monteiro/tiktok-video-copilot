import { inngest } from '@/lib/inngest/client'

/**
 * Job: metrics.update
 * Atualiza métricas de engajamento (views, likes, etc.) para vídeos existentes.
 * Disparado pelo scraper de monitoramento.
 * Referência: Seção 7 do Master Plan.
 */
export const metricsUpdate = inngest.createFunction(
  {
    id: 'metrics-update',
    name: 'Métricas: Atualizar Engajamento',
    retries: 2,
    triggers: [{ event: 'metrics/update' }],
  },
  async ({ event, step }) => {
    // Implementação: Entrega 1.6
    const { video_id, views, likes, comments, shares, saves } = event.data as {
      video_id: string
      views: number
      likes: number
      comments: number
      shares: number
      saves: number
    }
    void video_id, views, likes, comments, shares, saves, step
    throw new Error('Não implementado — ver Entrega 1.6')
  }
)
