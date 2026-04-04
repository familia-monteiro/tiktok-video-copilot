/**
 * Página de seleção de roteiro para o teleprompter.
 * Referência: Seção 27 do Master Plan v3.0
 */

import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function TeleprompterPage() {
  const { data: roteiros } = await supabaseAdmin
    .from('roteiros')
    .select('id, produto_nome, formato, duracao_calculada_segundos, status, gerado_em, influencer_id')
    .in('status', ['pendente', 'aprovado', 'editado'])
    .order('gerado_em', { ascending: false })
    .limit(30)

  const influencerIds = [...new Set((roteiros ?? []).map((r) => r.influencer_id))]
  const { data: influencers } = await supabaseAdmin
    .from('influenciadores')
    .select('id, tiktok_handle')
    .in('id', influencerIds)

  const handleMap: Record<string, string> = {}
  for (const inf of influencers ?? []) handleMap[inf.id] = inf.tiktok_handle

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Teleprompter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione um roteiro para iniciar a gravação
        </p>
      </div>

      {(!roteiros || roteiros.length === 0) ? (
        <p className="text-sm text-muted-foreground">
          Nenhum roteiro disponível. Gere um roteiro primeiro.
        </p>
      ) : (
        <div className="space-y-3">
          {roteiros.map((r) => (
            <Link key={r.id} href={`/teleprompter/${r.id}`}>
              <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{r.produto_nome ?? 'Sem produto'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      @{handleMap[r.influencer_id] ?? '?'} ·{' '}
                      {r.formato} ·{' '}
                      {r.duracao_calculada_segundos ?? '?'}s ·{' '}
                      {new Date(r.gerado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{r.status}</Badge>
                    <span className="text-xs text-primary font-medium">▶ Abrir</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
