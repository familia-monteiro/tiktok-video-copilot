// Tipos TypeScript correspondentes ao schema do banco de dados
// Referência: supabase/migrations/001_schema_completo.sql

export type StatusPipeline = 'pendente' | 'descobrindo' | 'processando' | 'ativo' | 'pausado' | 'erro'
export type ModoPipeline = 'inicial' | 'monitoramento'

export type StatusVideo =
  | 'aguardando' | 'baixando' | 'baixado' | 'audio_processado' | 'transcrito' | 'analisado'
  | 'falha_download' | 'falha_transcricao' | 'falha_analise' | 'indisponivel'

export type DimensaoMemoria = 'hooks' | 'ctas' | 'emocoes' | 'vocabulario' | 'ritmo' | 'produtos' | 'virais'

export type FormatoRoteiro = 'short' | 'standard' | 'extended' | 'long'
export type StatusRoteiro = 'pendente' | 'aprovado' | 'rejeitado' | 'editado'
export type ContextoQualidade = 'completo' | 'parcial' | 'sem_rag'

export type StatusJob = 'pendente' | 'processando' | 'concluido' | 'falha' | 'falha_permanente' | 'cancelado'
export type ModoJob = 'normal' | 'priority'

export type StatusCaptcha = 'aguardando' | 'resolvido' | 'abandonado'
export type Replicabilidade = 'alta' | 'media' | 'baixa'

export interface Influenciador {
  id: string
  tiktok_handle: string
  nome: string | null
  avatar_url: string | null
  seguidores: number | null
  total_videos: number | null
  status_pipeline: StatusPipeline
  modo_atual: ModoPipeline
  nivel_conhecimento_ia: number
  score_cobertura: number
  score_diversidade: number
  score_confianca: number
  ultimo_scraping_at: string | null
  ultimo_video_encontrado_at: string | null
  checkpoint_scraping: Record<string, unknown>
  criado_em: string
  atualizado_em: string
}

export interface Video {
  id: string
  influencer_id: string
  tiktok_video_id: string
  url: string
  thumbnail_url: string | null
  duracao_segundos: number | null
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  engagement_score: number | null
  viral_score: number
  is_viral: boolean
  data_publicacao: string | null
  status: StatusVideo
  analise_parcial: boolean
  tentativas_download: number
  erro_log: string | null
  metricas_atualizadas_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface Transcricao {
  id: string
  video_id: string
  influencer_id: string
  texto_completo: string
  duracao_segundos: number | null
  palavras_total: number | null
  palavras_por_minuto: number | null
  qualidade_transcricao: number
  modelo_utilizado: string | null
  criado_em: string
}

export interface TranscricaoSegmento {
  id: string
  transcricao_id: string
  start_ms: number
  end_ms: number
  texto: string
  palavras: number | null
}

export interface MemoriaChunk {
  id: string
  influencer_id: string
  video_id: string
  chunk_index: number
  texto: string
  embedding: number[] | null
  dimensao: string | null
  relevancia_geracao: number
  criado_em: string
}

export interface MemoriaEstruturada {
  id: string
  influencer_id: string
  dimensao: DimensaoMemoria
  dados: Record<string, unknown>
  versao: number
  total_videos_analisados: number
  confianca_atual: number
  atualizado_em: string
}

export interface Roteiro {
  id: string
  influencer_id: string
  lote_id: string | null
  briefing_id: string | null
  produto_nome: string | null
  produto_categoria: string | null
  produto_preco: string | null
  produto_detalhes: Record<string, unknown>
  cenario: string | null
  duracao_alvo_segundos: number | null
  duracao_calculada_segundos: number | null
  formato: FormatoRoteiro | null
  conteudo: Record<string, unknown>
  score_qualidade: number | null
  score_autenticidade: number | null
  score_estrutura: number | null
  score_viral: number | null
  score_produto: number | null
  contexto_qualidade: ContextoQualidade | null
  nivel_conhecimento_no_momento: number | null
  status: StatusRoteiro
  feedback_usuario: string | null
  pontos_fortes: string[] | null
  pontos_fracos: string[] | null
  chunks_rag_usados: string[] | null
  templates_virais_aplicados: string[] | null
  versao: number
  versao_anterior: Record<string, unknown> | null
  gerado_em: string
  aprovado_em: string | null
  ultima_edicao_em: string | null
}

export interface JobPipeline {
  id: string
  influencer_id: string | null
  video_id: string | null
  etapa: string
  modo: ModoJob
  status: StatusJob
  tentativas: number
  max_tentativas: number
  proximo_retry_em: string | null
  payload: Record<string, unknown>
  resultado: Record<string, unknown> | null
  erro_log: string | null
  iniciado_em: string | null
  concluido_em: string | null
  criado_em: string
}

export interface CaptchaAlert {
  id: string
  influencer_id: string
  job_id: string | null
  status: StatusCaptcha
  estado_salvo: Record<string, unknown> | null
  criado_em: string
  resolvido_em: string | null
  resolvido_por: string | null
}

export interface TemplateViral {
  id: string
  influencer_id: string
  video_id: string
  elemento_principal: string | null
  descricao: string | null
  estrutura: Record<string, unknown> | null
  categorias_compativeis: string[] | null
  categorias_incompativeis: string[] | null
  replicabilidade: Replicabilidade | null
  viral_score_original: number | null
  views_gerados: number | null
  vezes_aplicado: number
  ativo: boolean
  criado_em: string
}

export interface Briefing {
  id: string
  influencer_id: string
  roteiro_id: string | null
  conteudo: Record<string, unknown>
  chunks_recuperados: number | null
  threshold_aplicado: number | null
  nivel_fallback: number | null
  criado_em: string
}

export interface LoteRoteiros {
  id: string
  influencer_id: string
  produto_nome: string | null
  quantidade_total: number | null
  quantidade_gerada: number
  quantidade_aprovada: number
  status: string
  configuracao: Record<string, unknown> | null
  criado_em: string
  concluido_em: string | null
}

export interface Configuracao {
  id: string
  chave: string
  valor_criptografado: string | null
  valor_texto: string | null
  descricao: string | null
  atualizado_em: string
}
