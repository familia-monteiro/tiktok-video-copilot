/**
 * Ciclo de Geração — Integra Prompt Mestre + Agente Revisor
 * Referência: Seção 20 do Master Plan v3.0
 *
 * Score >= 7.0: aprovar
 * Score 5.0-6.9: revisar com Gemini temperatura 0.3 (usar versão revisada)
 * Score < 5.0: descartar e regenerar com parâmetros diferentes
 * Máximo 2 ciclos automáticos.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { montarBriefing, type BriefingGeracao, type ProdutoInput, type CenarioInput, type DuracaoInput } from './briefing'
import { gerarRoteiro, salvarBriefing, type RoteiroOutput } from './prompt-mestre'
import { revisarRoteiro, type RevisorOutput } from '@/lib/agents/agent-revisor'
import { avaliarColdStart, type ColdStartInfo } from './cold-start'

export interface CicloGeracaoInput {
  influencerId: string
  produto: ProdutoInput
  cenario: CenarioInput
  duracao: DuracaoInput
  forcarExperimental?: boolean // permitir geração em cold start real
}

export interface CicloGeracaoResult {
  roteiro: RoteiroOutput | null
  roteiroId: string | null
  briefingId: string | null
  revisao: RevisorOutput | null
  coldStart: ColdStartInfo
  ciclos: number
  status: 'aprovado' | 'revisado' | 'reprovado' | 'melhor_disponivel' | 'bloqueado' | 'erro'
  mensagem: string
}

/**
 * Executa o ciclo completo de geração de roteiro:
 * 1. Avalia cold start
 * 2. Monta briefing
 * 3. Gera roteiro (Prompt Mestre)
 * 4. Revisa (Agente Revisor)
 * 5. Se necessário: regenera ou usa versão revisada
 * Máximo 2 ciclos.
 */
