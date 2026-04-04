/**
 * Lógica compartilhada de download usada pelos jobs
 * `media.download.normal` e `media.download.priority`.
 * Referência: Seção 8 do Master Plan v3.0
 */

import os from 'os'
import path from 'path'
import fs from 'fs'
import { supabaseAdmin } from '@/lib/supabase/server'
import { downloadVideo } from './downloader'

/**
 * Executa o pipeline completo de download para um vídeo.
 * Retorna status final para o job registrar no banco.
 */
export async function runDownloadPipeline(videoId: string): Promise<{
  status: 'baixado' | 'falha_download' | 'indisponivel'
  tentativas: number
  erro?: string
}> {
  // Carregar metadados do vídeo
  const { data: video, error: loadError } = await supabaseAdmin
    .from('videos')
    .select('id, influencer_id, url, tiktok_video_id, tentativas_download')
    .eq('id', videoId)
    .single()

  if (loadError || !video) {
    throw new Error(`Vídeo não encontrado: ${videoId}`)
  }

  // Marcar como 'baixando'
  await supabaseAdmin
    .from('videos')
    .update({ status: 'baixando', atualizado_em: new Date().toISOString() })
    .eq('id', videoId)

  const tentativas = (video.tentativas_download || 0) + 1

  // Caminho temporário local para o download
  const tmpDir = path.join(os.tmpdir(), 'tiktok-copilot-downloads')
  const localPath = path.join(tmpDir, `${video.tiktok_video_id}.mp4`)

  const result = await downloadVideo(video.url, localPath)

  // Vídeo deletado/indisponível — não retry (Seção 8)
  if (result.is_unavailable) {
    await supabaseAdmin
      .from('videos')
      .update({
        status: 'indisponivel',
        tentativas_download: tentativas,
        erro_log: result.error,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', videoId)

    return { status: 'indisponivel', tentativas, erro: result.error }
  }

  // Falha no download
  if (!result.success || !result.file_path) {
    await supabaseAdmin
      .from('videos')
      .update({
        status: 'falha_download',
        tentativas_download: tentativas,
        erro_log: result.error,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', videoId)

    return { status: 'falha_download', tentativas, erro: result.error }
  }

  // Upload para Supabase Storage
  const storageKey = `${video.influencer_id}/${video.tiktok_video_id}.mp4`
  let uploadError: string | undefined

  try {
    const fileBuffer = fs.readFileSync(result.file_path)
    const { error } = await supabaseAdmin.storage
      .from('videos')
      .upload(storageKey, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      })

    if (error) uploadError = error.message
  } finally {
    // Deletar arquivo local imediatamente após upload — Seção 8
    if (fs.existsSync(result.file_path)) {
      fs.unlinkSync(result.file_path)
    }
  }

  if (uploadError) {
    await supabaseAdmin
      .from('videos')
      .update({
        status: 'falha_download',
        tentativas_download: tentativas,
        erro_log: `Upload falhou: ${uploadError}`,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', videoId)

    return { status: 'falha_download', tentativas, erro: uploadError }
  }

  // Sucesso: atualizar status e disparar separação de áudio
  await supabaseAdmin
    .from('videos')
    .update({
      status: 'baixado',
      tentativas_download: tentativas,
      erro_log: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', videoId)

  return { status: 'baixado', tentativas }
}
