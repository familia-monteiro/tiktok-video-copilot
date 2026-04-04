import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Job: viral.detect
 * Calcula viral_score para um vídeo com métricas atualizadas.
 * Dispara ações se viral_score >= 70.
 * Referência: Seção 26 do Master Plan v3.0
 *
 * Fórmula em 4 passos:
 * 1. engagement_score = (likes×1) + (comments×3) + (shares×5) + (saves×4)
 *    engagement_rate = engagement_score / views
 * 2. baseline_30d = média de engagement_rate dos últimos 30 vídeos
 *    performance_ratio = engagement_rate / baseline_30d
 * 3. velocity_factor (se < 48h): views_por_hora_atual / velocidade_esperada
 * 4. viral_score = min(100, ((performance_ratio × 0.60) + (velocity_factor × 0.40)) × 50)
 */
export const viralDetect = inngest.createFunction(
  {
    id: 'viral-detect',
    name: 'Virais: Detecção e Ação',
    retries: 1,
    triggers: [{ event: 'viral/detect' }],
  },
  async ({ event, step }) => {
    const { video_id, influencer_id } = event.data as {
      video_id: string
      influencer_id: string
    }

    const resultado = await step.run('calcular-viral-score', async () => {
      // Carregar vídeo atual
      const { data: video, error } = await supabaseAdmin
        .from('videos')
        .select('views, likes, comments, shares, saves, data_publicacao, criado_em')
        .eq('id', video_id)
        .single()

      if (error || !video) throw new Error(`Vídeo ${video_id} não encontrado`)

      // Passo 1: Engagement score ponderado
      const engagementScore =
        (video.likes * 1.0) +
        (video.comments * 3.0) +
        (video.shares * 5.0) +
        (video.saves * 4.0)

      if (video.views === 0) return { viral_score: 0, is_viral: false }

      const engagementRate = engagementScore / video.views

      // Passo 2: Normalização pelo baseline do criador (últimos 30 vídeos)
      const { data: recentVideos } = await supabaseAdmin
        .from('videos')
        .select('views, likes, comments, shares, saves')
        .eq('influencer_id', influencer_id)
        .neq('id', video_id)
        .gt('views', 0)
        .order('criado_em', { ascending: false })
        .limit(30)

      let baseline30d = engagementRate // Fallback se não há vídeos
      if (recentVideos && recentVideos.length > 0) {
        const rates = recentVideos.map((v) => {
          const es = (v.likes * 1.0) + (v.comments * 3.0) + (v.shares * 5.0) + (v.saves * 4.0)
          return es / v.views
        })
        baseline30d = rates.reduce((a, b) => a + b, 0) / rates.length
      }

      const performanceRatio = baseline30d > 0 ? engagementRate / baseline30d : 1.0

      // Passo 3: Fator de velocidade para vídeos recentes (< 48h)
      let velocityFactor = 1.0
      const dataPublicacao = video.data_publicacao
        ? new Date(video.data_publicacao)
        : new Date(video.criado_em)
      const horasDesdePublicacao = (Date.now() - dataPublicacao.getTime()) / (1000 * 60 * 60)

      if (horasDesdePublicacao < 48 && horasDesdePublicacao > 0) {
        const viewsPorHoraAtual = video.views / horasDesdePublicacao

        // Velocidade esperada: média de views/hora nas primeiras 48h dos últimos 20 vídeos
        const { data: historico } = await supabaseAdmin
          .from('videos')
          .select('views, data_publicacao, criado_em')
          .eq('influencer_id', influencer_id)
          .neq('id', video_id)
          .gt('views', 0)
          .order('criado_em', { ascending: false })
          .limit(20)

        if (historico && historico.length > 0) {
          const velocidades = historico.map((v) => {
            const pub = v.data_publicacao
              ? new Date(v.data_publicacao)
              : new Date(v.criado_em)
            const horas = Math.max(1, (Date.now() - pub.getTime()) / (1000 * 60 * 60))
            // Estimativa: views/hora baseada no total (simplificação)
            return v.views / Math.min(horas, 48)
          })
          const velocidadeEsperada = velocidades.reduce((a, b) => a + b, 0) / velocidades.length
          if (velocidadeEsperada > 0) {
            velocityFactor = viewsPorHoraAtual / velocidadeEsperada
          }
        }
      }

      // Passo 4: Score final
      const viralScore = Math.min(
        100,
        Math.round(((performanceRatio * 0.60) + (velocityFactor * 0.40)) * 50)
      )

      const isViral = viralScore >= 70

      return { viral_score: viralScore, is_viral: isViral }
    })

    // Atualizar vídeo no banco
    await step.run('atualizar-video', async () => {
      await supabaseAdmin
        .from('videos')
        .update({
          viral_score: resultado.viral_score,
          is_viral: resultado.is_viral,
        })
        .eq('id', video_id)
    })

    // Ações se viral detectado
    if (resultado.is_viral) {
      await step.run('acoes-viral', async () => {
        // Verificar status do vídeo
        const { data: video } = await supabaseAdmin
          .from('videos')
          .select('status')
          .eq('id', video_id)
          .single()

        if (!video) return

        if (video.status === 'aguardando' || video.status === 'baixando') {
          // Mover para fila de prioridade
          await inngest.send({
            name: 'media/download.priority',
            data: { video_id, influencer_id },
          })
        } else if (video.status === 'transcrito') {
          // Enfileirar análise imediata
          await inngest.send({
            name: 'agent/analyze',
            data: { video_id, influencer_id },
          })
        }
      })
    }

    return resultado
  }
)
