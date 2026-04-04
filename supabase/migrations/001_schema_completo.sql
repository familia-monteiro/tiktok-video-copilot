-- ============================================================================
-- TikTok Video Copilot — Schema Completo v1.0
-- Referência: Seção 29 do Master Plan v3.0
-- Executar no SQL Editor do Supabase: nifaqqupbdtrgjbegijs.supabase.co
-- ============================================================================

-- Extensões obrigatórias
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: influenciadores
-- Armazena o perfil de cada criador e o estado atual do pipeline.
-- ============================================================================
CREATE TABLE influenciadores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tiktok_handle VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(100),
  avatar_url TEXT,
  seguidores INTEGER,
  total_videos INTEGER,
  status_pipeline VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status_pipeline IN ('pendente', 'descobrindo', 'processando', 'ativo', 'pausado', 'erro')),
  modo_atual VARCHAR(20) NOT NULL DEFAULT 'inicial'
    CHECK (modo_atual IN ('inicial', 'monitoramento')),
  nivel_conhecimento_ia FLOAT DEFAULT 0,
  score_cobertura FLOAT DEFAULT 0,
  score_diversidade FLOAT DEFAULT 0,
  score_confianca FLOAT DEFAULT 0,
  ultimo_scraping_at TIMESTAMPTZ,
  ultimo_video_encontrado_at TIMESTAMPTZ,
  checkpoint_scraping JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: videos
-- Armazena metadados e estado de processamento de cada vídeo.
-- ============================================================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  tiktok_video_id VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  duracao_segundos INTEGER,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  engagement_score FLOAT,
  viral_score FLOAT DEFAULT 0,
  is_viral BOOLEAN DEFAULT FALSE,
  data_publicacao TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'aguardando'
    CHECK (status IN (
      'aguardando', 'baixando', 'baixado', 'audio_processado', 'transcrito', 'analisado',
      'falha_download', 'falha_transcricao', 'falha_analise', 'indisponivel'
    )),
  analise_parcial BOOLEAN DEFAULT FALSE,
  tentativas_download INTEGER DEFAULT 0,
  erro_log TEXT,
  metricas_atualizadas_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (influencer_id, tiktok_video_id)
);

CREATE INDEX idx_videos_influencer_status ON videos (influencer_id, status);
CREATE INDEX idx_videos_viral ON videos (is_viral, viral_score DESC);
CREATE INDEX idx_videos_data_publicacao ON videos (data_publicacao DESC);

-- ============================================================================
-- TABELA: transcricoes
-- Armazena o texto resultante da transcrição de cada vídeo.
-- ============================================================================
CREATE TABLE transcricoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  texto_completo TEXT NOT NULL,
  duracao_segundos INTEGER,
  palavras_total INTEGER,
  palavras_por_minuto FLOAT,
  qualidade_transcricao FLOAT DEFAULT 1.0,
  modelo_utilizado VARCHAR(50),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcricoes_influencer ON transcricoes (influencer_id);

-- ============================================================================
-- TABELA: transcricao_segmentos
-- Armazena a transcrição segmentada com timestamps para o Agente Ritmo.
-- ============================================================================
CREATE TABLE transcricao_segmentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transcricao_id UUID NOT NULL REFERENCES transcricoes(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  texto TEXT NOT NULL,
  palavras INTEGER
);

CREATE INDEX idx_segmentos_transcricao ON transcricao_segmentos (transcricao_id, start_ms);

-- ============================================================================
-- TABELA: memoria_chunks (Vector Store)
-- Armazena os chunks de transcrição com embeddings vetoriais (pgvector).
-- ============================================================================
CREATE TABLE memoria_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  texto TEXT NOT NULL,
  embedding vector(768),
  dimensao VARCHAR(20)
    CHECK (dimensao IS NULL OR dimensao IN ('hook', 'cta', 'emocao', 'vocabulario', 'ritmo', 'produto', 'viral')),
  relevancia_geracao FLOAT DEFAULT 1.0
    CHECK (relevancia_geracao >= 0.1 AND relevancia_geracao <= 2.0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_influencer ON memoria_chunks (influencer_id);
CREATE INDEX idx_chunks_video ON memoria_chunks (video_id);

-- Índice IVFFlat para busca vetorial por coseno
-- NOTA: Este índice deve ser criado APÓS ter dados na tabela (mínimo ~1000 linhas).
-- Para início, usar busca exata. Quando houver volume, executar:
-- CREATE INDEX idx_chunks_embedding ON memoria_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- TABELA: memorias_estruturadas
-- Armazena o perfil comportamental sintetizado por dimensão.
-- ============================================================================
CREATE TABLE memorias_estruturadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  dimensao VARCHAR(20) NOT NULL
    CHECK (dimensao IN ('hooks', 'ctas', 'emocoes', 'vocabulario', 'ritmo', 'produtos', 'virais')),
  dados JSONB NOT NULL DEFAULT '{}',
  versao INTEGER DEFAULT 1,
  total_videos_analisados INTEGER DEFAULT 0,
  confianca_atual FLOAT DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (influencer_id, dimensao)
);

