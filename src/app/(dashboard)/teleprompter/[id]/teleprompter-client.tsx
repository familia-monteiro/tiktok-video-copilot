'use client'

/**
 * Teleprompter — Componente client com lógica de scroll, controles e modo ensaio.
 * Referência: Seção 27 do Master Plan v3.0
 *
 * Controles:
 *   Espaço / toque central  → pausar/continuar
 *   ↑ / swipe up            → início do bloco atual
 *   ↓ / swipe down          → próximo bloco
 *   + / =                   → aumentar fonte
 *   -                       → diminuir fonte
 *   ← / swipe left          → diminuir velocidade
 *   → / swipe right         → aumentar velocidade
 *   R                       → reiniciar
 *   E                       → modo ensaio
 */

import { useEffect, useRef, useState, useCallback } from 'react'

interface Bloco {
  id: string
  tipo: string
  ordem: number
  duracao_segundos: number
  texto: string
  tom: string
  direcao_camera: string
  enfase: string[]
  pausa_antes: boolean
  pausa_depois: boolean
  notas: string
  marcadores_acao: string[]
}

interface Props {
  roteiroId: string
  produtoNome: string
  conteudo: Record<string, unknown>
  velocidadeWpm: number
}

const FONT_MIN = 32
const FONT_MAX = 72
const FONT_DEFAULT = 48
const VELOCIDADE_MIN = 0.5
const VELOCIDADE_MAX = 2.0
const VELOCIDADE_STEP = 0.1

// Largura da coluna em caracteres (estimativa para cálculo de velocidade)
const CHARS_POR_LINHA = 45
const MEDIA_CHARS_POR_PALAVRA = 5.5

