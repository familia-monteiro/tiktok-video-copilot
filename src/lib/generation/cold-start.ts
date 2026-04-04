/**
 * Cold Start — Três comportamentos por nível de conhecimento.
 * Referência: Seção 16 do Master Plan v3.0
 *
 * Nível 0-20%: NÃO gera roteiros (apenas experimental com aviso)
 * Nível 21-40%: Gera com badge "Confiança: Moderada", Revisor tolerante
 * Nível 41%+: Comportamento padrão
 */

import { supabaseAdmin } from '@/lib/supabase/server'

export type NivelColdStart = 'cold_start' | 'aprendizado' | 'operacional'

export interface ColdStartInfo {
  nivel: NivelColdStart
  nivel_conhecimento: number
  pode_gerar: boolean
  gerar_experimental: boolean
  mensagem: string | null
  estimativa_tempo: string | null
  revisor_threshold: number  // score mínimo para aprovação
  rag_threshold: number       // threshold do RAG
}

/**
 * Avalia o estado de cold start de um influenciador.
 */
export async function avaliarColdStart(influencerId: string): Promise<ColdStartInfo> {
  const { data: inf } = await supabaseAdmin
    .from('influenciadores')
    .select('nivel_conhecimento_ia, total_videos')
    .eq('id', influencerId)
    .single()

  if (!inf) throw new Error(`Influenciador ${influencerId} não encontrado`)

  const nivelPercent = Math.round((inf.nivel_conhecimento_ia ?? 0) * 100)

  // Contar vídeos por status
  const [{ count: totalVideos }, { count: processados }, { count: analisados }] = await Promise.all([
    supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('influencer_id', influencerId),
    supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('influencer_id', influencerId)
      .in('status', ['transcrito', 'analisado']),
    supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('influencer_id', influencerId)
      .eq('status', 'analisado'),
  ])

  const total = totalVideos ?? 0
  const proc = processados ?? 0
  const anal = analisados ?? 0
  const naFila = total - proc

  // Calcular estimativa de tempo
  const estimativa = naFila > 0 ? calcularEstimativa(influencerId, naFila) : null

  if (nivelPercent < 20) {
    return {
      nivel: 'cold_start',
      nivel_conhecimento: nivelPercent,
      pode_gerar: false,
      gerar_experimental: true,
      mensagem: `A IA está aprendendo. Com ${anal} vídeos analisados de ${total}, o nível de conhecimento está em ${nivelPercent}%.${estimativa ? ` Estimativa: ${await estimativa}` : ''} Aguarde para geração de qualidade.`,
      estimativa_tempo: estimativa ? await estimativa : null,
      revisor_threshold: 5.0, // mais tolerante para experimental
      rag_threshold: 0.60,
    }
  }

  if (nivelPercent < 40) {
    return {
      nivel: 'aprendizado',
      nivel_conhecimento: nivelPercent,
      pode_gerar: true,
      gerar_experimental: false,
      mensagem: `Nível de conhecimento em ${nivelPercent}%. Roteiros com confiança moderada — a qualidade melhora conforme mais vídeos forem processados.`,
      estimativa_tempo: estimativa ? await estimativa : null,
      revisor_threshold: 6.0, // mais tolerante que o padrão (7.0)
      rag_threshold: 0.60,    // threshold relaxado
    }
  }

  return {
    nivel: 'operacional',
    nivel_conhecimento: nivelPercent,
    pode_gerar: true,
    gerar_experimental: false,
    mensagem: null,
    estimativa_tempo: null,
    revisor_threshold: 7.0,
    rag_threshold: 0.75,
  }
}

/**
 * Calcula estimativa de tempo para atingir 40% baseado na velocidade do pipeline.
 */
async function calcularEstimativa(
  influencerId: string,
  videosNaFila: number
): Promise<string> {
  // Velocidade média dos últimos 10 jobs concluídos
  const { data: jobs } = await supabaseAdmin
    .from('jobs_pipeline')
    .select('iniciado_em, concluido_em')
    .eq('influencer_id', influencerId)
    .eq('status', 'concluido')
    .not('iniciado_em', 'is', null)
    .not('concluido_em', 'is', null)
    .order('concluido_em', { ascending: false })
    .limit(10)

  if (!jobs || jobs.length < 2) {
    // Estimativa padrão: ~2 min por vídeo
    const minutos = videosNaFila * 2
    return formatarTempo(minutos)
  }

  // Calcular tempo médio por job
  const duracoes = jobs.map((j) => {
    const inicio = new Date(j.iniciado_em!).getTime()
    const fim = new Date(j.concluido_em!).getTime()
    return (fim - inicio) / 60_000 // minutos
  }).filter((d) => d > 0 && d < 30) // filtrar outliers

  if (duracoes.length === 0) return formatarTempo(videosNaFila * 2)

  const mediaMinutos = duracoes.reduce((a, b) => a + b, 0) / duracoes.length
  const totalMinutos = Math.round(videosNaFila * mediaMinutos)

  return formatarTempo(totalMinutos)
}

function formatarTempo(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  const mins = minutos % 60
  if (mins === 0) return `${horas}h`
  return `${horas}h ${mins}min`
}
