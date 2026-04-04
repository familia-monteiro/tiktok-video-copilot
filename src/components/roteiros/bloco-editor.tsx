'use client'

/**
 * Editor inline por bloco de roteiro + regeneração individual + captura de diff.
 * Referência: Seção 24 do Master Plan v3.0
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BlocoData {
  id: string
  tipo: string
  ordem: number
  duracao_segundos: number
  texto: string
  tom: string
  direcao_camera: string
  enfase: string[]
  pausa_antes: boolean
  pausa_depois: boolean
  notas: string
  marcadores_acao: string[]
}

interface Props {
  bloco: BlocoData
  roteiroId: string
  influencerId: string
  onBlocoUpdated: (blocoAtualizado: BlocoData) => void
}

const TIPO_COLORS: Record<string, string> = {
  hook: 'bg-purple-600',
  problema: 'bg-red-500',
  apresentacao_produto: 'bg-blue-600',
  demonstracao: 'bg-cyan-600',
  prova_social: 'bg-green-600',
  revelacao_preco: 'bg-amber-600',
  cta_engajamento: 'bg-orange-500',
  cta_compra: 'bg-orange-600',
  humor: 'bg-pink-500',
  comparacao: 'bg-indigo-500',
  transformacao: 'bg-emerald-600',
}

export function BlocoEditor({ bloco, roteiroId, influencerId, onBlocoUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [editData, setEditData] = useState({ ...bloco })
  const [expanded, setExpanded] = useState(false)

  async function handleSave() {
    // Capturar diff para aprendizado (Seção 24)
    if (editData.texto !== bloco.texto) {
      try {
        await fetch('/api/internal/roteiro-edicao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roteiro_id: roteiroId,
            bloco_id: bloco.id,
            texto_original: bloco.texto,
            texto_editado: editData.texto,
          }),
        })
      } catch {
        // Diff logging não deve bloquear o save
      }
    }

    onBlocoUpdated(editData)
    setEditing(false)
    toast.success(`Bloco ${bloco.id} salvo`)
  }

  async function handleRegenerar() {
    setRegenerating(true)
    try {
      const res = await fetch('/api/internal/regenerar-bloco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roteiro_id: roteiroId,
          influencer_id: influencerId,
          bloco_id: bloco.id,
          tipo_bloco: bloco.tipo,
          ordem_bloco: bloco.ordem,
        }),
      })

      if (!res.ok) {
        toast.error('Erro ao regenerar bloco')
        return
      }

      const data = await res.json()
      if (data.bloco) {
        onBlocoUpdated(data.bloco)
        toast.success(`Bloco ${bloco.id} regenerado`)
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setRegenerating(false)
    }
  }

  const badgeColor = TIPO_COLORS[bloco.tipo] ?? 'bg-gray-500'

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${badgeColor} hover:${badgeColor}`}>
            {bloco.tipo.replace(/_/g, ' ')}
          </Badge>
          <span className="text-sm truncate max-w-[400px]">
            {(editing ? editData.texto : bloco.texto).slice(0, 80)}...
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{bloco.duracao_segundos}s</span>
          <span className="text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Conteúdo expandido */}
      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t">
          {editing ? (
            <>
              {/* Modo edição */}
              <div>
                <Label className="text-xs">Texto</Label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm bg-background resize-y"
                  value={editData.texto}
                  onChange={(e) => setEditData({ ...editData, texto: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Tom</Label>
                  <Input
                    value={editData.tom}
                    onChange={(e) => setEditData({ ...editData, tom: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Direção de câmera</Label>
                  <Input
                    value={editData.direcao_camera}
                    onChange={(e) => setEditData({ ...editData, direcao_camera: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas de performance</Label>
                <Input
                  value={editData.notas}
                  onChange={(e) => setEditData({ ...editData, notas: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}>Salvar bloco</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditData({ ...bloco }); setEditing(false) }}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Modo visualização */}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{bloco.texto}</p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-medium text-muted-foreground">Tom: </span>
                  {bloco.tom}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Câmera: </span>
                  {bloco.direcao_camera}
                </div>
              </div>

              {bloco.notas && (
                <div className="text-xs bg-muted/30 rounded p-2">
                  <span className="font-medium">Notas: </span>{bloco.notas}
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerar}
                  disabled={regenerating}
                >
                  {regenerating ? 'Regenerando...' : 'Regenerar este bloco'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
