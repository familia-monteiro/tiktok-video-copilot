'use client'

/**
 * Monitor de Virais — Feed em tempo real com Supabase Realtime.
 * Cards com viral_score e badge colorido.
 * Expansão com template viral extraído.
 * Botão "Usar este padrão" para aplicar template em novo roteiro.
 * Referência: Seção 26, 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { Video, TemplateViral } from '@/types/database'

interface VideoComInfluencer extends Video {
  tiktok_handle?: string
}

interface FiltroState {
  influencer: string
  scoreMin: number
}

// Badge de score viral com cor progressiva
function ViralScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-red-600'
    : score >= 80 ? 'bg-orange-600'
    : score >= 70 ? 'bg-yellow-600'
    : 'bg-gray-500'

  const label = score >= 90 ? '🔥 Viral!' : score >= 80 ? '⚡ Forte' : score >= 70 ? '📈 Viral'
    : 'Normal'

  return (
    <Badge className={`text-xs ${color} hover:${color} font-bold`}>
      {label} {score}
    </Badge>
  )
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatRelTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d atrás`
  if (h > 0) return `${h}h atrás`
  return `${m}m atrás`
}

export function MonitorViraisClient() {
  const [videos, setVideos] = useState<VideoComInfluencer[]>([])
  const [templates, setTemplates] = useState<Record<string, TemplateViral>>({})
  const [influencers, setInfluencers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroState>({ influencer: '', scoreMin: 70 })

  async function loadVideos() {
    let query = supabase
      .from('videos')
      .select('*')
      .eq('is_viral', true)
      .gte('viral_score', filtro.scoreMin)
      .order('metricas_atualizadas_em', { ascending: false, nullsFirst: false })
      .order('viral_score', { ascending: false })
      .limit(50)

    if (filtro.influencer) {
      query = query.eq('influencer_id', filtro.influencer)
    }

    const { data } = await query
    setVideos((data ?? []) as VideoComInfluencer[])
    setLoading(false)
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from('templates_virais')
      .select('*')
      .eq('ativo', true)
      .order('viral_score_original', { ascending: false })
      .limit(100)

    if (data) {
      const map: Record<string, TemplateViral> = {}
      for (const t of data as TemplateViral[]) {
        map[t.video_id] = t
      }
      setTemplates(map)
    }
  }

  async function loadInfluencers() {
    const { data } = await supabase
      .from('influenciadores')
      .select('id, tiktok_handle')
    if (data) {
      const map: Record<string, string> = {}
      for (const inf of data) map[inf.id] = inf.tiktok_handle
      setInfluencers(map)
    }
  }

  useEffect(() => {
    loadVideos()
    loadTemplates()
    loadInfluencers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  // Realtime: ouvir atualizações de vídeos virais
  useEffect(() => {
    const channel = supabase
      .channel('monitor-virais')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: 'is_viral=eq.true',
        },
        (payload) => {
          const updated = payload.new as Video
          setVideos((prev) => {
            const exists = prev.find((v) => v.id === updated.id)
            if (exists) {
              return prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v))
            }
            // Novo viral detectado
            if (updated.viral_score >= filtro.scoreMin) {
              toast.success(`Novo viral detectado! Score ${updated.viral_score}`, {
                description: `@${influencers[updated.influencer_id] ?? '?'}`,
              })
              return [updated, ...prev]
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [filtro.scoreMin, influencers])

  function usarTemplate(template: TemplateViral) {
    // Redirecionar para Roteiros com o template pré-selecionado
    const params = new URLSearchParams({
      template_id: template.id,
      categorias: (template.categorias_compativeis ?? []).join(','),
    })
    window.location.href = `/roteiros?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
          value={filtro.influencer}
          onChange={(e) => setFiltro({ ...filtro, influencer: e.target.value })}
        >
          <option value="">Todos os influenciadores</option>
          {Object.entries(influencers).map(([id, handle]) => (
            <option key={id} value={id}>@{handle}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Score mínimo:</span>
          {[70, 80, 90].map((score) => (
            <Button
              key={score}
              size="sm"
              variant={filtro.scoreMin === score ? 'default' : 'outline'}
              className="text-xs px-2 py-1 h-7"
              onClick={() => setFiltro({ ...filtro, scoreMin: score })}
            >
              {score}+
            </Button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {videos.length} vídeos virais
        </span>
      </div>

      {/* Feed */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo viral detectado ainda.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              O monitor atualiza a cada hora. Vídeos com viral_score ≥ {filtro.scoreMin} aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => {
            const template = templates[video.id]
            const isExpanded = expanded === video.id
            const handle = influencers[video.influencer_id] ?? '?'

            return (
              <Card key={video.id} className={video.viral_score >= 90 ? 'border-red-500/40' : video.viral_score >= 80 ? 'border-orange-500/30' : ''}>
                {/* Header do card */}
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ViralScoreBadge score={Math.round(video.viral_score)} />
                      <span className="text-sm font-medium">@{handle}</span>
                      {template && (
                        <Badge variant="secondary" className="text-xs">
                          Template disponível
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {video.metricas_atualizadas_em
                        ? formatRelTime(video.metricas_atualizadas_em)
                        : formatRelTime(video.criado_em)}
                    </span>
                  </div>
                </CardHeader>

                {/* Métricas */}
                <CardContent className="px-4 pb-3">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>👁 {formatNum(video.views)}</span>
                    <span>❤️ {formatNum(video.likes)}</span>
                    <span>💬 {formatNum(video.comments)}</span>
                    <span>↗️ {formatNum(video.shares)}</span>
                    <span>🔖 {formatNum(video.saves)}</span>
                  </div>

                  {/* Barra do score */}
                  <div className="mb-3">
                    <Progress value={video.viral_score} className="h-1.5" />
                  </div>

                  {/* Botões */}
                  <div className="flex items-center gap-2">
                    {template && (
                      <Button
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => usarTemplate(template)}
                      >
                        Usar este padrão
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => setExpanded(isExpanded ? null : video.id)}
                    >
                      {isExpanded ? 'Fechar' : template ? 'Ver template' : 'Ver detalhes'}
                    </Button>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Abrir vídeo ↗
                    </a>
                  </div>

                  {/* Template expandido */}
                  {isExpanded && template && (
                    <TemplateExpandido template={template} />
                  )}

                  {/* Detalhes sem template */}
                  {isExpanded && !template && (
                    <div className="mt-3 p-3 rounded-md bg-muted/20 text-xs space-y-1">
                      <p className="text-muted-foreground">Template ainda não extraído para este vídeo.</p>
                      <p>Status: <span className="font-medium">{video.status}</span></p>
                      <p>Publicado: <span className="font-medium">{video.data_publicacao ? new Date(video.data_publicacao).toLocaleDateString('pt-BR') : '?'}</span></p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TemplateExpandido({ template }: { template: TemplateViral }) {
  const estrutura = template.estrutura as {
    nome?: string
    descricao?: string
    estrutura_de_blocos?: { posicao: string; o_que_fazer: string }[]
    ingredientes_obrigatorios?: string[]
  } | null

  return (
    <div className="mt-3 p-3 rounded-md bg-muted/20 space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{template.elemento_principal}</span>
        <Badge variant="outline" className="text-xs">
          {template.replicabilidade} replicabilidade
        </Badge>
      </div>

      {template.descricao && (
        <p className="text-muted-foreground">{template.descricao}</p>
      )}

      {estrutura?.estrutura_de_blocos && estrutura.estrutura_de_blocos.length > 0 && (
        <div>
          <p className="font-medium mb-1">Estrutura:</p>
          <div className="space-y-1">
            {estrutura.estrutura_de_blocos.map((bloco, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{bloco.posicao}</span>
                <span>{bloco.o_que_fazer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {estrutura?.ingredientes_obrigatorios && estrutura.ingredientes_obrigatorios.length > 0 && (
        <div>
          <p className="font-medium mb-1">Ingredientes obrigatórios:</p>
          <div className="flex flex-wrap gap-1">
            {estrutura.ingredientes_obrigatorios.map((ing, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal">{ing}</Badge>
            ))}
          </div>
        </div>
      )}

      {template.categorias_compativeis && template.categorias_compativeis.length > 0 && (
        <div>
          <p className="font-medium">Compatível com: </p>
          <span className="text-muted-foreground">{template.categorias_compativeis.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
