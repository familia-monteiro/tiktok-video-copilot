export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

/**
 * POST /api/internal/requeue-audio
 * Dispara eventos audio/separate para todos os vídeos com status 'baixado'.
 * Útil para reprocessar após correção de bug no storage_path.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.SCRAPER_WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const influencer_id = body.influencer_id

  let query = supabaseAdmin
    .from('videos')
    .select('id')
    .eq('status', 'baixado')

  if (influencer_id) query = query.eq('influencer_id', influencer_id)

  const { data: videos, error } = await query.limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!videos?.length) return NextResponse.json({ ok: true, dispatched: 0 })

  const events = videos.map((v) => ({
    name: 'audio/separate' as const,
    data: { video_id: v.id },
  }))

  await inngest.send(events)

  return NextResponse.json({ ok: true, dispatched: events.length })
}
