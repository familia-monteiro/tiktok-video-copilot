import { inngest } from '@/lib/inngest/client'
import { executarAnaliseCompleta } from '@/lib/agents/agent-diretor-analise'

/**
 * Job: agent.analyze
 * Dispara o Agente Diretor para análise completa de um vídeo.
 * Ao final: gera embeddings, recalcula Nível de Conhecimento, marca como 'analisado'.
 * Referência: Seção 15 do Master Plan v3.0
 */
export const agentAnalyze = inngest.createFunction(
  {
    id: 'agent-analyze',
    name: 'Agente: Análise Completa do Vídeo',
    retries: 2,
    triggers: [{ event: 'agent/analyze' }],
  },
  async ({ event, step }) => {
    const { video_id, influencer_id } = event.data as {
      video_id: string
      influencer_id: string
    }

    const resultado = await step.run('executar-analise-completa', async () => {
      return executarAnaliseCompleta(video_id, influencer_id)
    })

    return {
      video_id,
      influencer_id,
      ...resultado,
    }
  }
)
