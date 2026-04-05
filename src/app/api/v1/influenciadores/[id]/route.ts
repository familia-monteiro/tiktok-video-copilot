/**
 * API: PATCH /api/v1/influenciadores/[id]  — pausar ou retomar análise
 * API: DELETE /api/v1/influenciadores/[id] — excluir influenciador e todos os dados
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  let body: { action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action !== 'pausar' && body.action !== 'retomar') {
    return NextResponse.json({ error: 'action deve ser "pausar" ou "retomar"' }, { status: 400 })
  }

  const novoStatus = body.action === 'pausar' ? 'pausado' : 'ativo'

  const { error } = await supabaseAdmin
    .from('influenciadores')
    .update({ status_pipeline: novoStatus })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status_pipeline: novoStatus })
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  // Verificar que o influenciador existe antes de excluir
  const { data: existing } = await supabaseAdmin
    .from('influenciadores')
    .select('id, tiktok_handle')
    .eq('id', id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Influenciador não encontrado' }, { status: 404 })
  }

  // Excluir — cascade no banco remove vídeos, memórias e chunks relacionados
  const { error } = await supabaseAdmin
    .from('influenciadores')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tiktok_handle: existing.tiktok_handle })
}
