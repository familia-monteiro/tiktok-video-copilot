/**
 * Chunking de transcrições para a memória vetorial.
 * Divide transcrição em chunks de 150 palavras com overlap de 30.
 * Referência: Seção 11 do Master Plan v3.0
 */

export interface Chunk {
  index: number
  texto: string
  palavras: number
}

/**
 * Divide um texto em chunks de `tamanho` palavras com `overlap` palavras de sobreposição.
 */
export function chunkTranscricao(
  texto: string,
  tamanho: number = 150,
  overlap: number = 30
): Chunk[] {
  const palavras = texto.split(/\s+/).filter((w) => w.length > 0)

  if (palavras.length === 0) return []

  // Se o texto inteiro cabe em um único chunk
  if (palavras.length <= tamanho) {
    return [{ index: 0, texto: palavras.join(' '), palavras: palavras.length }]
  }

  const chunks: Chunk[] = []
  let inicio = 0
  let index = 0

  while (inicio < palavras.length) {
    const fim = Math.min(inicio + tamanho, palavras.length)
    const chunkPalavras = palavras.slice(inicio, fim)

    chunks.push({
      index,
      texto: chunkPalavras.join(' '),
      palavras: chunkPalavras.length,
    })

    // Avançar pelo tamanho menos o overlap
    inicio += tamanho - overlap
    index++

    // Se o próximo chunk seria menor que o overlap, parar
    if (inicio >= palavras.length) break
  }

  return chunks
}
