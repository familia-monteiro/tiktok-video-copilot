'use client'

/**
 * Monitor em tempo real do pipeline para um influenciador.
 * Mostra vídeos descobertos, checkpoint de scraping e log de eventos.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import type { Influenciador } from '@/types/database'

interface LogEntry {
  id: string
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

interface VideoRow {
  id: string
  tiktok_video_id: string
  status: string
  criado_em: string
}

interface PipelineMonitorProps {
  influencer: Influenciador
}

const STATUS_COLORS: Record<string, string> = {
  aguardando:        'text-muted-foreground',
  baixando:          'text-blue-500',
  baixado:           'text-blue-400',
  audio_processando: 'text-purple-500',
  audio_processado:  'text-purple-400',
  transcrevendo:     'text-orange-500',
  transcrito:        'text-yellow-500',
  analisando:        'text-cyan-500',
  analisado:         'text-green-500',
  falha_download:    'text-red-500',
  falha_transcricao: 'text-red-500',
  indisponivel:      'text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  aguardando:        'aguardando download',
  baixando:          'baixando vídeo...',
  baixado:           'vídeo baixado',
  audio_processando: 'separando áudio...',
  audio_processado:  'áudio separado',
  transcrevendo:     'transcrevendo...',
  transcrito:        'transcrito',
  analisando:        'analisando...',
  analisado:         'analisado ✓',
  falha_download:    'falha no download',
  falha_transcricao: 'falha na transcrição',
  indisponivel:      'indisponível',
}

export function PipelineMonitor({ influencer: initial }: PipelineMonitorProps) {
  const [influencer, setInfluencer] = useState<Influenciador>(initial)
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [videoTotal, setVideoTotal] = useState(0)

  // Carregar vídeos recentes
  useEffect(() => {
    async function load() {
      const { data, count } = await supabase
        .from('videos')
        .select('id, tiktok_video_id, status, criado_em', { count: 'exact' })
        .eq('influencer_id', initial.id)
        .order('criado_em', { ascending: false })
        .limit(50)

      setVideos((data as VideoRow[]) ?? [])
      setVideoTotal(count ?? 0)
    }
    load()
  }, [initial.id])

  // Realtime: influenciador (status, checkpoint)
  useEffect(() => {
    const ch = supabase
      .channel(`monitor-influencer-${initial.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'influenciadores',
        filter: `id=eq.${initial.id}`,
      }, (payload) => {
        const updated = payload.new as Influenciador
        setInfluencer(updated)
        addLog(`Status atualizado: ${updated.status_pipeline}`, 'info')
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [initial.id])

  // Realtime: vídeos (INSERT = descoberto, UPDATE = progresso)
  useEffect(() => {
    const ch = supabase
      .channel(`monitor-videos-${initial.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'videos',
        filter: `influencer_id=eq.${initial.id}`,
      }, (payload) => {
        const v = payload.new as VideoRow
        setVideos((prev) => [v, ...prev].slice(0, 50))
        setVideoTotal((n) => n + 1)
        addLog(`Descoberto: ${v.tiktok_video_id}`, 'info')
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'videos',
        filter: `influencer_id=eq.${initial.id}`,
      }, (payload) => {
        const v = payload.new as VideoRow
        setVideos((prev) => prev.map((x) => x.id === v.id ? v : x))

        const label = STATUS_LABELS[v.status]
        if (label) {
          const type: LogEntry['type'] =
            v.status.startsWith('falha') ? 'error' :
            v.status === 'analisado' ? 'success' :
            v.status === 'indisponivel' ? 'warning' : 'info'
          addLog(`${v.tiktok_video_id}: ${label}`, type)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [initial.id])

  function addLog(message: string, type: LogEntry['type']) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      message,
      type,
    }
    setLog((prev) => [entry, ...prev].slice(0, 200))
  }

  // Dados do checkpoint
  const checkpoint = influencer.checkpoint_scraping as Record<string, unknown> | null
  const checkpointTotal = typeof checkpoint?.total_coletados === 'number' ? checkpoint.total_coletados : null
  const checkpointBatch = typeof checkpoint?.batch_number === 'number' ? checkpoint.batch_number : null

  const analisados = videos.filter((v) => v.status === 'analisado').length
  const transcritos = videos.filter((v) => v.status === 'transcrito').length
  const progressPercent = videoTotal > 0 ? Math.round((analisados / videoTotal) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Status geral */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Pipeline em tempo real</CardTitle>
            <StatusDot status={influencer.status_pipeline} />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold">{videoTotal}</p>
              <p className="text-xs text-muted-foreground">descobertos</p>
            </div>
            <div>
              <p className="text-xl font-bold">{transcritos}</p>
              <p className="text-xs text-muted-foreground">transcritos</p>
            </div>
            <div>
              <p className="text-xl font-bold">{analisados}</p>
              <p className="text-xs text-muted-foreground">analisados</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progresso de análise</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          {checkpointTotal !== null && (
            <p className="text-xs text-muted-foreground">
              Checkpoint: {checkpointTotal} vídeos coletados
              {checkpointBatch !== null && ` · batch ${checkpointBatch}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vídeos recentes */}
      {videos.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">
              Vídeos recentes ({videoTotal} total)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ScrollArea className="h-48">
              <ul className="space-y-1">
                {videos.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="font-mono text-muted-foreground truncate max-w-[180px]">
                      {v.tiktok_video_id}
                    </span>
                    <span className={STATUS_COLORS[v.status] ?? 'text-muted-foreground'}>
                      {STATUS_LABELS[v.status] ?? v.status}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Log de eventos */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Log de eventos</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ScrollArea className="h-40">
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aguardando eventos… Os eventos aparecerão aqui em tempo real quando o pipeline estiver ativo.
              </p>
            ) : (
              <ul className="space-y-1">
                {log.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                    <span className={
                      entry.type === 'error' ? 'text-red-500' :
                      entry.type === 'success' ? 'text-green-500' :
                      entry.type === 'warning' ? 'text-yellow-500' :
                      'text-foreground'
                    }>
                      {entry.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const isActive = ['descobrindo', 'processando', 'baixando', 'transcrevendo', 'analisando'].includes(status)
  const isError = status === 'erro'
  const isPaused = status === 'pausado'

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${
        isError ? 'bg-red-500' :
        isPaused ? 'bg-yellow-500' :
        isActive ? 'bg-green-500 animate-pulse' :
        'bg-muted-foreground'
      }`} />
      <Badge variant="outline" className="text-xs">{status}</Badge>
    </div>
  )
}
