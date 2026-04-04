/**
 * POST /api/internal/test-connectivity
 * Testa conectividade com Gemini, Decodo e Railway Worker.
 * Prioridade: valores do body > banco de dados (descriptografado).
 * Referência: Seção 31 do Master Plan v3.0
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { decryptWithKey } from '@/lib/crypto'
import { getOrCreateMasterKey } from '@/lib/crypto/master-key'

const BodySchema = z.object({
  service: z.enum(['gemini', 'decodo', 'railway']),
  valores: z.record(z.string(), z.string()).optional(),
})

async function getConfig(chave: string, inline?: Record<string, string>): Promise<string | null> {
  // 1. Valor fornecido diretamente pelo formulário
  if (inline?.[chave]?.trim()) return inline[chave].trim()

  // 2. Banco de dados
  const { data } = await supabaseAdmin
    .from('configuracoes')
    .select('valor_criptografado, valor_texto')
    .eq('chave', chave)
    .maybeSingle()

  if (!data) return null

  if (data.valor_criptografado) {
    try {
      const masterKey = await getOrCreateMasterKey()
      return decryptWithKey(masterKey, data.valor_criptografado)
    } catch {
      // Se descriptografia falha mas há valor_texto, usar como fallback
      return data.valor_texto ?? null
    }
  }

  return data.valor_texto ?? null
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parâmetro inválido' }, { status: 400 })
  }

  const { service, valores } = parsed.data

  try {
    switch (service) {
      case 'gemini':  return await testGemini(valores)
      case 'decodo':  return await testDecodo(valores)
      case 'railway': return await testRailway(valores)
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 200 }
    )
  }
}

async function testGemini(inline?: Record<string, string>): Promise<NextResponse> {
  const apiKey = await getConfig('gemini_api_key', inline)
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY não configurada. Preencha o campo e salve.' })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { signal: AbortSignal.timeout(10_000) }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` })
  }

  const data = await res.json() as { models?: unknown[] }
  return NextResponse.json({ ok: true, detail: `${data.models?.length ?? 0} modelos disponíveis` })
}

async function testDecodo(inline?: Record<string, string>): Promise<NextResponse> {
  const [host, portFromStr, portToStr, username, password] = await Promise.all([
    getConfig('decodo_host', inline),
    getConfig('decodo_port_from', inline),
    getConfig('decodo_port_to', inline),
    getConfig('decodo_username', inline),
    getConfig('decodo_password', inline),
  ])

  if (!host || !portFromStr || !username || !password) {
    return NextResponse.json({
      ok: false,
      error: 'Credenciais Decodo incompletas. Preencha: Host, Porta inicial, Usuário, Senha.',
    })
  }

  const portFrom = parseInt(portFromStr, 10)
  const portTo = parseInt(portToStr ?? portFromStr, 10)

  if (isNaN(portFrom) || portFrom < 1 || portFrom > 65535) {
    return NextResponse.json({ ok: false, error: 'Porta inicial inválida (deve ser 1–65535)' })
  }
  if (isNaN(portTo) || portTo < portFrom) {
    return NextResponse.json({ ok: false, error: 'Porta final inválida (deve ser >= porta inicial)' })
  }

  const totalPortas = portTo - portFrom + 1

  // Teste real de conectividade TCP ao proxy
  const { connect } = await import('net')
  const tcpOk = await new Promise<boolean>((resolve) => {
    const socket = connect(portFrom, host)
    socket.setTimeout(8000)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })

  if (!tcpOk) {
    return NextResponse.json({
      ok: false,
      error: `Não foi possível conectar ao proxy ${host}:${portFrom}. Verifique o host e a porta.`,
    })
  }

  return NextResponse.json({
    ok: true,
    detail: `Proxy acessível — ${host}:${portFrom}–${portTo} · ${totalPortas} porta${totalPortas > 1 ? 's' : ''} de rotação · usuário: ${username}`,
  })
}

async function testRailway(inline?: Record<string, string>): Promise<NextResponse> {
  const [workerUrl, workerSecret] = await Promise.all([
    getConfig('railway_worker_url', inline),
    getConfig('railway_worker_secret', inline),
  ])

  if (!workerUrl) return NextResponse.json({ ok: false, error: 'Railway Worker URL não configurada' })
  if (!workerSecret) return NextResponse.json({ ok: false, error: 'Railway Worker Secret não configurado' })

  const res = await fetch(`${workerUrl}/health`, {
    headers: { 'x-worker-secret': workerSecret },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return NextResponse.json({ ok: false, error: `Worker respondeu HTTP ${res.status}` })

  const data = await res.json() as { status?: string }
  return NextResponse.json({ ok: true, detail: `Worker online — status: ${data.status ?? 'ok'}` })
}
