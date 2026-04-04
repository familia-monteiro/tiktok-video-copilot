'use client'

/**
 * Lista de cards dos influenciadores com status em tempo real.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { PipelineStatusBadge } from '@/components/dashboard/pipeline-status'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { Influenciador } from '@/types/database'

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
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

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
        <InfluencerCard key={inf.id} influencer={inf} />
      ))}
    </div>
  )
}

function InfluencerCard({ influencer }: { influencer: Influenciador }) {
  const [videoCount, setVideoCount] = useState<number | null>(null)
  const [transcribedCount, setTranscribedCount] = useState<number | null>(null)

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

  const nivelConhecimento = influencer.nivel_conhecimento_ia ?? 0
  const progressPercent = Math.round(nivelConhecimento * 100)

  return (
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
            <PipelineStatusBadge
              influencerId={influencer.id}
              initialStatus={influencer.status_pipeline}
            />
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
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
