import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Atualiza o status do banco e solicita o download assíncrono para a VPS.
 * Utilizado por media.download.normal e media.download.priority.
 */
export async function requestDownloadOnVPS(videoId: string): Promise<number> {
  const { data: video, error: loadError } = await supabaseAdmin
    .from('videos')
    .select('id, influencer_id, url, tiktok_video_id, tentativas_download')
    .eq('id', videoId)
    .single()

  if (loadError || !video) {
    throw new Error(`Vídeo não encontrado: ${videoId}`)
  }

  const tentativas = (video.tentativas_download || 0) + 1

  await supabaseAdmin
    .from('videos')
    .update({ 
      status: 'baixando', 
      tentativas_download: tentativas,
      atualizado_em: new Date().toISOString() 
    })
    .eq('id', videoId)

  const workerUrl = process.env.SCRAPER_WORKER_URL || 'https://scraper.superapps.ai'
  const workerSecret = process.env.SCRAPER_WORKER_SECRET || ''
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://roteiros.tiktok.superapps.ai'
  const callbackUrl = `${siteUrl}/api/internal/download-complete`

  const res = await fetch(`${workerUrl}/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret
    },
    body: JSON.stringify({
      video_id: videoId,
      url: video.url,
      influencer_id: video.influencer_id,
      callback_url: callbackUrl
    })
  })

  if (!res.ok) {
    let err = 'Desconhecido'
    try {
      const text = await res.text()
      err = text || res.statusText
    } catch { err = res.statusText }
    throw new Error(`Falha ao contactar Worker VPS (${res.status}): ${err}`)
  }

  return tentativas
}
