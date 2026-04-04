/**
 * Prompt Mestre de Geração — Estrutura Completa
 * Referência: Seção 18 do Master Plan v3.0 + Seção 11 do Documento de Prompts v1.0
 *
 * O prompt é composto de 5 seções injetadas em ordem:
 * 1. Identidade e Missão (system prompt fixo)
 * 2. Perfil do Influenciador (dinâmico)
 * 3. Contexto do Produto e Cenário (dinâmico)
 * 4. Template Viral (condicional)
 * 5. Instruções de Geração e Schema (dinâmico)
 *
 * Chamada ao Gemini 1.5 Pro com temperatura 0.7.
 * Validação JSON do output contra schema canônico (Seção 23).
 */

import { z } from 'zod'
import { geminiPro } from '@/lib/gemini/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { BriefingGeracao } from './briefing'

// ============================================================================
// System Prompt Base (fixo — copiado exatamente da Seção 11 do Documento de Prompts)
// ============================================================================

const SYSTEM_PROMPT_BASE = `Você é um ghostwriter especializado em roteiros para TikTok Shop brasileiro.
Sua habilidade central é escrever roteiros que soam exatamente como foram escritos
pelo próprio influenciador — não como um roteiro genérico de vendas.

Seu critério de sucesso: uma pessoa que acompanha este influenciador há meses não
consegue distinguir se o roteiro veio de você ou do próprio criador.

REGRAS ABSOLUTAS DE AUTENTICIDADE:
1. Use APENAS vocabulário compatível com o perfil fornecido. Se uma expressão não
   está no perfil, ela não existe para você.
2. Respeite o nível de formalidade indicado. Se ele fala informalmente, você escreve
   informalmente — incluindo contrações, gírias e estruturas gramaticais informais.
3. As expressões características devem aparecer naturalmente, não forçadas.
4. O hook deve seguir o tipo indicado usando a estrutura dos exemplos reais como modelo.
   NÃO copie o texto dos exemplos — siga a estrutura e o padrão.
5. PROIBIDO: qualquer frase que poderia estar em um script genérico de vendas.
   Exemplos do que NUNCA escrever: "Este produto incrível vai transformar sua vida",
   "Não perca esta oportunidade única", "Garanta o seu agora".

SOBRE O FORMATO DE SAÍDA:
Você deve retornar APENAS o JSON no formato canônico especificado.
Nenhum texto antes ou depois. Nenhum markdown. JSON puro e válido.

Para calcular a duração de cada bloco:
palavras_do_bloco ÷ (velocidade_media_wpm ÷ 60) = duração em segundos
Se a velocidade não estiver disponível, usar 130 palavras por minuto como padrão.`

// ============================================================================
// Schema de validação do output (Seção 23 — formato canônico)
// ============================================================================

const BlocoSchema = z.object({
  id: z.string(),
  tipo: z.enum([
    'hook', 'problema', 'apresentacao_produto', 'demonstracao', 'prova_social',
    'revelacao_preco', 'cta_engajamento', 'cta_compra', 'humor', 'comparacao', 'transformacao',
  ]),
  ordem: z.number(),
  duracao_segundos: z.number(),
  texto: z.string().min(1),
  tom: z.string(),
  direcao_camera: z.string(),
  enfase: z.array(z.string()),
  pausa_antes: z.boolean(),
  pausa_depois: z.boolean(),
  notas: z.string(),
  marcadores_acao: z.array(z.string()),
})

const RoteiroOutputSchema = z.object({
  produto: z.object({
    nome: z.string(),
    categoria: z.string(),
    preco: z.string(),
    diferenciais: z.array(z.string()),
    objecoes_tratadas: z.array(z.string()),
  }),
  cenario: z.object({
    local: z.string(),
    descricao: z.string(),
    props_sugeridos: z.array(z.string()),
  }),
  parametros: z.object({
    duracao_alvo_segundos: z.number(),
    formato: z.enum(['short', 'standard', 'extended', 'long']),
    contexto_qualidade: z.enum(['completo', 'parcial', 'sem_rag']),
  }),
  blocos: z.array(BlocoSchema).min(2),
  duracao_total_calculada: z.number(),
})

export type RoteiroOutput = z.infer<typeof RoteiroOutputSchema>
export type BlocoRoteiro = z.infer<typeof BlocoSchema>

// ============================================================================
// Montagem do prompt completo
// ============================================================================

