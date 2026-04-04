/**
 * Página de Roteiros — Geração e histórico
 * Referência: Seção 31 do Master Plan v3.0
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { GerarRoteiroForm } from '@/components/roteiros/gerar-roteiro-form'
import { HistoricoRoteiros } from '@/components/roteiros/historico-roteiros'

type Tab = 'gerar' | 'historico'

export default function RoteirosPage() {
  const [tab, setTab] = useState<Tab>('gerar')

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Roteiros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere roteiros personalizados na voz do influenciador
          </p>
        </div>
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            size="sm"
            variant={tab === 'gerar' ? 'default' : 'ghost'}
            onClick={() => setTab('gerar')}
          >
            Gerar
          </Button>
          <Button
            size="sm"
            variant={tab === 'historico' ? 'default' : 'ghost'}
            onClick={() => setTab('historico')}
          >
            Histórico
          </Button>
        </div>
      </div>

      {tab === 'gerar' && <GerarRoteiroForm />}
      {tab === 'historico' && <HistoricoRoteiros />}
    </div>
  )
}
