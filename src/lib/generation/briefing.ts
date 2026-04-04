/**
 * Montagem do Briefing de Geração — Contrato de Dados Agentes → Gerador
 * Referência: Seção 17 do Master Plan v3.0
 *
 * Executa em paralelo:
 * 1. Carregamento de memória estruturada completa
 * 2. Busca RAG com 5 níveis de fallback (Seção 22)
 * 3. Seleção de hook por algoritmo de ranqueamento (Seção 19)
 * 4. Templates virais compatíveis
 * 5. Perfil de CTA recomendada
 * 6. Arco emocional recomendado
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { gerarEmbedding } from '@/lib/agents/embeddings'
import type { MemoriaEstruturada, TemplateViral } from '@/types/database'

// ============================================================================
// Tipos do Briefing
// ============================================================================

export interface ProdutoInput {
  nome: string
  categoria: string
  preco: string
  diferenciais: string[]
  objecoes_comuns: string[]
}

export interface CenarioInput {
  local: string
  tom_recomendado: string
  vocabulario_cenario: string[]
  restricoes: string[]
}

export interface DuracaoInput {
  segundos: number
  formato: 'short' | 'standard' | 'extended' | 'long'
}

export interface BriefingGeracao {
  influenciador: {
    handle: string
    nivel_conhecimento: number
    total_videos_analisados: number
  }

  produto: ProdutoInput & {
    objecoes_comuns: string[]
  }

  cenario: CenarioInput & {
    descricao: string
  }

  duracao_alvo: {
    segundos: number
    formato: 'short' | 'standard' | 'extended' | 'long'
    blocos_sugeridos: string[]
  }

  perfil_hooks: {
    hook_selecionado: {
      tipo: string
      justificativa_selecao: string
      exemplos_do_influenciador: string[]
    }
    alternativas: { tipo: string; exemplo: string }[]
  }

  perfil_cta: {
    cta_recomendada: {
      tipo: string
      nivel_urgencia: string
      emocao_associada: string
      exemplos_do_influenciador: string[]
    }
    posicao_recomendada: number
  }

  perfil_emocional: {
    arco_recomendado: string[]
    justificativa: string
    transicao_principal: { de: string; para: string; momento: number }
  }

  perfil_vocabulario: {
    expressoes_caracteristicas: string[]
    girias_proprias: string[]
    vicios_linguagem: string[]
    nivel_formalidade: number
    marcadores_transicao: string[]
    expressoes_raras_impactantes: string[]
  }

  perfil_ritmo: {
    velocidade_media_wpm: number
    padroes_pausa: string
    momento_aceleracao: number
    tecnica_enfase: string
  }

  perfil_produto_categoria: {
    angulo_preferido_para_esta_categoria: string
    atributos_que_ele_enfatiza: string[]
    objecoes_que_ele_trata: string[]
    posicionamento_preco_preferido: string
  }

  contexto_rag: {
    chunks_relevantes: { texto: string; similaridade: number; video_id: string }[]
    consulta_usada: string
    threshold_aplicado: number
    total_chunks_encontrados: number
    nivel_fallback: number
  }

  templates_virais_ativos: {
    elemento: string
    template: string
    replicabilidade: string
    compativel_com_categoria: boolean
  }[]

  restricoes: {
    blocos_proibidos: string[]
    tom_proibido: string
    palavras_evitar: string[]
  }
}

// ============================================================================
// Constantes
// ============================================================================

const BLOCOS_POR_FORMATO: Record<string, string[]> = {
  short: ['hook', 'apresentacao_produto', 'cta_compra'],
  standard: ['hook', 'problema', 'apresentacao_produto', 'revelacao_preco', 'cta_compra'],
  extended: ['hook', 'problema', 'apresentacao_produto', 'demonstracao', 'prova_social', 'revelacao_preco', 'cta_engajamento', 'cta_compra'],
  long: ['hook', 'problema', 'apresentacao_produto', 'demonstracao', 'comparacao', 'prova_social', 'revelacao_preco', 'cta_engajamento', 'cta_compra'],
}

// Compatibilidade cenário-hook (Seção 19)
const CENARIO_HOOK_COMPAT: Record<string, Record<string, number>> = {
  historia_pessoal: { quarto: 1.2, mesa: 1.2, escritorio: 1.0, rua: 0.6, praca: 0.6, loja: 0.8 },
  numero_especifico: {},  // sem penalidade para nenhum cenário
  antes_depois: { quarto: 1.3, mesa: 1.3, escritorio: 1.1, rua: 0.8, praca: 0.8 },
}

// ============================================================================
// Função principal
// ============================================================================

export async function montarBriefing(
  influencerId: string,
  produto: ProdutoInput,
  cenario: CenarioInput,
  duracao: DuracaoInput
): Promise<BriefingGeracao> {
  // Executar em paralelo: memória, RAG, templates, dados do influenciador
  const [
    influenciador,
    memorias,
    contextRag,
    templatesVirais,
  ] = await Promise.all([
    carregarInfluenciador(influencerId),
    carregarMemoriasEstruturadas(influencerId),
    buscarChunksRAG(influencerId, produto, cenario),
    carregarTemplatesVirais(influencerId, produto.categoria),
  ])

  // Extrair perfis das memórias
  const memHooks = memorias.find((m) => m.dimensao === 'hooks')?.dados ?? {}
  const memCtas = memorias.find((m) => m.dimensao === 'ctas')?.dados ?? {}
  const memEmocoes = memorias.find((m) => m.dimensao === 'emocoes')?.dados ?? {}
  const memVocab = memorias.find((m) => m.dimensao === 'vocabulario')?.dados ?? {}
  const memRitmo = memorias.find((m) => m.dimensao === 'ritmo')?.dados ?? {}
  const memProdutos = memorias.find((m) => m.dimensao === 'produtos')?.dados ?? {}

  // Total de vídeos analisados
  const totalAnalisados = Math.max(
    ...memorias.map((m) => m.total_videos_analisados),
    0
  )

  // Seleção de hook (Seção 19)
  const perfilHooks = selecionarHook(memHooks, produto.categoria, cenario.local)

  // Perfil CTA
  const perfilCta = montarPerfilCTA(memCtas, produto.categoria)

  // Arco emocional
  const perfilEmocional = montarArcoEmocional(memEmocoes, produto.categoria)

  // Vocabulário
  const perfilVocab = montarPerfilVocabulario(memVocab)

  // Ritmo
  const perfilRitmo = montarPerfilRitmo(memRitmo)

  // Perfil de produto/categoria
  const perfilProdCateg = montarPerfilProdutoCategoria(memProdutos, produto.categoria)

  return {
    influenciador: {
      handle: influenciador.tiktok_handle,
      nivel_conhecimento: Math.round(influenciador.nivel_conhecimento_ia * 100),
      total_videos_analisados: totalAnalisados,
    },

    produto: {
      ...produto,
      objecoes_comuns: produto.objecoes_comuns.length > 0
        ? produto.objecoes_comuns
        : perfilProdCateg.objecoes_que_ele_trata,
    },

    cenario: {
      ...cenario,
      descricao: `${cenario.local} — ${cenario.tom_recomendado}`,
    },

    duracao_alvo: {
      segundos: duracao.segundos,
      formato: duracao.formato,
      blocos_sugeridos: BLOCOS_POR_FORMATO[duracao.formato] ?? BLOCOS_POR_FORMATO.standard,
    },

    perfil_hooks: perfilHooks,
    perfil_cta: perfilCta,
    perfil_emocional: perfilEmocional,
    perfil_vocabulario: perfilVocab,
    perfil_ritmo: perfilRitmo,
    perfil_produto_categoria: perfilProdCateg,
    contexto_rag: contextRag,

    templates_virais_ativos: templatesVirais.map((t) => ({
      elemento: t.elemento_principal ?? '',
      template: t.descricao ?? '',
      replicabilidade: t.replicabilidade ?? 'media',
      compativel_com_categoria: (t.categorias_compativeis ?? []).includes(produto.categoria),
    })),

    restricoes: {
      blocos_proibidos: [],
      tom_proibido: '',
      palavras_evitar: [],
    },
  }
}

// ============================================================================
// Carregadores de dados
// ============================================================================

async function carregarInfluenciador(influencerId: string) {
  const { data, error } = await supabaseAdmin
    .from('influenciadores')
    .select('tiktok_handle, nivel_conhecimento_ia')
    .eq('id', influencerId)
    .single()

  if (error || !data) throw new Error(`Influenciador ${influencerId} não encontrado`)
  return data
}

async function carregarMemoriasEstruturadas(influencerId: string): Promise<MemoriaEstruturada[]> {
  const { data } = await supabaseAdmin
    .from('memorias_estruturadas')
    .select('*')
    .eq('influencer_id', influencerId)

  return (data ?? []) as MemoriaEstruturada[]
}

/**
 * Busca RAG com 5 níveis de fallback (Seção 22).
 */
