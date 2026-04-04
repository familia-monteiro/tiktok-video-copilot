import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Job: cost.aggregate
 * Agrega uso de tokens do dia anterior em custo_diario.
 * Cron: todos os dias às 3h (UTC).
 * Referência: Seção 33 do Master Plan v3.0
 */
export const costAggregate = inngest.createFunction(
  {
    id: 'cost-aggregate',
    name: 'Custo: Agregação Diária de Tokens',
    retries: 2,
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    const resultado = await step.run('agregar-custo', async () => {
      // Dia anterior em UTC
      const ontem = new Date()
      ontem.setUTCDate(ontem.getUTCDate() - 1)
      const dataStr = ontem.toISOString().slice(0, 10) // YYYY-MM-DD

      const inicioDia = `${dataStr}T00:00:00Z`
      const fimDia = `${dataStr}T23:59:59.999Z`

      // Carregar todos os registros de uso do dia anterior
      const { data: registros, error } = await supabaseAdmin
        .from('uso_tokens')
        .select('operacao, modelo, tokens_input, tokens_output, custo_estimado_usd')
        .gte('criado_em', inicioDia)
        .lte('criado_em', fimDia)

      if (error) throw new Error(`Erro ao carregar uso_tokens: ${error.message}`)
      if (!registros || registros.length === 0) {
        return { data: dataStr, agregados: 0, custo_total_usd: 0 }
      }

      // Agrupar por operacao + modelo
      const grupos: Record<string, {
        total_chamadas: number
        total_tokens_input: number
        total_tokens_output: number
        custo_total_usd: number
      }> = {}

      for (const r of registros) {
        const chave = `${r.operacao ?? 'desconhecido'}||${r.modelo ?? 'desconhecido'}`
        if (!grupos[chave]) {
          grupos[chave] = { total_chamadas: 0, total_tokens_input: 0, total_tokens_output: 0, custo_total_usd: 0 }
        }
        grupos[chave].total_chamadas += 1
        grupos[chave].total_tokens_input += r.tokens_input ?? 0
        grupos[chave].total_tokens_output += r.tokens_output ?? 0
        grupos[chave].custo_total_usd += r.custo_estimado_usd ?? 0
      }

      // Fazer upsert em custo_diario
      const linhas = Object.entries(grupos).map(([chave, stats]) => {
        const [operacao, modelo] = chave.split('||')
        return {
          data: dataStr,
          operacao,
          modelo,
          ...stats,
        }
      })

      const { error: upsertError } = await supabaseAdmin
        .from('custo_diario')
        .upsert(linhas, { onConflict: 'data,operacao,modelo' })

      if (upsertError) throw new Error(`Erro ao salvar custo_diario: ${upsertError.message}`)

      const custoTotal = linhas.reduce((acc, l) => acc + l.custo_total_usd, 0)
      return { data: dataStr, agregados: linhas.length, custo_total_usd: custoTotal }
    })

    return resultado
  }
)
