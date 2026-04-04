'use client'

/**
 * Lista paginada de roteiros com filtros e exportação TXT.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Roteiro, Influenciador } from '@/types/database'

const PAGE_SIZE = 10

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive' },
  editado: { label: 'Editado', variant: 'secondary' },
}

interface BlocoData {
  id: string
  tipo: string
  texto: string
  duracao_segundos: number
  tom: string
  direcao_camera: string
  notas: string
  marcadores_acao: string[]
}

export function HistoricoRoteiros() {
  const [roteiros, setRoteiros] = useState<Roteiro[]>([])
  const [influencers, setInfluencers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroInfluencer, setFiltroInfluencer] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const loadRoteiros = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('roteiros')
      .select('*')
      .order('gerado_em', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroStatus) query = query.eq('status', filtroStatus)
    if (filtroInfluencer) query = query.eq('influencer_id', filtroInfluencer)

    const { data } = await query
    if (data) {
      setRoteiros(data as Roteiro[])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [page, filtroStatus, filtroInfluencer])

  useEffect(() => {
    loadRoteiros()
  }, [loadRoteiros])

  useEffect(() => {
    async function loadInfluencers() {
      const { data } = await supabase.from('influenciadores').select('id, tiktok_handle')
      if (data) {
        const map: Record<string, string> = {}
        for (const inf of data) map[inf.id] = inf.tiktok_handle
        setInfluencers(map)
      }
    }
    loadInfluencers()
  }, [])

  function handleFeedback(roteiroId: string, tipo: 'aprovado' | 'rejeitado') {
    fetch('/api/v1/roteiros/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roteiro_id: roteiroId, tipo }),
    }).then((res) => {
      if (res.ok) {
        toast.success(tipo === 'aprovado' ? 'Roteiro aprovado!' : 'Roteiro rejeitado')
        loadRoteiros()
      }
    })
  }

  function exportarTXT(roteiro: Roteiro) {
    const conteudo = roteiro.conteudo as { blocos?: BlocoData[] }
    const blocos = conteudo.blocos ?? []

    let txt = `ROTEIRO: ${roteiro.produto_nome ?? 'Sem nome'}\n`
    txt += `Influenciador: @${influencers[roteiro.influencer_id] ?? roteiro.influencer_id}\n`
    txt += `Formato: ${roteiro.formato} | Duração: ${roteiro.duracao_calculada_segundos ?? '?'}s\n`
    txt += `Score: ${roteiro.score_qualidade?.toFixed(0) ?? 'N/A'}/100\n`
    txt += `Gerado em: ${new Date(roteiro.gerado_em).toLocaleString('pt-BR')}\n`
    txt += `${'='.repeat(60)}\n\n`

    for (const bloco of blocos) {
      txt += `[${bloco.tipo.toUpperCase()}] (${bloco.duracao_segundos}s)\n`
      txt += `${bloco.texto}\n`
      if (bloco.marcadores_acao?.length > 0) {
        txt += `Ações: ${bloco.marcadores_acao.join(', ')}\n`
      }
      if (bloco.notas) txt += `Notas: ${bloco.notas}\n`
      txt += '\n'
    }

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roteiro-${roteiro.produto_nome?.replace(/\s+/g, '-') ?? roteiro.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-3">
        <select
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
          value={filtroStatus}
          onChange={(e) => { setFiltroStatus(e.target.value); setPage(0) }}
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="aprovado">Aprovado</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="editado">Editado</option>
        </select>
        <select
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
          value={filtroInfluencer}
          onChange={(e) => { setFiltroInfluencer(e.target.value); setPage(0) }}
        >
          <option value="">Todos os influenciadores</option>
          {Object.entries(influencers).map(([id, handle]) => (
            <option key={id} value={id}>@{handle}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : roteiros.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum roteiro encontrado.</p>
      ) : (
        <div className="space-y-3">
          {roteiros.map((r) => {
            const statusInfo = STATUS_BADGES[r.status] ?? STATUS_BADGES.pendente
            const conteudo = r.conteudo as { blocos?: BlocoData[] }
            const isExpanded = expanded === r.id

            return (
              <Card key={r.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium hover:underline"
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                      >
                        {r.produto_nome ?? 'Sem produto'}
                      </button>
                      <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      {r.contexto_qualidade && r.contexto_qualidade !== 'completo' && (
                        <Badge variant="outline" className="text-xs">
                          {r.contexto_qualidade === 'parcial' ? 'Contexto parcial' : 'Sem RAG'}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      @{influencers[r.influencer_id] ?? '?'} · {new Date(r.gerado_em).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{r.formato}</span>
                    <span>{r.duracao_calculada_segundos ?? '?'}s</span>
                    <span>Score: {r.score_qualidade?.toFixed(0) ?? 'N/A'}/100</span>
                    <span>{(conteudo.blocos ?? []).length} blocos</span>
                  </div>

                  {isExpanded && conteudo.blocos && (
                    <div className="mt-3 space-y-2">
                      {conteudo.blocos.map((b) => (
                        <div key={b.id} className="text-sm bg-muted/20 rounded p-2">
                          <span className="text-xs font-medium text-muted-foreground">[{b.tipo}]</span>
                          <p className="mt-0.5">{b.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    {r.status === 'pendente' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleFeedback(r.id, 'aprovado')}>
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleFeedback(r.id, 'rejeitado')}>
                          Rejeitar
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => exportarTXT(r)}>
                      Exportar TXT
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">Página {page + 1}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasMore}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
