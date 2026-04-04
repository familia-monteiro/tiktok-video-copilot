/**
 * Módulo base compartilhado por todos os agentes de análise.
 * Implementa o padrão: chamada Gemini → parse JSON → validação Zod → retry → fallback.
 * Referência: Seção 14 do Master Plan v3.0
 */

import { geminiPro } from '@/lib/gemini/client'
import type { z } from 'zod'

export interface AgentInput {
  transcricaoCompleta: string
  duracaoSegundos: number
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  dataPublicacao: string | null
  viralScore: number
  memoriaAtual: Record<string, unknown>
}

export interface AgentResult<T> {
  status: 'sucesso' | 'falha'
  dados: T | null
  confianca: number
  memoriaAtualizada: Record<string, unknown>
}

/**
 * Monta a user message padrão para todos os agentes de análise.
 * Referência: Seção 2 do Documento de Prompts v1.0
 */
function montarUserMessage(input: AgentInput): string {
  return `TRANSCRIÇÃO DO VÍDEO:
---
${input.transcricaoCompleta}
---

DADOS DO VÍDEO:
- Duração: ${input.duracaoSegundos} segundos
- Views: ${input.views}
- Likes: ${input.likes}
- Comentários: ${input.comments}
- Compartilhamentos: ${input.shares}
- Salvamentos: ${input.saves}
- Data de publicação: ${input.dataPublicacao ?? 'desconhecida'}
- Viral Score: ${input.viralScore}

MEMÓRIA ATUAL DESTA DIMENSÃO (o que o sistema já sabe sobre este influenciador):
---
${JSON.stringify(input.memoriaAtual, null, 2)}
---

Analise a transcrição e retorne seu JSON conforme especificado.`
}

/**
 * Executa um agente com o padrão completo de retry e fallback.
 *
 * 1. Chama Gemini com system prompt + user message
 * 2. Tenta parse JSON + validação Zod
 * 3. Se falhar: retry com instrução adicional
 * 4. Se falhar de novo: retorna fallback sem alterar memória
 *
 * Referência: Seção 14 do Master Plan v3.0
 */
export async function executarAgente<T>(
  systemPrompt: string,
  input: AgentInput,
  schema: z.ZodType<T>,
  temperatura: number = 0.2
): Promise<AgentResult<T>> {
  const userMessage = montarUserMessage(input)

  // Primeira tentativa
  const resultado1 = await chamarGemini(systemPrompt, userMessage, temperatura)
  const parse1 = tentarParse(resultado1, schema)
  if (parse1.sucesso) {
    return {
      status: 'sucesso',
      dados: parse1.dados!,
      confianca: (parse1.dados as Record<string, unknown>).confianca as number ?? 0.8,
      memoriaAtualizada: (parse1.dados as Record<string, unknown>).memoria_atualizada as Record<string, unknown> ?? input.memoriaAtual,
    }
  }

  // Retry com instrução adicional
  const retryMessage = `${userMessage}

ATENÇÃO: Sua resposta anterior não estava em JSON válido. Responda APENAS com o JSON, sem nenhum texto antes ou depois. Sem blocos de código markdown. Apenas o JSON puro.`

  const resultado2 = await chamarGemini(systemPrompt, retryMessage, temperatura)
  const parse2 = tentarParse(resultado2, schema)
  if (parse2.sucesso) {
    return {
      status: 'sucesso',
      dados: parse2.dados!,
      confianca: (parse2.dados as Record<string, unknown>).confianca as number ?? 0.5,
      memoriaAtualizada: (parse2.dados as Record<string, unknown>).memoria_atualizada as Record<string, unknown> ?? input.memoriaAtual,
    }
  }

  // Fallback: não atualiza memória
  console.error(`Agente falhou após 2 tentativas. Erro: ${parse2.erro}`)
  return {
    status: 'falha',
    dados: null,
    confianca: 0,
    memoriaAtualizada: input.memoriaAtual,
  }
}

async function chamarGemini(
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
    console.error('Erro ao chamar Gemini:', error)
    return ''
  }
}

function tentarParse<T>(
  texto: string,
  schema: z.ZodType<T>
): { sucesso: boolean; dados: T | null; erro: string | null } {
  if (!texto) {
    return { sucesso: false, dados: null, erro: 'Resposta vazia do Gemini' }
  }

  // Limpar possíveis blocos de código markdown
  let limpo = texto.trim()
  if (limpo.startsWith('```json')) {
    limpo = limpo.slice(7)
  } else if (limpo.startsWith('```')) {
    limpo = limpo.slice(3)
  }
  if (limpo.endsWith('```')) {
    limpo = limpo.slice(0, -3)
  }
  limpo = limpo.trim()

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(limpo)
  } catch {
    return { sucesso: false, dados: null, erro: `JSON inválido: ${limpo.slice(0, 200)}` }
  }

  // Validação Zod
  const result = schema.safeParse(parsed)
  if (!result.success) {
    return { sucesso: false, dados: null, erro: `Schema inválido: ${result.error.message}` }
  }

  return { sucesso: true, dados: result.data, erro: null }
}
