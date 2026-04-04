/**
 * API: POST /api/v1/influenciadores
 * Cadastra um novo influenciador e dispara scraping inicial.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

const BodySchema = z.object({
  tiktok_handle: z
    .string()
    .min(1)
    .transform((h) => h.replace(/^@/, '')), // Remover @ se presente
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { tiktok_handle } = parsed.data

  // Verificar se já existe
  const { data: existing } = await supabaseAdmin
    .from('influenciadores')
    .select('id, status_pipeline')
    .eq('tiktok_handle', tiktok_handle)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Influenciador já cadastrado', influencer_id: existing.id },
      { status: 409 }
    )
  }

  // Inserir novo influenciador
  const { data: influencer, error } = await supabaseAdmin
    .from('influenciadores')
    .insert({
      tiktok_handle,
      status_pipeline: 'pendente',
      modo_atual: 'inicial',
    })
    .select('id')
    .single()

  if (error || !influencer) {
    return NextResponse.json({ error: 'Falha ao cadastrar influenciador' }, { status: 500 })
  }

  // Disparar coleta histórica inicial
  await inngest.send({
    name: 'scrape/discover.initial',
    data: { influencer_id: influencer.id },
  })

  return NextResponse.json(
    { ok: true, influencer_id: influencer.id, tiktok_handle },
    { status: 201 }
  )
}

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabaseAdmin
    .from('influenciadores')
    .select('*')
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ influenciadores: data })
}
