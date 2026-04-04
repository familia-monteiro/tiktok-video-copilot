# CLAUDE.md — TikTok Video Copilot

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
> Não remover, não renomear, não mover da raiz do projeto.

---

## Como usar este projeto com Claude Code

### Estrutura de arquivos de referência

Coloque estes dois arquivos na pasta `/docs` do projeto antes de começar:

```
/docs/TikTok_Video_Copilot_Master_Plan_v3.md
/docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md
```

**No início de cada sessão de trabalho, leia os dois arquivos completos antes de qualquer ação:**

```
Read docs/TikTok_Video_Copilot_Master_Plan_v3.md
Read docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md
```

Esses documentos são sua única fonte de verdade para decisões de arquitetura,
comportamento dos módulos, schemas de banco, lógica dos agentes e regras do projeto.

---

## Identidade e função

Você é o engenheiro sênior responsável por construir o TikTok Video Copilot do zero,
usando Claude Code no VS Code. Você tem acesso direto ao sistema de arquivos, pode
executar comandos no terminal, instalar dependências e criar a estrutura completa do projeto.

---

## Infraestrutura já contratada

**Supabase — backend principal:**
- Organização: `video-assistente`
- URL: `https://nifaqqupbdtrgjbegijs.supabase.co`
- Variáveis de ambiente obrigatórias no `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://nifaqqupbdtrgjbegijs.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=           # gerar no painel do Supabase
  SUPABASE_SERVICE_ROLE_KEY=               # gerar no painel do Supabase
  ```
- Todo SQL gerado é executado no SQL Editor deste projeto

**Outras variáveis de ambiente necessárias (criar no `.env.local`):**
```
GEMINI_API_KEY=
MASTER_ENCRYPTION_KEY=                     # 32 bytes hex — gerar com: openssl rand -hex 32
DECUDO_SERVER=
DECUDO_USERNAME=
DECUDO_PASSWORD=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RAILWAY_WORKER_URL=                        # URL do worker Python no Railway
RAILWAY_WORKER_SECRET=                     # token para autenticar callbacks
```

---

## Stack tecnológica

```
Frontend:    Next.js 14+ (App Router), Tailwind CSS, shadcn/ui, Zustand
Backend:     Supabase (PostgreSQL + pgvector + Storage + Auth + Realtime)
Filas:       Inngest (jobs sem timeout, retry automático, cron)
Worker:      Python 3.11 + Demucs htdemucs_ft + FFmpeg no Railway (Docker)
LLM:         gemini-1.5-pro (geração e análise), gemini-1.5-flash (tarefas rápidas)
Embeddings:  text-embedding-004 (768 dimensões)
Scraping:    Playwright + playwright-extra + puppeteer-stealth + Proxy Decudo 4G
Download:    yt-dlp (sem proxy, direto na CDN do TikTok)
Criptografia: AES-256-GCM via @noble/ciphers
Rate limit:  Upstash Rate Limit
Deploy:      Vercel
```

---

## Regras de trabalho — seguir sem exceção

**1. Leia os docs antes de qualquer implementação.**
Se uma decisão técnica não está no Master Plan ou no Documento de Prompts, pergunte
antes de decidir por conta própria.

**2. Implemente completo, nunca pela metade.**
Sem TODOs em aberto, sem "versão simplificada por agora", sem comentários
`// implement later`. Se o Master Plan descreve um comportamento, ele é implementado agora.

**3. Uma entrega por vez.**
Termine uma entrega, confirme que funciona, depois avance. Não comece a próxima
enquanto a atual não passou no critério de aceitação.

**4. Os prompts dos agentes são copiados exatamente.**
O texto dos system prompts está no arquivo `docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md`.
Copiar como string no código — sem reformular, sem simplificar, sem melhorar.

**5. O formato canônico do roteiro é inviolável.**
Todo código que gera, salva ou manipula roteiros produz exatamente o schema da
Seção 23 do Master Plan. Sem exceções.

**6. Ao concluir cada entrega, reportar:**
- O que foi implementado
- Como testar (comando exato ou passo a passo)
- Quais variáveis de ambiente precisam ser preenchidas
- Qual é a próxima entrega

---

## Estrutura de pastas do projeto

Criar esta estrutura no início da Fase 1:

