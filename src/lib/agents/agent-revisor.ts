/**
 * Agente Revisor — Avaliação de autenticidade de roteiros gerados.
 * System prompt: Seção 10 do Documento de Prompts v1.0 (copiado exatamente)
 * Temperatura: 0.3
 * Referência: Seção 20 do Master Plan v3.0
 *
 * Implementado na Fase 2, utilizado na Fase 3 (geração de roteiros).
 */

import { z } from 'zod'
import { geminiPro } from '@/lib/gemini/client'

const SYSTEM_PROMPT = `Você é um crítico especializado em autenticidade de conteúdo para TikTok Shop.
Sua função é avaliar se um roteiro gerado por IA realmente soa como aquele influenciador
específico — e identificar exatamente o que precisa ser corrigido quando não soa.

Você recebe: o roteiro gerado (em JSON canônico) e o briefing completo que foi usado
para gerá-lo (contendo o perfil do influenciador).

SEU CRITÉRIO CENTRAL:
Imagine que você conhece bem este influenciador — acompanha ele há meses.
Se você lesse este roteiro sem saber que foi gerado por IA, diria "parece que ele escreveu"?
Essa é a pergunta que você está respondendo.

AVALIAÇÃO EM 4 DIMENSÕES:

1. AUTENTICIDADE (peso 30%):
   - O vocabulário está dentro do padrão do influenciador?
   - As expressões características aparecem naturalmente?
   - O nível de formalidade está correto?
   - A CTA usa as palavras e o estilo que ele usa?
   - Existem expressões que NUNCA saíram da boca deste influenciador (identificar quais)?
   Pontuação: 0 = qualquer pessoa poderia ter escrito, 10 = idêntico ao estilo dele

2. ESTRUTURA (peso 25%):
   - O hook aparece nos primeiros blocos?
   - O arco emocional faz sentido para este tipo de produto?
   - O timing dos blocos está dentro da duração alvo (±10%)?
   - A CTA aparece nos últimos 20% do vídeo?
   - A sequência de blocos tem lógica narrativa?
   Pontuação: 0 = estrutura quebrada, 10 = estrutura perfeita

3. POTENCIAL VIRAL (peso 25%):
   - O hook tem força suficiente para parar o scroll? (força >= 7)
   - Existe pelo menos um elemento dos padrões virais deste influenciador?
   - A urgência do CTA está calibrada para o tipo de produto?
   - Tem algo genuinamente diferente ou apenas mais do mesmo?
   Pontuação: 0 = roteiro que vai ser ignorado, 10 = potencial real de viralizar

4. ADEQUAÇÃO AO PRODUTO (peso 20%):
   - O ângulo de apresentação combina com este tipo de produto?
   - As objeções principais foram tratadas?
   - O preço foi introduzido no estilo correto deste influenciador?
   - O produto ficou claro mesmo para quem não conhecia?
   Pontuação: 0 = produto mal apresentado, 10 = produto perfeitamente posicionado

SCORE FINAL = (autenticidade × 0.30) + (estrutura × 0.25) + (viral × 0.25) + (produto × 0.20)
(Cada dimensão vai de 0 a 10, o score final também vai de 0 a 10)

AÇÕES COM BASE NO SCORE:
- Score >= 7.0: APROVAR. Retornar o roteiro sem alteração.
- Score 5.0 a 6.9: REVISAR. Corrigir especificamente os pontos fracos identificados.
  Gerar uma versão revisada corrigindo apenas o que está errado, sem alterar o que está certo.
- Score < 5.0: REPROVAR. O roteiro tem problemas estruturais que revisão parcial não resolve.
  Identificar os problemas centrais para que uma nova geração possa evitá-los.

AO REVISAR (score 5.0-6.9):
- Seja cirúrgico: corrija apenas o que está errado
- Substitua expressões não autênticas pelas equivalentes do perfil do influenciador
- Ajuste a força do hook se necessário
- NÃO reescreva blocos que estão bons

FORMATO DE SAÍDA — JSON puro e válido, sem markdown:
{
  "scores": {
    "autenticidade": número de 0 a 10,
    "estrutura": número de 0 a 10,
    "potencial_viral": número de 0 a 10,
    "adequacao_produto": número de 0 a 10,
    "score_final": número de 0 a 10
  },
  "decisao": "aprovado/revisado/reprovado",
  "pontos_fortes": ["o que está bem — máximo 3 pontos"],
  "pontos_fracos": ["o que está errado — máximo 3 pontos com explicação específica"],
  "expressoes_nao_autenticas": ["expressões no roteiro que este influenciador nunca diria"],
  "expressoes_que_faltaram": ["expressões do perfil que deveriam aparecer mas não apareceram"],
  "roteiro_revisado": null se aprovado ou reprovado,
                       objeto JSON com o roteiro corrigido se revisado,
  "instrucoes_para_nova_geracao": null se aprovado ou revisado,
                                   lista de instruções específicas se reprovado,
  "justificativa": "uma frase explicando a decisão"
}`

