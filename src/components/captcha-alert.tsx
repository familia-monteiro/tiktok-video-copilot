'use client'

/**
 * Componente de alerta de CAPTCHA.
 * Ouve Supabase Realtime na tabela `captcha_alerts`.
 * Exibe badge vermelho pulsante com botão "Resolver CAPTCHA".
 *
 * Referência: Seção 4.2, 31 do Master Plan v3.0 — Entrega 1.10
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface CaptchaAlertRow {
  id: string
  influencer_id: string
  status: 'aguardando' | 'resolvido' | 'abandonado'
  criado_em: string
  estado_salvo: Record<string, unknown> | null
}

export function CaptchaAlertBanner() {
  const [pendingAlerts, setPendingAlerts] = useState<CaptchaAlertRow[]>([])
  const [resolving, setResolving] = useState<Set<string>>(new Set())

  // Carregar alertas pendentes ao montar
  useEffect(() => {
    async function loadPending() {
      const { data } = await supabase
        .from('captcha_alerts')
        .select('*')
        .eq('status', 'aguardando')
        .order('criado_em', { ascending: false })

      if (data) setPendingAlerts(data as CaptchaAlertRow[])
    }

    loadPending()

    // Subscrever Realtime para novos alertas — Seção 4.2
    const channel = supabase
      .channel('captcha-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'captcha_alerts',
        },
        (payload) => {
          const newAlert = payload.new as CaptchaAlertRow
          if (newAlert.status === 'aguardando') {
            setPendingAlerts((prev) => [newAlert, ...prev])
            toast.error('CAPTCHA detectado!', {
              description: 'Um influenciador precisa de resolução manual de CAPTCHA.',
              duration: 10000,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'captcha_alerts',
        },
        (payload) => {
          const updated = payload.new as CaptchaAlertRow
          if (updated.status === 'resolvido') {
            setPendingAlerts((prev) => prev.filter((a) => a.id !== updated.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleResolve(alertId: string) {
    setResolving((prev) => new Set(prev).add(alertId))

    try {
      const response = await fetch('/api/internal/captcha-resolved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captcha_alert_id: alertId }),
      })

      if (!response.ok) {
        throw new Error('Falha ao resolver CAPTCHA')
      }

      setPendingAlerts((prev) => prev.filter((a) => a.id !== alertId))
      toast.success('CAPTCHA resolvido! Job retomado.')
    } catch (err) {
      toast.error('Erro ao resolver CAPTCHA. Tente novamente.')
      console.error(err)
    } finally {
      setResolving((prev) => {
        const s = new Set(prev)
        s.delete(alertId)
        return s
      })
    }
  }

  if (pendingAlerts.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {pendingAlerts.map((alert) => (
        <Alert
          key={alert.id}
          variant="destructive"
          className="flex items-center justify-between animate-pulse border-red-500 bg-red-50 dark:bg-red-950"
        >
          <div>
            <AlertTitle className="flex items-center gap-2">
              <Badge variant="destructive" className="animate-pulse">
                CAPTCHA
              </Badge>
              Resolução manual necessária
            </AlertTitle>
            <AlertDescription className="text-xs mt-1 text-muted-foreground">
              Detectado em {new Date(alert.criado_em).toLocaleTimeString('pt-BR')}
              {alert.estado_salvo?.total_coletados !== undefined && (
                <span> · {String(alert.estado_salvo.total_coletados)} vídeos coletados antes</span>
              )}
            </AlertDescription>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={resolving.has(alert.id)}
            onClick={() => handleResolve(alert.id)}
          >
            {resolving.has(alert.id) ? 'Retomando...' : 'Resolver CAPTCHA'}
          </Button>
        </Alert>
      ))}
    </div>
  )
}
