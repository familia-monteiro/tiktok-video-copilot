/**
 * Download de vídeos via yt-dlp.
 * Referência: Seção 8 do Master Plan v3.0
 *
 * Regras invioláveis:
 * - SEM proxy — downloads vão direto à CDN do TikTok
 * - Qualidade máxima 720p (evitar arquivo desnecessariamente grande)
 * - Verificar integridade após download (tamanho > 0, formato válido)
 * - HTTP 404/410 → status 'indisponivel' imediato, sem retry
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

export interface DownloadResult {
  success: boolean
  file_path?: string
  file_size_bytes?: number
  error?: string
  is_unavailable?: boolean // 404/410 — vídeo deletado
}

/**
 * Baixa um vídeo TikTok via yt-dlp.
 * Sem proxy. Qualidade máxima 720p.
 * Referência: Seção 8 do Master Plan.
 *
 * @param url - URL do vídeo TikTok
 * @param output_path - Caminho de destino para o arquivo .mp4
 */
export async function downloadVideo(
  url: string,
  output_path: string
): Promise<DownloadResult> {
  // Garantir que o diretório de destino existe
  fs.mkdirSync(path.dirname(output_path), { recursive: true })

  const ytdlpArgs = [
    'yt-dlp',
    '--no-playlist',
    '--format', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', // Máx 720p — Seção 8
    '--merge-output-format', 'mp4',
    '--output', `"${output_path}"`,
    '--no-warnings',
    '--quiet',
    '--no-progress',
    // Sem proxy — download direto na CDN (Seção 6: regra inviolável)
    url,
  ].join(' ')

  try {
    await execAsync(ytdlpArgs, { timeout: 120_000 }) // 2 min timeout
  } catch (err: unknown) {
    const error = err as { stderr?: string; stdout?: string; code?: number }
    const stderr = error?.stderr || ''

    // HTTP 404/410 — vídeo indisponível: não retry (Seção 8)
    if (
      stderr.includes('HTTP Error 404') ||
      stderr.includes('HTTP Error 410') ||
      stderr.includes('Video unavailable') ||
      stderr.includes('This video is unavailable') ||
      stderr.includes('does not exist')
    ) {
      return { success: false, is_unavailable: true, error: stderr }
    }

    return { success: false, error: stderr || String(err) }
  }

  // Verificar integridade: arquivo deve existir e ter tamanho > 0 (Seção 8)
  if (!fs.existsSync(output_path)) {
    return { success: false, error: 'Arquivo não encontrado após download' }
  }

  const stats = fs.statSync(output_path)
  if (stats.size === 0) {
    fs.unlinkSync(output_path)
    return { success: false, error: 'Arquivo vazio após download' }
  }

  return {
    success: true,
    file_path: output_path,
    file_size_bytes: stats.size,
  }
}
