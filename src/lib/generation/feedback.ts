/**
 * Sistema de Feedback e Aprendizado Incremental
 * Referência: Seção 25 do Master Plan v3.0
 *
 * Tipos de feedback e seus efeitos:
 * - Aprovação sem edição: relevancia_geracao +0.05
 * - Rejeição: relevancia_geracao -0.10
 * - Edição (parcial ou total): relevancia_geracao +0.03
 *
 * Limites:
 * - Nenhum feedback individual altera relevancia_geracao além de ±0.10
 * - Memória estruturada só é atualizada com >= 5 roteiros com feedback
 */

import { supabaseAdmin } from '@/lib/supabase/server'

export type TipoFeedback = 'aprovado' | 'rejeitado' | 'editado'

export interface FeedbackInput {
  roteiroId: string
  tipo: TipoFeedback
  motivoRejeicao?: string
}

export interface FeedbackResult {
  chunksAtualizados: number
  mensagem: string
}

/**
 * Processa feedback do usuário sobre um roteiro.
 */
export async function processarFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const { roteiroId, tipo, motivoRejeicao } = input

  // Carregar roteiro com chunks RAG usados
  const { data: roteiro, error } = await supabaseAdmin
    .from('roteiros')
    .select('id, influencer_id, chunks_rag_usados, status')
    .eq('id', roteiroId)
    .single()

  if (error || !roteiro) {
    return { chunksAtualizados: 0, mensagem: 'Roteiro não encontrado' }
  }

  // Atualizar status do roteiro
  const updateData: Record<string, unknown> = {
    status: tipo,
    feedback_usuario: motivoRejeicao ?? null,
  }

  if (tipo === 'aprovado') {
    updateData.aprovado_em = new Date().toISOString()
  }

  await supabaseAdmin
    .from('roteiros')
    .update(updateData)
    .eq('id', roteiroId)

  // Ajustar relevancia_geracao dos chunks RAG usados
  const chunkIds = (roteiro.chunks_rag_usados ?? []) as string[]
  let chunksAtualizados = 0

  if (chunkIds.length > 0) {
    const delta = tipo === 'aprovado' ? 0.05
      : tipo === 'rejeitado' ? -0.10
      : 0.03 // editado

    chunksAtualizados = await ajustarRelevanciaChunks(chunkIds, delta)
  }

  return {
    chunksAtualizados,
    mensagem: `Feedback "${tipo}" processado. ${chunksAtualizados} chunks ajustados.`,
  }
}

/**
 * Ajusta relevancia_geracao dos chunks, respeitando limites (0.1 a 2.0).
 */
async function ajustarRelevanciaChunks(
  videoIds: string[],
  delta: number
): Promise<number> {
  // Os chunks_rag_usados armazenam video_ids (não chunk_ids diretamente)
  // Buscar chunks correspondentes
  const { data: chunks } = await supabaseAdmin
    .from('memoria_chunks')
    .select('id, relevancia_geracao')
    .in('video_id', videoIds)

  if (!chunks || chunks.length === 0) return 0

  let atualizados = 0
  for (const chunk of chunks) {
    const novaRelevancia = Math.max(0.1, Math.min(2.0, chunk.relevancia_geracao + delta))

    if (novaRelevancia !== chunk.relevancia_geracao) {
      const { error } = await supabaseAdmin
        .from('memoria_chunks')
        .update({ relevancia_geracao: novaRelevancia })
        .eq('id', chunk.id)

      if (!error) atualizados++
    }
  }

  return atualizados
}
