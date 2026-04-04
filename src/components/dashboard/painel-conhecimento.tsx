'use client'

/**
 * Painel de Conhecimento — barras por dimensão, badges de confiança, estimativa.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import type { MemoriaEstruturada, DimensaoMemoria } from '@/types/database'

interface PainelConhecimentoProps {
  influencerId: string
  nivelConhecimento: number // 0-1
  scoreCobertura: number
  scoreDiversidade: number
  scoreConfianca: number
}

const DIMENSAO_LABELS: Record<DimensaoMemoria, string> = {
  hooks: 'Hooks (Ganchos)',
  ctas: 'CTAs (Chamadas)',
  emocoes: 'Arco Emocional',
  vocabulario: 'Vocabulário',
  ritmo: 'Ritmo de Fala',
  produtos: 'Produtos',
  virais: 'Virais',
}

const NIVEL_LABELS: { range: [number, number]; label: string; color: string }[] = [
  { range: [0, 0.20], label: 'Iniciante', color: 'bg-red-500' },
  { range: [0.20, 0.40], label: 'Aprendendo', color: 'bg-orange-500' },
  { range: [0.40, 0.60], label: 'Conhece bem', color: 'bg-yellow-500' },
  { range: [0.60, 0.80], label: 'Expert', color: 'bg-green-500' },
  { range: [0.80, 1.01], label: 'Mestre', color: 'bg-emerald-600' },
]

function getNivelInfo(nivel: number) {
  return NIVEL_LABELS.find((n) => nivel >= n.range[0] && nivel < n.range[1]) ?? NIVEL_LABELS[0]
}

function ConfiancaBadge({ valor }: { valor: number }) {
  if (valor >= 0.8) return <Badge className="text-xs bg-green-600 hover:bg-green-600">Alta</Badge>
  if (valor >= 0.5) return <Badge variant="secondary" className="text-xs">Média</Badge>
  return <Badge variant="outline" className="text-xs">Baixa</Badge>
}

export function PainelConhecimento({
  influencerId,
  nivelConhecimento,
  scoreCobertura,
  scoreDiversidade,
  scoreConfianca,
}: PainelConhecimentoProps) {
  const [memorias, setMemorias] = useState<MemoriaEstruturada[]>([])
  const [nivel, setNivel] = useState(nivelConhecimento)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('memorias_estruturadas')
        .select('*')
        .eq('influencer_id', influencerId)

      if (data) setMemorias(data as MemoriaEstruturada[])
    }
    load()

    // Realtime para atualizações
    const channel = supabase
      .channel(`painel-conhecimento-${influencerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'influenciadores',
          filter: `id=eq.${influencerId}`,
        },
        (payload) => {
          const updated = payload.new as { nivel_conhecimento_ia: number }
          setNivel(updated.nivel_conhecimento_ia)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memorias_estruturadas',
          filter: `influencer_id=eq.${influencerId}`,
        },
        () => { load() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [influencerId])

  const nivelPercent = Math.round(nivel * 100)
  const nivelInfo = getNivelInfo(nivel)

  // Estimativa de vídeos necessários para próximo nível
  const proximoNivel = NIVEL_LABELS.find((n) => n.range[0] > nivel)
  const videosAnalisados = Math.max(...memorias.map((m) => m.total_videos_analisados), 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nível de Conhecimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score principal */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{nivelPercent}%</span>
              <Badge className={`text-xs ${nivelInfo.color} hover:${nivelInfo.color}`}>
                {nivelInfo.label}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {videosAnalisados} vídeos analisados
            </span>
          </div>
          <Progress value={nivelPercent} className="h-2" />
          {proximoNivel && (
            <p className="text-xs text-muted-foreground mt-1">
              Próximo nível: {proximoNivel.label} ({Math.round(proximoNivel.range[0] * 100)}%)
            </p>
          )}
        </div>

        {/* Breakdown dos scores */}
        <div className="grid grid-cols-3 gap-2">
          <ScoreCard label="Cobertura" valor={scoreCobertura} peso="40%" />
          <ScoreCard label="Diversidade" valor={scoreDiversidade} peso="30%" />
          <ScoreCard label="Confiança" valor={scoreConfianca} peso="30%" />
        </div>

        {/* Barras por dimensão */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Dimensões de análise</p>
          {(Object.keys(DIMENSAO_LABELS) as DimensaoMemoria[]).map((dim) => {
            const mem = memorias.find((m) => m.dimensao === dim)
            return (
              <DimensaoBar
                key={dim}
                label={DIMENSAO_LABELS[dim]}
                videos={mem?.total_videos_analisados ?? 0}
                confianca={mem?.confianca_atual ?? 0}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ScoreCard({ label, valor, peso }: { label: string; valor: number; peso: string }) {
  return (
    <div className="text-center p-2 rounded-md bg-muted/30">
      <p className="text-lg font-semibold leading-none">{Math.round(valor)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      <p className="text-xs text-muted-foreground/60">{peso}</p>
    </div>
  )
}

function DimensaoBar({
  label,
  videos,
  confianca,
}: {
  label: string
  videos: number
  confianca: number
}) {
  // Saturação: 20 vídeos = 100%
  const saturacao = Math.min(100, (videos / 20) * 100)

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-28 truncate">{label}</span>
      <div className="flex-1">
        <Progress value={saturacao} className="h-1.5" />
      </div>
      <span className="text-xs text-muted-foreground w-6 text-right">{videos}</span>
      <ConfiancaBadge valor={confianca} />
    </div>
  )
}
