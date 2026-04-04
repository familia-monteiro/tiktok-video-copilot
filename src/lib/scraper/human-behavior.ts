/**
 * Simulação de comportamento humano sintético para o scraper.
 * Referência: Seção 5 (Vetor 3 — Análise Comportamental) do Master Plan v3.0
 *
 * Implementa:
 * - Delays em distribuição normal (não uniforme — automação usa uniforme)
 * - Micro-delays entre sub-ações
 * - Padrão de fadiga após 20+ interações consecutivas
 * - Pausas periódicas a cada 5-15 ações
 * - Scroll com curva de bezier (aceleração + desaceleração)
 */

import type { Page } from 'playwright'

/**
 * Gera número aleatório com distribuição normal (Box-Muller).
 */
function randomNormal(mean: number, std: number): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return Math.max(mean - 3 * std, Math.min(mean + 3 * std, num * std + mean))
}

/**
 * Delay base entre ações: 2000-8000ms em distribuição normal.
 * Seção 5 — Vetor 3: "não uniforme — automação usa uniforme"
 */
export async function actionDelay(actionCount = 0): Promise<void> {
  const baseMean = 4000
  const baseStd = 1500

  // Aplicar fadiga: ações ficam progressivamente mais lentas após 20 interações
  const fatigueFactor = actionCount >= 20
    ? 1 + ((actionCount - 20) * 0.03) // +3% por ação após a 20ª
    : 1

  const delay = Math.min(
    randomNormal(baseMean * fatigueFactor, baseStd * fatigueFactor),
    8000 * fatigueFactor
  )

  await sleep(Math.max(2000, Math.round(delay)))
}

/**
 * Micro-delay entre sub-ações (50ms a 300ms).
 * Seção 5 — Vetor 3: "micro-delays adicionais entre sub-ações"
 */
export async function microDelay(): Promise<void> {
  await sleep(Math.round(randomNormal(175, 60)))
}

/**
 * Pausa periódica: a cada 5-15 ações, pausa de 3-12 segundos.
 * Seção 5 — Vetor 3: "pausa periódica"
 *
 * @returns true se pausa foi aplicada
 */
export async function periodicPause(
  actionCount: number,
  nextPauseAt: number
): Promise<{ paused: boolean; nextPauseAt: number }> {
  if (actionCount < nextPauseAt) {
    return { paused: false, nextPauseAt }
  }

  const pauseDuration = Math.round(randomNormal(7500, 2500)) // 3-12s
  await sleep(Math.max(3000, Math.min(12000, pauseDuration)))

  const nextInterval = Math.floor(randomNormal(10, 3)) // 5-15 ações
  return {
    paused: true,
    nextPauseAt: actionCount + Math.max(5, Math.min(15, nextInterval)),
  }
}

/**
 * Scroll com curva de bezier temporal (aceleração inicial + desaceleração final).
 * Seção 5 — Vetor 3: "scroll em múltiplos passos com aceleração e desaceleração"
 *
 * @param page - Instância do Playwright Page
 * @param deltaY - Pixels a rolar (positivo = para baixo)
 * @param steps - Número de etapas intermediárias
 */
export async function bezierScroll(
  page: Page,
  deltaY: number,
  steps = 12
): Promise<void> {
  const scrolled = await page.evaluate(
    ({ deltaY, steps }: { deltaY: number; steps: number }) => {
      return new Promise<void>((resolve) => {
        let currentStep = 0
        const totalPixels = deltaY

        function easeInOutCubic(t: number): number {
          return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2
        }

        function scroll() {
          currentStep++
          const progress = currentStep / steps
          const easedProgress = easeInOutCubic(progress)
          const targetY = Math.round(easedProgress * totalPixels)

          window.scrollTo(0, window.scrollY + (targetY - Math.round(easeInOutCubic((currentStep - 1) / steps) * totalPixels)))

          if (currentStep < steps) {
            // Delay variável entre cada passo do scroll (20-80ms)
            const stepDelay = 30 + Math.random() * 50
            setTimeout(scroll, stepDelay)
          } else {
            resolve()
          }
        }

        scroll()
      })
    },
    { deltaY, steps }
  )
  void scrolled

  // Micro-delay após o scroll
  await microDelay()
}

/**
 * Movimento de mouse simulado em trajetória curva até o elemento.
 * Seção 5 — Vetor 3
 */
export async function moveToElement(
  page: Page,
  selector: string
): Promise<void> {
  const element = await page.$(selector)
  if (!element) return

  const box = await element.boundingBox()
  if (!box) return

  const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * 10
  const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * 10

  await page.mouse.move(targetX, targetY, { steps: Math.floor(randomNormal(8, 3)) })
  await microDelay()
}

/**
 * Simula atividade de "aquecimento" do perfil: navega para home, rola brevemente.
 * Seção 5 — Vetor 5: "ao criar perfil novo, simular atividade inicial de aquecimento"
 */
export async function warmupProfile(page: Page): Promise<void> {
  await page.goto('https://www.tiktok.com', { waitUntil: 'domcontentloaded' })
  await sleep(randomNormal(3000, 800))

  // Scroll leve na home
  await bezierScroll(page, 300, 8)
  await sleep(randomNormal(2000, 500))
  await bezierScroll(page, 200, 6)
  await sleep(randomNormal(1500, 400))
}

/**
 * Delay simples em ms.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