function montarSecao1(briefing: BriefingGeracao): string {
  const contextQualidade = briefing.contexto_rag.nivel_fallback <= 1 ? 'completo'
    : briefing.contexto_rag.nivel_fallback <= 3 ? 'parcial'
    : 'sem_rag'

  return `MISSÃO DESTA GERAÇÃO:
Escrever um roteiro de ${briefing.duracao_alvo.formato} (${briefing.duracao_alvo.segundos} segundos) para o influenciador
@${briefing.influenciador.handle} apresentar ${briefing.produto.nome} no cenário de ${briefing.cenario.local}.

Nível de conhecimento da IA sobre este influenciador: ${briefing.influenciador.nivel_conhecimento}%
Qualidade do contexto disponível: ${contextQualidade}`
}

function montarSecao2(briefing: BriefingGeracao): string {
  const hooks = briefing.perfil_hooks
  const vocab = briefing.perfil_vocabulario
  const cta = briefing.perfil_cta
  const ritmo = briefing.perfil_ritmo
  const prod = briefing.perfil_produto_categoria
  const arco = briefing.perfil_emocional

  const hookExemplos = hooks.hook_selecionado.exemplos_do_influenciador.length > 0
    ? hooks.hook_selecionado.exemplos_do_influenciador.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')
    : '  (sem exemplos disponíveis — use o tipo indicado como referência)'

  const ctaExemplos = cta.cta_recomendada.exemplos_do_influenciador.length > 0
    ? cta.cta_recomendada.exemplos_do_influenciador.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')
    : '  (sem exemplos disponíveis)'

  const formalidadeDesc = vocab.nivel_formalidade <= 2 ? 'Muito informal, gírias frequentes'
    : vocab.nivel_formalidade <= 4 ? 'Informal, conversacional'
    : vocab.nivel_formalidade <= 6 ? 'Moderado, semi-formal'
    : 'Formal'

  return `PERFIL DO INFLUENCIADOR @${briefing.influenciador.handle}:

JEITO DE ABRIR VÍDEOS (hook):
Este influenciador costuma abrir com ${hooks.hook_selecionado.tipo}. Exemplos reais de como ele abre:
${hookExemplos}
Use esta estrutura e este padrão — NÃO copie o texto, replique o estilo.

VOCABULÁRIO CARACTERÍSTICO:
Expressões que ele usa regularmente: ${vocab.expressoes_caracteristicas.join(', ') || 'não identificadas ainda'}
Gírias próprias: ${vocab.girias_proprias.join(', ') || 'não identificadas ainda'}
Vícios de linguagem (incluir naturalmente): ${vocab.vicios_linguagem.join(', ') || 'nenhum identificado'}
Expressões raras mas impactantes (usar com parcimônia nos momentos certos): ${vocab.expressoes_raras_impactantes.join(', ') || 'nenhuma'}
Nível de formalidade: ${vocab.nivel_formalidade}/10 — ${formalidadeDesc}

MARCADORES DE TRANSIÇÃO (como ele muda de momento no vídeo):
${vocab.marcadores_transicao.join(', ') || 'não identificados ainda'}

ESTILO DE CTA:
Ele costuma fazer CTAs do tipo ${cta.cta_recomendada.tipo} com urgência ${cta.cta_recomendada.nivel_urgencia}.
Exemplos reais de como ele chama para ação:
${ctaExemplos}

ARCO EMOCIONAL RECOMENDADO PARA ESTE PRODUTO:
Começar com ${arco.arco_recomendado[0] ?? 'curiosidade'}, transitar para ${arco.arco_recomendado[Math.floor(arco.arco_recomendado.length / 2)] ?? 'interesse'}, fechar com ${arco.arco_recomendado[arco.arco_recomendado.length - 1] ?? 'urgencia'}.
Justificativa: ${arco.justificativa}

RITMO:
Velocidade média de fala: ${ritmo.velocidade_media_wpm} palavras por minuto.
Técnica de ênfase que ele usa: ${ritmo.tecnica_enfase}.
Ele costuma acelerar no momento do CTA.

ESTILO DE APRESENTAÇÃO PARA ${briefing.produto.categoria}:
Ângulo preferido: ${prod.angulo_preferido_para_esta_categoria}.
Atributos que ele mais enfatiza nesta categoria: ${prod.atributos_que_ele_enfatiza.join(', ') || 'não identificados'}.
Como ele posiciona o preço: ${prod.posicionamento_preco_preferido}.
Objeções que ele costuma tratar: ${prod.objecoes_que_ele_trata.join(', ') || 'não identificadas'}.`
}

