export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

/**
 * POST /api/internal/requeue-downloads
 * Dispara eventos media/download.normal para todos os vídeos em status 'aguardando'.
 * Útil para reprocessar vídeos que falharam ou tiveram URLs corrigidas.
 * Protegido por SCRAPER_WORKER_SECRET.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.SCRAPER_WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let influencer_id: string | undefined
  try {
    const body = await request.json().catch(() => ({}))
    influencer_id = body.influencer_id
  } catch { /* sem body é ok */ }

  // Buscar vídeos aguardando (filtrado por influencer se passado)
  let query = supabaseAdmin
    .from('videos')
    .select('id, tiktok_video_id, url')
    .eq('status', 'aguardando')

  if (influencer_id) {
    query = query.eq('influencer_id', influencer_id)
  }

  const { data: videos, error } = await query.limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!videos || videos.length === 0) {
    return NextResponse.json({ ok: true, dispatched: 0, message: 'Nenhum vídeo aguardando encontrado' })
  }

  const events = videos.map((v) => ({
    name: 'media/download.normal' as const,
    data: { video_id: v.id },
  }))

  await inngest.send(events)

  return NextResponse.json({
    ok: true,
    dispatched: events.length,
    message: `${events.length} eventos de download disparados`,
  })
}
