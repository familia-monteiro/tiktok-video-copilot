'use client'

/**
 * Monitor em tempo real do pipeline para um influenciador.
 * Mostra fase atual, vídeos descobertos, checkpoint e log de eventos.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2, AlertCircle, Loader2, Clock,
  Video, FileText, Brain, Wifi, WifiOff,
} from 'lucide-react'
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

// Fases do pipeline em ordem
const PHASES = [
  { key: 'descobrindo', label: 'Coletando vídeos', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  { key: 'processando', label: 'Baixando e transcrevendo', icon: <FileText className="w-3.5 h-3.5" /> },
  { key: 'ativo', label: 'Analisando com IA', icon: <Brain className="w-3.5 h-3.5" /> },
]

const STATUS_COLORS: Record<string, string> = {
  aguardando:        'text-muted-foreground/60',
  baixando:          'text-blue-400',
  baixado:           'text-blue-300',
  audio_processando: 'text-purple-400',
  audio_processado:  'text-purple-300',
  transcrevendo:     'text-orange-400',
  transcrito:        'text-yellow-400',
  analisando:        'text-cyan-400',
  analisado:         'text-emerald-400',
  falha_download:    'text-red-400',
  falha_transcricao: 'text-red-400',
  indisponivel:      'text-gray-400',
}

const STATUS_LABELS: Record<string, string> = {
  aguardando:        'aguardando',
  baixando:          'baixando…',
  baixado:           'baixado',
  audio_processando: 'separando áudio…',
  audio_processado:  'áudio pronto',
  transcrevendo:     'transcrevendo…',
  transcrito:        'transcrito',
  analisando:        'analisando…',
  analisado:         'analisado ✓',
  falha_download:    'falha no download',
  falha_transcricao: 'falha na transcrição',
  indisponivel:      'indisponível',
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info:    'text-foreground/70',
  success: 'text-emerald-400',
  error:   'text-red-400',
  warning: 'text-amber-400',
}

export function PipelineMonitor({ influencer: initial }: { influencer: Influenciador }) {
  const [influencer, setInfluencer] = useState<Influenciador>(initial)
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [videoTotal, setVideoTotal] = useState(0)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, count } = await supabase
        .from('videos')
        .select('id, tiktok_video_id, status, criado_em', { count: 'exact' })
        .eq('influencer_id', initial.id)
        .order('criado_em', { ascending: false })
        .limit(100)

      setVideos((data as VideoRow[]) ?? [])
      setVideoTotal(count ?? 0)
    }
    load()
  }, [initial.id])

  // Realtime: influenciador
  useEffect(() => {
    const ch = supabase
      .channel(`monitor-influencer-${initial.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'influenciadores',
        filter: `id=eq.${initial.id}`,
      }, (payload) => {
        const updated = payload.new as Influenciador
        setInfluencer(updated)
        addLog(`Status: ${updated.status_pipeline}`, 'info')
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => { supabase.removeChannel(ch) }
  }, [initial.id])

  // Realtime: vídeos
  useEffect(() => {
    const ch = supabase
      .channel(`monitor-videos-${initial.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'videos',
        filter: `influencer_id=eq.${initial.id}`,
      }, (payload) => {
        const v = payload.new as VideoRow
        setVideos((prev) => [v, ...prev].slice(0, 100))
        setVideoTotal((n) => n + 1)
        addLog(`Descoberto: ${v.tiktok_video_id}`, 'info')
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'videos',
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
    setLog((prev) => [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      message, type,
    }, ...prev].slice(0, 200))
  }

  const checkpoint = influencer.checkpoint_scraping as Record<string, unknown> | null
  const checkpointTotal = typeof checkpoint?.total_coletados === 'number' ? checkpoint.total_coletados : null
  const checkpointBatch = typeof checkpoint?.batch_number === 'number' ? checkpoint.batch_number : null

  const analisados = videos.filter((v) => v.status === 'analisado').length
  const transcritos = videos.filter((v) => v.status === 'transcrito').length
  const progressPercent = videoTotal > 0 ? Math.round((analisados / videoTotal) * 100) : 0

  const status = influencer.status_pipeline
  const isActive = ['descobrindo', 'processando'].includes(status)
  const isErro = status === 'erro'
  const erroMsg = isErro ? checkpoint?.erro as string | undefined : undefined

  // Determinar fase atual para mostrar no stepper
  const currentPhaseIdx = status === 'descobrindo' ? 0 : status === 'processando' ? 1 : status === 'ativo' ? 2 : -1

  return (
    <div className="space-y-4">
      {/* Cabeçalho: status + realtime indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Monitor do Pipeline</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connected
            ? <><Wifi className="w-3.5 h-3.5 text-emerald-500" /> Tempo real</>
            : <><WifiOff className="w-3.5 h-3.5 text-red-400" /> Reconectando…</>
          }
        </div>
      </div>

      {/* Bloco de erro */}
      {isErro && (
        <Card className="border-red-500/30 bg-red-500/[0.03]">
          <CardContent className="px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-500">Falha no pipeline</p>
                {erroMsg && <p className="text-xs text-red-400/80 mt-0.5">{erroMsg}</p>}
                <p className="text-xs text-muted-foreground mt-1">Use o menu do card para retentar a coleta.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={<Video className="w-4 h-4" />}
          label="Descobertos"
          value={videoTotal}
          active={status === 'descobrindo'}
        />
        <MetricCard
          icon={<FileText className="w-4 h-4" />}
          label="Transcritos"
          value={transcritos}
          active={status === 'processando'}
        />
        <MetricCard
          icon={<Brain className="w-4 h-4" />}
          label="Analisados"
          value={analisados}
          active={status === 'ativo'}
          highlight
        />
      </div>

      {/* Progresso geral */}
      {videoTotal > 0 && (
        <Card>
          <CardContent className="px-4 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progresso total de análise</span>
              <span className="font-semibold tabular-nums">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            {checkpointTotal !== null && (
              <p className="text-xs text-muted-foreground">
                Checkpoint: {checkpointTotal} vídeos coletados
                {checkpointBatch !== null && ` · batch ${checkpointBatch}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stepper de fases (só quando ativo) */}
      {(isActive || status === 'ativo') && (
        <Card>
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1">
              {PHASES.map((phase, idx) => {
                const done = idx < currentPhaseIdx
                const current = idx === currentPhaseIdx
                return (
                  <div key={phase.key} className="flex items-center flex-1 min-w-0">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      done ? 'text-emerald-500 bg-emerald-500/10' :
                      current ? 'text-blue-500 bg-blue-500/10' :
                      'text-muted-foreground/50'
                    }`}>
                      {done ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : phase.icon}
                      <span className="truncate hidden sm:block">{phase.label}</span>
                    </div>
                    {idx < PHASES.length - 1 && (
                      <div className={`h-px flex-1 mx-1 ${done ? 'bg-emerald-500/30' : 'bg-border'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado inicial: nenhuma atividade ainda */}
      {!isActive && status !== 'ativo' && !isErro && videoTotal === 0 && (
        <Card className="border-dashed">
          <CardContent className="px-4 py-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aguardando início do pipeline</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {status === 'pendente'
                ? 'A coleta de vídeos ainda não foi iniciada.'
                : status === 'pausado'
                ? 'O pipeline está pausado. Retome pelo menu do card.'
                : 'Nenhuma atividade registrada.'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de vídeos recentes */}
      {videos.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Vídeos recentes
              <span className="text-xs font-normal text-muted-foreground">{videoTotal} total</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ScrollArea className="h-52">
              <ul className="space-y-1.5">
                {videos.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs gap-3">
                    <span className="font-mono text-muted-foreground truncate">{v.tiktok_video_id}</span>
                    <span className={`shrink-0 ${STATUS_COLORS[v.status] ?? 'text-muted-foreground'}`}>
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
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Log de eventos
            {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ScrollArea className="h-36">
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">
                Os eventos aparecerão aqui em tempo real quando o pipeline estiver ativo.
              </p>
            ) : (
              <ul className="space-y-1">
                {log.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground/50 shrink-0 tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                    <span className={LOG_COLORS[entry.type]}>{entry.message}</span>
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

function MetricCard({
  icon, label, value, active, highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number
  active?: boolean
  highlight?: boolean
}) {
  return (
    <Card className={active ? 'border-blue-500/30 bg-blue-500/[0.02]' : ''}>
      <CardContent className="p-3 text-center">
        <div className={`flex justify-center mb-1.5 ${active ? 'text-blue-500' : highlight && value > 0 ? 'text-emerald-500' : 'text-muted-foreground/50'}`}>
          {icon}
        </div>
        <p className={`text-xl font-bold tabular-nums ${highlight && value > 0 ? 'text-emerald-500' : ''}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
        {active && <div className="mt-1.5 h-0.5 rounded-full bg-blue-500/30 overflow-hidden"><div className="h-full bg-blue-500 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} /></div>}
      </CardContent>
    </Card>
  )
}
