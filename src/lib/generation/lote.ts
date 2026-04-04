/**
 * Geração em Lote — Diversidade Garantida
 * Referência: Seção 21 do Master Plan v3.0
 *
 * Distribui variáveis em sequência para garantir roteiros genuinamente diferentes:
 * - Variável 1: Tipo de hook (ciclar por performance)
 * - Variável 2: Arco emocional (alternar entre os 3 principais)
 * - Variável 3: Duração (variar entre formatos se quantidade >= 3)
 * - Variável 4: Ênfase do produto (preço, transformação, exclusividade, praticidade)
 *
 * Prevenção de repetição: similaridade de hooks > 80% → regenerar.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { montarBriefing, type ProdutoInput, type CenarioInput, type DuracaoInput, type BriefingGeracao } from './briefing'
import { gerarRoteiro, salvarBriefing, type RoteiroOutput } from './prompt-mestre'
import { revisarRoteiro } from '@/lib/agents/agent-revisor'
import { avaliarColdStart } from './cold-start'
import type { FormatoRoteiro } from '@/types/database'

export interface LoteInput {
  influencerId: string
  produto: ProdutoInput
  cenario: CenarioInput
  quantidade: number
  duracaoBase: DuracaoInput
}

export interface LoteResult {
  loteId: string | null
  roteiros: {
    roteiroId: string | null
    roteiro: RoteiroOutput | null
    variacoes: { hook: string; arco: string; formato: string; enfase: string }
    score: number | null
    status: string
  }[]
  quantidade_gerada: number
  quantidade_aprovada: number
}

const ENFASES_PRODUTO = ['preco', 'transformacao', 'exclusividade', 'praticidade']

const FORMATOS_VARIACAO: { formato: FormatoRoteiro; segundos: number }[] = [
  { formato: 'short', segundos: 25 },
  { formato: 'standard', segundos: 45 },
  { formato: 'extended', segundos: 90 },
]

export async function gerarLote(input: LoteInput): Promise<LoteResult> {
  const { influencerId, produto, cenario, quantidade, duracaoBase } = input

  // Avaliar cold start
  const coldStart = await avaliarColdStart(influencerId)
  if (!coldStart.pode_gerar) {
    return { loteId: null, roteiros: [], quantidade_gerada: 0, quantidade_aprovada: 0 }
  }

  // Montar briefing base para obter hooks e arcos disponíveis
  const briefingBase = await montarBriefing(influencerId, produto, cenario, duracaoBase)

  // Extrair hooks disponíveis (principal + alternativas)
  const hooksDisponiveis = [
    briefingBase.perfil_hooks.hook_selecionado.tipo,
    ...briefingBase.perfil_hooks.alternativas.map((a) => a.tipo),
  ]

  // Extrair arcos emocionais
  const arcosDisponiveis = [
    briefingBase.perfil_emocional.arco_recomendado,
    // Rotacionar arco para criar variações
    rotacionarArco(briefingBase.perfil_emocional.arco_recomendado, 1),
    rotacionarArco(briefingBase.perfil_emocional.arco_recomendado, 2),
  ]

  // Criar lote no banco
  const { data: lote } = await supabaseAdmin
    .from('lotes_roteiros')
    .insert({
      influencer_id: influencerId,
      produto_nome: produto.nome,
      quantidade_total: quantidade,
      configuracao: {
        hooks: hooksDisponiveis,
        enfases: ENFASES_PRODUTO.slice(0, quantidade),
        formatos_variados: quantidade >= 3,
      },
    })
    .select('id')
    .single()

  const loteId = lote?.id ?? null
  const roteiros: LoteResult['roteiros'] = []
  const hooksGerados: string[] = []
  let aprovados = 0

  for (let i = 0; i < quantidade; i++) {
    // Distribuir variáveis
    const hookIdx = i % hooksDisponiveis.length
    const arcoIdx = i % arcosDisponiveis.length
    const enfaseIdx = i % ENFASES_PRODUTO.length
    const hookTipo = hooksDisponiveis[hookIdx]
    const arco = arcosDisponiveis[arcoIdx]
    const enfase = ENFASES_PRODUTO[enfaseIdx]

    // Variação de formato (se quantidade >= 3)
    let duracao = duracaoBase
    if (quantidade >= 3 && i < FORMATOS_VARIACAO.length) {
      duracao = FORMATOS_VARIACAO[i]
    }

    // Ajustar briefing para esta variação
    const briefingVariado = ajustarBriefingVariacao(
      briefingBase,
      hookTipo,
      arco,
      enfase,
      duracao
    )

    // Gerar roteiro
    const resultado = await gerarRoteiro(briefingVariado)

    if (!resultado.roteiro) {
      roteiros.push({
        roteiroId: null,
        roteiro: null,
        variacoes: { hook: hookTipo, arco: arco[0], formato: duracao.formato, enfase },
        score: null,
        status: 'erro',
      })
      continue
    }

    // Verificar similaridade de hooks com roteiros anteriores
    const hookTexto = resultado.roteiro.blocos[0]?.texto ?? ''
    if (similaridadeAlta(hookTexto, hooksGerados)) {
      // Regenerar com instrução adicional
      const resultado2 = await gerarRoteiro(briefingVariado, 0.9)
      if (resultado2.roteiro) {
        Object.assign(resultado, resultado2)
      }
    }

    hooksGerados.push(resultado.roteiro.blocos[0]?.texto ?? '')

    // Revisar
    const revisao = await revisarRoteiro({
      roteiroJson: resultado.roteiro as unknown as Record<string, unknown>,
      briefingJson: briefingVariado as unknown as Record<string, unknown>,
    })

    const score = revisao?.scores.score_final ?? null
    const roteiroFinal = (revisao?.decisao === 'revisado' && revisao.roteiro_revisado)
      ? revisao.roteiro_revisado as RoteiroOutput
      : resultado.roteiro

    // Salvar no banco
    const { data: roteiroDb } = await supabaseAdmin
      .from('roteiros')
      .insert({
        influencer_id: influencerId,
        lote_id: loteId,
        produto_nome: produto.nome,
        produto_categoria: produto.categoria,
        produto_preco: produto.preco,
        cenario: cenario.local,
        duracao_alvo_segundos: duracao.segundos,
        duracao_calculada_segundos: roteiroFinal.duracao_total_calculada,
        formato: duracao.formato,
        conteudo: roteiroFinal as unknown as Record<string, unknown>,
        score_qualidade: score ? score * 10 : null,
        score_autenticidade: revisao?.scores.autenticidade ?? null,
        score_estrutura: revisao?.scores.estrutura ?? null,
        score_viral: revisao?.scores.potencial_viral ?? null,
        score_produto: revisao?.scores.adequacao_produto ?? null,
        contexto_qualidade: briefingVariado.contexto_rag.nivel_fallback <= 1 ? 'completo'
          : briefingVariado.contexto_rag.nivel_fallback <= 3 ? 'parcial' : 'sem_rag',
        nivel_conhecimento_no_momento: briefingVariado.influenciador.nivel_conhecimento / 100,
        status: 'pendente',
        pontos_fortes: revisao?.pontos_fortes ?? null,
        pontos_fracos: revisao?.pontos_fracos ?? null,
      })
      .select('id')
      .single()

    const isAprovado = score !== null && score >= 7.0
    if (isAprovado) aprovados++

    roteiros.push({
      roteiroId: roteiroDb?.id ?? null,
      roteiro: roteiroFinal,
      variacoes: { hook: hookTipo, arco: arco[0], formato: duracao.formato, enfase },
      score,
      status: revisao?.decisao ?? 'gerado',
    })
  }

  // Atualizar lote
  if (loteId) {
    await supabaseAdmin
      .from('lotes_roteiros')
      .update({
        quantidade_gerada: roteiros.filter((r) => r.roteiro !== null).length,
        quantidade_aprovada: aprovados,
        status: roteiros.every((r) => r.roteiro !== null) ? 'concluido' : 'erro_parcial',
        concluido_em: new Date().toISOString(),
      })
      .eq('id', loteId)
  }

  return {
    loteId,
    roteiros,
    quantidade_gerada: roteiros.filter((r) => r.roteiro !== null).length,
    quantidade_aprovada: aprovados,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function ajustarBriefingVariacao(
  base: BriefingGeracao,
  hookTipo: string,
  arco: string[],
  enfase: string,
  duracao: DuracaoInput
): BriefingGeracao {
  return {
    ...base,
    duracao_alvo: {
      ...base.duracao_alvo,
      segundos: duracao.segundos,
      formato: duracao.formato,
    },
    perfil_hooks: {
      ...base.perfil_hooks,
      hook_selecionado: {
        ...base.perfil_hooks.hook_selecionado,
        tipo: hookTipo,
        justificativa_selecao: `Variação de lote — tipo ${hookTipo}, ênfase em ${enfase}`,
      },
    },
    perfil_emocional: {
      ...base.perfil_emocional,
      arco_recomendado: arco,
    },
    restricoes: {
      ...base.restricoes,
      // Adicionar ênfase como instrução implícita (será passada no prompt)
    },
  }
}

function rotacionarArco(arco: string[], posicoes: number): string[] {
  if (arco.length <= 1) return arco
  const resultado = [...arco]
  for (let i = 0; i < posicoes; i++) {
    const primeiro = resultado.shift()!
    resultado.push(primeiro)
  }
  return resultado
}

/**
 * Verifica se um hook é similar demais aos anteriores (> 80% de tokens compartilhados).
 */
function similaridadeAlta(novoHook: string, hooksAnteriores: string[]): boolean {
  if (hooksAnteriores.length === 0) return false

  const tokensNovo = new Set(novoHook.toLowerCase().split(/\s+/))

  for (const anterior of hooksAnteriores) {
    const tokensAnterior = new Set(anterior.toLowerCase().split(/\s+/))
    const intersecao = [...tokensNovo].filter((t) => tokensAnterior.has(t)).length
    const uniao = new Set([...tokensNovo, ...tokensAnterior]).size

    if (uniao > 0 && intersecao / uniao > 0.8) return true
  }

  return false
}
