/**
 * Agente Diretor de Análise — Orquestração dos agentes.
 * NÃO é um LLM — é lógica de orquestração JavaScript.
 * Referência: Seção 15 do Master Plan v3.0
 *
 * Fluxo:
 * Fase 1 — Carregamento de contexto (paralelo)
 * Fase 2 — Análise paralela dos 6 agentes base
 * Fase 3 — Análise condicional (Agente Viral se viral_score >= 70)
 * Fase 4 — Coleta e validação de resultados
 * Fase 5 — Atualização da memória estruturada
 * Fase 6 — Geração de embeddings
 * Fase 7 — Recalcular Nível de Conhecimento
 * Fase 8 — Atualizar status do vídeo
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { processarEmbeddings } from './embeddings'
import { calcularNivelConhecimento } from './nivel-conhecimento'
import { analisarHook } from './agent-hook'
import { analisarCta } from './agent-cta'
import { analisarEmocao } from './agent-emocao'
import { analisarVocabulario } from './agent-vocabulario'
import { analisarRitmo } from './agent-ritmo'
import { analisarProduto } from './agent-produto'
import { analisarViral } from './agent-viral'
import type { AgentInput, AgentResult } from './agent-base'
import type { DimensaoMemoria } from '@/types/database'

export interface AnaliseResultado {
  sucessos: number
  falhas: number
  analiseParcial: boolean
  viralAnalisado: boolean
  embeddings: number
}

/**
 * Executa a análise completa de um vídeo com todos os agentes.
 */
export async function executarAnaliseCompleta(
  videoId: string,
  influencerId: string
): Promise<AnaliseResultado> {
  // ── Fase 1: Carregamento de contexto (paralelo) ──
  const [transcricaoResult, videoResult, memoriasResult] = await Promise.all([
    supabaseAdmin
      .from('transcricoes')
      .select('texto_completo, duracao_segundos, palavras_por_minuto')
      .eq('video_id', videoId)
      .single(),
    supabaseAdmin
      .from('videos')
      .select('views, likes, comments, shares, saves, data_publicacao, viral_score, duracao_segundos')
      .eq('id', videoId)
      .single(),
    supabaseAdmin
      .from('memorias_estruturadas')
      .select('dimensao, dados, total_videos_analisados')
      .eq('influencer_id', influencerId),
  ])

  if (transcricaoResult.error || !transcricaoResult.data) {
    throw new Error(`Transcrição não encontrada para vídeo ${videoId}`)
  }
  if (videoResult.error || !videoResult.data) {
    throw new Error(`Vídeo ${videoId} não encontrado`)
  }

  const transcricao = transcricaoResult.data
  const video = videoResult.data

  // Montar mapa de memórias por dimensão
  const memorias: Record<string, Record<string, unknown>> = {}
  for (const m of memoriasResult.data ?? []) {
    memorias[m.dimensao] = (m.dados as Record<string, unknown>) ?? {}
  }

  // Input base para todos os agentes
  const baseInput: AgentInput = {
    transcricaoCompleta: transcricao.texto_completo,
    duracaoSegundos: video.duracao_segundos ?? transcricao.duracao_segundos ?? 0,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    saves: video.saves,
    dataPublicacao: video.data_publicacao,
    viralScore: video.viral_score,
    memoriaAtual: {},
  }

  // ── Fase 2: Análise paralela dos 6 agentes base ──
  const [hookResult, ctaResult, emocaoResult, vocabResult, ritmoResult, produtoResult] =
    await Promise.all([
      executarComTimeout(() => analisarHook({ ...baseInput, memoriaAtual: memorias['hooks'] ?? {} })),
      executarComTimeout(() => analisarCta({ ...baseInput, memoriaAtual: memorias['ctas'] ?? {} })),
      executarComTimeout(() => analisarEmocao({ ...baseInput, memoriaAtual: memorias['emocoes'] ?? {} })),
      executarComTimeout(() => analisarVocabulario({ ...baseInput, memoriaAtual: memorias['vocabulario'] ?? {} })),
      executarComTimeout(() => analisarRitmo({ ...baseInput, memoriaAtual: memorias['ritmo'] ?? {} })),
      executarComTimeout(() => analisarProduto({ ...baseInput, memoriaAtual: memorias['produtos'] ?? {} })),
    ])

  // ── Fase 3: Análise condicional (Viral) ──
  let viralResult: AgentResult<unknown> | null = null
  if (video.viral_score >= 70) {
    viralResult = await executarComTimeout(
      () => analisarViral({ ...baseInput, memoriaAtual: memorias['virais'] ?? {} })
    )
  }

  // ── Fase 4: Coleta e validação ──
  const resultados: { dimensao: DimensaoMemoria; result: AgentResult<unknown> }[] = [
    { dimensao: 'hooks', result: hookResult },
    { dimensao: 'ctas', result: ctaResult },
    { dimensao: 'emocoes', result: emocaoResult },
    { dimensao: 'vocabulario', result: vocabResult },
    { dimensao: 'ritmo', result: ritmoResult },
    { dimensao: 'produtos', result: produtoResult },
  ]

  if (viralResult) {
    resultados.push({ dimensao: 'virais', result: viralResult })
  }

  let sucessos = 0
  let falhas = 0

  // ── Fase 5: Atualização da memória estruturada ──
  for (const { dimensao, result } of resultados) {
    if (result.status === 'sucesso') {
      sucessos++
      await atualizarMemoriaEstruturada(
        influencerId,
        dimensao,
        result.memoriaAtualizada,
        result.confianca
      )
    } else {
      falhas++
    }
  }

  // Se viral foi analisado com sucesso, salvar template
  if (viralResult?.status === 'sucesso' && viralResult.dados) {
    await salvarTemplateViral(influencerId, videoId, viralResult.dados as Record<string, unknown>, video.viral_score)
  }

  // ── Fase 6: Geração de embeddings (sequencial) ──
  const embeddings = await processarEmbeddings(
    influencerId,
    videoId,
    transcricao.texto_completo
  )

  // ── Fase 7: Recalcular Nível de Conhecimento ──
  await calcularNivelConhecimento(influencerId)

  // ── Fase 8: Atualizar status do vídeo ──
  const analiseParcial = falhas > 0
  await supabaseAdmin
    .from('videos')
    .update({
      status: 'analisado',
      analise_parcial: analiseParcial,
    })
    .eq('id', videoId)

  return {
    sucessos,
    falhas,
    analiseParcial,
    viralAnalisado: viralResult !== null,
    embeddings,
  }
}

