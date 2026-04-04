/**
 * Geração de embeddings via text-embedding-004 e inserção em memoria_chunks.
 * Referência: Seção 11 do Master Plan v3.0
 *
 * Embeddings: 768 dimensões via text-embedding-004.
 * Chunks são inseridos sequencialmente para evitar rate limiting.
 */

import { genAI } from '@/lib/gemini/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import { chunkTranscricao, type Chunk } from './chunking'

/**
 * Gera embedding para um texto usando text-embedding-004.
 */
export async function gerarEmbedding(texto: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(texto)
  return result.embedding.values
}

/**
 * Pipeline completo: chunka a transcrição, gera embeddings, insere em memoria_chunks.
 * Sequencial para evitar rate limiting da API de embeddings.
 */
export async function processarEmbeddings(
  influencerId: string,
  videoId: string,
  textoCompleto: string
): Promise<number> {
  const chunks = chunkTranscricao(textoCompleto)

  if (chunks.length === 0) return 0

  // Deletar chunks antigos deste vídeo (re-análise)
  await supabaseAdmin
    .from('memoria_chunks')
    .delete()
    .eq('video_id', videoId)

  // Processar sequencialmente para evitar rate limiting
  let inseridos = 0
  for (const chunk of chunks) {
    const embedding = await gerarEmbedding(chunk.texto)

    const { error } = await supabaseAdmin
      .from('memoria_chunks')
      .insert({
        influencer_id: influencerId,
        video_id: videoId,
        chunk_index: chunk.index,
        texto: chunk.texto,
        embedding: JSON.stringify(embedding),
        relevancia_geracao: 1.0,
      })

    if (error) {
      console.error(`Erro ao inserir chunk ${chunk.index} do vídeo ${videoId}:`, error)
      continue
    }

    inseridos++
  }

  return inseridos
}
