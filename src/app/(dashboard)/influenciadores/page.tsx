/**
 * Página de Influenciadores
 * Lista todos os influenciadores com cards, status pipeline e nível de conhecimento.
 * Permite adicionar novos influenciadores.
 * Referência: Seção 31 do Master Plan v3.0
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { InfluencerCardList } from '@/components/dashboard/influencer-card-list'
import { AddInfluencerDialog } from '@/components/dashboard/add-influencer-dialog'

export const dynamic = 'force-dynamic'

export default async function InfluenciadoresPage() {
  const { data: influencers } = await supabaseAdmin
    .from('influenciadores')
    .select('*')
    .order('criado_em', { ascending: false })

  const { count: totalVideos } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })

  const { count: totalAnalisados } = await supabaseAdmin
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'analisado')

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Influenciadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {influencers?.length || 0} cadastrados ·{' '}
            {totalVideos || 0} vídeos ·{' '}
            {totalAnalisados || 0} analisados
          </p>
        </div>
        <AddInfluencerDialog />
      </div>

      <InfluencerCardList influencers={influencers || []} />
    </div>
  )
}
