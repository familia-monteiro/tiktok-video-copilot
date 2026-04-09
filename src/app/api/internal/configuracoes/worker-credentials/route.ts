export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { decryptWithKey } from '@/lib/crypto'
import { getOrCreateMasterKey } from '@/lib/crypto/master-key'

/**
 * GET /api/internal/configuracoes/worker-credentials?keys=decodo_host,decodo_password,...
 * 
 * Retorna valores descriptografados de chaves específicas.
 * Usado pela VPS para buscar credenciais sem expor a master key.
 * Autenticado via x-worker-secret.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-worker-secret')
  if (!secret || secret !== process.env.SCRAPER_WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keysParam = request.nextUrl.searchParams.get('keys') ?? ''
  const keys = keysParam.split(',').map((k) => k.trim()).filter(Boolean)

  if (keys.length === 0) {
    return NextResponse.json({ error: 'Parâmetro "keys" obrigatório' }, { status: 400 })
  }

  // Bloquear acesso à chave mestra
  if (keys.includes('system_master_key')) {
    return NextResponse.json({ error: 'Acesso não permitido' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor_criptografado, valor_texto')
    .in('chave', keys)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let masterKey: Uint8Array | null = null

  // Verificar se algum valor precisa de descriptografia
  const temCriptografado = (data ?? []).some((c) => !!c.valor_criptografado)
  if (temCriptografado) {
    try {
      masterKey = await getOrCreateMasterKey()
    } catch (err) {
      return NextResponse.json(
        { error: `Falha ao obter chave de criptografia: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      )
    }
  }

  const configs: Record<string, string> = {}

  for (const row of data ?? []) {
    if (row.valor_criptografado && masterKey) {
      try {
        configs[row.chave] = decryptWithKey(masterKey, row.valor_criptografado)
      } catch {
        configs[row.chave] = '' // falha silenciosa na descriptografia
      }
    } else if (row.valor_texto) {
      configs[row.chave] = row.valor_texto
    } else {
      configs[row.chave] = ''
    }
  }

  return NextResponse.json({ configs })
}
