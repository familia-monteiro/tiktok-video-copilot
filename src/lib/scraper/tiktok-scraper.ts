/**
 * Lógica de scraping do TikTok.
 * Referência: Seções 4, 5, 7 do Master Plan v3.0
 *
 * Responsabilidades:
 * - Navegar para o perfil do influenciador
 * - Coletar metadados dos vídeos (URL, views, thumbnail, data)
 * - Detectar e reportar CAPTCHAs
 * - Scroll com comportamento humano sintético
 */

import type { BrowserContext, Page } from 'playwright-core'
import {
  actionDelay,
  bezierScroll,
  microDelay,
  periodicPause,
  sleep,
} from './human-behavior'

export interface VideoMetadata {
  tiktok_video_id: string
  url: string
  thumbnail_url: string | null
  views: number
  data_publicacao: string | null
}

export interface ScrapeResult {
  videos: VideoMetadata[]
  captcha_detected: boolean
  page_state: {
    scroll_position: number
    last_video_id: string | null
    has_more: boolean
  }
}

export interface ScrapeOptions {
  max_videos: number             // Máximo a coletar nesta execução
  resume_scroll_y?: number       // Posição Y para retomar (de checkpoint)
  known_video_ids?: Set<string>  // IDs já conhecidos (para deduplicação)
  mode: 'initial' | 'monitor'   // Seção 7: os dois modos são distintos
}

/**
 * Parseia número formatado do TikTok: "47K" → 47000, "1.2M" → 1200000
 */
export function parseTikTokNumber(text: string): number {
  if (!text) return 0
  const clean = text.replace(/[^0-9.KMB]/gi, '').trim()
  if (!clean) return 0

  const num = parseFloat(clean)
  if (isNaN(num)) return 0

  const upper = clean.toUpperCase()
  if (upper.includes('B')) return Math.round(num * 1_000_000_000)
  if (upper.includes('M')) return Math.round(num * 1_000_000)
  if (upper.includes('K')) return Math.round(num * 1_000)
  return Math.round(num)
}

/**
 * Detecta CAPTCHA na página.
 * Seção 4.2 do Master Plan.
 */
export async function detectCaptcha(page: Page): Promise<boolean> {
  const url = page.url()
  if (url.includes('/captcha') || url.includes('verify')) return true

  const title = await page.title()
  if (title.toLowerCase().includes('verify')) return true

  const captchaSelector = await page.$('.captcha-verify-container')
  if (captchaSelector) return true

  return false
}

/**
 * Extrai metadados de um vídeo a partir do seu elemento na página.
 * Retorna null se não conseguir extrair o ID do vídeo.
 */
async function extractVideoData(
  page: Page,
  itemElement: { href: string; thumbnail: string | null; views: string; time: string | null }
): Promise<VideoMetadata | null> {
  // Extrair video ID da URL: /@handle/video/7123456789
  const match = itemElement.href.match(/\/video\/(\d+)/)
  if (!match) return null

  const tiktok_video_id = match[1]

  // Normalizar a URL: o href pode ser relativo (/@handle/video/ID)
  // ou absoluto (https://www.tiktok.com/@handle/video/ID).
  // Evitar duplicação como "https://www.tiktok.comhttps://..."
  let url: string
  if (itemElement.href.startsWith('http')) {
    url = itemElement.href
  } else {
    url = `https://www.tiktok.com${itemElement.href}`
  }

  return {
    tiktok_video_id,
    url,
    thumbnail_url: itemElement.thumbnail,
    views: parseTikTokNumber(itemElement.views),
    data_publicacao: itemElement.time,
  }
}


/**
 * Coleta todos os itens de vídeo visíveis na página no momento.
 */
async function collectVisibleVideos(page: Page): Promise<
  Array<{ href: string; thumbnail: string | null; views: string; time: string | null }>
> {
  return page.evaluate(() => {
    const items: Array<{
      href: string
      thumbnail: string | null
      views: string
      time: string | null
    }> = []

    // Seletores robustos usando data-e2e (mais estáveis que classes hash)
    // Fallback para seletores por padrão de URL de vídeo
    const links = Array.from(
      document.querySelectorAll('a[href*="/video/"]')
    ) as HTMLAnchorElement[]

    const seen = new Set<string>()

    for (const link of links) {
      const href = link.getAttribute('href') || ''
      if (!href.includes('/video/') || seen.has(href)) continue
      seen.add(href)

      // Thumbnail: img mais próxima ao link
      const container = link.closest('div[class]') || link.parentElement
      const img = container?.querySelector('img') as HTMLImageElement | null
      const thumbnail = img?.src || img?.getAttribute('data-src') || null

      // Views: span/strong dentro do container com número
      let views = '0'
      const spans = container?.querySelectorAll('strong, span') || []
      for (const span of Array.from(spans)) {
        const text = (span as HTMLElement).innerText || ''
        if (/[\d.]+[KMB]?/i.test(text) && text.length < 10) {
          views = text.trim()
          break
        }
      }

      // Tempo de publicação (pode não estar disponível no feed)
      const time = null

      items.push({ href, thumbnail, views, time })
    }

    return items
  })
}

