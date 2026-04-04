/**
 * API: POST /api/v1/roteiros — Gerar roteiro unitário
 * Referência: Seção 31 do Master Plan v3.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executarCicloGeracao } from '@/lib/generation/ciclo-geracao'
import type { FormatoRoteiro } from '@/types/database'

const GerarRoteiroSchema = z.object({
  influencer_id: z.string().uuid(),
  produto: z.object({
    nome: z.string().min(1),
    categoria: z.string().min(1),
    preco: z.string().min(1),
    diferenciais: z.array(z.string()).default([]),
    objecoes_comuns: z.array(z.string()).default([]),
  }),
  cenario: z.object({
    local: z.string().min(1),
    tom_recomendado: z.string().default('casual'),
    vocabulario_cenario: z.array(z.string()).default([]),
    restricoes: z.array(z.string()).default([]),
  }),
  duracao: z.object({
    segundos: z.number().min(15).max(300),
    formato: z.enum(['short', 'standard', 'extended', 'long']),
  }),
  forcar_experimental: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = GerarRoteiroSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', detalhes: parsed.error.issues },
      { status: 400 }
    )
  }

  const { influencer_id, produto, cenario, duracao, forcar_experimental } = parsed.data

  try {
    const resultado = await executarCicloGeracao({
      influencerId: influencer_id,
      produto,
      cenario,
      duracao,
      forcarExperimental: forcar_experimental,
    })

    const httpStatus = resultado.status === 'bloqueado' ? 422
      : resultado.status === 'erro' ? 500
      : 200

    return NextResponse.json(resultado, { status: httpStatus })
  } catch (err) {
    console.error('Erro na geração de roteiro:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
