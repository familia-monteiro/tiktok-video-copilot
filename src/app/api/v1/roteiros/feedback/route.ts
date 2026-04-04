/**
 * API: POST /api/v1/roteiros/feedback
 * Processa feedback do usuário sobre um roteiro.
 * Referência: Seção 25 do Master Plan v3.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processarFeedback } from '@/lib/generation/feedback'

const FeedbackSchema = z.object({
  roteiro_id: z.string().uuid(),
  tipo: z.enum(['aprovado', 'rejeitado', 'editado']),
  motivo_rejeicao: z.string().optional(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = FeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
  }

  const resultado = await processarFeedback({
    roteiroId: parsed.data.roteiro_id,
    tipo: parsed.data.tipo,
    motivoRejeicao: parsed.data.motivo_rejeicao,
  })

  return NextResponse.json(resultado)
}
