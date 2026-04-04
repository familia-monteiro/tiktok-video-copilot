/**
 * API: POST /api/internal/regenerar-bloco
 * Regenera um bloco individual do roteiro mantendo os outros.
 * Referência: Seção 24 do Master Plan v3.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { montarBriefing } from '@/lib/generation/briefing'
import { regenerarBloco } from '@/lib/generation/prompt-mestre'

export async function POST(request: NextRequest) {
  let body: {
    roteiro_id: string
    influencer_id: string
    bloco_id: string
    tipo_bloco: string
    ordem_bloco: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { roteiro_id, influencer_id, tipo_bloco, ordem_bloco } = body

  // Carregar roteiro atual para contexto
  const { data: roteiro } = await supabaseAdmin
    .from('roteiros')
    .select('conteudo, produto_nome, produto_categoria, produto_preco, cenario, duracao_alvo_segundos, formato')
    .eq('id', roteiro_id)
    .single()

  if (!roteiro) {
    return NextResponse.json({ error: 'Roteiro não encontrado' }, { status: 404 })
  }

  const conteudo = roteiro.conteudo as { blocos?: Array<{ id: string; tipo: string; texto: string }> }
  const outrosBlocos = (conteudo.blocos ?? [])
    .filter((b) => b.id !== body.bloco_id)
    .map((b) => `[${b.tipo}] ${b.texto}`)
    .join('\n')

  // Montar briefing
  const briefing = await montarBriefing(
    influencer_id,
    {
      nome: roteiro.produto_nome ?? '',
      categoria: roteiro.produto_categoria ?? '',
      preco: roteiro.produto_preco ?? '',
      diferenciais: [],
      objecoes_comuns: [],
    },
    {
      local: roteiro.cenario ?? '',
      tom_recomendado: 'casual',
      vocabulario_cenario: [],
      restricoes: [],
    },
    {
      segundos: roteiro.duracao_alvo_segundos ?? 45,
      formato: (roteiro.formato ?? 'standard') as 'short' | 'standard' | 'extended' | 'long',
    }
  )

  const blocoNovo = await regenerarBloco(briefing, tipo_bloco, ordem_bloco, outrosBlocos)

  if (!blocoNovo) {
    return NextResponse.json({ error: 'Falha ao regenerar bloco' }, { status: 500 })
  }

  // Atualizar bloco no conteúdo do roteiro
  const blocosAtualizados = (conteudo.blocos ?? []).map((b) =>
    b.id === body.bloco_id ? blocoNovo : b
  )

  await supabaseAdmin
    .from('roteiros')
    .update({
      conteudo: { ...conteudo, blocos: blocosAtualizados },
      ultima_edicao_em: new Date().toISOString(),
    })
    .eq('id', roteiro_id)

  return NextResponse.json({ bloco: blocoNovo })
}
