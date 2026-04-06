export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { inngest } from '@/lib/inngest/client'

const CallbackSchema = z.object({
  event: z.literal('download.complete'),
  video_id: z.string(),
  influencer_id: z.string(),
  success: z.boolean(),
  storage_path: z.string().optional().nullable(),
  error_message: z.string().optional().nullable()
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-worker-secret')
  if (!secret || secret !== process.env.SCRAPER_WORKER_SECRET) {
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

  await inngest.send({
    name: 'download.complete', // Esse é o nome do evento no inngest
    data: parsed.data,
  })

  return NextResponse.json({ ok: true })
}