function montarSecao3(briefing: BriefingGeracao): string {
  const chunksFormatados = briefing.contexto_rag.chunks_relevantes.length > 0
    ? briefing.contexto_rag.chunks_relevantes
        .slice(0, 10)
        .map((c, i) => `  ${i + 1}. "${c.texto}" (similaridade: ${c.similaridade.toFixed(2)})`)
        .join('\n')
    : '  (sem exemplos contextuais disponíveis)'

  const secaoContextoParcial = briefing.contexto_rag.nivel_fallback >= 4
    ? '\nNota: Não há exemplos contextuais para este tipo de produto. Baseie-se exclusivamente no perfil comportamental do influenciador e adapte para o produto fornecido.'
    : briefing.contexto_rag.nivel_fallback >= 2
    ? '\nNota: Contexto parcial — poucos exemplos disponíveis para esta categoria. Use o perfil geral como âncora principal.'
    : ''

  return `PRODUTO A APRESENTAR:
Nome: ${briefing.produto.nome}
Categoria: ${briefing.produto.categoria}
Preço: ${briefing.produto.preco}
Diferenciais principais: ${briefing.produto.diferenciais.join(', ') || 'não especificados'}
Objeções que precisam ser tratadas: ${briefing.produto.objecoes_comuns.join(', ') || 'nenhuma especificada'}

CENÁRIO DE GRAVAÇÃO:
Local: ${briefing.cenario.local}
Tom recomendado para este cenário: ${briefing.cenario.tom_recomendado}
Vocabulário do cenário (use naturalmente): ${briefing.cenario.vocabulario_cenario.join(', ') || 'não especificado'}
O que evitar neste cenário: ${briefing.cenario.restricoes.join(', ') || 'sem restrições'}

EXEMPLOS CONTEXTUAIS DO HISTÓRICO DO INFLUENCIADOR:
(trechos dos vídeos mais relevantes para este tipo de produto e cenário)
${chunksFormatados}
${secaoContextoParcial}`
}

function montarSecao4(briefing: BriefingGeracao): string | null {
  const compativeis = briefing.templates_virais_ativos.filter((t) => t.compativel_com_categoria)
  const template = compativeis[0] ?? briefing.templates_virais_ativos[0]

  if (!template || !template.elemento) return null

  return `PADRÃO VIRAL DESTE INFLUENCIADOR QUE PODE SER APLICADO:
Um dos vídeos de maior performance deste criador usou o seguinte padrão:
"${template.elemento}": ${template.template}

Considere incorporar elementos deste padrão adaptados ao produto atual.
Adapte — não copie. O produto é diferente, mas a lógica pode ser a mesma.`
}

function montarSecao5(briefing: BriefingGeracao): string {
  return `INSTRUÇÕES DE GERAÇÃO:

1. Duração alvo: ${briefing.duracao_alvo.segundos} segundos com tolerância de ±10%.
2. Formato: ${briefing.duracao_alvo.formato} — blocos sugeridos: ${briefing.duracao_alvo.blocos_sugeridos.join(', ')}
3. O primeiro bloco DEVE ser do tipo "hook" com o tipo ${briefing.perfil_hooks.hook_selecionado.tipo}.
4. Deve existir pelo menos um bloco de CTA nos últimos 20% do vídeo.
5. A duração de cada bloco é calculada por: palavras ÷ (${briefing.perfil_ritmo.velocidade_media_wpm} ÷ 60).
6. Cada bloco de texto deve soar como fala natural — sem ler como roteiro.
7. Inclua marcadores de ação em colchetes quando necessário: [MOSTRAR PRODUTO],
   [APONTAR PARA CÂMERA], [MOSTRAR RESULTADO], etc.
8. O campo "notas" de cada bloco deve conter instrução de performance para o influenciador.

SCHEMA DE OUTPUT — retorne EXATAMENTE este JSON, sem nenhum texto além do JSON:

{
  "produto": {
    "nome": "${briefing.produto.nome}",
    "categoria": "${briefing.produto.categoria}",
    "preco": "${briefing.produto.preco}",
    "diferenciais": [${briefing.produto.diferenciais.map((d) => `"${d}"`).join(', ')}],
    "objecoes_tratadas": ["lista das objeções que o roteiro trata"]
  },
  "cenario": {
    "local": "${briefing.cenario.local}",
    "descricao": "${briefing.cenario.descricao}",
    "props_sugeridos": ["lista de props usados"]
  },
  "parametros": {
    "duracao_alvo_segundos": ${briefing.duracao_alvo.segundos},
    "formato": "${briefing.duracao_alvo.formato}",
    "contexto_qualidade": "${briefing.contexto_rag.nivel_fallback <= 1 ? 'completo' : briefing.contexto_rag.nivel_fallback <= 3 ? 'parcial' : 'sem_rag'}"
  },
  "blocos": [
    {
      "id": "bloco_001",
      "tipo": "hook",
      "ordem": 1,
      "duracao_segundos": "numero calculado",
      "texto": "texto exato a ser falado — em primeira pessoa, na voz do influenciador",
      "tom": "descrição do tom emocional deste bloco",
      "direcao_camera": "instrução para o influenciador sobre câmera e posicionamento",
      "enfase": ["palavras ou frases para enfatizar"],
      "pausa_antes": false,
      "pausa_depois": true,
      "notas": "instrução de performance — o que o influenciador deve transmitir",
      "marcadores_acao": ["lista de marcadores de ação se houver"]
    }
  ],
  "duracao_total_calculada": "soma das durações dos blocos"
}`
}

