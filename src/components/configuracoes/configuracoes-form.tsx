'use client'

/**
 * Formulário de configurações editável.
 * Campos já configurados mostram valor mascarado com botão para revelar.
 * Cada card tem botões "Testar" + "Salvar" independentes.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

interface FieldDef {
  chave: string
  label: string
  placeholder: string
  type?: string
}

interface ServiceConfig {
  id: 'gemini' | 'decodo' | 'railway'
  title: string
  description: string
  fields: FieldDef[]
}

const SERVICES: ServiceConfig[] = [
  {
    id: 'gemini',
    title: 'Google Gemini',
    description: 'API para transcrição e análise de vídeos (Gemini 1.5 Pro / Flash)',
    fields: [
      { chave: 'gemini_api_key', label: 'API Key', placeholder: 'AIzaSy...', type: 'password' },
    ],
  },
  {
    id: 'decodo',
    title: 'Proxy Decodo 4G',
    description: 'Proxy rotativo 4G para scraping do TikTok — Localização: Brasil (br.decodo.com)',
    fields: [
      { chave: 'decodo_host', label: 'Host', placeholder: 'br.decodo.com' },
      { chave: 'decodo_port_from', label: 'Porta inicial (rotação)', placeholder: '10001' },
      { chave: 'decodo_port_to', label: 'Porta final (rotação)', placeholder: '10010' },
      { chave: 'decodo_username', label: 'Usuário (Authentication)', placeholder: 'sp78i0zms5' },
      { chave: 'decodo_password', label: 'Senha (Password)', placeholder: '••••••••', type: 'password' },
    ],
  },
  {
    id: 'railway',
    title: 'Railway Worker (Demucs)',
    description: 'Worker Python para separação de áudio (Demucs htdemucs_ft)',
    fields: [
      { chave: 'railway_worker_url', label: 'URL do Worker', placeholder: 'https://meu-worker.railway.app' },
      { chave: 'railway_worker_secret', label: 'Token Secreto', placeholder: '••••••••', type: 'password' },
    ],
  },
]

const OTHER_CONFIGS: FieldDef[] = [
  { chave: 'inngest_event_key', label: 'Inngest Event Key', placeholder: 'evt_...', type: 'password' },
  { chave: 'inngest_signing_key', label: 'Inngest Signing Key', placeholder: 'signkey-...', type: 'password' },
  { chave: 'upstash_redis_rest_url', label: 'Upstash Redis URL', placeholder: 'https://...upstash.io' },
  { chave: 'upstash_redis_rest_token', label: 'Upstash Redis Token', placeholder: 'AX...', type: 'password' },
]

interface ConfigData {
  chave: string
  valor: string
  preenchido: boolean
  descricao: string | null
  atualizado_em: string
}

type SaveResult = { atualizados: string[]; erros?: string[]; avisos?: string[] }

function StatusBadge({ status }: { status: TestStatus }) {
  if (status === 'idle') return null
  if (status === 'testing') return <Badge variant="secondary" className="text-xs">Testando...</Badge>
  if (status === 'ok') return <Badge className="text-xs bg-green-600 hover:bg-green-600">Conectado</Badge>
  return <Badge variant="destructive" className="text-xs">Falha</Badge>
}

export function ConfiguracoesForm() {
  const [configs, setConfigs] = useState<Record<string, ConfigData>>({})
  // values: o que o usuário digitou (vazio = não editou)
  const [values, setValues] = useState<Record<string, string>>({})
  // revealed: valor real descriptografado buscado do backend
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const loadConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/internal/configuracoes')
      const data = await res.json() as { configs: ConfigData[] }
      const map: Record<string, ConfigData> = {}
      const vals: Record<string, string> = {}
      for (const c of data.configs) {
        map[c.chave] = c
        vals[c.chave] = ''
      }
      setConfigs(map)
      setValues(vals)
      setRevealed({})
      setDirty(new Set())
    } catch {
      toast.error('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfigs() }, [loadConfigs])

  function handleChange(chave: string, valor: string) {
    setValues((prev) => ({ ...prev, [chave]: valor }))
    setDirty((prev) => new Set(prev).add(chave))
    // Ao editar, descartar o valor revelado (usuário está substituindo)
    setRevealed((prev) => { const n = { ...prev }; delete n[chave]; return n })
  }

  async function revealField(chave: string) {
    // Toggle: se já revelado, ocultar
    if (revealed[chave] !== undefined) {
      setRevealed((prev) => { const n = { ...prev }; delete n[chave]; return n })
      return
    }

    try {
      const res = await fetch('/api/internal/configuracoes/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave }),
      })
      const data = await res.json() as { valor?: string; error?: string }
      if (data.error) {
        toast.error('Não foi possível revelar', { description: data.error })
        return
      }
      setRevealed((prev) => ({ ...prev, [chave]: data.valor ?? '' }))
    } catch {
      toast.error('Erro ao revelar valor')
    }
  }

  async function saveFields(chaves: string[]): Promise<boolean> {
    // Para cada chave, usar o valor digitado (dirty) ou o valor revelado (se editado via reveal)
    const toSave = chaves
      .filter((c) => values[c]?.trim() !== '')
      .map((c) => ({ chave: c, valor: values[c].trim() }))

    if (toSave.length === 0) {
      toast.info('Nenhum campo editado para salvar')
      return false
    }

    const res = await fetch('/api/internal/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs: toSave }),
    })
    const data = await res.json() as SaveResult

    if (data.erros && data.erros.length > 0) {
      toast.error('Erros ao salvar', { description: data.erros.join('\n') })
    }
    if (data.atualizados.length > 0) {
      toast.success(`${data.atualizados.length} campo(s) salvo(s)`)
      setDirty((prev) => {
        const next = new Set(prev)
        data.atualizados.forEach((c) => next.delete(c))
        return next
      })
      setValues((prev) => {
        const next = { ...prev }
        data.atualizados.forEach((c) => { next[c] = '' })
        return next
      })
      await loadConfigs()
      return true
    }
    return false
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Carregando configurações...</p>
  }

  const otherDirty = OTHER_CONFIGS.some((f) => dirty.has(f.chave) && values[f.chave]?.trim())

  return (
    <div className="space-y-4">
      {SERVICES.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          configs={configs}
          values={values}
          revealed={revealed}
          dirty={dirty}
          onChange={handleChange}
          onReveal={revealField}
          onSave={saveFields}
        />
      ))}

      {/* Outras Integrações */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outras Integrações</CardTitle>
          <CardDescription className="text-xs">Inngest, Upstash Redis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {OTHER_CONFIGS.map((field) => (
            <ConfigField
              key={field.chave}
              chave={field.chave}
              label={field.label}
              placeholder={field.placeholder}
              type={field.type}
              config={configs[field.chave]}
              value={values[field.chave] ?? ''}
              revealedValue={revealed[field.chave]}
              onChange={handleChange}
              onReveal={revealField}
            />
          ))}
          <div className="pt-1">
            <SaveButton
              chaves={OTHER_CONFIGS.map((f) => f.chave)}
              hasDirty={otherDirty}
              onSave={saveFields}
            />
          </div>
        </CardContent>
      </Card>

      {/* Parâmetros do Sistema */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parâmetros do Sistema</CardTitle>
          <CardDescription className="text-xs">Valores padrão configurados no banco de dados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono text-muted-foreground">
            {Object.values(configs)
              .filter((c) => c.valor &&
                c.chave !== 'system_master_key' &&
                !c.chave.includes('api_key') && !c.chave.includes('password') &&
                !c.chave.includes('secret') && !c.chave.includes('token') &&
                !c.chave.includes('server') && !c.chave.includes('url') &&
                !c.chave.includes('username') && !c.chave.includes('signing') &&
                !c.chave.includes('event_key'))
              .map((c) => (
                <div key={c.chave} className="flex items-center justify-between gap-2 py-1">
                  <span>{c.descricao ?? c.chave}</span>
                  <span className="font-semibold text-foreground">{c.valor}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function ConfigField({
  chave, label, placeholder, type, config, value, revealedValue, onChange, onReveal,
}: {
  chave: string
  label: string
  placeholder: string
  type?: string
  config?: ConfigData
  value: string
  revealedValue?: string
  onChange: (chave: string, valor: string) => void
  onReveal: (chave: string) => Promise<void>
}) {
  const [revealing, setRevealing] = useState(false)
  const preenchido = config?.preenchido ?? false
  const isRevealed = revealedValue !== undefined
  const isSensitive = type === 'password'

  // O campo mostra: valor digitado > valor revelado > vazio
  const displayValue = value !== '' ? value : (revealedValue ?? '')
  // Tipo real do input: revelar como texto quando revelado e não editando
  const inputType = isSensitive && !isRevealed && value === '' ? 'password' : 'text'

  async function handleRevealClick() {
    if (!preenchido) return
    setRevealing(true)
    try {
      await onReveal(chave)
    } finally {
      setRevealing(false)
    }
  }

  return (
    <div>
      <Label htmlFor={chave} className="text-xs font-medium flex items-center gap-2">
        {label}
        {preenchido && (
          <Badge variant="secondary" className="text-xs font-normal">Configurado</Badge>
        )}
      </Label>
      <div className="flex items-center gap-1.5 mt-1">
        <Input
          id={chave}
          type={inputType}
          placeholder={preenchido && !isRevealed ? '••••••• (clique em 👁 para ver ou edite para substituir)' : placeholder}
          value={displayValue}
          onChange={(e) => onChange(chave, e.target.value)}
          className="text-xs font-mono"
          autoComplete="off"
        />
        {preenchido && isSensitive && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={handleRevealClick}
            title={isRevealed ? 'Ocultar valor' : 'Revelar valor'}
          >
            {revealing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRevealed ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        {preenchido && !isSensitive && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={handleRevealClick}
            title={isRevealed ? 'Ocultar valor' : 'Revelar valor'}
          >
            {revealing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRevealed ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

function SaveButton({
  chaves, hasDirty, onSave,
}: {
  chaves: string[]
  hasDirty: boolean
  onSave: (chaves: string[]) => Promise<boolean>
}) {
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave(chaves) } finally { setSaving(false) }
  }

  return (
    <Button size="sm" onClick={handleSave} disabled={saving || !hasDirty} className="text-xs h-8">
      {saving ? 'Salvando...' : 'Salvar'}
    </Button>
  )
}

function ServiceCard({
  service, configs, values, revealed, dirty, onChange, onReveal, onSave,
}: {
  service: ServiceConfig
  configs: Record<string, ConfigData>
  values: Record<string, string>
  revealed: Record<string, string>
  dirty: Set<string>
  onChange: (chave: string, valor: string) => void
  onReveal: (chave: string) => Promise<void>
  onSave: (chaves: string[]) => Promise<boolean>
}) {
  const storageKey = `test_status_${service.id}`
  const [testStatus, setTestStatus] = useState<TestStatus>(() => {
    if (typeof window === 'undefined') return 'idle'
    return (localStorage.getItem(storageKey) as TestStatus) ?? 'idle'
  })
  const [saving, setSaving] = useState(false)

  const fieldKeys = service.fields.map((f) => f.chave)
  const hasDirty = fieldKeys.some((k) => dirty.has(k) && values[k]?.trim())
  const allConfigured = fieldKeys.every((k) => configs[k]?.preenchido)

  function persistStatus(status: TestStatus) {
    setTestStatus(status)
    if (typeof window !== 'undefined') {
      if (status === 'idle') {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, status)
      }
    }
  }

  async function handleTest() {
    persistStatus('testing')
    try {
      const valoresForm: Record<string, string> = {}
      for (const field of service.fields) {
        const v = values[field.chave]?.trim() || revealed[field.chave]?.trim()
        if (v) valoresForm[field.chave] = v
      }

      const res = await fetch('/api/internal/test-connectivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: service.id,
          valores: Object.keys(valoresForm).length > 0 ? valoresForm : undefined,
        }),
      })
      const data = await res.json() as { ok: boolean; detail?: string; error?: string }

      if (data.ok) {
        persistStatus('ok')
        toast.success(`${service.title}: conexão OK`, { description: data.detail })
      } else {
        persistStatus('error')
        toast.error(`${service.title}: falha`, { description: data.error })
      }
    } catch (err) {
      persistStatus('error')
      toast.error(`${service.title}: erro ao testar`, {
        description: err instanceof Error ? err.message : 'Verifique o console do navegador (F12)',
      })
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await onSave(fieldKeys)
      // Após salvar, resetar status para forçar novo teste com os valores salvos
      if (saved) persistStatus('idle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{service.title}</CardTitle>
            {allConfigured && testStatus === 'idle' && (
              <Badge variant="secondary" className="text-xs">Configurado</Badge>
            )}
          </div>
          <StatusBadge status={testStatus} />
        </div>
        <CardDescription className="text-xs">{service.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {service.fields.map((field) => (
          <ConfigField
            key={field.chave}
            chave={field.chave}
            label={field.label}
            placeholder={field.placeholder}
            type={field.type}
            config={configs[field.chave]}
            value={values[field.chave] ?? ''}
            revealedValue={revealed[field.chave]}
            onChange={onChange}
            onReveal={onReveal}
          />
        ))}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="flex-1 text-xs h-8"
          >
            {testStatus === 'testing' ? 'Testando...' : 'Testar Conectividade'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasDirty}
            className="text-xs h-8 min-w-[80px]"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
