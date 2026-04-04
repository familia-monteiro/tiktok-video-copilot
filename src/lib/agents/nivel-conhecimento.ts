/**
 * Cálculo do Nível de Conhecimento (0-100%).
 * Fórmula: Cobertura (40%) + Diversidade (30%) + Confiança (30%)
 * Referência: Seção 28 do Master Plan v3.0
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import type { DimensaoMemoria } from '@/types/database'

/**
 * Recalcula o Nível de Conhecimento de um influenciador e atualiza no banco.
 */
export async function calcularNivelConhecimento(influencerId: string): Promise<number> {
  // Carregar dados necessários em paralelo
  const [influencerResult, memoriasResult, videosCountResult] = await Promise.all([
    supabaseAdmin
      .from('influenciadores')
      .select('total_videos')
      .eq('id', influencerId)
      .single(),
    supabaseAdmin
      .from('memorias_estruturadas')
      .select('dimensao, dados, total_videos_analisados, confianca_atual')
      .eq('influencer_id', influencerId),
    supabaseAdmin
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('influencer_id', influencerId)
      .eq('status', 'analisado'),
  ])

  const totalVideosPerfil = influencerResult.data?.total_videos ?? 0
  const videosAnalisados = videosCountResult.count ?? 0
  const memorias = memoriasResult.data ?? []

  // ── Score de Cobertura (40%) ──
  const scoreCobertura = calcularCobertura(videosAnalisados, totalVideosPerfil)

  // ── Score de Diversidade (30%) ──
  const scoreDiversidade = calcularDiversidade(memorias)

  // ── Score de Confiança (30%) ──
  const scoreConfianca = calcularConfianca(memorias)

  // ── Score final ──
  const nivel = (scoreCobertura * 0.40) + (scoreDiversidade * 0.30) + (scoreConfianca * 0.30)
  const nivelFinal = Math.min(100, Math.round(nivel * 100) / 100)

  // Atualizar no banco
  await supabaseAdmin
    .from('influenciadores')
    .update({
      nivel_conhecimento_ia: nivelFinal / 100, // Normalizado 0-1 no banco
      score_cobertura: scoreCobertura,
      score_diversidade: scoreDiversidade,
      score_confianca: scoreConfianca,
    })
    .eq('id', influencerId)

  return nivelFinal
}

/**
 * Score de Cobertura (40%)
 * cobertura_base = (videos_analisados / total_videos_perfil) × 100
 * + bônus por volume
 */
function calcularCobertura(videosAnalisados: number, totalVideosPerfil: number): number {
  if (totalVideosPerfil === 0) return 0

  const coberturaBase = (videosAnalisados / totalVideosPerfil) * 100

  let bonus = 0
  if (videosAnalisados >= 500) bonus = 20
  else if (videosAnalisados >= 200) bonus = 15
  else if (videosAnalisados >= 50) bonus = 10
  else if (videosAnalisados >= 10) bonus = 5

  return Math.min(100, coberturaBase + bonus)
}

/**
 * Score de Diversidade (30%)
 * categorias de produto diferentes: +15 por categoria, máximo 75
 * cenários diferentes: +10 por cenário, máximo 40
 * tipos de hook diferentes: +5 por tipo, máximo 30
 */
function calcularDiversidade(
  memorias: { dimensao: string; dados: unknown }[]
): number {
  let pontos = 0

  // Categorias de produto
  const memProduto = memorias.find((m) => m.dimensao === 'produtos')
  if (memProduto) {
    const dados = memProduto.dados as Record<string, unknown>
    const categorias = (dados.categorias_cobertas as string[]) ?? []
    pontos += Math.min(75, categorias.length * 15)
  }

  // Tipos de hook diferentes
  const memHook = memorias.find((m) => m.dimensao === 'hooks')
  if (memHook) {
    const dados = memHook.dados as Record<string, unknown>
    const padroes = (dados.padroes as Array<{ tipo: string }>) ?? []
    const tipos = new Set(padroes.map((p) => p.tipo))
    pontos += Math.min(30, tipos.size * 5)
  }

  // Arcos emocionais como proxy para cenários
  const memEmocao = memorias.find((m) => m.dimensao === 'emocoes')
  if (memEmocao) {
    const dados = memEmocao.dados as Record<string, unknown>
    const padroes = (dados.padroes as Array<{ padrao_arco: string }>) ?? []
    const arcos = new Set(padroes.map((p) => p.padrao_arco))
    pontos += Math.min(40, arcos.size * 10)
  }

  return Math.min(100, pontos)
}

/**
 * Score de Confiança (30%)
 * Para cada dimensão:
 *   confianca_dimensao = min(1.0, evidencias / 20) × consistencia
 * Score = média das confiancas × 100
 */
function calcularConfianca(
  memorias: { dimensao: string; total_videos_analisados: number; confianca_atual: number }[]
): number {
  const dimensoesAlvo: DimensaoMemoria[] = ['hooks', 'ctas', 'emocoes', 'vocabulario', 'ritmo', 'produtos']

  let soma = 0
  let count = 0

  for (const dim of dimensoesAlvo) {
    const mem = memorias.find((m) => m.dimensao === dim)
    if (mem) {
      const evidencias = mem.total_videos_analisados
      const saturacao = Math.min(1.0, evidencias / 20)
      // Usar confianca_atual do agente como proxy de consistência
      const consistencia = mem.confianca_atual >= 0.7 ? 1.0 : 0.5
      soma += saturacao * consistencia
    }
    count++
  }

  if (count === 0) return 0
  return Math.min(100, (soma / count) * 100)
}