/**
 * Scraper principal do perfil TikTok.
 * Implementa Seção 7 (modo inicial e monitoramento).
 *
 * @param context - BrowserContext com proxy e perfil configurados
 * @param handle - @handle do influenciador (sem o @)
 * @param options - Opções de scraping
 */
export async function scrapeTikTokProfile(
  context: BrowserContext,
  handle: string,
  options: ScrapeOptions
): Promise<ScrapeResult> {
  const page = await context.newPage()
  const collectedVideos: VideoMetadata[] = []
  const seenIds = new Set(options.known_video_ids || [])
  let captcha_detected = false
  let actionCount = 0
  let nextPauseAt = Math.floor(Math.random() * 6) + 5 // primeira pausa em 5-10 ações

  try {
    // Navegar para o perfil
    const profileUrl = `https://www.tiktok.com/@${handle}`
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(2000)

    // Verificar CAPTCHA imediatamente após navegação
    if (await detectCaptcha(page)) {
      captcha_detected = true
      return {
        videos: collectedVideos,
        captcha_detected: true,
        page_state: { scroll_position: 0, last_video_id: null, has_more: false },
      }
    }

    // Modo monitoramento: scroll máximo de 20 posições
    const maxScrolls = options.mode === 'monitor' ? 20 : 9999

    // Retomar de checkpoint: rolar até a posição salva
    if (options.resume_scroll_y && options.resume_scroll_y > 0) {
      await page.evaluate((y: number) => window.scrollTo(0, y), options.resume_scroll_y)
      await sleep(1500)
    }

    let scrollCount = 0
    let noNewVideosCount = 0
    let lastScrollY = options.resume_scroll_y || 0

    while (scrollCount < maxScrolls && collectedVideos.length < options.max_videos) {
      // Coletar vídeos visíveis agora
      const rawItems = await collectVisibleVideos(page)

      let newThisBatch = 0
      for (const item of rawItems) {
        const video = await extractVideoData(page, item)
        if (!video) continue
        if (seenIds.has(video.tiktok_video_id)) {
          // Modo monitor: ao encontrar ID já existente, parar imediatamente
          if (options.mode === 'monitor') {
            return {
              videos: collectedVideos,
              captcha_detected: false,
              page_state: {
                scroll_position: lastScrollY,
                last_video_id: collectedVideos.at(-1)?.tiktok_video_id || null,
                has_more: false, // Alcançou vídeos conhecidos
              },
            }
          }
          continue
        }

        seenIds.add(video.tiktok_video_id)
        collectedVideos.push(video)
        newThisBatch++

        if (collectedVideos.length >= options.max_videos) break
      }

      if (collectedVideos.length >= options.max_videos) break

      // Sem novos vídeos por 3 scrolls consecutivos = chegou ao fim
      if (newThisBatch === 0) {
        noNewVideosCount++
        if (noNewVideosCount >= 3) break
      } else {
        noNewVideosCount = 0
      }

      // Scroll para baixo com comportamento humano
      actionCount++
      await actionDelay(actionCount)

      const scrollDelta = Math.round(Math.random() * 400 + 600) // 600-1000px
      await bezierScroll(page, scrollDelta)

      lastScrollY = await page.evaluate(() => window.scrollY)
      scrollCount++

      // Verificar CAPTCHA após cada scroll
      if (await detectCaptcha(page)) {
        captcha_detected = true
        break
      }

      // Pausas periódicas
      const { nextPauseAt: newPauseAt } = await periodicPause(actionCount, nextPauseAt)
      nextPauseAt = newPauseAt

      await microDelay()
    }

    const hasMore =
      collectedVideos.length >= options.max_videos ||
      (scrollCount >= maxScrolls && noNewVideosCount < 3)

    return {
      videos: collectedVideos,
      captcha_detected,
      page_state: {
        scroll_position: lastScrollY,
        last_video_id: collectedVideos.at(-1)?.tiktok_video_id || null,
        has_more: hasMore,
      },
    }
  } finally {
    await page.close()
  }
}
