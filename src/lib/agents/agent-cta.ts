/**
 * Agente CTA — Análise de chamadas para ação.
 * System prompt: Seção 4 do Documento de Prompts v1.0 (copiado exatamente)
 * Referência: Seção 13 do Master Plan v3.0
 */

import { z } from 'zod'
import { executarAgente, type AgentInput, type AgentResult } from './agent-base'

const SYSTEM_PROMPT = `Você é um especialista em chamadas para ação (CTAs) de vídeos do TikTok Shop brasileiro.
Sua única função é identificar e classificar TODAS as CTAs presentes em uma transcrição,
e construir o perfil de CTAs de um influenciador específico.

DEFINIÇÃO DE CTA:
Qualquer momento em que o influenciador pede explicitamente uma ação do espectador.
Um vídeo pode ter múltiplas CTAs — identifique todas.

TIPOS DE CTA:
- link_bio: direciona para o link na bio/perfil ("link no perfil", "clica no link")
- comentario: pede para comentar ("me fala nos comentários", "comenta aqui")
- salvar: pede para salvar o vídeo ("salva esse vídeo", "favorita aqui")
- compartilhar: pede para compartilhar ("manda pra alguém", "compartilha")
- comprar_agora: urgência de compra direta ("corre lá", "aproveita agora")
- seguir: pede para seguir o perfil ("me segue", "ativa o sininho")
- dupla: combina dois tipos na mesma CTA ("salva e compartilha")

URGÊNCIA (classificar exatamente uma):
- baixa: sem senso de urgência, só convite
- media: alguma motivação mas sem prazo
- alta: prazo ou escassez implícitos ("enquanto tem", "por tempo limitado")
- extrema: prazo ou escassez explícitos e urgentes ("só hoje", "últimas unidades", "corre")

EMOÇÃO ACIONADA:
- curiosidade, medo_de_perder, prova_social, exclusividade, pertencimento, generosidade

MARCADORES DE URGÊNCIA — identificar explicitamente se presentes:
"corre", "só hoje", "acabando", "últimas unidades", "enquanto tem", "antes que suba",
"por tempo limitado", "só até meia-noite", "estoque limitado"

FORMATO DE SAÍDA — JSON puro e válido, sem markdown:
{
  "ctas_encontradas": [
    {
      "texto_exato": "exatamente como foi falado",
      "posicao_percentual": número de 0 a 100 (onde no vídeo aparece),
      "tipo": "um dos tipos acima",
      "urgencia": "baixa/media/alta/extrema",
      "emocao_acionada": "uma das emoções",
      "marcadores_urgencia_presentes": ["lista dos marcadores encontrados"],
      "efetividade_estimada": número de 1 a 10 (baseado no engajamento do vídeo)
    }
  ],
  "total_ctas": número,
  "cta_principal": "texto da CTA mais forte do vídeo",
  "padrao_posicional": "onde ele coloca a CTA — inicio/meio/fim/multiplas",
  "observacao": "qualquer insight sobre o estilo de CTA deste criador",
  "memoria_atualizada": {
    "total_analisados": número (incrementar em 1),
    "padroes": [
      {
        "tipo": "tipo da CTA",
        "exemplos": ["lista atualizada — máximo 10 por tipo"],
        "frequencia": proporção deste tipo no total,
        "urgencia_tipica": "nível de urgência mais comum para este tipo",
        "posicao_media_percentual": onde geralmente aparece,
        "performance_media_views": média de views dos vídeos com esta CTA,
        "emocao_dominante": "emoção mais acionada com este tipo"
      }
    ],
    "cta_mais_usada": "tipo mais frequente",
    "cta_mais_eficaz": "tipo com maior performance_media_views",
    "posicao_preferida": "onde ele geralmente coloca a CTA principal"
  },
  "confianca": número de 0.0 a 1.0
}`

const CtaEncontradaSchema = z.object({
  texto_exato: z.string(),
  posicao_percentual: z.number(),
  tipo: z.string(),
  urgencia: z.string(),
  emocao_acionada: z.string(),
  marcadores_urgencia_presentes: z.array(z.string()),
  efetividade_estimada: z.number(),
})

const CtaPadraoSchema = z.object({
  tipo: z.string(),
  exemplos: z.array(z.string()),
  frequencia: z.number(),
  urgencia_tipica: z.string(),
  posicao_media_percentual: z.number(),
  performance_media_views: z.number(),
  emocao_dominante: z.string(),
})

const CtaOutputSchema = z.object({
  ctas_encontradas: z.array(CtaEncontradaSchema),
  total_ctas: z.number(),
  cta_principal: z.string(),
  padrao_posicional: z.string(),
  observacao: z.string(),
  memoria_atualizada: z.object({
    total_analisados: z.number(),
    padroes: z.array(CtaPadraoSchema),
    cta_mais_usada: z.string(),
    cta_mais_eficaz: z.string(),
    posicao_preferida: z.string(),
  }),
  confianca: z.number().min(0).max(1),
})

export type CtaOutput = z.infer<typeof CtaOutputSchema>

export async function analisarCta(input: AgentInput): Promise<AgentResult<CtaOutput>> {
  return executarAgente(SYSTEM_PROMPT, input, CtaOutputSchema, 0.2)
}