/**
 * Executa uma função com timeout de 60 segundos por agente.
 */
async function executarComTimeout<T>(
  fn: () => Promise<AgentResult<T>>,
  timeoutMs: number = 60_000
): Promise<AgentResult<T>> {
  return Promise.race([
    fn(),
    new Promise<AgentResult<T>>((resolve) =>
      setTimeout(
        () =>
          resolve({
            status: 'falha',
            dados: null,
            confianca: 0,
            memoriaAtualizada: {},
          }),
        timeoutMs
      )
    ),
  ])
}

/**
 * Atualiza a memória estruturada de uma dimensão específica.
 * Incrementa versão e salva snapshot anterior para rollback.
 */
async function atualizarMemoriaEstruturada(
  influencerId: string,
  dimensao: DimensaoMemoria,
  memoriaAtualizada: Record<string, unknown>,
  confianca: number
): Promise<void> {
  // Buscar memória existente
  const { data: existente } = await supabaseAdmin
    .from('memorias_estruturadas')
    .select('id, dados, versao, total_videos_analisados')
    .eq('influencer_id', influencerId)
    .eq('dimensao', dimensao)
    .single()

  if (existente) {
    // Salvar snapshot para rollback (mantido por 7 dias — cleanup na Fase 5)
    await supabaseAdmin.from('memorias_historico').insert({
      memoria_id: existente.id,
      influencer_id: influencerId,
      dimensao,
      dados: existente.dados,
      versao: existente.versao,
    })

    // Atualizar com novos dados
    await supabaseAdmin
      .from('memorias_estruturadas')
      .update({
        dados: memoriaAtualizada,
        versao: existente.versao + 1,
        total_videos_analisados: existente.total_videos_analisados + 1,
        confianca_atual: confianca,
      })
      .eq('id', existente.id)
  } else {
    // Criar primeira entrada para esta dimensão
    await supabaseAdmin.from('memorias_estruturadas').insert({
      influencer_id: influencerId,
      dimensao,
      dados: memoriaAtualizada,
      versao: 1,
      total_videos_analisados: 1,
      confianca_atual: confianca,
    })
  }
}

/**
 * Salva template viral extraído pelo Agente Viral.
 */
async function salvarTemplateViral(
  influencerId: string,
  videoId: string,
  dados: Record<string, unknown>,
  viralScore: number
): Promise<void> {
  const template = dados.template_extraido as Record<string, unknown> | undefined
  if (!template) return

  await supabaseAdmin.from('templates_virais').insert({
    influencer_id: influencerId,
    video_id: videoId,
    elemento_principal: dados.elemento_viral_principal as string ?? null,
    descricao: template.descricao as string ?? null,
    estrutura: template,
    categorias_compativeis: template.categorias_compativeis as string[] ?? null,
    categorias_incompativeis: template.categorias_incompativeis as string[] ?? null,
    replicabilidade: dados.replicabilidade as string ?? null,
    viral_score_original: viralScore,
    ativo: true,
  })
}
