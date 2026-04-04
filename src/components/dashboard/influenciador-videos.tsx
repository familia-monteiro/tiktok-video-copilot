'use client'

/**
 * Lista de vídeos de um influenciador com paginação e log de atividade em tempo real.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Video {
  id: string
  tiktok_video_id: string
  url: string
  status: string
  views: number
  likes: number
  viral_score: number
  is_viral: boolean
  data_publicacao: string | null
  criado_em: string
}

interface ActivityEntry {
  id: string
  message: string
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  aguardando:        { label: 'Aguardando',     variant: 'outline' },
  baixando:          { label: 'Baixando',        variant: 'secondary' },
  baixado:           { label: 'Baixado',         variant: 'secondary' },
  audio_processado:  { label: 'Áudio OK',        variant: 'secondary' },
  transcrito:        { label: 'Transcrito',      variant: 'default' },
  analisado:         { label: 'Analisado',       variant: 'default' },
  falha_download:    { label: 'Falha download',  variant: 'destructive' },
  falha_transcricao: { label: 'Falha transcrição', variant: 'destructive' },
  indisponivel:      { label: 'Indisponível',    variant: 'destructive' },
}

const TYPE_COLORS: Record<ActivityEntry['type'], string> = {
  info:    'text-blue-500',
  success: 'text-green-500',
  error:   'text-red-500',
  warning: 'text-yellow-500',
}

const PAGE_SIZE = 20

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function InfluenciadorVideos({ influencerId }: { influencerId: string }) {
  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState<string>('')
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  async function loadVideos(pg: number, status: string) {
    setLoading(true)
    const from = pg * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('videos')
      .select('id, tiktok_video_id, url, status, views, likes, viral_score, is_viral, data_publicacao, criado_em', { count: 'exact' })
      .eq('influencer_id', influencerId)
      .order('criado_em', { ascending: false })
      .range(from, to)

    if (status) query = query.eq('status', status)

    const { data, count } = await query
    setVideos((data ?? []) as Video[])
    setTotal(count ?? 0)
    setLoading(false)
  }

  useEffect(() => {
    loadVideos(page, statusFiltro)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFiltro, influencerId])

  // Realtime — atualizar status de vídeos na lista
  useEffect(() => {
    const STATUS_MESSAGES: Record<string, { msg: string; type: ActivityEntry['type'] }> = {
      baixado:          { msg: 'Vídeo baixado com sucesso', type: 'info' },
      audio_processado: { msg: 'Áudio separado (Demucs)', type: 'info' },
      transcrito:       { msg: 'Transcrição concluída', type: 'success' },
      analisado:        { msg: 'Análise pelos agentes concluída', type: 'success' },
      falha_download:   { msg: 'Falha no download', type: 'error' },
      falha_transcricao:{ msg: 'Falha na transcrição', type: 'error' },
      indisponivel:     { msg: 'Vídeo indisponível (deletado)', type: 'warning' },
    }

    const channel = supabase
      .channel(`influenciador-videos-${influencerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'videos',
          filter: `influencer_id=eq.${influencerId}`,
        },
        (payload) => {
          const v = payload.new as Video
          setActivity((prev) => [{
            id: `insert-${v.id}-${Date.now()}`,
            message: `Novo vídeo descoberto: ${v.tiktok_video_id}`,
            timestamp: new Date().toISOString(),
            type: 'info' as const,
          }, ...prev].slice(0, 50))
          // Recarregar se estiver na primeira página
          if (page === 0) loadVideos(0, statusFiltro)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: `influencer_id=eq.${influencerId}`,
        },
        (payload) => {
          const updated = payload.new as Video
          setVideos((prev) => prev.map((v) => v.id === updated.id ? { ...v, ...updated } : v))

          const cfg = STATUS_MESSAGES[updated.status]
          if (cfg) {
            setActivity((prev) => [{
              id: `update-${updated.id}-${Date.now()}`,
              message: `${cfg.msg} — ${updated.tiktok_video_id}`,
              timestamp: new Date().toISOString(),
              type: cfg.type,
            }, ...prev].slice(0, 50))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [influencerId, page, statusFiltro])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Log de atividade */}
      {activity.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium">Atividade em tempo real</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-32">
              <ul className="space-y-1">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                    <span className={TYPE_COLORS[entry.type]}>{entry.message}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Vídeos */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium">
              Vídeos ({total})
            </CardTitle>
            {/* Filtro de status */}
            <div className="flex items-center gap-1 flex-wrap">
              {['', 'analisado', 'transcrito', 'aguardando', 'falha_download'].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFiltro === s ? 'default' : 'outline'}
                  className="text-xs px-2 py-0.5 h-6"
                  onClick={() => { setStatusFiltro(s); setPage(0) }}
                >
                  {s === '' ? 'Todos' : (STATUS_CONFIG[s]?.label ?? s)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum vídeo {statusFiltro ? `com status "${STATUS_CONFIG[statusFiltro]?.label}"` : ''} encontrado.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        variant={(STATUS_CONFIG[video.status] ?? STATUS_CONFIG['aguardando']).variant}
                        className="text-xs shrink-0"
                      >
                        {STATUS_CONFIG[video.status]?.label ?? video.status}
                      </Badge>
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[200px]"
                      >
                        {video.tiktok_video_id}
                      </a>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {video.views > 0 && <span>👁 {formatNum(video.views)}</span>}
                      {video.likes > 0 && <span>❤️ {formatNum(video.likes)}</span>}
                      {video.is_viral && (
                        <Badge className="text-xs bg-red-600 hover:bg-red-600 px-1.5">
                          🔥 {Math.round(video.viral_score)}
                        </Badge>
                      )}
                      <span className="hidden sm:inline">
                        {video.data_publicacao
                          ? new Date(video.data_publicacao).toLocaleDateString('pt-BR')
                          : new Date(video.criado_em).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