async function buscarChunksRAG(
  influencerId: string,
  produto: ProdutoInput,
  cenario: CenarioInput
): Promise<BriefingGeracao['contexto_rag']> {
  const consultaCompleta = `${produto.nome} ${produto.categoria} ${cenario.local}`
  const consultaCategoria = `${produto.categoria}`

  // Nível 1 — threshold 0.75
  let resultado = await executarBuscaRAG(influencerId, consultaCompleta, 0.75)
  if (resultado.chunks.length >= 5) {
    return {
      chunks_relevantes: resultado.chunks,
      consulta_usada: consultaCompleta,
      threshold_aplicado: 0.75,
      total_chunks_encontrados: resultado.chunks.length,
      nivel_fallback: 1,
    }
  }

  // Nível 2 — threshold 0.60
  resultado = await executarBuscaRAG(influencerId, consultaCompleta, 0.60)
  if (resultado.chunks.length >= 3) {
    return {
      chunks_relevantes: resultado.chunks,
      consulta_usada: consultaCompleta,
      threshold_aplicado: 0.60,
      total_chunks_encontrados: resultado.chunks.length,
      nivel_fallback: 2,
    }
  }

  // Nível 3 — consulta expandida (apenas categoria)
  resultado = await executarBuscaRAG(influencerId, consultaCategoria, 0.60)
  if (resultado.chunks.length >= 3) {
    return {
      chunks_relevantes: resultado.chunks,
      consulta_usada: consultaCategoria,
      threshold_aplicado: 0.60,
      total_chunks_encontrados: resultado.chunks.length,
      nivel_fallback: 3,
    }
  }

  // Nível 4 — sem RAG (memória estruturada apenas)
  return {
    chunks_relevantes: resultado.chunks, // pode ter 0-2 chunks
    consulta_usada: consultaCategoria,
    threshold_aplicado: 0.60,
    total_chunks_encontrados: resultado.chunks.length,
    nivel_fallback: resultado.chunks.length === 0 ? 5 : 4,
  }
}

