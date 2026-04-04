'use client'

/**
 * Exibe o status do pipeline em tempo real via Supabase Realtime.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import type { StatusPipeline } from '@/types/database'

const STATUS_CONFIG: Record<StatusPipeline, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente:      { label: 'Pendente',     variant: 'outline' },
  descobrindo:   { label: 'Descobrindo',  variant: 'secondary' },
  processando:   { label: 'Processando',  variant: 'default' },
  ativo:         { label: 'Ativo',        variant: 'default' },
  pausado:       { label: 'Pausado',      variant: 'outline' },
  erro:          { label: 'Erro',         variant: 'destructive' },
}

interface PipelineStatusBadgeProps {
  influencerId: string
  initialStatus: StatusPipeline
}

export function PipelineStatusBadge({ influencerId, initialStatus }: PipelineStatusBadgeProps) {
  const [status, setStatus] = useState<StatusPipeline>(initialStatus)

  useEffect(() => {
    const channel = supabase
      .channel(`influencer-status-${influencerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'influenciadores',
          filter: `id=eq.${influencerId}`,
        },
        (payload) => {
          const updated = payload.new as { status_pipeline: StatusPipeline }
          if (updated.status_pipeline) setStatus(updated.status_pipeline)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [influencerId])

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendente

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  )
}
