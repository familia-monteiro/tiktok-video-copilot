/**
 * Endpoint: POST /api/internal/audio-complete
 * Recebe callback do Worker Python (Railway) após separação vocal.
 * Atualiza status do vídeo e dispara job de transcrição.
 *
 * Referência: Seção 9 do Master Plan v3.0
 * Autenticação: header x-worker-secret
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

const CallbackSchema = z.object({
  video_id: z.string().uuid(),
  success: z.boolean(),
  audio_storage_path: z.string().optional().default(''),
  error: z.string().optional().default(''),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Autenticar request do worker
  const secret = request.headers.get('x-worker-secret')
  if (!secret || secret !== process.env.RAILWAY_WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CallbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Schema inválido', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { video_id, success, audio_storage_path, error } = parsed.data

  if (!success) {
    // Falha no worker: marcar vídeo com erro e registrar log
    await supabaseAdmin
      .from('videos')
      .update({
        status: 'falha_analise',
        erro_log: `Worker falhou na separação vocal: ${error}`,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', video_id)

    return NextResponse.json({ ok: true, action: 'marked_failed' })
  }

  // Sucesso: atualizar status e disparar transcrição
  await supabaseAdmin
    .from('videos')
    .update({
      status: 'audio_processado',
      erro_log: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', video_id)

  // Disparar job de transcrição
  await inngest.send({
    name: 'audio/transcribe',
    data: {
      video_id,
      audio_storage_path,
    },
  })

  return NextResponse.json({ ok: true, action: 'transcription_dispatched' })
}
