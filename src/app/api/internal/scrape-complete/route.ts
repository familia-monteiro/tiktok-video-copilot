/**
 * Endpoint: POST /api/internal/scrape-complete
 * Recebe callback do worker de scraping na VPS após conclusão de um batch.
 * Dispara evento Inngest para que o job aguardando retome a execução.
 *
 * Autenticação: header x-worker-secret (mesmo segredo configurado na VPS)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { inngest } from '@/lib/inngest/client'

const VideoMetadataSchema = z.object({
  tiktok_video_id: z.string(),
  url: z.string(),
  thumbnail_url: z.string().optional().default(''),
  views: z.number().default(0),
  data_publicacao: z.string().optional().nullable(),
})

const PageStateSchema = z.object({
  scroll_position: z.number(),
  last_video_id: z.string().nullable(),
  has_more: z.boolean(),
})

const CallbackSchema = z.object({
  job_id: z.string(),
  influencer_id: z.string(),
  success: z.boolean(),
  videos: z.array(VideoMetadataSchema).optional().default([]),
  page_state: PageStateSchema.optional(),
  captcha_detected: z.boolean().optional().default(false),
  error: z.string().optional().default(''),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Autenticar request do worker VPS
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

  // Disparar evento para que o job Inngest aguardando retome
  await inngest.send({
    name: 'scrape/batch.complete',
    data: parsed.data,
  })

  return NextResponse.json({ ok: true })
}
