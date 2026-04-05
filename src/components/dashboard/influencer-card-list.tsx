'use client'

/**
 * Lista de influenciadores com cards modernos e status em tempo real.
 * Grid 2 colunas no desktop. Mostra erro com botão de retentar.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  MoreVertical, Pause, Play, Trash2, RefreshCw,
  AlertCircle, Loader2, CheckCircle2, Clock, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Influenciador, StatusPipeline } from '@/types/database'

interface InfluencerCardListProps {
  influencers: Influenciador[]
}

// Paleta de cores para avatares (baseada no handle)
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
]

function avatarColor(handle: string) {
  const idx = handle.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// Configuração visual de cada status
const STATUS_DISPLAY: Record<StatusPipeline, {
  label: string
  dot: string
  pulse: boolean
  icon: React.ReactNode
  badgeClass: string
}> = {
  pendente: {
    label: 'Aguardando início',
    dot: 'bg-muted-foreground/40',
    pulse: false,
    icon: <Clock className="w-3 h-3" />,
    badgeClass: 'border-muted-foreground/30 text-muted-foreground',
  },
  descobrindo: {
    label: 'Coletando vídeos…',
    dot: 'bg-blue-500',
    pulse: true,
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    badgeClass: 'border-blue-500/30 text-blue-500 bg-blue-500/5',
  },
  processando: {
    label: 'Processando vídeos…',
    dot: 'bg-purple-500',
    pulse: true,
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    badgeClass: 'border-purple-500/30 text-purple-500 bg-purple-500/5',
  },
  ativo: {
    label: 'Ativo',
    dot: 'bg-emerald-500',
    pulse: false,
    icon: <CheckCircle2 className="w-3 h-3" />,
    badgeClass: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5',
  },
  pausado: {
    label: 'Pausado',
    dot: 'bg-amber-500',
    pulse: false,
    icon: <Pause className="w-3 h-3" />,
    badgeClass: 'border-amber-500/30 text-amber-500 bg-amber-500/5',
  },
  erro: {
    label: 'Erro',
    dot: 'bg-red-500',
    pulse: false,
    icon: <AlertCircle className="w-3 h-3" />,
    badgeClass: 'border-red-500/30 text-red-500 bg-red-500/5',
  },
}

export function InfluencerCardList({ influencers: initial }: InfluencerCardListProps) {
  const [influencers, setInfluencers] = useState<Influenciador[]>(initial)

  useEffect(() => {
    const channel = supabase
      .channel('influencer-card-list')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'influenciadores' }, (payload) => {
        const updated = payload.new as Influenciador
        setInfluencers((prev) => prev.map((inf) => inf.id === updated.id ? { ...inf, ...updated } : inf))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'influenciadores' }, (payload) => {
        setInfluencers((prev) => [payload.new as Influenciador, ...prev])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'influenciadores' }, (payload) => {
        const deleted = payload.old as { id: string }
        setInfluencers((prev) => prev.filter((inf) => inf.id !== deleted.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (influencers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Zap className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nenhum influenciador cadastrado</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Adicionar Influenciador" para começar.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {influencers.map((inf) => (
        <InfluencerCard
          key={inf.id}
          influencer={inf}
          onRemove={(id) => setInfluencers((prev) => prev.filter((i) => i.id !== id))}
          onStatusChange={(id, status) =>
            setInfluencers((prev) => prev.map((i) => i.id === id ? { ...i, status_pipeline: status } : i))
          }
        />
      ))}
    </div>
  )
}

function InfluencerCard({
  influencer,
  onRemove,
  onStatusChange,
}: {
  influencer: Influenciador
  onRemove: (id: string) => void
  onStatusChange: (id: string, status: StatusPipeline) => void
}) {
  const [videoCount, setVideoCount] = useState<number | null>(null)
  const [transcribedCount, setTranscribedCount] = useState<number | null>(null)
  const [analyzedCount, setAnalyzedCount] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState<'pausar' | 'retomar' | 'retentar' | 'excluir' | null>(null)

  const statusCfg = STATUS_DISPLAY[influencer.status_pipeline] ?? STATUS_DISPLAY.pendente
  const isPausado = influencer.status_pipeline === 'pausado'
  const isErro = influencer.status_pipeline === 'erro'
  const isActive = ['descobrindo', 'processando'].includes(influencer.status_pipeline)
  const nivelConhecimento = influencer.nivel_conhecimento_ia ?? 0
  const progressPercent = Math.round(nivelConhecimento * 100)

  // Erro armazenado no checkpoint_scraping quando job falha
  const erroMsg = isErro
    ? (influencer.checkpoint_scraping as Record<string, unknown>)?.erro as string | undefined
    : undefined

  useEffect(() => {
    async function loadCounts() {
      const [{ count: total }, { count: transcribed }, { count: analyzed }] = await Promise.all([
        supabase.from('videos').select('*', { count: 'exact', head: true }).eq('influencer_id', influencer.id),
        supabase.from('videos').select('*', { count: 'exact', head: true }).eq('influencer_id', influencer.id).eq('status', 'transcrito'),
        supabase.from('videos').select('*', { count: 'exact', head: true }).eq('influencer_id', influencer.id).eq('status', 'analisado'),
      ])
      setVideoCount(total ?? 0)
      setTranscribedCount(transcribed ?? 0)
      setAnalyzedCount(analyzed ?? 0)
    }

    loadCounts()

    const channel = supabase
      .channel(`card-videos-${influencer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos', filter: `influencer_id=eq.${influencer.id}` }, () => loadCounts())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [influencer.id])

  async function handleAction(action: 'pausar' | 'retomar' | 'retentar') {
    setLoading(action)
    try {
      const res = await fetch(`/api/v1/influenciadores/${influencer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; status_pipeline?: string }

      if (!res.ok) {
        toast.error(`Erro ao ${action}`, { description: data.error })
        return
      }

      const newStatus = (data.status_pipeline ?? (
        action === 'pausar' ? 'pausado' : action === 'retentar' ? 'pendente' : 'ativo'
      )) as StatusPipeline

      onStatusChange(influencer.id, newStatus)

      const msgs: Record<string, string> = {
        pausar: 'Análise pausada',
        retomar: 'Análise retomada',
        retentar: 'Coleta reiniciada',
      }
      toast.success(msgs[action], { description: `@${influencer.tiktok_handle}` })
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    setLoading('excluir')
    try {
      const res = await fetch(`/api/v1/influenciadores/${influencer.id}`, { method: 'DELETE' })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        toast.error('Erro ao excluir', { description: data.error })
        return
      }

      onRemove(influencer.id)
      toast.success('Influenciador excluído', { description: `@${influencer.tiktok_handle}` })
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(null)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="relative group">
        <Link href={`/influenciadores/${influencer.id}`}>
          <Card className={`transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${isErro ? 'border-red-500/30 bg-red-500/[0.02]' : ''}`}>
            <CardContent className="p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor(influencer.tiktok_handle)} flex items-center justify-center text-white text-base font-bold shadow-sm shrink-0`}>
                    {influencer.tiktok_handle[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">@{influencer.tiktok_handle}</p>
                    {influencer.nome && (
                      <p className="text-xs text-muted-foreground truncate">{influencer.nome}</p>
                    )}
                    {influencer.seguidores && (
                      <p className="text-xs text-muted-foreground/60">{formatNumber(influencer.seguidores)} seguidores</p>
                    )}
                  </div>
                </div>

                {/* Menu */}
                <div onClick={(e) => e.preventDefault()} className="z-10 relative shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={loading !== null}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {isErro && (
                        <DropdownMenuItem onClick={() => handleAction('retentar')} disabled={loading !== null}>
                          <RefreshCw className="h-4 w-4 mr-2 text-blue-500" />
                          Retentar coleta
                        </DropdownMenuItem>
                      )}
                      {!isErro && (
                        isPausado ? (
                          <DropdownMenuItem onClick={() => handleAction('retomar')} disabled={loading !== null}>
                            <Play className="h-4 w-4 mr-2 text-emerald-500" />
                            Retomar análise
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction('pausar')} disabled={loading !== null || isActive}>
                            <Pause className="h-4 w-4 mr-2 text-amber-500" />
                            Pausar análise
                          </DropdownMenuItem>
                        )
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setConfirmDelete(true)}
                        disabled={loading !== null}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Bloco de erro */}
              {isErro && erroMsg && (
                <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <p className="text-xs text-red-500 font-medium mb-0.5">Falha na coleta</p>
                  <p className="text-xs text-red-400/80 line-clamp-2">{erroMsg}</p>
                  <button
                    onClick={(e) => { e.preventDefault(); handleAction('retentar') }}
                    disabled={loading !== null}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 disabled:opacity-50"
                  >
                    {loading === 'retentar'
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Retentando…</>
                      : <><RefreshCw className="w-3 h-3" /> Retentar coleta</>
                    }
                  </button>
                </div>
              )}

              {/* Status badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex w-2 h-2 rounded-full shrink-0 ${statusCfg.dot} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                  {statusCfg.icon}
                  {statusCfg.label}
                </span>
                {influencer.modo_atual && !isErro && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    {influencer.modo_atual}
                  </Badge>
                )}
              </div>

              {/* Progresso de conhecimento */}
              {!isErro && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Conhecimento IA</span>
                    <span className="text-xs font-semibold tabular-nums">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5" />
                </div>
              )}

              {/* Estatísticas */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
                <Stat label="vídeos" value={videoCount} />
                <Stat label="transcritos" value={transcribedCount} />
                <Stat label="analisados" value={analyzedCount} highlight={!!analyzedCount} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir influenciador?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai remover <strong>@{influencer.tiktok_handle}</strong> e todos os dados
              associados (vídeos, transcrições, memórias). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading === 'excluir'}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading === 'excluir'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading === 'excluir' ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold tabular-nums leading-tight ${highlight && value ? 'text-emerald-500' : ''}`}>
        {value ?? '—'}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
