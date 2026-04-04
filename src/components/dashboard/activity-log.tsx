'use client'

/**
 * Log de atividade em tempo real via Supabase Realtime.
 * Exibe as últimas ações do pipeline.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ActivityEntry {
  id: string
  message: string
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
}

function videoStatusToMessage(status: string, videoId: string): ActivityEntry | null {
  const messages: Record<string, { msg: string; type: ActivityEntry['type'] }> = {
    baixado:          { msg: `Vídeo baixado`, type: 'info' },
    audio_processado: { msg: `Áudio separado (Demucs)`, type: 'info' },
    transcrito:       { msg: `Vídeo transcrito`, type: 'success' },
    analisado:        { msg: `Vídeo analisado pelos agentes`, type: 'success' },
    falha_download:   { msg: `Falha no download`, type: 'error' },
    falha_transcricao:{ msg: `Falha na transcrição`, type: 'error' },
    indisponivel:     { msg: `Vídeo indisponível (deletado)`, type: 'warning' },
  }

  const config = messages[status]
  if (!config) return null

  return {
    id: `${videoId}-${status}-${Date.now()}`,
    message: config.msg,
    timestamp: new Date().toISOString(),
    type: config.type,
  }
}

const TYPE_COLORS: Record<ActivityEntry['type'], string> = {
  info:    'text-blue-600 dark:text-blue-400',
  success: 'text-green-600 dark:text-green-400',
  error:   'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
}

export function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  useEffect(() => {
    const channel = supabase
      .channel('activity-log-videos')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'videos' },
        (payload) => {
          const video = payload.new as { id: string; status: string }
          const entry = videoStatusToMessage(video.status, video.id)
          if (entry) {
            setEntries((prev) => [entry, ...prev].slice(0, 100)) // Manter últimas 100
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'videos' },
        (payload) => {
          const video = payload.new as { id: string; tiktok_video_id: string }
          setEntries((prev) => [
            {
              id: `insert-${video.id}`,
              message: `Novo vídeo descoberto: ${video.tiktok_video_id}`,
              timestamp: new Date().toISOString(),
              type: 'info' as const,
            },
            ...prev,
          ].slice(0, 100))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-medium mb-3">Atividade em tempo real</h3>
      <ScrollArea className="h-48">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aguardando atividade…</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                </span>
                <span className={TYPE_COLORS[entry.type]}>{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
