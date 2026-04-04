/**
 * Helper para leitura de configurações do banco com descriptografia automática.
 * Usado pelos jobs Inngest e APIs internas que precisam das credenciais reais.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { decryptWithKey } from '@/lib/crypto'
import { getOrCreateMasterKey } from '@/lib/crypto/master-key'

export async function getConfig(chave: string): Promise<string | null> {
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
      console.error(`[getConfig] Erro ao descriptografar: ${chave}`)
      return null
    }
  }

  return data.valor_texto ?? null
}

export async function getConfigs(chaves: string[]): Promise<Record<string, string | null>> {
  const results = await Promise.all(chaves.map((c) => getConfig(c)))
  return Object.fromEntries(chaves.map((c, i) => [c, results[i]]))
}
