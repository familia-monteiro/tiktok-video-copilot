/**
 * POST /api/internal/configuracoes/reveal
 * Retorna o valor real (descriptografado) de uma configuração.
 * Usado pelo botão 👁 no formulário de configurações.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { decryptWithKey } from '@/lib/crypto'
import { getOrCreateMasterKey } from '@/lib/crypto/master-key'

const BodySchema = z.object({
  chave: z.string().min(1),
})

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

  const { chave } = parsed.data

  // Bloquear acesso à chave mestra via esta rota
  if (chave === 'system_master_key') {
    return NextResponse.json({ error: 'Acesso não permitido' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('valor_criptografado, valor_texto')
    .eq('chave', chave)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: `Erro ao consultar banco: ${error.message}` }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 })
  }

  // Valor criptografado → descriptografar
  if (data.valor_criptografado) {
    let masterKey: Uint8Array
    try {
      masterKey = await getOrCreateMasterKey()
    } catch (err) {
      return NextResponse.json(
        { error: `Falha ao obter chave de criptografia: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      )
    }

    try {
      const valor = decryptWithKey(masterKey, data.valor_criptografado)
      return NextResponse.json({ valor })
    } catch (err) {
      return NextResponse.json(
        { error: `Falha ao descriptografar: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      )
    }
  }

  // Valor texto plano
  if (data.valor_texto) {
    return NextResponse.json({ valor: data.valor_texto })
  }

  return NextResponse.json({ error: 'Nenhum valor configurado para esta chave' }, { status: 404 })
}
