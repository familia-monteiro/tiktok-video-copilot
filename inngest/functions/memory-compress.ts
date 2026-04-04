import { inngest } from '@/lib/inngest/client'

/**
 * Job: memory.compress
 * Verifica e executa compressão de dimensões que ultrapassaram os limites.
 * Disparado diariamente às 3h.
 * Referência: Seção 12 do Master Plan.
 */
export const memoryCompress = inngest.createFunction(
  {
    id: 'memory-compress',
    name: 'Memória: Compressão de Padrões',
    retries: 1,
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    // Implementação: Entrega 2.4
    void step
    throw new Error('Não implementado — ver Entrega 2.4')
  }
)