async function executarBuscaRAG(
  influencerId: string,
  consulta: string,
  threshold: number
): Promise<{ chunks: { texto: string; similaridade: number; video_id: string }[] }> {
  try {
    const embedding = await gerarEmbedding(consulta)

    const { data, error } = await supabaseAdmin.rpc('buscar_chunks_similares', {
      p_influencer_id: influencerId,
      p_embedding: JSON.stringify(embedding),
      p_top_k: 20,
      p_similaridade_minima: threshold,
    })

    if (error) {
      console.error('Erro na busca RAG:', error)
      return { chunks: [] }
    }

    return {
      chunks: (data ?? []).map((c: { texto: string; similaridade: number; video_id: string }) => ({
        texto: c.texto,
        similaridade: c.similaridade,
        video_id: c.video_id,
      })),
    }
  } catch (err) {
    console.error('Erro ao gerar embedding para RAG:', err)
    return { chunks: [] }
  }
}

async function carregarTemplatesVirais(
  influencerId: string,
  categoriaAtual: string
): Promise<TemplateViral[]> {
  const { data } = await supabaseAdmin
    .from('templates_virais')
    .select('*')
    .eq('influencer_id', influencerId)
    .eq('ativo', true)
    .order('viral_score_original', { ascending: false })
    .limit(5)

  if (!data) return []

  // Priorizar templates compatíveis com a categoria
  return (data as TemplateViral[]).sort((a, b) => {
    const aCompat = (a.categorias_compativeis ?? []).includes(categoriaAtual) ? 1 : 0
    const bCompat = (b.categorias_compativeis ?? []).includes(categoriaAtual) ? 1 : 0
    return bCompat - aCompat
  })
}