export async function executarCicloGeracao(
  input: CicloGeracaoInput
): Promise<CicloGeracaoResult> {
  // 1. Avaliar cold start
  const coldStart = await avaliarColdStart(input.influencerId)

  if (!coldStart.pode_gerar && !input.forcarExperimental) {
    return {
      roteiro: null,
      roteiroId: null,
      briefingId: null,
      revisao: null,
      coldStart,
      ciclos: 0,
      status: 'bloqueado',
      mensagem: coldStart.mensagem ?? 'Nível de conhecimento insuficiente para geração.',
    }
  }

  // 2. Montar briefing
  const briefing = await montarBriefing(
    input.influencerId,
    input.produto,
    input.cenario,
    input.duracao
  )

  // Salvar briefing para auditoria
  const briefingId = await salvarBriefing(input.influencerId, briefing)

  // 3. Ciclo 1: Gerar + Revisar
  let melhorRoteiro: RoteiroOutput | null = null
  let melhorRevisao: RevisorOutput | null = null
  let melhorScore = 0

  const resultado1 = await gerarRoteiro(briefing)
  if (!resultado1.roteiro) {
    return {
      roteiro: null,
      roteiroId: null,
      briefingId,
      revisao: null,
      coldStart,
      ciclos: 1,
      status: 'erro',
      mensagem: resultado1.erro ?? 'Falha na geração do roteiro',
    }
  }

  // Revisar
  const revisao1 = await revisarRoteiro({
    roteiroJson: resultado1.roteiro as unknown as Record<string, unknown>,
    briefingJson: briefing as unknown as Record<string, unknown>,
  })

  if (revisao1) {
    const score = revisao1.scores.score_final

    if (score >= coldStart.revisor_threshold) {
      // Aprovado
      const roteiroId = await salvarRoteiroNoBanco(
        input.influencerId,
        resultado1.roteiro,
        revisao1,
        briefing,
        briefingId
      )
      return {
        roteiro: resultado1.roteiro,
        roteiroId,
        briefingId,
        revisao: revisao1,
        coldStart,
        ciclos: 1,
        status: 'aprovado',
        mensagem: `Roteiro aprovado com score ${score.toFixed(1)}/10`,
      }
    }

    if (score >= 5.0 && revisao1.roteiro_revisado) {
      // Revisado — usar versão corrigida
      const roteiroRevisado = revisao1.roteiro_revisado as RoteiroOutput
      const roteiroId = await salvarRoteiroNoBanco(
        input.influencerId,
        roteiroRevisado,
        revisao1,
        briefing,
        briefingId
      )
      return {
        roteiro: roteiroRevisado,
        roteiroId,
        briefingId,
        revisao: revisao1,
        coldStart,
        ciclos: 1,
        status: 'revisado',
        mensagem: `Roteiro revisado automaticamente. Score original: ${score.toFixed(1)}/10`,
      }
    }

    // Score < 5.0 — guardar e tentar ciclo 2
    melhorRoteiro = resultado1.roteiro
    melhorRevisao = revisao1
    melhorScore = score
  } else {
    // Revisor falhou — aceitar roteiro sem revisão
    melhorRoteiro = resultado1.roteiro
    melhorScore = 0
  }

  // 4. Ciclo 2: Regenerar com parâmetros diferentes
  const briefing2 = ajustarBriefingParaRetry(briefing, melhorRevisao)
  const resultado2 = await gerarRoteiro(briefing2, 0.8) // temperatura mais alta

  if (resultado2.roteiro) {
    const revisao2 = await revisarRoteiro({
      roteiroJson: resultado2.roteiro as unknown as Record<string, unknown>,
      briefingJson: briefing2 as unknown as Record<string, unknown>,
    })

    if (revisao2) {
      const score2 = revisao2.scores.score_final

      if (score2 >= coldStart.revisor_threshold) {
        const roteiroId = await salvarRoteiroNoBanco(
          input.influencerId,
          resultado2.roteiro,
          revisao2,
          briefing2,
          briefingId
        )
        return {
          roteiro: resultado2.roteiro,
          roteiroId,
          briefingId,
          revisao: revisao2,
          coldStart,
          ciclos: 2,
          status: 'aprovado',
          mensagem: `Roteiro aprovado no segundo ciclo. Score: ${score2.toFixed(1)}/10`,
        }
      }

      if (score2 >= 5.0 && revisao2.roteiro_revisado) {
        const roteiroRevisado = revisao2.roteiro_revisado as RoteiroOutput
        const roteiroId = await salvarRoteiroNoBanco(
          input.influencerId,
          roteiroRevisado,
          revisao2,
          briefing2,
          briefingId
        )
        return {
          roteiro: roteiroRevisado,
          roteiroId,
          briefingId,
          revisao: revisao2,
          coldStart,
          ciclos: 2,
          status: 'revisado',
          mensagem: `Roteiro revisado no segundo ciclo. Score: ${score2.toFixed(1)}/10`,
        }
      }

      // Usar o melhor dos dois ciclos
      if (score2 > melhorScore) {
        melhorRoteiro = resultado2.roteiro
        melhorRevisao = revisao2
        melhorScore = score2
      }
    }
  }

  // 5. Entregar melhor versão disponível com aviso
  if (melhorRoteiro) {
    const roteiroId = await salvarRoteiroNoBanco(
      input.influencerId,
      melhorRoteiro,
      melhorRevisao,
      briefing,
      briefingId
    )
    return {
      roteiro: melhorRoteiro,
      roteiroId,
      briefingId,
      revisao: melhorRevisao,
      coldStart,
      ciclos: 2,
      status: 'melhor_disponivel',
      mensagem: `Melhor versão disponível (score ${melhorScore.toFixed(1)}/10). Confiança baixa — revise manualmente.`,
    }
  }

  return {
    roteiro: null,
    roteiroId: null,
    briefingId,
    revisao: null,
    coldStart,
    ciclos: 2,
    status: 'erro',
    mensagem: 'Não foi possível gerar um roteiro aceitável após 2 ciclos.',
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Ajusta o briefing para uma segunda tentativa com parâmetros diferentes.
 * Usa hook alternativo e arco emocional diferente (Seção 20).
 */
function ajustarBriefingParaRetry(
  briefing: BriefingGeracao,
  revisaoAnterior: RevisorOutput | null
): BriefingGeracao {
  const adjusted = { ...briefing }

  // Usar hook alternativo
  if (briefing.perfil_hooks.alternativas.length > 0) {
    const alt = briefing.perfil_hooks.alternativas[0]
    adjusted.perfil_hooks = {
      ...briefing.perfil_hooks,
      hook_selecionado: {
        tipo: alt.tipo,
        justificativa_selecao: 'Alternativa selecionada após reprovação do ciclo 1',
        exemplos_do_influenciador: alt.exemplo ? [alt.exemplo] : [],
      },
    }
  }

  // Rotacionar arco emocional
  if (briefing.perfil_emocional.arco_recomendado.length > 2) {
    const arco = [...briefing.perfil_emocional.arco_recomendado]
    // Mover primeira emoção para posição 2
    const primeira = arco.shift()!
    arco.splice(1, 0, primeira)
    adjusted.perfil_emocional = {
      ...briefing.perfil_emocional,
      arco_recomendado: arco,
      justificativa: 'Arco ajustado após reprovação do ciclo 1',
    }
  }

  // Adicionar instruções de melhoria do revisor como restrições
  if (revisaoAnterior?.instrucoes_para_nova_geracao) {
    adjusted.restricoes = {
      ...briefing.restricoes,
      palavras_evitar: [
        ...briefing.restricoes.palavras_evitar,
        ...(revisaoAnterior.expressoes_nao_autenticas ?? []),
      ],
    }
  }

  return adjusted
}

/**
 * Salva o roteiro no banco.
 */
async function salvarRoteiroNoBanco(
  influencerId: string,
  roteiro: RoteiroOutput,
  revisao: RevisorOutput | null,
  briefing: BriefingGeracao,
  briefingId: string | null
): Promise<string | null> {
  const contextoQualidade = briefing.contexto_rag.nivel_fallback <= 1 ? 'completo'
    : briefing.contexto_rag.nivel_fallback <= 3 ? 'parcial'
    : 'sem_rag'

  const { data, error } = await supabaseAdmin
    .from('roteiros')
    .insert({
      influencer_id: influencerId,
      briefing_id: briefingId,
      produto_nome: briefing.produto.nome,
      produto_categoria: briefing.produto.categoria,
      produto_preco: briefing.produto.preco,
      produto_detalhes: { diferenciais: briefing.produto.diferenciais },
      cenario: briefing.cenario.local,
      duracao_alvo_segundos: briefing.duracao_alvo.segundos,
      duracao_calculada_segundos: roteiro.duracao_total_calculada,
      formato: briefing.duracao_alvo.formato,
      conteudo: roteiro as unknown as Record<string, unknown>,
      score_qualidade: revisao ? revisao.scores.score_final * 10 : null,
      score_autenticidade: revisao?.scores.autenticidade ?? null,
      score_estrutura: revisao?.scores.estrutura ?? null,
      score_viral: revisao?.scores.potencial_viral ?? null,
      score_produto: revisao?.scores.adequacao_produto ?? null,
      contexto_qualidade: contextoQualidade,
      nivel_conhecimento_no_momento: briefing.influenciador.nivel_conhecimento / 100,
      status: 'pendente',
      pontos_fortes: revisao?.pontos_fortes ?? null,
      pontos_fracos: revisao?.pontos_fracos ?? null,
      chunks_rag_usados: briefing.contexto_rag.chunks_relevantes.map((c) => c.video_id),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Erro ao salvar roteiro:', error)
    return null
  }

  return data.id
}