// ============================================================================
// Geração do roteiro
// ============================================================================

export interface GeracaoResult {
  roteiro: RoteiroOutput | null
  erro: string | null
  tentativas: number
}

/**
 * Gera um roteiro chamando o Gemini 1.5 Pro com o prompt mestre montado.
 * Temperatura 0.7 (default) com instrução de variar criatividade por dimensão.
 * Valida output contra schema canônico. Retry 1x em caso de falha.
 */
export async function gerarRoteiro(
  briefing: BriefingGeracao,
  temperatura: number = 0.7
): Promise<GeracaoResult> {
  // Montar prompt completo
  const secoes = [
    montarSecao1(briefing),
    montarSecao2(briefing),
    montarSecao3(briefing),
    montarSecao4(briefing),
    montarSecao5(briefing),
  ].filter(Boolean).join('\n\n---\n\n')

  // Primeira tentativa
  const result1 = await chamarGeminiGeracao(SYSTEM_PROMPT_BASE, secoes, temperatura)
  const parse1 = validarOutput(result1)
  if (parse1.roteiro) {
    const validacao = validarRoteiroCanon(parse1.roteiro, briefing)
    if (validacao.valido) {
      return { roteiro: parse1.roteiro, erro: null, tentativas: 1 }
    }
  }

  // Retry com instrução adicional
  const retryPrompt = `${secoes}

ATENÇÃO: Sua resposta anterior não estava no formato correto. Retorne APENAS o JSON válido, sem markdown, sem texto adicional. Verifique:
- O primeiro bloco DEVE ser tipo "hook"
- Deve ter pelo menos um CTA
- Todos os campos de cada bloco são obrigatórios
- A duração total deve estar dentro de ±15% do alvo`

  const result2 = await chamarGeminiGeracao(SYSTEM_PROMPT_BASE, retryPrompt, temperatura)
  const parse2 = validarOutput(result2)
  if (parse2.roteiro) {
    const validacao = validarRoteiroCanon(parse2.roteiro, briefing)
    if (validacao.valido) {
      return { roteiro: parse2.roteiro, erro: null, tentativas: 2 }
    }
    // Retornar mesmo com validação parcial na segunda tentativa
    return { roteiro: parse2.roteiro, erro: validacao.motivo, tentativas: 2 }
  }

  return {
    roteiro: null,
    erro: parse2.erro ?? 'Falha ao gerar roteiro após 2 tentativas',
    tentativas: 2,
  }
}

/**
 * Gera apenas um bloco específico (para regeneração individual).
 */