// ============================================================================
// Algoritmo de seleção de hook (Seção 19)
// ============================================================================

interface HookPadrao {
  tipo: string
  frequencia: number
  exemplos: string[]
  performance_media_views?: number
  por_categoria?: Record<string, { frequencia: number; performance_media_views: number }>
}

function selecionarHook(
  memHooks: Record<string, unknown>,
  categoriaAtual: string,
  cenarioLocal: string
): BriefingGeracao['perfil_hooks'] {
  const padroes: HookPadrao[] = (memHooks.padroes as HookPadrao[] | undefined) ?? []

  if (padroes.length === 0) {
    return {
      hook_selecionado: {
        tipo: 'pergunta_chocante',
        justificativa_selecao: 'Tipo padrão — memória de hooks vazia',
        exemplos_do_influenciador: [],
      },
      alternativas: [
        { tipo: 'afirmacao_bold', exemplo: '' },
        { tipo: 'numero_especifico', exemplo: '' },
      ],
    }
  }

  // Calcular score para cada tipo de hook
  const scored = padroes.map((p) => {
    // Performance para esta categoria (ou geral)
    const catData = p.por_categoria?.[categoriaAtual]
    const performance = catData?.performance_media_views ?? p.performance_media_views ?? 1.0

    // Compatibilidade com cenário
    const cenarioKey = cenarioLocal.toLowerCase()
    const compatMap = CENARIO_HOOK_COMPAT[p.tipo] ?? {}
    const compatCenario = compatMap[cenarioKey] ?? 1.0

    // Score final = performance × compatibilidade × frequência
    const score = performance * compatCenario * (p.frequencia ?? 1)

    return { ...p, score }
  })

  // Ordenar por score descrescente
  scored.sort((a, b) => b.score - a.score)

  const melhor = scored[0]
  const alternativas = scored.slice(1, 3)

  return {
    hook_selecionado: {
      tipo: melhor.tipo,
      justificativa_selecao: `Score ${melhor.score.toFixed(2)} — performance ${(melhor.performance_media_views ?? 0).toFixed(0)} × compat cenário × freq ${melhor.frequencia}`,
      exemplos_do_influenciador: (melhor.exemplos ?? []).slice(0, 3),
    },
    alternativas: alternativas.map((a) => ({
      tipo: a.tipo,
      exemplo: (a.exemplos ?? [])[0] ?? '',
    })),
  }
}

// ============================================================================
// Montagem de perfis
// ============================================================================

function montarPerfilCTA(
  memCtas: Record<string, unknown>,
  categoriaAtual: string
): BriefingGeracao['perfil_cta'] {
  const padroes = (memCtas.padroes as Array<{
    tipo: string
    urgencia: string
    emocao: string
    exemplos: string[]
    frequencia: number
    por_categoria?: Record<string, { frequencia: number }>
  }>) ?? []

  if (padroes.length === 0) {
    return {
      cta_recomendada: {
        tipo: 'direto',
        nivel_urgencia: 'medio',
        emocao_associada: 'entusiasmo',
        exemplos_do_influenciador: [],
      },
      posicao_recomendada: 85,
    }
  }

  // Priorizar CTA mais frequente para esta categoria
  const scored = padroes.map((p) => {
    const catFreq = p.por_categoria?.[categoriaAtual]?.frequencia ?? 0
    return { ...p, score: catFreq > 0 ? catFreq * 2 : p.frequencia }
  })
  scored.sort((a, b) => b.score - a.score)

  const melhor = scored[0]
  return {
    cta_recomendada: {
      tipo: melhor.tipo,
      nivel_urgencia: melhor.urgencia ?? 'medio',
      emocao_associada: melhor.emocao ?? 'entusiasmo',
      exemplos_do_influenciador: (melhor.exemplos ?? []).slice(0, 3),
    },
    posicao_recomendada: (memCtas.padrao_posicional as number) ?? 85,
  }
}

