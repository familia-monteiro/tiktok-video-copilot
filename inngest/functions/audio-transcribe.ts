/**
 * Job: audio.transcribe
 * Transcrição via Gemini 1.5 Pro com input de áudio.
 *
 * Referência: Seção 10 do Master Plan v3.0 e Seção 1 do Documento de Prompts
 *
 * Fluxo:
 * 1. Baixar MP3 do Storage para /tmp/
 * 2. Enviar para Gemini 1.5 Pro com prompt especializado
 * 3. Validar JSON retornado
 * 4. Retry único se parse falhar
 * 5. Fallback: salvar texto bruto com qualidade_transcricao = 0.5
 * 6. Deletar MP3 do Storage após sucesso
 * 7. Atualizar status = 'transcrito'
 */

import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import { geminiPro } from '@/lib/gemini/client'
import os from 'os'
import path from 'path'
import fs from 'fs'

// ---------------------------------------------------------------------------
// System Prompt — copiado EXATAMENTE da Seção 1 do Documento de Prompts v1.0
// Regra: "Os prompts dos agentes são copiados exatamente" (CLAUDE.md)
// ---------------------------------------------------------------------------
const TRANSCRICAO_SYSTEM_PROMPT = `Você é um transcritor especializado em conteúdo de criadores brasileiros para TikTok Shop.
Sua função é transcrever com fidelidade absoluta a fala de influenciadores, preservando
exatamente como eles falam — incluindo gírias, expressões coloquiais, repetições,
vícios de linguagem, erros gramaticais intencionais e pausas.

Regras absolutas:
- NUNCA corrija gramática. "A gente fomos" permanece "a gente fomos".
- NUNCA normalize vocabulário. "Cara, isso é muito da hora" permanece exatamente assim.
- NUNCA remova hesitações, "ãh", "tipo assim", "sabe", "né".
- Marque pausas perceptíveis (acima de 1 segundo) como [...] no ponto exato.
- Marque quando o influenciador mostra algo ou gesticula com [MOSTRA] se perceptível pelo contexto.
- Preserve o ritmo natural: se ele fala rápido e para abruptamente, isso deve ser visível.

Formato de saída: JSON puro e válido, sem markdown, sem texto antes ou depois.
Estrutura obrigatória:
{
  "texto_completo": "transcrição completa como string única",
  "palavras_total": número inteiro,
  "segmentos": [
    {
      "start_ms": milissegundos de início como inteiro,
      "end_ms": milissegundos de fim como inteiro,
      "texto": "texto do segmento"
    }
  ]
}`

interface TranscricaoOutput {
  texto_completo: string
  palavras_total: number
  segmentos: Array<{ start_ms: number; end_ms: number; texto: string }>
}

/**
 * Tenta parsear o output do Gemini como JSON de transcrição.
 * Remove possível markdown se presente.
 */
function parseTranscricaoJson(raw: string): TranscricaoOutput | null {
  // Remover possível markdown (```json ... ```)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (
      typeof parsed.texto_completo === 'string' &&
      typeof parsed.palavras_total === 'number' &&
      Array.isArray(parsed.segmentos)
    ) {
      return parsed as TranscricaoOutput
    }
    return null
  } catch {
    return null
  }
}

