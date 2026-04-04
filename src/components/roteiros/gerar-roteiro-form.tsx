'use client'

/**
 * Formulário de geração unitária de roteiro.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RoteiroViewer } from './roteiro-viewer'
import type { Influenciador } from '@/types/database'

interface ResultadoGeracao {
  roteiro: Record<string, unknown> | null
  roteiroId: string | null
  briefingId: string | null
  revisao: Record<string, unknown> | null
  coldStart: Record<string, unknown>
  ciclos: number
  status: string
  mensagem: string
}

const FORMATOS = [
  { value: 'short', label: 'Short (15-30s)', duracao: 25 },
  { value: 'standard', label: 'Standard (30-60s)', duracao: 45 },
  { value: 'extended', label: 'Extended (60-120s)', duracao: 90 },
  { value: 'long', label: 'Long (120-180s)', duracao: 150 },
] as const

type EtapaGeracao = 'idle' | 'montando_briefing' | 'gerando_roteiro' | 'revisando' | 'concluido' | 'erro'

const ETAPA_LABELS: Record<EtapaGeracao, string> = {
  idle: '',
  montando_briefing: 'Montando briefing de geração...',
  gerando_roteiro: 'Gerando roteiro com Gemini...',
  revisando: 'Agente Revisor avaliando autenticidade...',
  concluido: 'Roteiro gerado!',
  erro: 'Erro na geração',
}

export function GerarRoteiroForm() {
  const [influencers, setInfluencers] = useState<Influenciador[]>([])
  const [selectedInfluencer, setSelectedInfluencer] = useState('')
  const [produto, setProduto] = useState({ nome: '', categoria: '', preco: '', diferenciais: '', objecoes: '' })
  const [cenario, setCenario] = useState({ local: '', tom: 'casual' })
  const [formato, setFormato] = useState<typeof FORMATOS[number]>(FORMATOS[1])
  const [etapa, setEtapa] = useState<EtapaGeracao>('idle')
  const [resultado, setResultado] = useState<ResultadoGeracao | null>(null)
  const [forcarExperimental, setForcarExperimental] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('influenciadores')
        .select('*')
        .order('criado_em', { ascending: false })
      if (data) setInfluencers(data as Influenciador[])
    }
    load()
  }, [])

  async function handleGerar(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInfluencer) {
      toast.error('Selecione um influenciador')
      return
    }

    setEtapa('montando_briefing')
    setResultado(null)

    try {
      // Simular etapas via timer (o backend faz tudo em uma chamada)
      const etapaTimer = setTimeout(() => setEtapa('gerando_roteiro'), 3000)
      const etapaTimer2 = setTimeout(() => setEtapa('revisando'), 8000)

      const res = await fetch('/api/v1/roteiros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          influencer_id: selectedInfluencer,
          produto: {
            nome: produto.nome,
            categoria: produto.categoria,
            preco: produto.preco,
            diferenciais: produto.diferenciais ? produto.diferenciais.split(',').map((s) => s.trim()) : [],
            objecoes_comuns: produto.objecoes ? produto.objecoes.split(',').map((s) => s.trim()) : [],
          },
          cenario: {
            local: cenario.local,
            tom_recomendado: cenario.tom,
            vocabulario_cenario: [],
            restricoes: [],
          },
          duracao: {
            segundos: formato.duracao,
            formato: formato.value,
          },
          forcar_experimental: forcarExperimental,
        }),
      })

      clearTimeout(etapaTimer)
      clearTimeout(etapaTimer2)

      const data = await res.json()

      if (!res.ok) {
        setEtapa('erro')
        toast.error(data.mensagem ?? data.error ?? 'Erro na geração')
        return
      }

      setResultado(data)
      setEtapa('concluido')

      if (data.status === 'bloqueado') {
        toast.info(data.mensagem)
      } else {
        toast.success(data.mensagem)
      }
    } catch {
      setEtapa('erro')
      toast.error('Erro de conexão')
    }
  }

  const isLoading = etapa !== 'idle' && etapa !== 'concluido' && etapa !== 'erro'

  return (
    <div className="space-y-6">
      <form onSubmit={handleGerar}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Influenciador */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Influenciador</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={selectedInfluencer}
                onChange={(e) => setSelectedInfluencer(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Selecione...</option>
                {influencers.map((inf) => (
                  <option key={inf.id} value={inf.id}>
                    @{inf.tiktok_handle} — {Math.round(inf.nivel_conhecimento_ia * 100)}% conhecimento
                  </option>
                ))}
              </select>
              {selectedInfluencer && (() => {
                const inf = influencers.find((i) => i.id === selectedInfluencer)
                if (!inf) return null
                const nivel = Math.round(inf.nivel_conhecimento_ia * 100)
                return (
                  <div className="mt-2 flex items-center gap-2">
                    {nivel < 20 && (
                      <>
                        <Badge variant="destructive" className="text-xs">Cold Start</Badge>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={forcarExperimental}
                            onChange={(e) => setForcarExperimental(e.target.checked)}
                          />
                          Gerar experimental
                        </label>
                      </>
                    )}
                    {nivel >= 20 && nivel < 40 && (
                      <Badge variant="secondary" className="text-xs">Confiança moderada</Badge>
                    )}
                    {nivel >= 40 && (
                      <Badge className="text-xs bg-green-600 hover:bg-green-600">Operacional</Badge>
                    )}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Produto */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  placeholder="Ex: iPhone 15 Pro"
                  value={produto.nome}
                  onChange={(e) => setProduto({ ...produto, nome: e.target.value })}
                  disabled={isLoading}
                  className="text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Input
                    placeholder="Ex: eletrônicos"
                    value={produto.categoria}
                    onChange={(e) => setProduto({ ...produto, categoria: e.target.value })}
                    disabled={isLoading}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Preço</Label>
                  <Input
                    placeholder="Ex: R$ 7.999"
                    value={produto.preco}
                    onChange={(e) => setProduto({ ...produto, preco: e.target.value })}
                    disabled={isLoading}
                    className="text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Diferenciais (separados por vírgula)</Label>
                <Input
                  placeholder="Ex: câmera 48MP, chip A17, titânio"
                  value={produto.diferenciais}
                  onChange={(e) => setProduto({ ...produto, diferenciais: e.target.value })}
                  disabled={isLoading}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Objeções comuns (separadas por vírgula)</Label>
                <Input
                  placeholder="Ex: preço alto, muito parecido com o anterior"
                  value={produto.objecoes}
                  onChange={(e) => setProduto({ ...produto, objecoes: e.target.value })}
                  disabled={isLoading}
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cenário */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cenário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-xs">Local de gravação</Label>
                <Input
                  placeholder="Ex: quarto, escritório, loja"
                  value={cenario.local}
                  onChange={(e) => setCenario({ ...cenario, local: e.target.value })}
                  disabled={isLoading}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Tom</Label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  value={cenario.tom}
                  onChange={(e) => setCenario({ ...cenario, tom: e.target.value })}
                  disabled={isLoading}
                >
                  <option value="casual">Casual</option>
                  <option value="entusiasmado">Entusiasmado</option>
                  <option value="informativo">Informativo</option>
                  <option value="urgente">Urgente</option>
                  <option value="emocional">Emocional</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Formato/Duração */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Formato</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {FORMATOS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={`text-left p-3 rounded-md border text-sm transition-colors ${
                      formato.value === f.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setFormato(f)}
                    disabled={isLoading}
                  >
                    <p className="font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.duracao}s alvo</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botão gerar + indicador de etapa */}
        <div className="mt-4 flex items-center gap-4">
          <Button
            type="submit"
            disabled={isLoading || !selectedInfluencer || !produto.nome || !produto.categoria || !cenario.local}
            className="min-w-[200px]"
          >
            {isLoading ? 'Gerando...' : 'Gerar Roteiro'}
          </Button>

          {etapa !== 'idle' && (
            <div className="flex items-center gap-2">
              {isLoading && (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
              <span className="text-sm text-muted-foreground">{ETAPA_LABELS[etapa]}</span>
            </div>
          )}
        </div>
      </form>

      {resultado && resultado.roteiro && (
        <RoteiroViewer
          roteiro={resultado.roteiro}
          revisao={resultado.revisao}
          coldStart={resultado.coldStart}
          status={resultado.status}
          mensagem={resultado.mensagem}
          roteiroId={resultado.roteiroId}
        />
      )}

      {resultado && resultado.status === 'bloqueado' && (
        <Card className="border-yellow-500/30 bg-yellow-50/5">
          <CardContent className="p-4">
            <p className="text-sm">{resultado.mensagem}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
