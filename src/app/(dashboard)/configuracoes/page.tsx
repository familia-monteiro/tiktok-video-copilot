/**
 * Página de Configurações
 * Gerencia chaves de API: Gemini, Decodo, Railway.
 * Botões de teste de conectividade por serviço.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { ConfiguracoesForm } from '@/components/configuracoes/configuracoes-form'
import { PainelCusto } from '@/components/configuracoes/painel-custo'

export default function ConfiguracoesPage() {
  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as integrações e chaves de API do sistema.
        </p>
      </div>
      <ConfiguracoesForm />
      <PainelCusto />
    </div>
  )
}