```
tiktok-video-copilot/
├── CLAUDE.md                          ← este arquivo
├── docs/
│   ├── TikTok_Video_Copilot_Master_Plan_v3.md
│   └── TikTok_Copilot_Prompts_dos_Agentes_v1.md
├── .env.local
├── .env.example
├── package.json
├── next.config.js
├── tailwind.config.js
├── src/
│   ├── app/                           ← Next.js App Router
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx               ← Dashboard principal
│   │   │   ├── influenciadores/
│   │   │   ├── roteiros/
│   │   │   ├── virais/
│   │   │   ├── teleprompter/
│   │   │   └── configuracoes/
│   │   └── api/
│   │       ├── v1/                    ← APIs externas (com rate limiting)
│   │       └── internal/              ← APIs internas (worker callbacks)
│   ├── components/
│   ├── lib/
│   │   ├── supabase/                  ← cliente Supabase
│   │   ├── gemini/                    ← cliente Gemini
│   │   ├── agents/                    ← os 9 agentes de análise
│   │   ├── generation/                ← briefing + prompt mestre + revisor
│   │   ├── scraper/                   ← playwright + anti-detecção
│   │   ├── crypto/                    ← AES-256-GCM
│   │   └── inngest/                   ← definição de todos os jobs
│   └── types/                         ← TypeScript types
├── inngest/
│   └── functions/                     ← implementação dos jobs Inngest
├── worker/                            ← Worker Python (Demucs + FFmpeg)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
└── supabase/
    └── migrations/
        └── 001_schema_completo.sql    ← schema gerado na Entrega 1.1
```

---

## Plano de implementação

### FASE 1 — Pipeline de Extração e Transcrição

Referência: Seções 2, 3, 4, 5, 6, 7, 8, 9, 10, 29, 30 do Master Plan + Seção 1 do Documento de Prompts.

**Entrega 1.1 — Schema do banco**
Gerar `supabase/migrations/001_schema_completo.sql` com: todas as tabelas definidas
na Seção 29 do Master Plan, todos os índices, `CREATE EXTENSION IF NOT EXISTS vector`,
e a função `buscar_chunks_similares` com ponderação por `relevancia_geracao`.
Instrução de execução: copiar e colar no SQL Editor de `nifaqqupbdtrgjbegijs.supabase.co`.

**Entrega 1.2 — Setup do projeto Next.js**
Rodar `npx create-next-app@latest` com as opções corretas. Instalar dependências:
`@supabase/supabase-js`, `inngest`, `playwright`, `playwright-extra`,
`puppeteer-extra-plugin-stealth`, `@noble/ciphers`, `@upstash/ratelimit`,
`@upstash/redis`, `zod`, shadcn/ui, Zustand, Tailwind.
Criar a estrutura de pastas completa. Criar `.env.example` com todas as chaves.

**Entrega 1.3 — Setup do Inngest**
Criar `src/lib/inngest/client.ts` e `inngest/functions/` com definição de todos os
jobs (nomes, retries, cron) conforme Seção 30 do Master Plan. Criar o API route
`/api/inngest` para o webhook. Nenhum job precisa ter a lógica implementada ainda —
só a estrutura e configuração.

**Entrega 1.4 — Worker Python no Railway**
Criar `worker/Dockerfile` com Python 3.11 + PyTorch CPU + Demucs htdemucs_ft + FFmpeg.
Criar `worker/main.py` com endpoint POST `/process` (recebe `video_id` e caminho no Storage),
executa o pipeline do Demucs conforme Seção 9 do Master Plan, e faz callback POST para
`{RAILWAY_WORKER_URL}/api/internal/audio-complete`. Criar `worker/requirements.txt`.

**Entrega 1.5 — Job `scrape.discover.initial`**
Implementar em `inngest/functions/scrape-discover-initial.ts`.
Playwright + playwright-extra + stealth. Proxy Decudo configurado.
Comportamento humano sintético completo: delays 2000-8000ms em distribuição normal,
scroll gradual com bezier, fadiga após 20 ações, pausas periódicas.
Checkpoint a cada 50 vídeos no campo `checkpoint_scraping` do banco.
Deduplicação por `tiktok_video_id`. Máximo 500 vídeos por execução.
Detecção de CAPTCHA + insert em `captcha_alerts` + evento Supabase Realtime.
Referência: Seções 4, 5, 7 do Master Plan.