function montarArcoEmocional(
  memEmocoes: Record<string, unknown>,
  _categoriaAtual: string
): BriefingGeracao['perfil_emocional'] {
  const arcos = (memEmocoes.arcos_identificados as Array<{
    padrao: string
    sequencia: string[]
    frequencia: number
  }>) ?? []

  if (arcos.length === 0) {
    return {
      arco_recomendado: ['curiosidade', 'interesse', 'desejo', 'confianca', 'urgencia'],
      justificativa: 'Arco padrão — memória emocional vazia',
      transicao_principal: { de: 'curiosidade', para: 'desejo', momento: 40 },
    }
  }

  // Usar o arco mais frequente
  arcos.sort((a, b) => (b.frequencia ?? 0) - (a.frequencia ?? 0))
  const melhor = arcos[0]

  const seq = melhor.sequencia ?? ['curiosidade', 'interesse', 'desejo', 'confianca', 'urgencia']
  const meio = Math.floor(seq.length / 2)

  return {
    arco_recomendado: seq,
    justificativa: `Arco "${melhor.padrao}" — mais frequente (${melhor.frequencia}x)`,
    transicao_principal: {
      de: seq[meio - 1] ?? seq[0],
      para: seq[meio] ?? seq[seq.length - 1],
      momento: Math.round((meio / seq.length) * 100),
    },
  }
}

function montarPerfilVocabulario(
  memVocab: Record<string, unknown>
): BriefingGeracao['perfil_vocabulario'] {
  return {
    expressoes_caracteristicas: asStringArray(memVocab.expressoes_caracteristicas).slice(0, 10),
    girias_proprias: asStringArray(memVocab.girias_proprias),
    vicios_linguagem: asStringArray(memVocab.vicios_linguagem).slice(0, 5),
    nivel_formalidade: (memVocab.nivel_formalidade as number) ?? 3,
    marcadores_transicao: asStringArray(memVocab.marcadores_transicao),
    expressoes_raras_impactantes: asStringArray(memVocab.expressoes_raras_impactantes),
  }
}

function montarPerfilRitmo(
  memRitmo: Record<string, unknown>
): BriefingGeracao['perfil_ritmo'] {
  return {
    velocidade_media_wpm: (memRitmo.velocidade_media_wpm as number) ?? 130,
    padroes_pausa: (memRitmo.padroes_pausa as string) ?? 'pausa antes do CTA',
    momento_aceleracao: (memRitmo.momento_aceleracao as number) ?? 80,
    tecnica_enfase: (memRitmo.tecnica_enfase as string) ?? 'repetição',
  }
}

function montarPerfilProdutoCategoria(
  memProdutos: Record<string, unknown>,
  categoriaAtual: string
): BriefingGeracao['perfil_produto_categoria'] {
  const porCategoria = (memProdutos.por_categoria as Record<string, {
    angulo_preferido: string
    atributos_enfatizados: string[]
    objecoes_tratadas: string[]
    posicionamento_preco: string
  }>) ?? {}

  const cat = porCategoria[categoriaAtual]

  if (!cat) {
    return {
      angulo_preferido_para_esta_categoria: 'demonstracao_pratica',
      atributos_que_ele_enfatiza: [],
      objecoes_que_ele_trata: [],
      posicionamento_preco_preferido: 'revelacao_gradual',
    }
  }

  return {
    angulo_preferido_para_esta_categoria: cat.angulo_preferido ?? 'demonstracao_pratica',
    atributos_que_ele_enfatiza: asStringArray(cat.atributos_enfatizados),
    objecoes_que_ele_trata: asStringArray(cat.objecoes_tratadas),
    posicionamento_preco_preferido: cat.posicionamento_preco ?? 'revelacao_gradual',
  }
}

// ============================================================================
// Utils
// ============================================================================

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === 'string')
  return []
}