export async function regenerarBloco(
  briefing: BriefingGeracao,
  tipoBloco: string,
  ordemBloco: number,
  contextoOutrosBlocos: string
): Promise<BlocoRoteiro | null> {
  const prompt = `${montarSecao2(briefing)}

${montarSecao3(briefing)}

TAREFA: Regenerar APENAS o bloco "${tipoBloco}" (ordem ${ordemBloco}) do roteiro.

Contexto dos outros blocos do roteiro (para manter coerência):
${contextoOutrosBlocos}

Retorne APENAS o JSON do bloco, no formato:
{
  "id": "bloco_${String(ordemBloco).padStart(3, '0')}",
  "tipo": "${tipoBloco}",
  "ordem": ${ordemBloco},
  "duracao_segundos": numero,
  "texto": "texto na voz do influenciador",
  "tom": "tom emocional",
  "direcao_camera": "instrução de câmera",
  "enfase": ["palavras para enfatizar"],
  "pausa_antes": boolean,
  "pausa_depois": boolean,
  "notas": "notas de performance",
  "marcadores_acao": ["marcadores"]
}`

  const result = await chamarGeminiGeracao(SYSTEM_PROMPT_BASE, prompt, 0.8)
  const parsed = tentarParseJSON(result)
  if (!parsed) return null

  const validation = BlocoSchema.safeParse(parsed)
  return validation.success ? validation.data : null
}

// ============================================================================
// Helpers
// ============================================================================

async function chamarGeminiGeracao(
  systemPrompt: string,
  userMessage: string,
  temperatura: number
): Promise<string> {
  try {
    const result = await geminiPro.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: temperatura },
    })
    return result.response.text()
  } catch (error) {
    console.error('Erro ao chamar Gemini para geração:', error)
    return ''
  }
}

function validarOutput(texto: string): { roteiro: RoteiroOutput | null; erro: string | null } {
  if (!texto) return { roteiro: null, erro: 'Resposta vazia do Gemini' }

  const parsed = tentarParseJSON(texto)
  if (!parsed) return { roteiro: null, erro: 'JSON inválido na resposta' }

  const result = RoteiroOutputSchema.safeParse(parsed)
  if (!result.success) {
    return { roteiro: null, erro: `Schema inválido: ${result.error.message.slice(0, 300)}` }
  }

  return { roteiro: result.data, erro: null }
}

/**
 * Validação canônica (Seção 23):
 * 1. blocos[0].tipo === 'hook'
 * 2. Pelo menos um CTA
 * 3. Duração dentro de ±15%
 * 4. Todos os campos obrigatórios presentes
 */
function validarRoteiroCanon(
  roteiro: RoteiroOutput,
  briefing: BriefingGeracao
): { valido: boolean; motivo: string | null } {
  // 1. Primeiro bloco deve ser hook
  if (roteiro.blocos[0]?.tipo !== 'hook') {
    return { valido: false, motivo: 'Primeiro bloco não é hook' }
  }

  // 2. Pelo menos um CTA
  const temCTA = roteiro.blocos.some((b) =>
    b.tipo === 'cta_compra' || b.tipo === 'cta_engajamento'
  )
  if (!temCTA) {
    return { valido: false, motivo: 'Nenhum bloco de CTA encontrado' }
  }

  // 3. Duração dentro de ±15%
  const alvo = briefing.duracao_alvo.segundos
  const tolerancia = alvo * 0.15
  if (
    roteiro.duracao_total_calculada < alvo - tolerancia ||
    roteiro.duracao_total_calculada > alvo + tolerancia
  ) {
    return {
      valido: false,
      motivo: `Duração ${roteiro.duracao_total_calculada}s fora da tolerância (${alvo}s ±15%)`,
    }
  }

  return { valido: true, motivo: null }
}

function tentarParseJSON(texto: string): unknown | null {
  let limpo = texto.trim()
  if (limpo.startsWith('```json')) limpo = limpo.slice(7)
  else if (limpo.startsWith('```')) limpo = limpo.slice(3)
  if (limpo.endsWith('```')) limpo = limpo.slice(0, -3)
  limpo = limpo.trim()

  try {
    return JSON.parse(limpo)
  } catch {
    return null
  }
}

/**
 * Salva briefing no banco para auditoria.
 */
export async function salvarBriefing(
  influencerId: string,
  briefing: BriefingGeracao
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('briefings')
    .insert({
      influencer_id: influencerId,
      conteudo: briefing as unknown as Record<string, unknown>,
      chunks_recuperados: briefing.contexto_rag.total_chunks_encontrados,
      threshold_aplicado: briefing.contexto_rag.threshold_aplicado,
      nivel_fallback: briefing.contexto_rag.nivel_fallback,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Erro ao salvar briefing:', error)
    return null
  }

  return data.id
}
