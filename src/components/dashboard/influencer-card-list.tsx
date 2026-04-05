'use client'

/**
 * Lista de cards dos influenciadores com status em tempo real.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MoreVertical, Pause, Play, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { PipelineStatusBadge } from '@/components/dashboard/pipeline-status'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Influenciador, StatusPipeline } from '@/types/database'

interface InfluencerCardListProps {
  influencers: Influenciador[]
}

export function InfluencerCardList({ influencers: initial }: InfluencerCardListProps) {
  const [influencers, setInfluencers] = useState<Influenciador[]>(initial)

  useEffect(() => {
    const channel = supabase
      .channel('influencer-card-list')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'influenciadores' },
        (payload) => {
          const updated = payload.new as Influenciador
          setInfluencers((prev) =>
            prev.map((inf) => (inf.id === updated.id ? { ...inf, ...updated } : inf))
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'influenciadores' },
        (payload) => {
          const newInf = payload.new as Influenciador
          setInfluencers((prev) => [newInf, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'influenciadores' },
        (payload) => {
          const deleted = payload.old as { id: string }
          setInfluencers((prev) => prev.filter((inf) => inf.id !== deleted.id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function handleRemove(id: string) {
    setInfluencers((prev) => prev.filter((inf) => inf.id !== id))
  }

  function handleStatusChange(id: string, newStatus: StatusPipeline) {
    setInfluencers((prev) =>
      prev.map((inf) => inf.id === id ? { ...inf, status_pipeline: newStatus } : inf)
    )
  }

  if (influencers.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum influenciador cadastrado ainda.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Clique em "Adicionar Influenciador" para começar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {influencers.map((inf) => (
        <InfluencerCard
          key={inf.id}
          influencer={inf}
          onRemove={handleRemove}
          onStatusChange={handleStatusChange}
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState<'pausar' | 'retomar' | 'excluir' | null>(null)

  useEffect(() => {
    async function loadCounts() {
      const [{ count: total }, { count: transcribed }] = await Promise.all([
        supabase
          .from('videos')
          .select('*', { count: 'exact', head: true })
          .eq('influencer_id', influencer.id),
        supabase
          .from('videos')
          .select('*', { count: 'exact', head: true })
          .eq('influencer_id', influencer.id)
          .in('status', ['transcrito', 'analisado']),
      ])
      setVideoCount(total ?? 0)
      setTranscribedCount(transcribed ?? 0)
    }

    loadCounts()

    const channel = supabase
      .channel(`influencer-card-videos-${influencer.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'videos',
          filter: `influencer_id=eq.${influencer.id}`,
        },
        () => { loadCounts() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [influencer.id])

  async function handleAction(action: 'pausar' | 'retomar') {
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

      onStatusChange(influencer.id, (data.status_pipeline ?? (action === 'pausar' ? 'pausado' : 'ativo')) as StatusPipeline)
      toast.success(action === 'pausar' ? 'Análise pausada' : 'Análise retomada', {
        description: `@${influencer.tiktok_handle}`,
      })
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    setLoading('excluir')
    try {
      const res = await fetch(`/api/v1/influenciadores/${influencer.id}`, {
        method: 'DELETE',
      })
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

  const isPausado = influencer.status_pipeline === 'pausado'
  const nivelConhecimento = influencer.nivel_conhecimento_ia ?? 0
  const progressPercent = Math.round(nivelConhecimento * 100)

  return (
    <>
      <div className="relative">
        <Link href={`/influenciadores/${influencer.id}`}>
          <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar com inicial */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {influencer.tiktok_handle[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">@{influencer.tiktok_handle}</p>
                    {influencer.nome && (
                      <p className="text-xs text-muted-foreground">{influencer.nome}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PipelineStatusBadge
                    influencerId={influencer.id}
                    initialStatus={influencer.status_pipeline}
                  />
                  {/* Botão de menu — stopPropagation para não navegar */}
                  <div onClick={(e) => e.preventDefault()} className="z-10 relative">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={loading !== null}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {isPausado ? (
                          <DropdownMenuItem
                            onClick={() => handleAction('retomar')}
                            disabled={loading !== null}
                          >
                            <Play className="h-4 w-4 mr-2 text-green-500" />
                            Retomar análise
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleAction('pausar')}
                            disabled={loading !== null}
                          >
                            <Pause className="h-4 w-4 mr-2 text-yellow-500" />
                            Pausar análise
                          </DropdownMenuItem>
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
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {/* Nível de Conhecimento */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Nível de conhecimento</span>
                  <span className="text-xs font-medium">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>

              {/* Estatísticas */}
              <div className="flex items-center gap-4 mt-3">
                <div className="text-center">
                  <p className="text-lg font-semibold leading-none">
                    {videoCount ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">vídeos</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold leading-none">
                    {transcribedCount ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">transcritos</p>
                </div>
                {influencer.seguidores && (
                  <div className="text-center">
                    <p className="text-lg font-semibold leading-none">
                      {formatNumber(influencer.seguidores)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">seguidores</p>
                  </div>
                )}
                {influencer.modo_atual && (
                  <div className="ml-auto">
                    <span className="text-xs text-muted-foreground">
                      modo: <span className="font-medium text-foreground">{influencer.modo_atual}</span>
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Diálogo de confirmação de exclusão */}
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
              {loading === 'excluir' ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
