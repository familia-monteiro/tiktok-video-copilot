import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Job: cleanup.briefings
 * Deleta briefings com mais de 30 dias.
 * Disparado domingo às 4h (UTC).
 * Referência: Seção 30, 33 do Master Plan v3.0
 */
export const cleanupBriefings = inngest.createFunction(
  {
    id: 'cleanup-briefings',
    name: 'Cleanup: Briefings Antigos (30 dias)',
    retries: 1,
    triggers: [{ cron: '0 4 * * 0' }],
  },
  async ({ step }) => {
    const resultado = await step.run('deletar-briefings-antigos', async () => {
      const limite = new Date()
      limite.setDate(limite.getDate() - 30)
      const limiteStr = limite.toISOString()

      // Contar antes de deletar
      const { count: total } = await supabaseAdmin
        .from('briefings')
        .select('*', { count: 'exact', head: true })
        .lt('criado_em', limiteStr)

      if (!total || total === 0) {
        return { deletados: 0, limite: limiteStr }
      }

      // Deletar em lotes de 100 para evitar timeout
      let deletados = 0
      let continuar = true

      while (continuar) {
        // Buscar IDs do lote
        const { data: lote, error: fetchError } = await supabaseAdmin
          .from('briefings')
          .select('id')
          .lt('criado_em', limiteStr)
          .limit(100)

        if (fetchError) throw new Error(`Erro ao buscar briefings: ${fetchError.message}`)
        if (!lote || lote.length === 0) { continuar = false; break }

        const ids = lote.map((b) => b.id)
        const { error: deleteError } = await supabaseAdmin
          .from('briefings')
          .delete()
          .in('id', ids)

        if (deleteError) throw new Error(`Erro ao deletar briefings: ${deleteError.message}`)

        deletados += lote.length
        if (lote.length < 100) continuar = false
      }

      return { deletados, limite: limiteStr }
    })

    return resultado
  }
)