**Entrega 1.6 — Job `scrape.discover.monitor`**
Implementar em `inngest/functions/scrape-discover-monitor.ts`.
Modo diferenciado: máximo 20 posições de scroll. Parar ao encontrar `tiktok_video_id`
já existente. Atualizar métricas de vídeos existentes sem re-download.
Referência: Seção 7 do Master Plan.

**Entrega 1.7 — Job `media.download`**
Implementar em `inngest/functions/media-download.ts`.
Chamar yt-dlp via `child_process.exec`. Sem proxy. Qualidade máxima 720p.
Verificar integridade. Upload para Supabase Storage. Fallback. HTTP 404/410 → `indisponivel`.
Referência: Seção 8 do Master Plan.

**Entrega 1.8 — Job `audio.separate`**
Implementar em `inngest/functions/audio-separate.ts`.
Fazer POST para o Worker Railway com `video_id`. Aguardar callback via endpoint
`/api/internal/audio-complete`. Atualizar status e disparar `audio.transcribe`.
Criar o endpoint `/api/internal/audio-complete/route.ts`.
Referência: Seção 9 do Master Plan.

**Entrega 1.9 — Job `audio.transcribe`**
Implementar em `inngest/functions/audio-transcribe.ts`.
Gemini 1.5 Pro com input de áudio. System prompt exato da Seção 1 do Documento de Prompts
(ler de `docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md` antes de implementar).
Validação de JSON. Retry único. Fallback com `qualidade_transcricao = 0.5`.
Deletar MP3 do Storage após sucesso.
Referência: Seção 10 do Master Plan.

**Entrega 1.10 — Resolução de CAPTCHA**
Criar componente de alerta no frontend que ouve Supabase Realtime na tabela `captcha_alerts`.
Botão "Resolver CAPTCHA" que faz POST para `/api/internal/captcha-resolved`.
O endpoint marca `captcha_alerts.status = 'resolvido'` e o job retoma do estado salvo.
Referência: Seção 4.2 do Master Plan.

**Entrega 1.11 — Dashboard e configurações**
Dashboard: cards de influenciadores, status em tempo real via Supabase Realtime,
log de atividade, alerta de CAPTCHA. Configurações: campos para Gemini Key, Decudo,
Railway URL, com botões de teste de conectividade.
Referência: Seção 31 do Master Plan.

**Critério de aceitação da Fase 1:**
```bash
# Rodar localmente:
npm run dev
# Inserir um @handle com 50+ vídeos via dashboard.
# Após 2h sem intervenção (exceto CAPTCHAs), verificar no Supabase:
# SELECT COUNT(*) FROM videos WHERE status = 'transcrito';
# Resultado esperado: >= 30
# Verificar uma transcrição: gírias e expressões devem estar preservadas.
```

---

### FASE 2 — Memória Vetorial e Agentes de Análise

Referência: Seções 11, 12, 13, 14, 15, 28 do Master Plan + Seções 2–10 do Documento de Prompts.

**Entrega 2.1 — Chunking e embeddings**
Criar `src/lib/agents/chunking.ts`: função que divide transcrição em chunks de 150 palavras
com overlap de 30. Criar `src/lib/agents/embeddings.ts`: chamada à API `text-embedding-004`,
inserção em `memoria_chunks` no Supabase. Referência: Seção 11 do Master Plan.

**Entrega 2.2 — Os 7 agentes de análise**
Criar um arquivo por agente em `src/lib/agents/`:
`agent-hook.ts`, `agent-cta.ts`, `agent-emocao.ts`, `agent-vocabulario.ts`,
`agent-ritmo.ts`, `agent-produto.ts`, `agent-viral.ts`.
Cada arquivo: system prompt exato do Documento de Prompts (lido de `/docs/`),
chamada ao Gemini com temperatura 0.2, validação de JSON com Zod,
retry automático em falha de parse, fallback que retorna memória inalterada.
Referência: Seções 13, 14 do Master Plan + Seções 3–9 do Documento de Prompts.

**Entrega 2.3 — Agente Revisor**
Criar `src/lib/agents/agent-revisor.ts`. System prompt exato da Seção 10
do Documento de Prompts. Temperatura 0.3. Lógica completa de aprovação/revisão/reprovação.
Implementado agora, usado na Fase 3. Referência: Seção 20 do Master Plan.

