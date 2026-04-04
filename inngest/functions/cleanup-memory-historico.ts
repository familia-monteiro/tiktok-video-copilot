import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Job: cleanup.memory_historico
 * Deleta snapshots de memória (memorias_historico) com mais de 7 dias.
 * Mantém sempre as 3 versões mais recentes por influenciador+dimensão.
 * Disparado domingo às 5h (UTC).
 * Referência: Seção 30, 33 do Master Plan v3.0
 */
export const cleanupMemoryHistorico = inngest.createFunction(
  {
    id: 'cleanup-memory-historico',
    name: 'Cleanup: Histórico de Memória (7 dias)',
    retries: 1,
    triggers: [{ cron: '0 5 * * 0' }],
  },
  async ({ step }) => {
    const resultado = await step.run('deletar-snapshots-antigos', async () => {
      const limite = new Date()
      limite.setDate(limite.getDate() - 7)
      const limiteStr = limite.toISOString()

      // Buscar combinações únicas de influencer_id + dimensao
      const { data: combinacoes, error: fetchError } = await supabaseAdmin
        .from('memorias_historico')
        .select('influencer_id, dimensao')
        .lt('criado_em', limiteStr)

      if (fetchError) throw new Error(`Erro ao buscar memorias_historico: ${fetchError.message}`)
      if (!combinacoes || combinacoes.length === 0) {
        return { deletados: 0, limite: limiteStr }
      }

      // Deduplicar combinações
      const unicas = new Map<string, { influencer_id: string; dimensao: string }>()
      for (const c of combinacoes) {
        unicas.set(`${c.influencer_id}|${c.dimensao}`, c)
      }

      let totalDeletados = 0

      for (const { influencer_id, dimensao } of unicas.values()) {
        // Buscar os 3 mais recentes desta combinação (manter)
        const { data: recentes } = await supabaseAdmin
          .from('memorias_historico')
          .select('id')
          .eq('influencer_id', influencer_id)
          .eq('dimensao', dimensao)
          .order('criado_em', { ascending: false })
          .limit(3)

        const idsParaManter = (recentes ?? []).map((r) => r.id)

        // Deletar os antigos (> 7 dias) exceto os 3 mais recentes
        let query = supabaseAdmin
          .from('memorias_historico')
          .delete()
          .eq('influencer_id', influencer_id)
          .eq('dimensao', dimensao)
          .lt('criado_em', limiteStr)

        if (idsParaManter.length > 0) {
          query = query.not('id', 'in', `(${idsParaManter.join(',')})`)
        }

        const { error: deleteError, count } = await query

        if (deleteError) {
          console.error(`Erro ao deletar snapshots de ${influencer_id}/${dimensao}: ${deleteError.message}`)
          continue
        }

        totalDeletados += count ?? 0
      }

      return { deletados: totalDeletados, limite: limiteStr }
    })

    return resultado
  }
)