export function TeleprompterClient({ produtoNome, conteudo, velocidadeWpm }: Props) {
  const blocos: Bloco[] = (conteudo.blocos as Bloco[]) ?? []
  const duracaoTotal = blocos.reduce((acc, b) => acc + b.duracao_segundos, 0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const scrollYRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)

  const [playing, setPlaying] = useState(false)
  const [fontSize, setFontSize] = useState(FONT_DEFAULT)
  const [velocidadeFator, setVelocidadeFator] = useState(1.0)
  const [modoEnsaio, setModoEnsaio] = useState(false)
  const [blocoAtual, setBlocoAtual] = useState(0)
  const [tempoDecorrido, setTempoDecorrido] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [totalScrollHeight, setTotalScrollHeight] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // ── Calcular velocidade de scroll (px/s) ──
  const calcularVelocidade = useCallback(() => {
    const palavrasPorLinha = CHARS_POR_LINHA / MEDIA_CHARS_POR_PALAVRA
    const linhasPorMinuto = velocidadeWpm / palavrasPorLinha
    const linhasPorSegundo = linhasPorMinuto / 60
    const alturaLinha = fontSize * 1.6 // line-height ~1.6
    return linhasPorSegundo * alturaLinha * velocidadeFator
  }, [velocidadeWpm, fontSize, velocidadeFator])

  // ── Scroll automático ──
  useEffect(() => {
    if (!playing || modoEnsaio) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      lastTimeRef.current = null
      return
    }

    const velocidadePxS = calcularVelocidade()

    const tick = (time: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = time
      const delta = (time - lastTimeRef.current) / 1000
      lastTimeRef.current = time

      if (scrollRef.current) {
        scrollYRef.current += velocidadePxS * delta
        scrollRef.current.scrollTop = scrollYRef.current

        // Detectar bloco atual baseado no scroll
        atualizarBlocoAtual()

        // Parar ao chegar no fim
        if (scrollYRef.current >= scrollRef.current.scrollHeight - scrollRef.current.clientHeight) {
          setPlaying(false)
          return
        }
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [playing, modoEnsaio, calcularVelocidade])

  // ── Timer de tempo decorrido ──
  useEffect(() => {
    if (playing && !modoEnsaio) {
      timerRef.current = setInterval(() => {
        setTempoDecorrido((t) => t + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playing, modoEnsaio])

  // ── Ocultar controles após 3s sem interação ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [playing, showControls])

  function atualizarBlocoAtual() {
    if (!scrollRef.current) return
    const scrollTop = scrollRef.current.scrollTop
    const blocoEls = scrollRef.current.querySelectorAll('[data-bloco]')

    for (let i = blocoEls.length - 1; i >= 0; i--) {
      const el = blocoEls[i] as HTMLElement
      if (el.offsetTop <= scrollTop + 100) {
        setBlocoAtual(i)
        break
      }
    }
  }

  // ── Handlers de teclado ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      setShowControls(true)

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (modoEnsaio) {
            // Modo ensaio: avançar bloco
            setBlocoAtual((b) => {
              if (b >= blocos.length - 1) return 0
              return b + 1
            })
          } else {
            setPlaying((p) => !p)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          irParaBlocoAtual()
          break
        case 'ArrowDown':
          e.preventDefault()
          proximoBloco()
          break
        case '+':
        case '=':
          setFontSize((f) => Math.min(FONT_MAX, f + 2))
          break
        case '-':
          setFontSize((f) => Math.max(FONT_MIN, f - 2))
          break
        case 'ArrowLeft':
          setVelocidadeFator((v) => Math.max(VELOCIDADE_MIN, +(v - VELOCIDADE_STEP).toFixed(1)))
          break
        case 'ArrowRight':
          setVelocidadeFator((v) => Math.min(VELOCIDADE_MAX, +(v + VELOCIDADE_STEP).toFixed(1)))
          break
        case 'r':
        case 'R':
          reiniciar()
          break
        case 'e':
        case 'E':
          setModoEnsaio((m) => !m)
          setPlaying(false)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modoEnsaio, blocos.length])

  // ── Handlers de toque ──
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    setShowControls(true)

    if (absDx < 20 && absDy < 20) {
      // Toque central: pausar/continuar
      if (modoEnsaio) {
        setBlocoAtual((b) => (b >= blocos.length - 1 ? 0 : b + 1))
      } else {
        setPlaying((p) => !p)
      }
    } else if (absDy > absDx) {
      if (dy < 0) proximoBloco()   // swipe up = próximo bloco
      else irParaBlocoAtual()       // swipe down = início do bloco
    } else {
      if (dx < 0) setVelocidadeFator((v) => Math.max(VELOCIDADE_MIN, +(v - VELOCIDADE_STEP).toFixed(1)))
      else setVelocidadeFator((v) => Math.min(VELOCIDADE_MAX, +(v + VELOCIDADE_STEP).toFixed(1)))
    }

    touchStartRef.current = null
  }

  function irParaBlocoAtual() {
    if (!scrollRef.current) return
    const blocoEls = scrollRef.current.querySelectorAll('[data-bloco]')
    const el = blocoEls[blocoAtual] as HTMLElement | undefined
    if (el) {
      scrollYRef.current = el.offsetTop - 80
      scrollRef.current.scrollTop = scrollYRef.current
    }
  }

  function proximoBloco() {
    if (!scrollRef.current) return
    const blocoEls = scrollRef.current.querySelectorAll('[data-bloco]')
    const next = Math.min(blocoAtual + 1, blocos.length - 1)
    const el = blocoEls[next] as HTMLElement | undefined
    if (el) {
      scrollYRef.current = el.offsetTop - 80
      scrollRef.current.scrollTop = scrollYRef.current
      setBlocoAtual(next)
    }
  }

  function reiniciar() {
    setPlaying(false)
    setBlocoAtual(0)
    setTempoDecorrido(0)
    scrollYRef.current = 0
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    lastTimeRef.current = null
  }

  // Tempo restante
  const tempoRestante = Math.max(0, duracaoTotal - tempoDecorrido)
  const minutos = Math.floor(tempoRestante / 60)
  const segundos = tempoRestante % 60
  const progressoPct = duracaoTotal > 0 ? Math.min(100, (tempoDecorrido / duracaoTotal) * 100) : 0

  // ── Modo Ensaio ──
  if (modoEnsaio) {
    const bloco = blocos[blocoAtual]
    if (!bloco) return null

    return (
      <div
        className="fixed inset-0 bg-black flex flex-col items-center justify-center"
        style={{ color: '#FFFFFF' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Tipo do bloco */}
        <p className="text-xs uppercase tracking-widest mb-8 opacity-40">
          {bloco.tipo.replace(/_/g, ' ')}
        </p>

        {/* Texto do bloco */}
        <div
          className="text-center px-8 leading-relaxed"
          style={{ fontSize: `${fontSize}px`, maxWidth: '60%' }}
        >
          {renderTextoBloco(bloco, fontSize)}
        </div>

        {/* Indicador de bloco */}
        <p className="absolute bottom-6 left-6 text-xs opacity-30">
          {blocoAtual + 1}/{blocos.length} — {bloco.tipo.replace(/_/g, ' ')}
        </p>

        {/* Instrução */}
        <p className="absolute bottom-6 right-6 text-xs opacity-30">
          [Espaço] próximo · [E] sair do ensaio
        </p>
      </div>
    )
  }

  // ── Modo Normal ──
  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden select-none"
      style={{ color: '#FFFFFF' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Barra de progresso 2px no topo */}
      <div
        className="fixed top-0 left-0 h-0.5 bg-white transition-all duration-300"
        style={{ width: `${progressoPct}%`, opacity: 0.4 }}
      />

      {/* Conteúdo com scroll */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Padding top para iniciar texto no meio da tela */}
        <div style={{ paddingTop: '30vh', paddingBottom: '70vh' }}>
          <div
            className="mx-auto"
            style={{ width: '60%', maxWidth: '900px' }}
          >
            {blocos.map((bloco, idx) => (
              <div
                key={bloco.id}
                data-bloco={idx}
                className="mb-12"
              >
                {/* Pausa antes */}
                {bloco.pausa_antes && <div className="h-8" />}

                {/* Texto do bloco */}
                <div
                  className="leading-relaxed"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {renderTextoBloco(bloco, fontSize)}
                </div>

                {/* Pausa depois */}
                {bloco.pausa_depois && <div className="h-8" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicadores mínimos — baixo contraste para não distrair */}
      {/* Timer: canto inferior direito */}
      <div
        className="fixed bottom-6 right-6 text-sm font-mono transition-opacity duration-500"
        style={{ opacity: 0.25, color: '#FFFFFF' }}
      >
        {minutos}:{String(segundos).padStart(2, '0')}
      </div>

      {/* Bloco atual: canto inferior esquerdo */}
      <div
        className="fixed bottom-6 left-6 text-sm font-mono transition-opacity duration-500"
        style={{ opacity: 0.25, color: '#FFFFFF' }}
      >
        {blocoAtual + 1}/{blocos.length}
      </div>

      {/* Controles visíveis apenas ao interagir (showControls) */}
      {showControls && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-xs opacity-60 bg-black/80 px-4 py-2 rounded-full transition-opacity duration-300"
          style={{ color: '#FFFFFF' }}
        >
          <button
            type="button"
            className="hover:opacity-100"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? '⏸' : '▶'} {playing ? 'Pausar' : 'Iniciar'}
          </button>
          <span className="opacity-40">|</span>
          <button type="button" className="hover:opacity-100" onClick={() => setFontSize((f) => Math.min(FONT_MAX, f + 2))}>A+</button>
          <button type="button" className="hover:opacity-100" onClick={() => setFontSize((f) => Math.max(FONT_MIN, f - 2))}>A-</button>
          <span className="opacity-40">|</span>
          <span>{velocidadeFator.toFixed(1)}x</span>
          <span className="opacity-40">|</span>
          <button
            type="button"
            className="hover:opacity-100"
            onClick={() => { setModoEnsaio(true); setPlaying(false) }}
          >
            Ensaio [E]
          </button>
          <span className="opacity-40">|</span>
          <button type="button" className="hover:opacity-100" onClick={reiniciar}>
            ↺ Reiniciar [R]
          </button>
          <span className="opacity-40">|</span>
          <a href="/roteiros" className="hover:opacity-100 text-xs">✕ Sair</a>
        </div>
      )}

      {/* Nome do produto — invisível por padrão, aparece com hover/showControls */}
      {showControls && (
        <div
          className="fixed top-4 left-4 text-xs opacity-30"
          style={{ color: '#FFFFFF' }}
        >
          {produtoNome}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Renderização do texto com marcadores visuais (Seção 27)
// ============================================================================

function renderTextoBloco(bloco: Bloco, _fontSize: number): React.ReactNode {
  const isCta = bloco.tipo === 'cta_compra' || bloco.tipo === 'cta_engajamento'

  // Substituir marcadores de ação no texto por spans azuis
  let textoProcessado = bloco.texto

  // Extrair marcadores de ação para highlight
  const acoesPattern = /\[([^\]]+)\]/g

  const partes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = acoesPattern.exec(textoProcessado)) !== null) {
    // Texto antes do marcador
    if (match.index > lastIndex) {
      const antes = textoProcessado.slice(lastIndex, match.index)
      partes.push(renderComEnfase(antes, bloco.enfase, isCta, partes.length))
    }

    // Marcador de ação em azul
    partes.push(
      <span key={`acao-${match.index}`} style={{ color: '#60A5FA' }}>
        {match[0]}
      </span>
    )

    lastIndex = match.index + match[0].length
  }

  // Resto do texto após o último marcador
  if (lastIndex < textoProcessado.length) {
    partes.push(renderComEnfase(
      textoProcessado.slice(lastIndex),
      bloco.enfase,
      isCta,
      partes.length
    ))
  }

  // CTA: cor laranja discreta
  return (
    <span style={isCta ? { color: '#F97316' } : undefined}>
      {partes.length > 0 ? partes : renderComEnfase(bloco.texto, bloco.enfase, isCta, 0)}
    </span>
  )
}

function renderComEnfase(
  texto: string,
  enfases: string[],
  isCta: boolean,
  keyBase: number
): React.ReactNode {
  if (!enfases || enfases.length === 0) return texto

  // Dividir texto por palavras/frases de ênfase
  let resultado = texto
  const partes: React.ReactNode[] = []
  let textoRestante = texto
  let keyIdx = keyBase * 100

  for (const enfase of enfases) {
    const idx = textoRestante.toLowerCase().indexOf(enfase.toLowerCase())
    if (idx === -1) continue

    // Texto antes da ênfase
    if (idx > 0) {
      partes.push(
        <span key={`txt-${keyIdx++}`}>{textoRestante.slice(0, idx)}</span>
      )
    }

    // Texto com ênfase — negrito
    partes.push(
      <strong key={`enf-${keyIdx++}`} style={{ fontWeight: 800 }}>
        {textoRestante.slice(idx, idx + enfase.length)}
      </strong>
    )

    textoRestante = textoRestante.slice(idx + enfase.length)
  }

  if (textoRestante) partes.push(<span key={`end-${keyIdx}`}>{textoRestante}</span>)

  return partes.length > 0 ? <>{partes}</> : texto
}
