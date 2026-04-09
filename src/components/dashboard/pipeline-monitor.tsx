'use client'

/**
 * Monitor em tempo real do pipeline para um influenciador.
 * Redesenhado para visibilidade total do estado de cada vídeo.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2, AlertCircle, Loader2, Clock,
  Video, FileText, Brain, Wifi, WifiOff, Music,
  Download, Mic, Zap, AlertTriangle, Activity,
} from 'lucide-react'
import type { Influenciador } from '@/types/database'

interface LogEntry {
  id: string
  timestamp: string
  message: string
  detail?: string
  type: 'info' | 'success' | 'error' | 'warning'
}

interface VideoRow {
  id: string
  tiktok_video_id: string
  status: string
  erro_log?: string | null
  criado_em: string
}

interface StatusCount {
  aguardando: number
  baixando: number
  baixado: number
  audio_processado: number
  transcrito: number
  analisado: number
  falha_download: number
  falha_transcricao: number
  indisponivel: number
  [key: string]: number
}

const EMPTY_COUNTS: StatusCount = {
  aguardando: 0, baixando: 0, baixado: 0,
  audio_processado: 0, transcrito: 0, analisado: 0,
  falha_download: 0, falha_transcricao: 0, indisponivel: 0,
}

const STATUS_LABELS: Record<string, string> = {
  aguardando:        'Aguardando',
  baixando:          'Baixando…',
  baixado:           'Baixado',
  audio_processado:  'Áudio pronto',
  transcrito:        'Transcrito',
  analisado:         'Analisado ✓',
  falha_download:    'Falha no download',
  falha_transcricao: 'Falha na transcrição',
  indisponivel:      'Indisponível',
}

const STATUS_ICON: Record<string, string> = {
  aguardando: '⏳', baixando: '⬇️', baixado: '💾',
  audio_processado: '🎵', transcrito: '📝', analisado: '✅',
  falha_download: '❌', falha_transcricao: '❌', indisponivel: '🚫',
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info:    'text-foreground/70',
  success: 'text-emerald-400',
  error:   'text-red-400',
  warning: 'text-amber-400',
}

const LOG_ICONS: Record<LogEntry['type'], string> = {
  info: '·', success: '✓', error: '✗', warning: '⚠',
}

function countStatuses(videos: VideoRow[]): StatusCount {
  const c = { ...EMPTY_COUNTS }
  for (const v of videos) c[v.status] = (c[v.status] ?? 0) + 1
  return c
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 5000) return 'agora mesmo'
  if (diff < 60000) return `${Math.round(diff / 1000)}s atrás`
  if (diff < 3600000) return `${Math.round(diff / 60000)}min atrás`
  return `${Math.round(diff / 3600000)}h atrás`
}

function truncateError(err: string | null | undefined, max = 120): string {
  if (!err) return ''
  const clean = err.replace(/\n/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

export function PipelineMonitor({ influencer: initial }: { influencer: Influenciador }) {
  const [influencer, setInfluencer] = useState<Influenciador>(initial)
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [videoTotal, setVideoTotal] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(true)
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  // Atualizar relativeTime a cada 10s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

  const addLog = useCallback((message: string, type: LogEntry['type'], detail?: string) => {
    const ts = new Date().toISOString()
    setLastActivity(ts)
    setLog((prev) => [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: ts,
      message,
      detail,
      type,
    }, ...prev].slice(0, 300))
  }, [])

  // Carregamento inicial
  useEffect(() => {
    async function load() {
      const { data, count } = await supabase
        .from('videos')
        .select('id, tiktok_video_id, status, erro_log, criado_em', { count: 'exact' })
        .eq('influencer_id', initial.id)
        .order('criado_em', { ascending: false })
        .limit(200)

      setVideos((data as VideoRow[]) ?? [])
      setVideoTotal(count ?? 0)
    }
    load()
  }, [initial.id])

  // Realtime: influenciador
  useEffect(() => {
    const ch = supabase
      .channel(`pm-inf-${initial.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'influenciadores',
        filter: `id=eq.${initial.id}`,
      }, (payload) => {
        const updated = payload.new as Influenciador
        setInfluencer(updated)
        const status = updated.status_pipeline
        if (status === 'erro') addLog('Pipeline entrou em estado de erro', 'error')
        else if (status === 'ativo') addLog('Coleta e processamento concluídos', 'success')
        else if (status === 'descobrindo') addLog('Coleta de vídeos iniciada', 'info')
        else if (status === 'processando') addLog('Processamento em andamento', 'info')
      })
      .subscribe((s) => setConnected(s === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(ch) }
  }, [initial.id, addLog])

  // Realtime: vídeos
  useEffect(() => {
    const ch = supabase
      .channel(`pm-videos-${initial.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'videos',
        filter: `influencer_id=eq.${initial.id}`,
      }, (payload) => {
        const v = payload.new as VideoRow
        setVideos((prev) => [v, ...prev].slice(0, 200))
        setVideoTotal((n) => n + 1)
        addLog(`Descoberto: ${v.tiktok_video_id}`, 'info')
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'videos',
        filter: `influencer_id=eq.${initial.id}`,
      }, (payload) => {
        const v = payload.new as VideoRow
        setVideos((prev) => prev.map((x) => x.id === v.id ? { ...x, ...v } : x))

        const short = v.tiktok_video_id.slice(-6)
        switch (v.status) {
          case 'baixando':
            addLog(`⬇ …${short} — download iniciado`, 'info')
            break
          case 'baixado':
            addLog(`💾 …${short} — vídeo salvo no Storage`, 'info')
            break
          case 'audio_processado':
            addLog(`🎵 …${short} — áudio separado (Demucs)`, 'info')
            break
          case 'transcrito':
            addLog(`📝 …${short} — transcrição concluída`, 'info')
            break
          case 'analisado':
            addLog(`✅ …${short} — análise concluída!`, 'success')
            break
          case 'falha_download':
            addLog(
              `❌ …${short} — falha no download`,
              'error',
              truncateError(v.erro_log)
            )
            break
          case 'falha_transcricao':
            addLog(
              `❌ …${short} — falha na transcrição`,
              'error',
              truncateError(v.erro_log)
            )
            break
          case 'indisponivel':
            addLog(`🚫 …${short} — vídeo indisponível (removido)`, 'warning')
            break
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [initial.id, addLog])

  const counts = countStatuses(videos)
  const analisados = counts.analisado
  const falhas = counts.falha_download + counts.falha_transcricao + counts.indisponivel
  const emProcesso = counts.baixando + counts.baixado + counts.audio_processado + counts.transcrito
  const progressPercent = videoTotal > 0 ? Math.round((analisados / videoTotal) * 100) : 0

  const status = influencer.status_pipeline
  const isAtivo = ['descobrindo', 'processando', 'ativo'].includes(status)
  const isErro = status === 'erro'
  const checkpoint = influencer.checkpoint_scraping as Record<string, unknown> | null
  const erroMsg = isErro ? checkpoint?.erro as string | undefined : undefined

  return (
    <div className="space-y-3">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Monitor do Pipeline
        </h2>
        <div className="flex items-center gap-2">
          {lastActivity && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {relativeTime(lastActivity)}
            </span>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {connected
              ? <><Wifi className="w-3.5 h-3.5 text-emerald-500" /> <span className="hidden sm:inline">Tempo real</span></>
              : <><WifiOff className="w-3.5 h-3.5 text-red-400 animate-pulse" /> Reconectando…</>
            }
          </div>
        </div>
      </div>

      {/* Erro */}
      {isErro && (
        <Card className="border-red-500/30 bg-red-500/[0.04]">
          <CardContent className="px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-500">Falha no pipeline</p>
                {erroMsg && <p className="text-xs text-red-400/80 mt-0.5 font-mono">{erroMsg}</p>}
                <p className="text-xs text-muted-foreground mt-1">Use o menu do card para retentar a coleta.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alertas de falha */}
      {falhas > 0 && !isErro && (
        <Card className="border-amber-500/30 bg-amber-500/[0.03]">
          <CardContent className="px-3 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-500/90">
              <strong>{falhas}</strong> {falhas === 1 ? 'vídeo com falha' : 'vídeos com falha'} —
              veja o log abaixo para detalhes
            </p>
          </CardContent>
        </Card>
      )}

      {/* Breakdown de status por etapa */}
      {videoTotal > 0 && (
        <Card>
          <CardContent className="px-4 py-3 space-y-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-muted-foreground">Progresso geral</span>
              <span className="text-xs font-bold tabular-nums">{analisados}/{videoTotal} ({progressPercent}%)</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />

            {/* Pipeline stages */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <StageChip
                icon={<Download className="w-3 h-3" />}
                label="Baixando"
                count={counts.baixando}
                done={counts.baixado}
                color="blue"
              />
              <StageChip
                icon={<Music className="w-3 h-3" />}
                label="Áudio"
                count={counts.baixado}
                done={counts.audio_processado}
                color="purple"
              />
              <StageChip
                icon={<Mic className="w-3 h-3" />}
                label="Transcrito"
                count={counts.audio_processado}
                done={counts.transcrito}
                color="orange"
              />
              <StageChip
                icon={<Zap className="w-3 h-3" />}
                label="Analisado"
                count={counts.transcrito}
                done={counts.analisado}
                color="emerald"
              />
            </div>

            {/* Resumo de falhas */}
            {(counts.falha_download > 0 || counts.falha_transcricao > 0 || counts.indisponivel > 0) && (
              <div className="flex flex-wrap gap-1 pt-1">
                {counts.falha_download > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {counts.falha_download} falha download
                  </Badge>
                )}
                {counts.falha_transcricao > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    {counts.falha_transcricao} falha transcrição
                  </Badge>
                )}
                {counts.indisponivel > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30">
                    {counts.indisponivel} indisponível
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stepper de fases */}
      {videoTotal > 0 && (
        <Card>
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1">
              {[
                { label: 'Coletando', done: status !== 'descobrindo' && status !== 'pendente', current: status === 'descobrindo', icon: <Video className="w-3 h-3" /> },
                { label: 'Processando', done: status === 'ativo', current: status === 'processando', icon: <FileText className="w-3 h-3" /> },
                { label: 'Analisando', done: false, current: status === 'ativo', icon: <Brain className="w-3 h-3" /> },
              ].map((phase, idx, arr) => (
                <div key={idx} className="flex items-center flex-1 min-w-0">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                    phase.done ? 'text-emerald-400 bg-emerald-500/10' :
                    phase.current ? 'text-blue-400 bg-blue-500/10' :
                    'text-muted-foreground/40'
                  }`}>
                    {phase.done
                      ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                      : phase.current
                      ? <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                      : phase.icon}
                    <span className="hidden sm:block truncate">{phase.label}</span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className={`h-px flex-1 mx-1 ${phase.done ? 'bg-emerald-500/40' : 'bg-border'}`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado vazio */}
      {videoTotal === 0 && !isErro && (
        <Card className="border-dashed">
          <CardContent className="px-4 py-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {status === 'pendente' ? 'Coleta ainda não iniciada.' :
               status === 'pausado' ? 'Pipeline pausado.' :
               status === 'descobrindo' ? 'Buscando vídeos…' :
               'Aguardando atividade.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Log de eventos em tempo real */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            Log de eventos
            {(isAtivo || emProcesso > 0) && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
            {log.length > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground/60 ml-auto">
                {log.length} entradas
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-48">
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic py-2">
                {videoTotal > 0
                  ? 'Aguardando próximas transições de status…'
                  : 'Os eventos aparecerão aqui em tempo real quando o pipeline estiver ativo.'
                }
              </p>
            ) : (
              <ul className="space-y-1">
                {log.map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground/40 shrink-0 tabular-nums font-mono text-[10px] pt-0.5">
                        {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`shrink-0 font-bold ${LOG_COLORS[entry.type]}`}>
                        {LOG_ICONS[entry.type]}
                      </span>
                      <div className="min-w-0">
                        <span className={LOG_COLORS[entry.type]}>{entry.message}</span>
                        {entry.detail && (
                          <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate" title={entry.detail}>
                            {entry.detail}
                          </p>
                        )}
                      </div>
                    </div>
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

function StageChip({
  icon, label, count, done, color,
}: {
  icon: React.ReactNode
  label: string
  count: number
  done: number
  color: 'blue' | 'purple' | 'orange' | 'emerald'
}) {
  const isActive = count > 0
  const colorMap = {
    blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
    purple:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
    orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  }
  const c = colorMap[color]

  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center transition-all ${
      isActive ? `${c.bg} ${c.border}` : 'border-border'
    }`}>
      <div className={`flex justify-center mb-0.5 ${isActive ? c.text : 'text-muted-foreground/30'}`}>
        {icon}
      </div>
      <p className={`text-sm font-bold tabular-nums ${isActive ? c.text : 'text-muted-foreground/40'}`}>
        {isActive ? count : done > 0 ? '✓' : '—'}
      </p>
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
    </div>
  )
}