-- ============================================================================
-- TABELA: memorias_historico
-- Snapshots das memórias estruturadas para rollback. Retenção: 7 dias.
-- ============================================================================
CREATE TABLE memorias_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  dimensao VARCHAR(20) NOT NULL,
  dados JSONB,
  versao INTEGER,
  motivo_snapshot VARCHAR(100),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memorias_historico_lookup ON memorias_historico (influencer_id, dimensao, versao DESC);

-- ============================================================================
-- TABELA: roteiros
-- Armazena todos os roteiros gerados.
-- ============================================================================
CREATE TABLE roteiros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  lote_id UUID,
  briefing_id UUID,

  produto_nome VARCHAR(200),
  produto_categoria VARCHAR(50),
  produto_preco VARCHAR(50),
  produto_detalhes JSONB DEFAULT '{}',
  cenario VARCHAR(50),

  duracao_alvo_segundos INTEGER,
  duracao_calculada_segundos INTEGER,
  formato VARCHAR(20)
    CHECK (formato IN ('short', 'standard', 'extended', 'long')),

  conteudo JSONB NOT NULL,

  score_qualidade FLOAT,
  score_autenticidade FLOAT,
  score_estrutura FLOAT,
  score_viral FLOAT,
  score_produto FLOAT,

  contexto_qualidade VARCHAR(20)
    CHECK (contexto_qualidade IN ('completo', 'parcial', 'sem_rag')),
  nivel_conhecimento_no_momento FLOAT,

  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'editado')),

  feedback_usuario TEXT,
  pontos_fortes TEXT[],
  pontos_fracos TEXT[],

  chunks_rag_usados UUID[],
  templates_virais_aplicados UUID[],

  versao INTEGER DEFAULT 1,
  versao_anterior JSONB,

  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprovado_em TIMESTAMPTZ,
  ultima_edicao_em TIMESTAMPTZ
);

CREATE INDEX idx_roteiros_influencer ON roteiros (influencer_id);
CREATE INDEX idx_roteiros_status ON roteiros (status);
CREATE INDEX idx_roteiros_lote ON roteiros (lote_id);

-- ============================================================================
-- TABELA: roteiro_edicoes
-- Armazena o diff de edições para aprendizado.
-- ============================================================================
CREATE TABLE roteiro_edicoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roteiro_id UUID NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
  bloco_id VARCHAR(20),
  texto_original TEXT,
  texto_editado TEXT,
  expressoes_removidas TEXT[],
  expressoes_adicionadas TEXT[],
  processado_para_aprendizado BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: briefings
-- Armazena os briefings de geração para auditoria. Retenção: 30 dias.
-- ============================================================================
CREATE TABLE briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  roteiro_id UUID,
  conteudo JSONB NOT NULL,
  chunks_recuperados INTEGER,
  threshold_aplicado FLOAT,
  nivel_fallback INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK de roteiros para briefings (após ambas existirem)
ALTER TABLE roteiros
  ADD CONSTRAINT fk_roteiros_briefing FOREIGN KEY (briefing_id) REFERENCES briefings(id) ON DELETE SET NULL;

-- ============================================================================
-- TABELA: lotes_roteiros
-- ============================================================================
CREATE TABLE lotes_roteiros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  produto_nome VARCHAR(200),
  quantidade_total INTEGER,
  quantidade_gerada INTEGER DEFAULT 0,
  quantidade_aprovada INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'gerando'
    CHECK (status IN ('gerando', 'concluido', 'erro_parcial', 'cancelado')),
  configuracao JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ
);

-- FK de roteiros para lotes (após ambas existirem)
ALTER TABLE roteiros
  ADD CONSTRAINT fk_roteiros_lote FOREIGN KEY (lote_id) REFERENCES lotes_roteiros(id) ON DELETE SET NULL;

-- ============================================================================
-- TABELA: templates_virais
-- ============================================================================
CREATE TABLE templates_virais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  elemento_principal VARCHAR(100),
  descricao TEXT,
  estrutura JSONB,
  categorias_compativeis TEXT[],
  categorias_incompativeis TEXT[],
  replicabilidade VARCHAR(10)
    CHECK (replicabilidade IN ('alta', 'media', 'baixa')),
  viral_score_original FLOAT,
  views_gerados BIGINT,
  vezes_aplicado INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: jobs_pipeline
