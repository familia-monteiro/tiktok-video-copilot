/**
 * Monitor de Virais — Feed em tempo real de vídeos virais
 * Referência: Seção 26, 31 do Master Plan v3.0
 */

import { MonitorViraisClient } from './monitor-virais-client'

export default function ViraisPage() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Monitor de Virais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Feed em tempo real de vídeos com alta performance
        </p>
      </div>
      <MonitorViraisClient />
    </div>
  )
}
