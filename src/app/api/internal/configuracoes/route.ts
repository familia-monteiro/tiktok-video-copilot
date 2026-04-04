import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { encryptWithKey, maskSensitiveValue } from '@/lib/crypto'
import { getOrCreateMasterKey } from '@/lib/crypto/master-key'

/**
 * GET /api/internal/configuracoes
 * Retorna todas as configurações (valores sensíveis mascarados).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor_criptografado, valor_texto, descricao, atualizado_em')
    .neq('chave', 'system_master_key') // nunca expor a chave mestra
    .order('chave')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const CHAVES_SENSIVEIS = [
    'gemini_api_key', 'decodo_password', 'railway_worker_secret',
    'inngest_event_key', 'inngest_signing_key', 'upstash_redis_rest_token',
    'upstash_redis_rest_url', 'railway_worker_url',
  ]

  const configs = (data ?? []).map((c) => {
    const temCriptografado = !!c.valor_criptografado
    const valorTexto = c.valor_texto ?? ''
    const isSensivel = CHAVES_SENSIVEIS.includes(c.chave)

    return {
      chave: c.chave,
      valor: temCriptografado
        ? maskSensitiveValue('configurado')
        : isSensivel && valorTexto
        ? maskSensitiveValue(valorTexto)
        : valorTexto,
      preenchido: temCriptografado || !!valorTexto,
      descricao: c.descricao,
      atualizado_em: c.atualizado_em,
    }
  })

  return NextResponse.json({ configs })
}

/**
 * PUT /api/internal/configuracoes
 * Atualiza uma ou mais configurações com criptografia automática.
 * Body: { configs: { chave: string, valor: string }[] }
 */
export async function PUT(req: NextRequest) {
  let body: { configs: { chave: string; valor: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.configs || !Array.isArray(body.configs)) {
    return NextResponse.json({ error: 'Campo "configs" é obrigatório' }, { status: 400 })
  }

  const CHAVES_CRIPTOGRAFADAS = [
    'gemini_api_key',
    // Decodo: apenas a senha é criptografada; host e portas são texto plano
    'decodo_password',
    'railway_worker_url', 'railway_worker_secret',
    'inngest_event_key', 'inngest_signing_key',
    'upstash_redis_rest_url', 'upstash_redis_rest_token',
  ]

  // Obter a chave mestra uma única vez para todas as operações
  let masterKey: Uint8Array
  try {
    masterKey = await getOrCreateMasterKey()
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao obter chave de criptografia: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  const erros: string[] = []
  const atualizados: string[] = []

  for (const { chave, valor } of body.configs) {
    if (!chave || typeof valor !== 'string') {
      erros.push(`Configuração inválida: ${chave}`)
      continue
    }

    // Bloquear tentativa de sobrescrever a chave mestra via API
    if (chave === 'system_master_key') continue

    // Ignorar placeholders mascarados (usuário não editou)
    if (valor.includes('****')) continue

    let updateData: Record<string, string | null>

    if (CHAVES_CRIPTOGRAFADAS.includes(chave)) {
      if (!valor.trim()) {
        updateData = { valor_criptografado: null, valor_texto: null }
      } else {
        const encrypted = encryptWithKey(masterKey, valor.trim())
        updateData = { valor_criptografado: encrypted, valor_texto: null }
      }
    } else {
      updateData = { valor_texto: valor.trim() || null }
    }

    const { error } = await supabaseAdmin
      .from('configuracoes')
      .upsert(
        { chave, ...updateData },
        { onConflict: 'chave' }
      )

    if (error) {
      erros.push(`Erro ao atualizar ${chave}: ${error.message}`)
    } else {
      atualizados.push(chave)
    }
  }

  return NextResponse.json({
    atualizados,
    erros: erros.length > 0 ? erros : undefined,
  })
}
