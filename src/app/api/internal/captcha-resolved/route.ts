/**
 * Endpoint: POST /api/internal/captcha-resolved
 * Marca o CAPTCHA como resolvido e retoma o job de onde parou.
 *
 * Referência: Seção 4.2 do Master Plan v3.0
 *
 * Fluxo:
 * 1. Operador clica "Resolver CAPTCHA" no dashboard
 * 2. Frontend chama este endpoint com o captcha_alert_id
 * 3. Endpoint marca status = 'resolvido'
 * 4. Re-dispara o job de scraping a partir do checkpoint salvo
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

const BodySchema = z.object({
  captcha_alert_id: z.string().uuid(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Schema inválido' }, { status: 400 })
  }

  const { captcha_alert_id } = parsed.data

  // Buscar alerta de CAPTCHA
  const { data: alert, error: alertError } = await supabaseAdmin
    .from('captcha_alerts')
    .select('*')
    .eq('id', captcha_alert_id)
    .eq('status', 'aguardando')
    .single()

  if (alertError || !alert) {
    return NextResponse.json(
      { error: 'Alerta não encontrado ou já resolvido' },
      { status: 404 }
    )
  }

  // Marcar como resolvido
  await supabaseAdmin
    .from('captcha_alerts')
    .update({
      status: 'resolvido',
      resolvido_em: new Date().toISOString(),
      resolvido_por: 'operador',
    })
    .eq('id', captcha_alert_id)

  // Re-disparar o job de scraping com o checkpoint salvo
  // O checkpoint contém posição de scroll, último video_id e total coletados
  const estadoSalvo = alert.estado_salvo as Record<string, unknown> | null

  if (estadoSalvo?.modo === 'monitor') {
    // CAPTCHA ocorreu no monitoramento — re-disparar monitor
    await inngest.send({
      name: 'scrape/discover.monitor' as const,
      data: { influencer_id: alert.influencer_id },
    })
  } else {
    // CAPTCHA ocorreu na coleta inicial — re-disparar com checkpoint
    await inngest.send({
      name: 'scrape/discover.initial' as const,
      data: { influencer_id: alert.influencer_id },
    })
  }

  return NextResponse.json({ ok: true, action: 'job_redispatched', influencer_id: alert.influencer_id })
}