**Entrega 2.4 — Agente Diretor (análise)**
Criar `src/lib/agents/agent-diretor-analise.ts`.
Promise.all dos 7 agentes base. Agente Viral condicional (`viral_score >= 70`).
Atualização incremental da memória estruturada com mesclagem.
Limites de exemplos e compressão automática conforme Seção 12 do Master Plan.

**Entrega 2.5 — Job `agent.analyze`**
Criar `inngest/functions/agent-analyze.ts` que chama o Agente Diretor.
Ao final: gerar embeddings, recalcular Nível de Conhecimento, marcar vídeo como `analisado`.

**Entrega 2.6 — Cálculo do Nível de Conhecimento**
Criar `src/lib/agents/nivel-conhecimento.ts` com a fórmula completa:
cobertura (40%) + diversidade (30%) + confiança (30%). Referência: Seção 28 do Master Plan.

**Entrega 2.7 — Monitor de Virais e fila de prioridade**
Criar `inngest/functions/monitor-virals.ts` com cron a cada hora.
Fórmula do Viral Score em 4 passos. Dois jobs separados: `media.download.priority`
e `media.download.normal`. Referência: Seções 26, 30 do Master Plan.

**Entrega 2.8 — Painel de conhecimento**
Componente React com barras por dimensão, badges de confiança, estimativa de tempo.
Referência: Seção 31 do Master Plan.

**Critério de aceitação da Fase 2:**
```bash
# Com 50 vídeos analisados de um influenciador real, verificar no Supabase:
SELECT dados FROM memorias_estruturadas
WHERE influencer_id = '<id>' AND dimensao = 'hooks';
# O JSON deve mostrar >= 3 tipos de hook com exemplos reais do influenciador.
```

---

### FASE 3 — Geração de Roteiros

Referência: Seções 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 do Master Plan + Seção 11 do Documento de Prompts.

**Entrega 3.1 — Montagem do Briefing de Geração**
Criar `src/lib/generation/briefing.ts`.
Executar em paralelo: carregamento de memória estruturada, busca RAG com 5 níveis
de fallback (threshold 0.75 → 0.60 → consulta expandida → sem RAG → cold start),
seleção de hook por algoritmo de ranqueamento (3 critérios), templates virais compatíveis.
Retornar objeto briefing completo no schema da Seção 17 do Master Plan.

**Entrega 3.2 — Cold start**
Criar `src/lib/generation/cold-start.ts`. Três comportamentos por nível (0-20%, 21-40%, 41%+).
Componente de UI com estimativa de tempo e badge de confiança.
Referência: Seção 16 do Master Plan.

**Entrega 3.3 — Prompt Mestre de Geração**
Criar `src/lib/generation/prompt-mestre.ts`.
Montar as 5 seções com injeção dinâmica dos dados do briefing. Ler a estrutura exata
das 5 seções do arquivo `docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md`.
Chamada ao Gemini 1.5 Pro com temperatura 0.75. Validar JSON retornado contra
schema canônico da Seção 23 do Master Plan. Referência: Seção 11 do Documento de Prompts.

**Entrega 3.4 — Agente Revisor integrado à geração**
Criar `src/lib/generation/ciclo-geracao.ts`.
Score >= 7.0: aprovar. Score 5.0-6.9: revisar com Gemini temperatura 0.3.
Score < 5.0: descartar e regenerar com parâmetros diferentes. Máximo 2 ciclos.
Referência: Seção 20 do Master Plan.

**Entrega 3.5 — Geração unitária no frontend**
Formulário completo. Loading com etapas visíveis via Supabase Realtime.
Exibição de blocos em acordeão com scores e badges de contexto.
Referência: Seção 31 do Master Plan.

**Entrega 3.6 — Geração em lote**
Criar `src/lib/generation/lote.ts`. Variação sequencial de hook, arco, duração
e ênfase. Detecção de repetição por similaridade > 80%.
Referência: Seção 21 do Master Plan.

**Entrega 3.7 — Edição por bloco e captura de diff**
Componente de edição inline por bloco. Botão de regeneração de bloco individual.
Captura de diff + job assíncrono de aprendizado.
Referência: Seção 24 do Master Plan.

**Entrega 3.8 — Sistema de feedback**
Criar `src/lib/generation/feedback.ts`. Lógica de ajuste de `relevancia_geracao`
por aprovação (+0.05), rejeição (-0.10) e edição (+0.03).
Referência: Seção 25 do Master Plan.

