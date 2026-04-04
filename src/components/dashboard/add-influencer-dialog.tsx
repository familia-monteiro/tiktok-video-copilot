'use client'

/**
 * Dialog para adicionar novo influenciador.
 * Chama POST /api/v1/influenciadores e dispara scraping inicial.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddInfluencerDialog() {
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmed = handle.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      const response = await fetch('/api/v1/influenciadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_handle: trimmed }),
      })

      const data = await response.json()

      if (response.status === 409) {
        toast.error('Influenciador já cadastrado', {
          description: `@${trimmed} já está na lista.`,
        })
        return
      }

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cadastrar influenciador')
      }

      toast.success('Influenciador adicionado!', {
        description: `@${data.tiktok_handle} está na fila de scraping inicial.`,
      })

      setHandle('')
      setOpen(false)
    } catch (err) {
      toast.error('Erro ao adicionar influenciador', {
        description: err instanceof Error ? err.message : 'Tente novamente.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        + Adicionar Influenciador
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar Influenciador</DialogTitle>
            <DialogDescription>
              Insira o @ do TikTok. O sistema irá coletar até 500 vídeos e iniciar
              o pipeline de transcrição automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="handle" className="text-sm font-medium">
              TikTok Handle
            </Label>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-muted-foreground text-sm">@</span>
              <Input
                id="handle"
                placeholder="nomedousuario"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))}
                disabled={loading}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Exemplo: charlidamelio, khaby.lame
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !handle.trim()}>
              {loading ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
