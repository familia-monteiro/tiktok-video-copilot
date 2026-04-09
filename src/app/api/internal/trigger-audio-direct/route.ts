export const dynamic = 'force-dynamic'

/**
 * POST /api/internal/trigger-audio-direct
 * Chama o Railway Worker diretamente para todos os vídeos com status 'baixado'.
 * Sem Inngest — útil em dev onde o Inngest CLI não está rodando.
 *
 * Autenticação: x-admin-secret (SCRAPER_WORKER_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getConfig } from '@/lib/config/get-config'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.SCRAPER_WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const influencer_id = body.influencer_id as string | undefined
  const limit = Math.min(Number(body.limit) || 10, 50)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://roteiros.tiktok.superapps.ai'

  // Buscar credenciais do Railway
  const [workerUrl, workerSecret] = await Promise.all([
    getConfig('railway_worker_url'),
    getConfig('railway_worker_secret'),
  ])

  if (!workerUrl || !workerSecret) {
    return NextResponse.json({ error: 'Railway não configurado' }, { status: 500 })
  }

  // Buscar vídeos baixados
  let query = supabaseAdmin
    .from('videos')
    .select('id, influencer_id, tiktok_video_id, status')
    .eq('status', 'baixado')
    .limit(limit)

  if (influencer_id) query = query.eq('influencer_id', influencer_id)

  const { data: videos, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!videos?.length) return NextResponse.json({ ok: true, dispatched: 0, message: 'Nenhum vídeo baixado encontrado' })

  // Enviar para o Railway Worker — fire-and-forget (worker é síncrono, processa e chama callback)
  const results = await Promise.allSettled(
    videos.map(async (video) => {
      const storagePath = `videos/${video.influencer_id}/${video.id}.mp4`

      // Timeout curto: só verifica se o Worker aceitou a requisição (202/200)
      // O Worker processará assincronamente e chamará callback_url quando terminar
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)

      try {
        const res = await fetch(`${workerUrl}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': workerSecret,
          },
          body: JSON.stringify({
            video_id: video.id,
            storage_path: storagePath,
            callback_url: `${siteUrl}/api/internal/audio-complete`,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`${video.id}: HTTP ${res.status} ${txt}`)
        }
        return video.id
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        const msg = err instanceof Error ? err.message : String(err)
        // Timeout significa que o worker está processando (aguardará callback)
        if (msg.includes('abort') || msg.includes('signal')) {
          return `${video.id}:queued`
        }
        throw err
      }
    })
  )

  const dispatched = results.filter((r) => r.status === 'fulfilled').length
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => (r as PromiseRejectedResult).reason?.message)

  return NextResponse.json({ ok: true, dispatched, total: videos.length, errors })
}
