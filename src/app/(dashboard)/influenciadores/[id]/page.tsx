/**
 * Página de detalhe do influenciador.
 * Exibe métricas, painel de conhecimento, pipeline monitor e vídeos.
 * Referência: Seção 31 do Master Plan v3.0
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users, Calendar, Brain, Video } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { PainelConhecimento } from '@/components/dashboard/painel-conhecimento'
import { PipelineStatusBadge } from '@/components/dashboard/pipeline-status'
import { InfluenciadorVideos } from '@/components/dashboard/influenciador-videos'
import { PipelineMonitor } from '@/components/dashboard/pipeline-monitor'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
]

function avatarColor(handle: string) {
  return AVATAR_COLORS[handle.charCodeAt(0) % AVATAR_COLORS.length]
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

  const { count: totalVirais } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .eq('influencer_id', id)
    .eq('is_viral', true)

  const nivel = influencer.nivel_conhecimento_ia ?? 0
  const handle = influencer.tiktok_handle

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/influenciadores"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Influenciadores
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {influencer.avatar_url ? (
          <img
            src={influencer.avatar_url}
            alt={handle}
            className="w-16 h-16 rounded-2xl object-cover shadow-sm shrink-0"
          />
        ) : (
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${avatarColor(handle)} flex items-center justify-center text-white text-2xl font-bold shadow-sm shrink-0`}>
            {handle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">@{handle}</h1>
              {influencer.nome && (
                <p className="text-sm text-muted-foreground mt-0.5">{influencer.nome}</p>
              )}
            </div>
            <PipelineStatusBadge
              influencerId={id}
              initialStatus={influencer.status_pipeline ?? 'pendente'}
            />
          </div>

          {/* Metadados */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {influencer.seguidores && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {formatNum(influencer.seguidores)} seguidores
              </span>
            )}
            {influencer.ultimo_scraping_at && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                Scraping: {new Date(influencer.ultimo_scraping_at).toLocaleDateString('pt-BR')}
              </span>
            )}
            {influencer.modo_atual && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Modo: {influencer.modo_atual}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickMetric
          icon={<Video className="w-4 h-4" />}
          label="Total de vídeos"
          value={totalVideos}
        />
        <QuickMetric
          icon={<Brain className="w-4 h-4" />}
          label="Analisados"
          value={analisados}
          highlight
        />
        <QuickMetric
          icon={<Brain className="w-4 h-4 opacity-60" />}
          label="Transcritos"
          value={transcritos}
        />
        <QuickMetric
          icon={<span className="text-base leading-none">🔥</span>}
          label="Virais"
          value={totalVirais ?? 0}
        />
      </div>

      {/* Layout de 2 colunas no desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda: Monitor do pipeline */}
        <div>
          <PipelineMonitor influencer={influencer} />
        </div>

        {/* Coluna direita: Painel de Conhecimento */}
        <div>
          <PainelConhecimento
            influencerId={id}
            nivelConhecimento={nivel}
            scoreCobertura={(influencer.score_cobertura ?? 0) * 100}
            scoreDiversidade={(influencer.score_diversidade ?? 0) * 100}
            scoreConfianca={(influencer.score_confianca ?? 0) * 100}
          />
        </div>
      </div>

      {/* Vídeos — largura total */}
      <InfluenciadorVideos influencerId={id} />
    </div>
  )
}

function QuickMetric({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-2 ${highlight ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
          {icon}
        </div>
        <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-500' : ''}`}>
          {value}
        </p>
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
