-- ============================================================
-- Migração 002: Row Level Security
-- Habilita RLS em todas as tabelas sensíveis.
-- service_role ignora RLS por padrão (usado nos jobs e APIs server-side).
-- Políticas para role 'authenticated' (usuários logados via Supabase Auth).
-- Referência: Seção 32 do Master Plan v3.0
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Habilitar RLS em todas as tabelas
-- ────────────────────────────────────────────────────────────
ALTER TABLE influenciadores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE memoria_chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE memorias_estruturadas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteiros               ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteiro_edicoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_roteiros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_virais       ENABLE ROW LEVEL SECURITY;
ALTER TABLE captcha_alerts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs_pipeline          ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes          ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 2. influenciadores — authenticated: leitura e escrita completa
-- ────────────────────────────────────────────────────────────
CREATE POLICY "influenciadores_select" ON influenciadores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "influenciadores_insert" ON influenciadores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "influenciadores_update" ON influenciadores
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "influenciadores_delete" ON influenciadores
  FOR DELETE TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 3. videos — authenticated: leitura (escrita apenas via service_role)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "videos_select" ON videos
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. memoria_chunks — apenas service_role (dados internos dos agentes)
-- ────────────────────────────────────────────────────────────
-- Sem políticas para authenticated: bloqueado por RLS.

-- ────────────────────────────────────────────────────────────
-- 5. memorias_estruturadas — authenticated: leitura (painel de conhecimento)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "memorias_select" ON memorias_estruturadas
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 6. briefings — apenas service_role (dados internos de geração)
-- ────────────────────────────────────────────────────────────
-- Sem políticas para authenticated.

-- ────────────────────────────────────────────────────────────
-- 7. roteiros — authenticated: leitura e atualização de status/conteúdo
-- ────────────────────────────────────────────────────────────
CREATE POLICY "roteiros_select" ON roteiros
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "roteiros_update" ON roteiros
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 8. roteiro_edicoes — apenas service_role (diff interno)
-- ────────────────────────────────────────────────────────────
-- Sem políticas para authenticated.

-- ────────────────────────────────────────────────────────────
-- 9. lotes_roteiros — authenticated: leitura
-- ────────────────────────────────────────────────────────────
CREATE POLICY "lotes_select" ON lotes_roteiros
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 10. templates_virais — authenticated: leitura
-- ────────────────────────────────────────────────────────────
CREATE POLICY "templates_select" ON templates_virais
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 11. captcha_alerts — authenticated: leitura + update de status
-- ────────────────────────────────────────────────────────────
CREATE POLICY "captcha_select" ON captcha_alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "captcha_update" ON captcha_alerts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 12. jobs_pipeline — authenticated: leitura (log de atividade)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "jobs_select" ON jobs_pipeline
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 13. configuracoes — BLOQUEADO para todos os roles de cliente.
-- Acesso exclusivo via service_role (APIs internas server-side).
-- ────────────────────────────────────────────────────────────
-- Sem políticas para authenticated nem anon.

-- ────────────────────────────────────────────────────────────
-- 14. custo_diario / custo_tokens_raw (se existirem)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'custo_diario') THEN
    ALTER TABLE custo_diario ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "custo_diario_select" ON custo_diario
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'custo_tokens_raw') THEN
    ALTER TABLE custo_tokens_raw ENABLE ROW LEVEL SECURITY;
    -- custo_tokens_raw: apenas service_role
  END IF;
END $$;
