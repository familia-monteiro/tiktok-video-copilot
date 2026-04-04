/**
 * Dashboard Principal
 * Referência: Seção 31 do Master Plan v3.0
 *
 * Exibe:
 * - Cards de todos os influenciadores com status em tempo real
 * - Log de atividade via Supabase Realtime
 * - Alerta de CAPTCHA (badge vermelho pulsante)
 * - Botão "Adicionar Influenciador"
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { CaptchaAlertBanner } from '@/components/captcha-alert'
import { ActivityLog } from '@/components/dashboard/activity-log'
import { InfluencerCardList } from '@/components/dashboard/influencer-card-list'
import { AddInfluencerDialog } from '@/components/dashboard/add-influencer-dialog'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { data: influencers } = await supabaseAdmin
    .from('influenciadores')
    .select('*')
    .order('criado_em', { ascending: false })

  const { count: totalVideos } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })

  const { count: transcribed } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .in('status', ['transcrito', 'analisado'])

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {influencers?.length || 0} influenciadores ·{' '}
            {totalVideos || 0} vídeos ·{' '}
            {transcribed || 0} transcritos
          </p>
        </div>
        <AddInfluencerDialog />
      </div>

      {/* Alertas de CAPTCHA — Seção 4.2 */}
      <CaptchaAlertBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cards de influenciadores */}
        <div className="lg:col-span-2">
          <InfluencerCardList influencers={influencers || []} />
        </div>

        {/* Log de atividade */}
        <div>
          <ActivityLog />
        </div>
      </div>
    </div>
  )
}
