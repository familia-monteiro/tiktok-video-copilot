/**
 * Página de detalhe do influenciador.
 * Exibe métricas, painel de conhecimento, vídeos e log de atividade.
 * Referência: Seção 31 do Master Plan v3.0
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PainelConhecimento } from '@/components/dashboard/painel-conhecimento'
import { PipelineStatusBadge } from '@/components/dashboard/pipeline-status'
import { InfluenciadorVideos } from '@/components/dashboard/influenciador-videos'
import { PipelineMonitor } from '@/components/dashboard/pipeline-monitor'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function InfluenciadorPage({ params }: Props) {
  const { id } = await params

  const { data: influencer } = await supabaseAdmin
    .from('influenciadores')
    .select('*')
    .eq('id', id)
    .single()

  if (!influencer) notFound()

  // Contagens de vídeos por status
  const { data: contagens } = await supabaseAdmin
    .from('videos')
    .select('status')
    .eq('influencer_id', id)

  const contagemMap: Record<string, number> = {}
  for (const v of contagens ?? []) {
    contagemMap[v.status] = (contagemMap[v.status] ?? 0) + 1
  }
  const totalVideos = contagens?.length ?? 0
  const analisados = contagemMap['analisado'] ?? 0
  const transcritos = contagemMap['transcrito'] ?? 0
  const virais = Object.values(contagemMap).reduce((a, b) => a + b, 0) // will recompute below

  // Contagem de virais
  const { count: totalVirais } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .eq('influencer_id', id)
    .eq('is_viral', true)

  const nivel = influencer.nivel_conhecimento_ia ?? 0

  return (
    <div className="p-8 max-w-6xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/influenciadores" className="hover:text-foreground transition-colors">
          Influenciadores
        </Link>
        <span>/</span>
        <span className="text-foreground">@{influencer.tiktok_handle}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {influencer.avatar_url ? (
            <img
              src={influencer.avatar_url}
              alt={influencer.tiktok_handle}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-bold">
              {influencer.tiktok_handle.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">@{influencer.tiktok_handle}</h1>
            {influencer.nome && (
              <p className="text-sm text-muted-foreground">{influencer.nome}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <PipelineStatusBadge
                influencerId={id}
                initialStatus={influencer.status_pipeline ?? 'pendente'}
              />
              {influencer.modo_atual && (
                <Badge variant="outline" className="text-xs">{influencer.modo_atual}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          {influencer.seguidores ? (
            <p>{formatNum(influencer.seguidores)} seguidores</p>
          ) : null}
          {influencer.ultimo_scraping_at ? (
            <p>Último scraping: {new Date(influencer.ultimo_scraping_at).toLocaleDateString('pt-BR')}</p>
          ) : null}
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total de vídeos" value={totalVideos} />
        <MetricCard label="Analisados" value={analisados} highlight />
        <MetricCard label="Transcritos" value={transcritos} />
        <MetricCard label="Virais" value={totalVirais ?? 0} />
      </div>

      {/* Monitor em tempo real */}
      <PipelineMonitor influencer={influencer} />

      {/* Painel de Conhecimento */}
      <PainelConhecimento
        influencerId={id}
        nivelConhecimento={nivel}
        scoreCobertura={(influencer.score_cobertura ?? 0) * 100}
        scoreDiversidade={(influencer.score_diversidade ?? 0) * 100}
        scoreConfianca={(influencer.score_confianca ?? 0) * 100}
      />

      {/* Vídeos */}
      <InfluenciadorVideos influencerId={id} />
    </div>
  )
}

function MetricCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/30' : ''}>
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
