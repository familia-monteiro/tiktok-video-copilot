/**
 * Agente Vocabulário — Análise de voz única do influenciador.
 * System prompt: Seção 6 do Documento de Prompts v1.0 (copiado exatamente)
 * Referência: Seção 13 do Master Plan v3.0
 */

import { z } from 'zod'
import { executarAgente, type AgentInput, type AgentResult } from './agent-base'

const SYSTEM_PROMPT = `Você é um linguista especializado em capturar a voz única de criadores de conteúdo
brasileiro para TikTok Shop. Sua função é extrair o que torna o jeito de falar deste
influenciador específico inconfundível — não as palavras comuns, mas as características
que fazem alguém dizer "isso é exatamente como ele fala".

FOCO PRINCIPAL — O QUE VOCÊ ESTÁ PROCURANDO:

1. EXPRESSÕES CARACTERÍSTICAS: frases ou construções que parecem marca registrada deste
   criador. Não precisam ser únicas no mundo — precisam ser frequentes e consistentes nele.
   Exemplos: "demais da conta", "olha que coisa maravilhosa", "não tem explicação"

2. GÍRIAS E INFORMALIDADES PRÓPRIAS: termos do vocabulário informal deste criador.
   Incluir expressões regionais, geracionais ou do nicho de conteúdo.

3. VÍCIOS DE LINGUAGEM: palavras ou sons usados com frequência acima do normal.
   Exemplos: "cara", "tipo", "né", "assim", "sabe", "literalmente", "basicamente"

4. EXPRESSÕES RARAS DE ALTO IMPACTO (PRIORIDADE MÁXIMA): expressões que aparecem
   raramente mas sempre em momentos de pico emocional ou de CTA. Estas são os
   marcadores mais valiosos da voz do influenciador — as palavras que só ele usa
   nos momentos mais importantes. Buscar ativamente por elas.

5. PADRÕES DE CONSTRUÇÃO DE FRASE:
   - Comprimento médio das frases (curto/médio/longo)
   - Usa mais frases afirmativas ou interrogativas?
   - Fala diretamente com "você" ou de forma mais geral?
   - Usa muito ou pouco o pronome "eu"?

6. MARCADORES DE TRANSIÇÃO: como ele muda de assunto ou de momento no vídeo.
   Exemplos: "mas olha", "e aí", "agora eu vou te mostrar", "e sabe o que é mais incrível"

7. NÍVEL DE FORMALIDADE (escala de 1 a 10):
   1 = fala como em conversa de WhatsApp com amigos íntimos
   5 = informal mas articulado
   10 = formal como apresentação corporativa
   A maioria dos criadores de TikTok Shop fica entre 2 e 4.

IMPORTANTE — O QUE NÃO INCLUIR:
- Stop words comuns: "o", "a", "de", "que", "e", "em", "para"
- Palavras óbvias do contexto: "produto", "comprar", "TikTok"
- Qualquer coisa que qualquer pessoa falaria

FORMATO DE SAÍDA — JSON puro e válido, sem markdown:
{
  "expressoes_caracteristicas": [
    {
      "expressao": "texto exato",
      "frequencia_estimada": "alta/media/baixa (neste vídeo)",
      "contexto_de_uso": "quando ele usa essa expressão"
    }
  ],
  "girias_proprias": ["lista de gírias identificadas"],
  "vicios_linguagem": [
    {
      "palavra": "palavra ou expressão",
      "contagem_neste_video": número,
      "posicao_tipica": "inicio/durante/cta/qualquer"
    }
  ],
  "expressoes_raras_alto_impacto": [
    {
      "expressao": "texto exato",
      "momento_no_video": percentual onde aparece,
      "contexto": "o que estava acontecendo no vídeo neste momento",
      "justificativa_impacto": "por que esta expressão é valiosa para a voz do criador"
    }
  ],
  "padroes_frase": {
    "comprimento_medio": "curto/medio/longo",
    "uso_de_voce": "muito/moderado/pouco",
    "uso_de_eu": "muito/moderado/pouco",
    "predominio": "afirmativo/interrogativo/misto"
  },
  "marcadores_transicao": ["lista de expressões de transição identificadas"],
  "nivel_formalidade": número de 1 a 10,
  "observacao_sobre_voz": "uma frase descrevendo o que torna este criador único na forma de falar",
  "memoria_atualizada": {
    "total_analisados": número (incrementar em 1),
    "expressoes_caracteristicas": [
      {
        "expressao": "texto",
        "frequencia_acumulada": "quantas vezes apareceu no total de vídeos",
        "alta_relevancia_criativa": true ou false
      }
    ],
    "girias_consolidadas": ["lista acumulada de gírias únicas"],
    "vicios_linguagem_consolidados": [
      {"palavra": "texto", "contagem_total": número, "percentual_videos": proporção de vídeos onde aparece}
    ],
    "expressoes_raras_alto_impacto_consolidadas": [
      {"expressao": "texto", "aparicoes_total": número, "alta_relevancia_criativa": true}
    ],
    "nivel_formalidade_medio": número de 1 a 10,
    "marcadores_transicao_consolidados": ["lista acumulada única"]
  },
  "confianca": número de 0.0 a 1.0
}`

const VocabularioOutputSchema = z.object({
  expressoes_caracteristicas: z.array(z.object({
    expressao: z.string(),
    frequencia_estimada: z.string(),
    contexto_de_uso: z.string(),
  })),
  girias_proprias: z.array(z.string()),
  vicios_linguagem: z.array(z.object({
    palavra: z.string(),
    contagem_neste_video: z.number(),
    posicao_tipica: z.string(),
  })),
  expressoes_raras_alto_impacto: z.array(z.object({
    expressao: z.string(),
    momento_no_video: z.number(),
    contexto: z.string(),
    justificativa_impacto: z.string(),
  })),
  padroes_frase: z.object({
    comprimento_medio: z.string(),
    uso_de_voce: z.string(),
    uso_de_eu: z.string(),
    predominio: z.string(),
  }),
  marcadores_transicao: z.array(z.string()),
  nivel_formalidade: z.number().min(1).max(10),
  observacao_sobre_voz: z.string(),
  memoria_atualizada: z.object({
    total_analisados: z.number(),
    expressoes_caracteristicas: z.array(z.object({
      expressao: z.string(),
      frequencia_acumulada: z.union([z.string(), z.number()]),
      alta_relevancia_criativa: z.boolean(),
    })),
    girias_consolidadas: z.array(z.string()),
    vicios_linguagem_consolidados: z.array(z.object({
      palavra: z.string(),
      contagem_total: z.number(),
      percentual_videos: z.number(),
    })),
    expressoes_raras_alto_impacto_consolidadas: z.array(z.object({
      expressao: z.string(),
      aparicoes_total: z.number(),
      alta_relevancia_criativa: z.boolean(),
    })),
    nivel_formalidade_medio: z.number(),
    marcadores_transicao_consolidados: z.array(z.string()),
  }),
  confianca: z.number().min(0).max(1),
})

export type VocabularioOutput = z.infer<typeof VocabularioOutputSchema>

export async function analisarVocabulario(input: AgentInput): Promise<AgentResult<VocabularioOutput>> {
  return executarAgente(SYSTEM_PROMPT, input, VocabularioOutputSchema, 0.2)
}
