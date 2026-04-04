'use client'

/**
 * Exibição de roteiro gerado em acordeão de blocos com scores e badges.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface BlocoData {
  id: string
  tipo: string
  ordem: number
  duracao_segundos: number
  texto: string
  tom: string
  direcao_camera: string
  enfase: string[]
  pausa_antes: boolean
  pausa_depois: boolean
  notas: string
  marcadores_acao: string[]
}

interface ScoresData {
  autenticidade: number
  estrutura: number
  potencial_viral: number
  adequacao_produto: number
  score_final: number
}

interface RevisaoData {
  scores: ScoresData
  pontos_fortes: string[]
  pontos_fracos: string[]
}

interface Props {
  roteiro: Record<string, unknown>
  revisao: Record<string, unknown> | null
  coldStart: Record<string, unknown>
  status: string
  mensagem: string
  roteiroId: string | null
}

const TIPO_COLORS: Record<string, string> = {
  hook: 'bg-purple-600',
  problema: 'bg-red-500',
  apresentacao_produto: 'bg-blue-600',
  demonstracao: 'bg-cyan-600',
  prova_social: 'bg-green-600',
  revelacao_preco: 'bg-amber-600',
  cta_engajamento: 'bg-orange-500',
  cta_compra: 'bg-orange-600',
  humor: 'bg-pink-500',
  comparacao: 'bg-indigo-500',
  transformacao: 'bg-emerald-600',
}

const TIPO_LABELS: Record<string, string> = {
  hook: 'Hook',
  problema: 'Problema',
  apresentacao_produto: 'Apresentação',
  demonstracao: 'Demonstração',
  prova_social: 'Prova Social',
  revelacao_preco: 'Preço',
  cta_engajamento: 'CTA Engajamento',
  cta_compra: 'CTA Compra',
  humor: 'Humor',
  comparacao: 'Comparação',
  transformacao: 'Transformação',
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'aprovado': return <Badge className="text-xs bg-green-600 hover:bg-green-600">Aprovado</Badge>
    case 'revisado': return <Badge variant="secondary" className="text-xs">Revisado</Badge>
    case 'melhor_disponivel': return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">Confiança baixa</Badge>
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
}

function ContextoBadge({ nivel }: { nivel: string }) {
  switch (nivel) {
    case 'cold_start': return <Badge variant="destructive" className="text-xs">Cold Start</Badge>
    case 'aprendizado': return <Badge variant="secondary" className="text-xs">Confiança Moderada</Badge>
    default: return null
  }
}

export function RoteiroViewer({ roteiro, revisao, coldStart, status, mensagem, roteiroId }: Props) {
  const [expandedBloco, setExpandedBloco] = useState<string | null>(null)

  const blocos = (roteiro.blocos as BlocoData[]) ?? []
  const rev = revisao as RevisaoData | null
  const scores = rev?.scores
  const duracaoTotal = (roteiro.duracao_total_calculada as number) ?? 0

  return (
    <div className="space-y-4">
      {/* Header com scores */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Roteiro Gerado</CardTitle>
              <StatusBadge status={status} />
              <ContextoBadge nivel={(coldStart?.nivel as string) ?? 'operacional'} />
            </div>
            <span className="text-xs text-muted-foreground">
              {duracaoTotal}s · {blocos.length} blocos
            </span>
          </div>
        </CardHeader>
        {scores && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-2 mb-3">
              <ScoreItem label="Geral" value={scores.score_final} />
              <ScoreItem label="Autenticidade" value={scores.autenticidade} />
              <ScoreItem label="Estrutura" value={scores.estrutura} />
              <ScoreItem label="Viral" value={scores.potencial_viral} />
              <ScoreItem label="Produto" value={scores.adequacao_produto} />
            </div>

            {rev?.pontos_fortes && rev.pontos_fortes.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="text-green-600 font-medium">Pontos fortes: </span>
                {rev.pontos_fortes.join(' · ')}
              </div>
            )}
            {rev?.pontos_fracos && rev.pontos_fracos.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                <span className="text-red-500 font-medium">Pontos fracos: </span>
                {rev.pontos_fracos.join(' · ')}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Blocos em acordeão */}
      <div className="space-y-2">
        {blocos.map((bloco) => (
          <BlocoCard
            key={bloco.id}
            bloco={bloco}
            expanded={expandedBloco === bloco.id}
            onToggle={() => setExpandedBloco(expandedBloco === bloco.id ? null : bloco.id)}
          />
        ))}
      </div>

      {/* Mensagem */}
      {mensagem && (
        <p className="text-xs text-muted-foreground">{mensagem}</p>
      )}
    </div>
  )
}

function ScoreItem({ label, value }: { label: string; value: number }) {
  const color = value >= 7 ? 'text-green-600' : value >= 5 ? 'text-yellow-600' : 'text-red-500'
  return (
    <div className="text-center">
      <p className={`text-lg font-semibold ${color}`}>{value.toFixed(1)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function BlocoCard({
  bloco,
  expanded,
  onToggle,
}: {
  bloco: BlocoData
  expanded: boolean
  onToggle: () => void
}) {
  const badgeColor = TIPO_COLORS[bloco.tipo] ?? 'bg-gray-500'
  const label = TIPO_LABELS[bloco.tipo] ?? bloco.tipo

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${badgeColor} hover:${badgeColor}`}>{label}</Badge>
          <span className="text-sm truncate max-w-[400px]">
            {bloco.texto.slice(0, 80)}{bloco.texto.length > 80 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{bloco.duracao_segundos}s</span>
          <span className="text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t">
          {/* Texto completo */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Texto</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{bloco.texto}</p>
          </div>

          {/* Detalhes em grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-medium text-muted-foreground">Tom</p>
              <p>{bloco.tom}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Direção de câmera</p>
              <p>{bloco.direcao_camera}</p>
            </div>
            {bloco.enfase.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Ênfases</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {bloco.enfase.map((e, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-normal">{e}</Badge>
                  ))}
                </div>
              </div>
            )}
            {bloco.marcadores_acao.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Ações</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {bloco.marcadores_acao.map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-mono">{m}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          {bloco.notas && (
            <div className="text-xs bg-muted/30 rounded p-2">
              <span className="font-medium">Notas de performance: </span>
              {bloco.notas}
            </div>
          )}

          {/* Indicadores de pausa */}
          {(bloco.pausa_antes || bloco.pausa_depois) && (
            <div className="flex gap-2">
              {bloco.pausa_antes && <Badge variant="outline" className="text-xs">⏸ Pausa antes</Badge>}
              {bloco.pausa_depois && <Badge variant="outline" className="text-xs">⏸ Pausa depois</Badge>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