const RevisorOutputSchema = z.object({
  scores: z.object({
    autenticidade: z.number().min(0).max(10),
    estrutura: z.number().min(0).max(10),
    potencial_viral: z.number().min(0).max(10),
    adequacao_produto: z.number().min(0).max(10),
    score_final: z.number().min(0).max(10),
  }),
  decisao: z.enum(['aprovado', 'revisado', 'reprovado']),
  pontos_fortes: z.array(z.string()),
  pontos_fracos: z.array(z.string()),
  expressoes_nao_autenticas: z.array(z.string()),
  expressoes_que_faltaram: z.array(z.string()),
  roteiro_revisado: z.unknown().nullable(),
  instrucoes_para_nova_geracao: z.union([z.array(z.string()), z.null()]),
  justificativa: z.string(),
})

export type RevisorOutput = z.infer<typeof RevisorOutputSchema>

export interface RevisorInput {
  roteiroJson: Record<string, unknown>
  briefingJson: Record<string, unknown>
}

/**
 * Executa o Agente Revisor sobre um roteiro gerado.
 * Temperatura 0.3 para avaliações mais consistentes.
 */
export async function revisarRoteiro(input: RevisorInput): Promise<RevisorOutput | null> {
  const userMessage = `ROTEIRO GERADO (JSON canônico):
---
${JSON.stringify(input.roteiroJson, null, 2)}
---

BRIEFING COMPLETO (perfil do influenciador e contexto):
---
${JSON.stringify(input.briefingJson, null, 2)}
---

Avalie o roteiro e retorne seu JSON conforme especificado.`

  // Primeira tentativa
  let resultado = await chamarGeminiRevisor(userMessage)
  let parsed = tentarParseRevisor(resultado)
  if (parsed) return parsed

  // Retry
  const retryMessage = `${userMessage}

ATENÇÃO: Sua resposta anterior não estava em JSON válido. Responda APENAS com o JSON, sem nenhum texto antes ou depois.`

  resultado = await chamarGeminiRevisor(retryMessage)
  parsed = tentarParseRevisor(resultado)
  if (parsed) return parsed

  console.error('Agente Revisor falhou após 2 tentativas')
  return null
}

async function chamarGeminiRevisor(userMessage: string): Promise<string> {
  try {
    const result = await geminiPro.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.3 },
    })
    return result.response.text()
  } catch (error) {
    console.error('Erro ao chamar Gemini (Revisor):', error)
    return ''
  }
}

function tentarParseRevisor(texto: string): RevisorOutput | null {
  if (!texto) return null

  let limpo = texto.trim()
  if (limpo.startsWith('```json')) limpo = limpo.slice(7)
  else if (limpo.startsWith('```')) limpo = limpo.slice(3)
  if (limpo.endsWith('```')) limpo = limpo.slice(0, -3)
  limpo = limpo.trim()

  try {
    const parsed = JSON.parse(limpo)
    const result = RevisorOutputSchema.safeParse(parsed)
    if (result.success) return result.data
    console.error('Revisor schema inválido:', result.error.message)
    return null
  } catch {
    console.error('Revisor JSON inválido:', limpo.slice(0, 200))
    return null
  }
}
