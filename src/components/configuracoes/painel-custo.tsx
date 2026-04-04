'use client'

/**
 * Painel de monitoramento de custo de tokens.
 * Mostra custo dos últimos 7 dias por operação/modelo.
 * Referência: Seção 33 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'

interface CustoDia {
  data: string
  operacao: string
  modelo: string
  total_chamadas: number
  total_tokens_input: number
  total_tokens_output: number
  custo_total_usd: number
}

interface ResumoHoje {
  operacao: string
  total_chamadas: number
  tokens_input: number
  tokens_output: number
  custo_usd: number
}

export function PainelCusto() {
  const [custoHoje, setCustoHoje] = useState<ResumoHoje[]>([])
  const [custo7Dias, setCusto7Dias] = useState<number>(0)
  const [totalTokens7Dias, setTotalTokens7Dias] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const hoje = new Date().toISOString().slice(0, 10)
      const limite7dias = new Date()
      limite7dias.setDate(limite7dias.getDate() - 7)
      const limite7diasStr = limite7dias.toISOString().slice(0, 10)

      // Registros de hoje (direto da uso_tokens)
      const { data: hojeData } = await supabase
        .from('uso_tokens')
        .select('operacao, modelo, tokens_input, tokens_output, custo_estimado_usd')
        .gte('criado_em', `${hoje}T00:00:00Z`)

      if (hojeData) {
        const grupos: Record<string, ResumoHoje> = {}
        for (const r of hojeData) {
          const op = r.operacao ?? 'outros'
          if (!grupos[op]) grupos[op] = { operacao: op, total_chamadas: 0, tokens_input: 0, tokens_output: 0, custo_usd: 0 }
          grupos[op].total_chamadas += 1
          grupos[op].tokens_input += r.tokens_input ?? 0
          grupos[op].tokens_output += r.tokens_output ?? 0
          grupos[op].custo_usd += r.custo_estimado_usd ?? 0
        }
        setCustoHoje(Object.values(grupos).sort((a, b) => b.custo_usd - a.custo_usd))
      }

      // Últimos 7 dias agregados
      const { data: dias7Data } = await supabase
        .from('custo_diario')
        .select('custo_total_usd, total_tokens_input, total_tokens_output')
        .gte('data', limite7diasStr) as { data: CustoDia[] | null }

      if (dias7Data) {
        const totalUsd = dias7Data.reduce((acc, d) => acc + d.custo_total_usd, 0)
        const totalTok = dias7Data.reduce((acc, d) => acc + d.total_tokens_input + d.total_tokens_output, 0)
        setCusto7Dias(totalUsd)
        setTotalTokens7Dias(totalTok)
      }

      setLoading(false)
    }

    load()
  }, [])

  const totalHojeUsd = custoHoje.reduce((acc, r) => acc + r.custo_usd, 0)
  const totalHojeTokens = custoHoje.reduce((acc, r) => acc + r.tokens_input + r.tokens_output, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Monitoramento de Custo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : (
          <>
            {/* Resumo 7 dias */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                <p className="text-lg font-semibold mt-0.5">${custo7Dias.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">{(totalTokens7Dias / 1000).toFixed(1)}K tokens</p>
              </div>
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Hoje</p>
                <p className="text-lg font-semibold mt-0.5">${totalHojeUsd.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">{(totalHojeTokens / 1000).toFixed(1)}K tokens</p>
              </div>
            </div>

            {/* Breakdown por operação hoje */}
            {custoHoje.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Breakdown hoje por operação</p>
                <div className="space-y-1">
                  {custoHoje.map((r) => (
                    <div key={r.operacao} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{r.operacao}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{r.total_chamadas}×</span>
                        <span className="font-medium">${r.custo_usd.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {custoHoje.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum uso de tokens hoje.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
