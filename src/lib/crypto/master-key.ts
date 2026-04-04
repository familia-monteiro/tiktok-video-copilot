/**
 * Gerenciamento da chave mestra de criptografia.
 *
 * Prioridade:
 * 1. Variável de ambiente MASTER_ENCRYPTION_KEY (Vercel/produção)
 * 2. Banco de dados — tabela `configuracoes`, chave `system_master_key`
 * 3. Auto-gera uma chave de 32 bytes, persiste no banco e usa
 *
 * Em desenvolvimento, basta não definir MASTER_ENCRYPTION_KEY. A chave é
 * gerada automaticamente na primeira execução e reutilizada em seguida.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { randomBytes } from '@noble/ciphers/utils.js'
import { hexToBytes, bytesToHex } from '@/lib/crypto'

// Cache de processo — evita uma query ao banco por chamada
let _cached: Uint8Array | null = null

export async function getOrCreateMasterKey(): Promise<Uint8Array> {
  // 1. Cache em memória
  if (_cached) return _cached

  // 2. Variável de ambiente (Vercel / .env.local com MASTER_ENCRYPTION_KEY)
  const hexEnv = process.env.MASTER_ENCRYPTION_KEY
  if (hexEnv && hexEnv.length === 64) {
    _cached = hexToBytes(hexEnv)
    return _cached
  }

  // 3. Banco de dados
  const { data: existing } = await supabaseAdmin
    .from('configuracoes')
    .select('valor_texto')
    .eq('chave', 'system_master_key')
    .maybeSingle()

  if (existing?.valor_texto && existing.valor_texto.length === 64) {
    _cached = hexToBytes(existing.valor_texto)
    return _cached
  }

  // 4. Gerar nova chave e persistir
  const newKeyBytes = randomBytes(32)
  const newKeyHex = bytesToHex(newKeyBytes)

  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert(
      {
        chave: 'system_master_key',
        valor_texto: newKeyHex,
        descricao: 'Chave mestra de criptografia (gerada automaticamente)',
      },
      { onConflict: 'chave' }
    )

  if (error) {
    // Upsert falhou (raro) — tentar um SELECT final como fallback de race condition
    const { data: fallback } = await supabaseAdmin
      .from('configuracoes')
      .select('valor_texto')
      .eq('chave', 'system_master_key')
      .maybeSingle()

    if (fallback?.valor_texto?.length === 64) {
      _cached = hexToBytes(fallback.valor_texto)
      return _cached
    }

    throw new Error(`Falha ao persistir chave mestra: ${error.message}`)
  }

  _cached = newKeyBytes
  return _cached
}