-- ============================================================================
CREATE TABLE jobs_pipeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES influenciadores(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  etapa VARCHAR(50) NOT NULL,
  modo VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (modo IN ('normal', 'priority')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluido', 'falha', 'falha_permanente', 'cancelado')),
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 4,
  proximo_retry_em TIMESTAMPTZ,
  payload JSONB DEFAULT '{}',
  resultado JSONB,
  erro_log TEXT,
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_status_etapa ON jobs_pipeline (status, etapa);
CREATE INDEX idx_jobs_retry ON jobs_pipeline (status, proximo_retry_em) WHERE status = 'falha';
CREATE INDEX idx_jobs_priority ON jobs_pipeline (modo, status) WHERE status = 'pendente';

-- ============================================================================
-- TABELA: captcha_alerts
-- ============================================================================
CREATE TABLE captcha_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID NOT NULL REFERENCES influenciadores(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs_pipeline(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'resolvido', 'abandonado')),
  estado_salvo JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por VARCHAR(50)
);

-- ============================================================================
-- TABELA: configuracoes
-- ============================================================================
CREATE TABLE configuracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave VARCHAR(100) NOT NULL UNIQUE,
  valor_criptografado TEXT,
  valor_texto TEXT,
  descricao TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserir configurações padrão
INSERT INTO configuracoes (chave, valor_texto, descricao) VALUES
  ('max_videos_por_sessao_inicial', '500', 'Máximo de vídeos coletados por sessão inicial de scraping'),
  ('max_videos_por_sessao_monitoramento', '20', 'Máximo de posições de scroll no monitoramento'),
  ('delay_min_ms', '2000', 'Delay mínimo entre ações do scraper em ms'),
  ('delay_max_ms', '8000', 'Delay máximo entre ações do scraper em ms'),
  ('viral_score_threshold', '70', 'Threshold do Viral Score para alertas e análise viral'),
  ('nivel_conhecimento_minimo_geracao', '40', 'Nível mínimo de conhecimento para geração sem aviso (%)'),
  ('max_exemplos_por_padrao', '10', 'Máximo de exemplos por padrão na memória estruturada');

-- ============================================================================
-- TABELA: api_keys
-- ============================================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(100) NOT NULL,
  chave_hash VARCHAR(64) NOT NULL UNIQUE,
  chave_prefixo VARCHAR(10) NOT NULL,
  permissoes TEXT[] DEFAULT '{}',
  rate_limit_por_hora INTEGER DEFAULT 100,
  ativa BOOLEAN DEFAULT TRUE,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso_em TIMESTAMPTZ
);

-- ============================================================================
-- TABELA: uso_tokens (para monitoramento de custo)
-- ============================================================================
CREATE TABLE uso_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operacao VARCHAR(50) NOT NULL,
  modelo VARCHAR(50) NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  custo_estimado_usd FLOAT DEFAULT 0,
  influencer_id UUID REFERENCES influenciadores(id) ON DELETE SET NULL,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uso_tokens_operacao ON uso_tokens (operacao, criado_em DESC);
CREATE INDEX idx_uso_tokens_data ON uso_tokens (criado_em DESC);

-- ============================================================================
-- FUNÇÃO: buscar_chunks_similares
-- Busca semântica com ponderação por relevancia_geracao (feedback do usuário).
-- Referência: Seção 29 do Master Plan.
-- ============================================================================
CREATE OR REPLACE FUNCTION buscar_chunks_similares(
  p_influencer_id UUID,
  p_embedding vector(768),
  p_top_k INT DEFAULT 20,
  p_similaridade_minima FLOAT DEFAULT 0.75
)
RETURNS TABLE(
  chunk_id UUID,
  texto TEXT,
  video_id UUID,
  similaridade FLOAT,
  relevancia_geracao FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    mc.id,
    mc.texto,
    mc.video_id,
    (1 - (mc.embedding <=> p_embedding))::FLOAT AS similaridade,
    mc.relevancia_geracao
  FROM memoria_chunks mc
  WHERE mc.influencer_id = p_influencer_id
    AND (1 - (mc.embedding <=> p_embedding)) >= p_similaridade_minima
  ORDER BY (mc.embedding <=> p_embedding) * (1.0 / mc.relevancia_geracao)
  LIMIT p_top_k;
END;
$$;

-- ============================================================================
-- FUNÇÃO: atualizar_timestamp
-- Trigger para atualizar atualizado_em automaticamente.
-- ============================================================================
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de atualizado_em
CREATE TRIGGER trg_influenciadores_updated
  BEFORE UPDATE ON influenciadores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_videos_updated
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_memorias_estruturadas_updated
  BEFORE UPDATE ON memorias_estruturadas
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_configuracoes_updated
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ============================================================================
-- HABILITAR REALTIME nas tabelas que o frontend precisa ouvir
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE captcha_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE videos;
ALTER PUBLICATION supabase_realtime ADD TABLE influenciadores;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs_pipeline;
