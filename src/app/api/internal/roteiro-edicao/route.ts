/**
 * API: POST /api/internal/roteiro-edicao
 * Captura diff de edição de bloco para aprendizado.
 * Referência: Seção 24 do Master Plan v3.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  let body: { roteiro_id: string; bloco_id: string; texto_original: string; texto_editado: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { roteiro_id, bloco_id, texto_original, texto_editado } = body

  if (!roteiro_id || !bloco_id || !texto_original || !texto_editado) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  // Computar diff: expressões removidas e adicionadas
  const tokensOriginal = new Set(texto_original.toLowerCase().split(/\s+/))
  const tokensEditado = new Set(texto_editado.toLowerCase().split(/\s+/))

  const removidas = [...tokensOriginal].filter((t) => !tokensEditado.has(t) && t.length > 2)
  const adicionadas = [...tokensEditado].filter((t) => !tokensOriginal.has(t) && t.length > 2)

  const { error } = await supabaseAdmin
    .from('roteiro_edicoes')
    .insert({
      roteiro_id,
      bloco_id,
      texto_original,
      texto_editado,
      expressoes_removidas: removidas,
      expressoes_adicionadas: adicionadas,
      processado_para_aprendizado: false,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Atualizar status do roteiro para 'editado'
  await supabaseAdmin
    .from('roteiros')
    .update({ status: 'editado', ultima_edicao_em: new Date().toISOString() })
    .eq('id', roteiro_id)

  return NextResponse.json({
    ok: true,
    diff: { removidas: removidas.length, adicionadas: adicionadas.length },
  })
}