**Entrega 3.9 — Histórico e exportação**
Lista paginada com filtros. Exportação TXT e PDF.
Referência: Seção 31 do Master Plan.

**Critério de aceitação da Fase 3:**
Com 100 vídeos analisados, gerar 3 roteiros para produtos não abordados.
Avaliação humana cega: >= 2 dos 3 aprovados como "poderia ser do influenciador".

---

### FASE 4 — Teleprompter e Monitor de Virais

Referência: Seções 26, 27, 31 do Master Plan.

**Entrega 4.1 — Teleprompter**
Criar `src/app/(dashboard)/teleprompter/[id]/page.tsx`.
Fundo `#000000`. Coluna 60% da tela. Fonte 48px ajustável 32-72px.
Marcadores visuais por tipo (pausa = linha vazia, [MOSTRAR] = azul, ênfase = negrito, CTA = laranja).
Controles apenas por teclado/toque. Algoritmo de velocidade baseado em `velocidade_media_wpm`.
Modo de ensaio. Timer, barra de progresso 2px, número do bloco atual.
Referência: Seção 27 do Master Plan.

**Entrega 4.2 — Monitor de Virais**
Feed em tempo real. Cards com viral_score e badge colorido. Expansão com template.
Botão "Usar este padrão". Filtros. Referência: Seção 31 do Master Plan.

**Entrega 4.3 — Agente Viral na fila**
Vídeos com `viral_score >= 70` analisados com prompt da Seção 9 do Documento de Prompts.
Template salvo em `templates_virais`. Referência: Seção 26 do Master Plan.

**Critério de aceitação da Fase 4:**
Teleprompter funciona em mobile sem UI visível durante gravação.
Monitor detecta viral e exibe template < 2h após publicação.

---

### FASE 5 — Segurança e Deploy

Referência: Seções 2, 32, 33, 34 do Master Plan.

**Entrega 5.1 — Criptografia**
Criar `src/lib/crypto/index.ts` com `encryptKey` e `decryptKey` usando AES-256-GCM
via `@noble/ciphers`. `MASTER_ENCRYPTION_KEY` apenas em variável de ambiente.
Referência: Seção 32 do Master Plan.

**Entrega 5.2 — RLS no Supabase**
Gerar `supabase/migrations/002_rls.sql` com RLS habilitado em todas as tabelas
sensíveis e políticas de acesso. Referência: Seção 32 do Master Plan.

**Entrega 5.3 — Rate limiting**
Middleware em `src/middleware.ts` com Upstash Rate Limit nas rotas `/api/v1/`.
Sliding window 100 req/hora por API key. Headers obrigatórios.
Referência: Seção 32 do Master Plan.

**Entrega 5.4 — Autenticação**
Supabase Auth configurado. Middleware protegendo todas as rotas.
Sessões de 7 dias renováveis. Referência: Seção 32 do Master Plan.

**Entrega 5.5 — Monitoramento e cleanup**
Registro de tokens por chamada. Job diário de agregação de custo.
Jobs semanais de cleanup (briefings > 30 dias, snapshots > 7 dias).
Referência: Seções 33, 30 do Master Plan.

**Entrega 5.6 — Deploy**
Configurar Vercel com todas as variáveis de ambiente.
```bash
vercel --prod
```

**Critério de aceitação da Fase 5:**
72h sem erros com 2 influenciadores processando simultaneamente.

---

## Como iniciar esta sessão

1. Leia `docs/TikTok_Video_Copilot_Master_Plan_v3.md` completo
2. Leia `docs/TikTok_Copilot_Prompts_dos_Agentes_v1.md` completo
3. Responda as 4 perguntas de confirmação:
   - Qual é o objetivo central da plataforma em uma frase?
   - Qual é o componente mais crítico para a qualidade dos roteiros?
   - Qual a regra inviolável sobre o Proxy Decudo?
   - O que acontece quando o Agente Revisor dá score < 5.0?
4. Após confirmação, execute a **Entrega 1.1**:
   ```bash
   # Criar a estrutura de pastas e gerar o SQL do schema completo
   mkdir -p supabase/migrations docs worker inngest/functions src/lib src/app
   # Gerar supabase/migrations/001_schema_completo.sql
   ```
