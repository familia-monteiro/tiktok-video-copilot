/**
 * Teleprompter — Página de exibição durante gravação
 * Referência: Seção 27 do Master Plan v3.0
 *
 * Design: fundo preto absoluto, coluna 60%, fonte 48px
 * Controles apenas por teclado/toque
 * Algoritmo de velocidade baseado em velocidade_media_wpm
 * Modo de ensaio: um bloco por vez sem scroll automático
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TeleprompterClient } from './teleprompter-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TeleprompterPage({ params }: Props) {
  const { id } = await params

  const { data: roteiro } = await supabaseAdmin
    .from('roteiros')
    .select('id, conteudo, produto_nome, influencer_id')
    .eq('id', id)
    .single()

  if (!roteiro) notFound()

  // Carregar velocidade_media_wpm do perfil de ritmo
  const { data: memoriaRitmo } = await supabaseAdmin
    .from('memorias_estruturadas')
    .select('dados')
    .eq('influencer_id', roteiro.influencer_id)
    .eq('dimensao', 'ritmo')
    .single()

  const dadosRitmo = memoriaRitmo?.dados as Record<string, unknown> | null
  const velocidadeWpm = (dadosRitmo?.velocidade_media_wpm as number) ?? 130

  const conteudo = roteiro.conteudo as Record<string, unknown>

  return (
    <TeleprompterClient
      roteiroId={roteiro.id}
      produtoNome={roteiro.produto_nome ?? 'Roteiro'}
      conteudo={conteudo}
      velocidadeWpm={velocidadeWpm}
    />
  )
}