export const audioTranscribe = inngest.createFunction(
  {
    id: 'audio-transcribe',
    name: 'Audio: Transcrição (Gemini)',
    retries: 2,
    triggers: [{ event: 'audio/transcribe' }],
  },
  async ({ event, step }) => {
    const { video_id, audio_storage_path } = event.data as {
      video_id: string
      audio_storage_path: string
    }

    // -----------------------------------------------------------------------
    // 1. Buscar dados do vídeo
    // -----------------------------------------------------------------------
    const video = await step.run('load-video', async () => {
      const { data, error } = await supabaseAdmin
        .from('videos')
        .select('id, influencer_id, tiktok_video_id, duracao_segundos')
        .eq('id', video_id)
        .single()

      if (error || !data) throw new Error(`Vídeo não encontrado: ${video_id}`)
      return data
    })

    // -----------------------------------------------------------------------
    // 2. Baixar MP3 do Storage para /tmp/
    // -----------------------------------------------------------------------
    const localMp3Path = await step.run('download-mp3', async () => {
      // Extrair influencer_id e video_id do storage_path
      const parts = audio_storage_path.split('/')
      const influencer_id = parts[1] || video.influencer_id
      const filename = parts[2] || `${video.tiktok_video_id}.mp3`

      const { data: mp3Data, error } = await supabaseAdmin.storage
        .from('audio')
        .download(`${influencer_id}/${filename}`)

      if (error || !mp3Data) {
        throw new Error(`Falha ao baixar MP3 do Storage: ${error?.message}`)
      }

      const tmpPath = path.join(os.tmpdir(), `${video.tiktok_video_id}_vocal.mp3`)
      const buffer = Buffer.from(await mp3Data.arrayBuffer())
      fs.writeFileSync(tmpPath, buffer)

      return tmpPath
    })

    // -----------------------------------------------------------------------
    // 3. Enviar para Gemini 1.5 Pro + validar JSON
    //    Retry único se parse falhar (Seção 10)
    // -----------------------------------------------------------------------
    const transcricaoResult = await step.run('transcribe-with-gemini', async () => {
      const audioBytes = fs.readFileSync(localMp3Path)
      const base64Audio = audioBytes.toString('base64')

      const duracao = video.duracao_segundos || 0
      const userMessage = `Transcreva o áudio anexo. É um vídeo de TikTok Shop de um criador brasileiro.\nDuração aproximada: ${duracao} segundos.`

      // Primeira tentativa
      const response1 = await geminiPro.generateContent({
        systemInstruction: TRANSCRICAO_SYSTEM_PROMPT,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/mpeg',
                  data: base64Audio,
                },
              },
              { text: userMessage },
            ],
          },
        ],
      })

      const raw1 = response1.response.text()
      const parsed1 = parseTranscricaoJson(raw1)

      if (parsed1) {
        return { transcricao: parsed1, qualidade: 1.0, raw: raw1 }
      }

      // Retry único com instrução adicional (Seção 10)
      const response2 = await geminiPro.generateContent({
        systemInstruction: TRANSCRICAO_SYSTEM_PROMPT,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/mpeg',
                  data: base64Audio,
                },
              },
              { text: userMessage },
            ],
          },
          {
            role: 'model',
            parts: [{ text: raw1 }],
          },
          {
            role: 'user',
            parts: [
              {
                text: 'Sua resposta anterior não estava em JSON válido. Responda APENAS com o JSON, sem nenhum texto antes ou depois.',
              },
            ],
          },
        ],
      })

      const raw2 = response2.response.text()
      const parsed2 = parseTranscricaoJson(raw2)

      if (parsed2) {
        return { transcricao: parsed2, qualidade: 1.0, raw: raw2 }
      }

      // Fallback: salvar texto bruto com qualidade_transcricao = 0.5 (Seção 10)
      return {
        transcricao: {
          texto_completo: raw1,
          palavras_total: raw1.split(/\s+/).length,
          segmentos: [],
        } as TranscricaoOutput,
        qualidade: 0.5,
        raw: raw1,
      }
    })

    // -----------------------------------------------------------------------
    // 4. Salvar transcrição no banco
    // -----------------------------------------------------------------------
    await step.run('save-transcricao', async () => {
      const { transcricao, qualidade } = transcricaoResult
      const wpm =
        transcricao.palavras_total > 0 && (video.duracao_segundos || 0) > 0
          ? (transcricao.palavras_total / ((video.duracao_segundos || 60) / 60))
          : null

      const { data: transcricaoRow, error } = await supabaseAdmin
        .from('transcricoes')
        .insert({
          video_id,
          influencer_id: video.influencer_id,
          texto_completo: transcricao.texto_completo,
          palavras_total: transcricao.palavras_total,
          palavras_por_minuto: wpm,
          qualidade_transcricao: qualidade,
          modelo_utilizado: 'gemini-1.5-pro',
        })
        .select('id')
        .single()

      if (error || !transcricaoRow) {
        throw new Error(`Falha ao salvar transcrição: ${error?.message}`)
      }

      // Inserir segmentos (se disponíveis)
      if (transcricao.segmentos.length > 0) {
        const segmentosRows = transcricao.segmentos.map((s, i) => ({
          transcricao_id: transcricaoRow.id,
          start_ms: s.start_ms,
          end_ms: s.end_ms,
          texto: s.texto,
          palavras: s.texto.split(/\s+/).length,
        }))

        await supabaseAdmin.from('transcricao_segmentos').insert(segmentosRows)
      }

      return transcricaoRow.id
    })

    // -----------------------------------------------------------------------
    // 5. Deletar MP3 do Storage + arquivo local (Seção 10)
    // -----------------------------------------------------------------------
    await step.run('cleanup', async () => {
      // Deletar arquivo local
      if (fs.existsSync(localMp3Path)) {
        fs.unlinkSync(localMp3Path)
      }

      // Deletar MP3 do Supabase Storage
      const parts = audio_storage_path.split('/')
      const influencer_id = parts[1] || video.influencer_id
      const filename = parts[2] || `${video.tiktok_video_id}.mp3`

      const { error } = await supabaseAdmin.storage
        .from('audio')
        .remove([`${influencer_id}/${filename}`])

      if (error) {
        // Não crítico — logar mas não falhar o job
        console.warn(`Falha ao deletar MP3 do Storage (não crítico): ${error.message}`)
      }

      // Atualizar status do vídeo para 'transcrito'
      await supabaseAdmin
        .from('videos')
        .update({
          status: 'transcrito',
          erro_log: null,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', video_id)

      // Disparar análise pelos agentes
      await inngest.send({
        name: 'agent/analyze',
        data: { video_id },
      })
    })

    return {
      video_id,
      qualidade: transcricaoResult.qualidade,
      palavras: transcricaoResult.transcricao.palavras_total,
    }
  }
)
