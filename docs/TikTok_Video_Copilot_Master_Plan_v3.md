# 🎬 TikTok Video Copilot — Master Plan v3.0

> Documento de referência técnica para implementação completa da plataforma por uma IA de engenharia. Cada decisão de arquitetura está justificada. Cada comportamento esperado está especificado. Nenhum componente depende de suposição.

**Foco desta versão:** funcionamento perfeito do pipeline de extração, análise e geração de roteiros. Escalabilidade é objetivo secundário.

---

## Sumário

1. Proposta de Valor e Objetivo Técnico Central
2. Stack Tecnológica e Justificativas
3. Infraestrutura de Computação (incluindo Demucs)
4. Arquitetura Geral do Sistema
5. Sistema Anti-Detecção do TikTok
6. Integração Técnica do Proxy Decudo
7. Pipeline de Extração — Modo Inicial vs Monitoramento
8. Etapa de Download e Fallback
9. Etapa de Processamento de Áudio
10. Etapa de Transcrição
11. Sistema de Memória do Influenciador — Duas Camadas
12. Limites, Compressão e Consistência da Memória
13. Agentes de Análise — Contratos e Comportamento Esperado
14. Validação de Output dos Agentes
15. Agente Diretor — Orquestração de Análise
16. Estratégia de Cold Start (< 20 vídeos)
17. O Briefing de Geração — Contrato de Dados Agentes → Gerador
18. Prompt Mestre de Geração — Estrutura Completa
19. Critério de Seleção de Hook e Variáveis Criativas
20. Agente Revisor — Comportamento Completo em Aprovação e Reprovação
21. Geração em Lote — Diversidade Garantida
22. Fallback do RAG e Estratégias de Contexto Degradado
23. Formato Canônico do Roteiro de TikTok Shop
24. Fluxo de Edição de Roteiro no Frontend
25. Sistema de Feedback e Aprendizado Incremental
26. Monitor de Virais — Fórmula e Extração de Templates
27. Teleprompter — Especificação Técnica Completa
28. Algoritmo de Nível de Conhecimento (0–100%)
29. Banco de Dados — Schema Completo
30. Sistema de Filas e Jobs (Inngest)
31. Telas e Módulos da Plataforma
32. Segurança e Gestão de Chaves
33. Custo e Monitoramento
34. Fases de Desenvolvimento com Critérios de Aceitação
35. Regras e Princípios Invioláveis

---

## 1. Proposta de Valor e Objetivo Técnico Central

### O que a plataforma faz

O TikTok Video Copilot coleta o histórico completo de vídeos de um criador de conteúdo TikTok Shop, extrai os padrões comportamentais e linguísticos que definem sua voz, e usa esses padrões para gerar roteiros que o próprio influenciador poderia acreditar que saíram da sua cabeça.

### O que diferencia tecnicamente

A maioria das ferramentas gera roteiros com "escreva no estilo de X" — o modelo imita superfície. O Video Copilot constrói um modelo comportamental multidimensional real: cada vídeo alimenta nove dimensões independentes de memória (hook, CTA, emoção, vocabulário, ritmo, produto, viral, contexto e identidade). Na geração, essas dimensões são consultadas seletivamente via busca semântica e entregues ao gerador em uma estrutura de briefing precisa — não como um dump de texto, mas como um conjunto organizado de evidências que instrui a IA sobre como aquele criador específico pensa, fala e convence.

### O objetivo técnico central — não negociável

Gerar roteiros que passem no teste de autoria cega: um humano familiarizado com o influenciador não consegue distinguir se o roteiro foi gerado pela plataforma ou escrito pelo próprio criador.

---

## 2. Stack Tecnológica e Justificativas

### Frontend

**Next.js 14+ com App Router** — escolhido porque permite Server Components para reduzir bundle do cliente, API Routes para o backend da aplicação, e integração nativa com Vercel para deploy sem configuração. O App Router é obrigatório porque o sistema usa Streaming para resposta progressiva durante geração de roteiros.

**Tailwind CSS + shadcn/ui** — shadcn/ui fornece componentes acessíveis e customizáveis sem biblioteca de estilos proprietária. Tailwind garante consistência visual sem CSS global conflitante.

**Zustand** — gerenciamento de estado global simples para status de pipeline em tempo real recebido via WebSocket. Redux seria overhead desnecessário para este caso.

**Supabase Realtime** — WebSocket nativo do Supabase para atualizações de status de jobs e alertas de CAPTCHA sem polling. É a ponte entre o backend assíncrono e o frontend.

### Backend

**Supabase** — PostgreSQL gerenciado com extensão pgvector, Storage para arquivos temporários, Auth para autenticação, Edge Functions para lógica leve, e Realtime para WebSocket. Concentrar banco + autenticação + storage + realtime em um único serviço reduz drasticamente a complexidade de configuração e manutenção.

**Inngest** — processamento assíncrono de jobs de longa duração sem timeout. Supabase Edge Functions têm timeout de 150 segundos — insuficiente para Demucs (3-5 minutos) e análise de agentes (1-2 minutos). Inngest elimina esse limite e oferece retry configurável, dashboard de monitoramento e cron nativo.

**pgvector** — extensão PostgreSQL para armazenamento e busca de vetores de embedding diretamente no banco. Elimina a necessidade de um serviço vetorial separado (Pinecone, Weaviate) e garante transações ACID entre metadados e embeddings.

### IA e Modelos

**gemini-1.5-pro** — LLM principal para geração de roteiros e análise de agentes que requerem raciocínio profundo. Suporte nativo a áudio elimina a necessidade de pipeline de transcrição externa. Janela de 1M tokens permite injeção de contexto rico mesmo para influenciadores com histórico denso.

**gemini-1.5-flash** — LLM para tarefas rápidas: classificação, revisão leve, validação de JSON, geração de embeddings de consulta. 10x mais barato que o Pro para mesma qualidade em tarefas simples.

**text-embedding-004 (Google)** — modelo de embedding de 768 dimensões otimizado para recuperação semântica. Escolhido por: integração no mesmo ecossistema Google (mesma API key), custo muito baixo (~$0.0001/1000 tokens), e qualidade de embedding superior para português brasileiro em comparação com alternativas abertas.

### Scraping e Download

**Playwright + playwright-extra + puppeteer-stealth** — Playwright é o único framework de automação de browser com suporte completo a Chromium em modo headless moderno. O plugin stealth é obrigatório para mascarar as propriedades que identificam automação ao TikTok.

**yt-dlp** — ferramenta em Python, mantida ativamente, com suporte nativo ao TikTok incluindo rotação de URLs de CDN. É a solução mais robusta para download de vídeos do TikTok sem autenticação. Não usa proxy — downloads vão direto à CDN do TikTok.

**Decudo (proxy 4G)** — proxy de rede móvel para scraping de metadados. IPs de operadoras móveis são indistinguíveis de usuários reais para o sistema anti-bot do TikTok. Usado exclusivamente para coleta de metadados, nunca para download.

### Processamento de Áudio

**Demucs (modelo htdemucs_ft)** — modelo de separação de fontes sonoras da Meta AI. O modelo `htdemucs_ft` é fine-tuned para voz sobre música, que é exatamente o caso de vídeos de TikTok Shop. Sem separação vocal, a transcrição de vídeos com música de fundo tem acurácia de 60-70%. Com separação, sobe para 90-95%.

**FFmpeg** — processamento de áudio padrão: extração de canal de áudio do vídeo, normalização de formato, compressão para MP3 64kbps.

### Segurança

**@noble/ciphers (AES-256-GCM)** — criptografia de chaves sensíveis no banco. Biblioteca JavaScript pura sem dependências nativas, funciona em Edge Functions e Node.js.

**Upstash Rate Limit** — rate limiting baseado em Redis serverless para as APIs externas. Sem estado local — funciona em múltiplas instâncias sem sincronização.

---

## 3. Infraestrutura de Computação para Demucs

### O problema

Demucs é um modelo de deep learning que requer PyTorch com pelo menos 4GB de RAM e, idealmente, GPU para processamento em tempo viável. Nenhum serviço serverless (Vercel Functions, Supabase Edge Functions, Inngest) suporta esse requisito.

### A solução: Worker dedicado em Railway ou Fly.io

O processamento de áudio (Demucs + FFmpeg) roda em um **worker Python dedicado** hospedado em Railway ou Fly.io — serviços que suportam containers Docker de longa duração com recursos configuráveis.

**Especificação do worker:**
- Runtime: Python 3.11 com PyTorch CPU (sem GPU necessária para volume inicial)
- Recursos mínimos: 2 vCPU, 4GB RAM (Railway Hobby: ~$5/mês)
- Container: Docker com PyTorch + Demucs + FFmpeg pré-instalados
- Comunicação: o worker consome uma fila de jobs do Inngest, baixa o arquivo de vídeo do Supabase Storage, processa, faz upload do MP3 resultante e atualiza o status no banco
- Escalabilidade: se o volume de vídeos aumentar, aumentar a instância (vertical) antes de escalar horizontal

**Fluxo de comunicação:**

O job `audio.separate` no Inngest não executa o Demucs diretamente. Ele envia uma mensagem para o worker via HTTP (webhook) ou via evento Inngest que o worker está inscrito. O worker processa e, ao concluir, chama de volta um endpoint `/api/internal/audio-complete` que atualiza o banco e dispara o próximo job na fila.

**Por que não usar Vercel ou Supabase para isso:** Edge Functions têm timeout de 150s e memória limitada. Demucs pode levar 3-5 minutos em CPU para um vídeo de 60 segundos. Qualquer solução serverless vai falhar por timeout.

---

## 4. Arquitetura Geral do Sistema

O sistema tem quatro camadas funcionais com separação clara de responsabilidades:

**Camada 1 — Coleta (Scraper + Downloader):** responsável por descobrir vídeos, coletar metadados e baixar mídia. Opera de forma assíncrona via Inngest. Nunca bloqueia o frontend.

**Camada 2 — Processamento (Áudio + Transcrição):** responsável por transformar vídeos em texto limpo. Demucs roda no worker dedicado. Transcrição via Gemini Audio. Ambos alimentam o banco com texto e metadados de timing.

**Camada 3 — Inteligência (Agentes + Memória):** responsável por extrair padrões das transcrições, atualizar a memória vetorial e estruturada, e manter o modelo comportamental do influenciador atualizado e preciso.

**Camada 4 — Geração (Prompt Mestre + Revisor):** responsável por transformar o modelo comportamental do influenciador em roteiros concretos para produtos específicos. Esta é a camada de maior impacto na qualidade percebida.

O frontend consome apenas APIs REST e WebSocket — nunca acessa diretamente o banco, o scraper ou os agentes. Toda a lógica de negócio está no backend.

```
FRONTEND (Next.js)
      │
      ▼ API Routes
BACKEND (Next.js API + Supabase Edge Functions)
      │
      ├──► INNGEST (orquestração de jobs)
      │         ├──► Scraping Layer (Playwright + Decudo)
      │         ├──► Download Layer (yt-dlp)
      │         ├──► Worker Python (Demucs + FFmpeg) [Railway]
      │         ├──► Transcrição (Gemini Audio)
      │         └──► Sistema de Agentes (Gemini Pro/Flash)
      │
      ├──► SUPABASE
      │         ├──► PostgreSQL (dados + memória estruturada)
      │         ├──► pgvector (embeddings)
      │         ├──► Storage (arquivos temporários)
      │         └──► Realtime (WebSocket para frontend)
      │
      └──► GEMINI API (LLM + Embeddings)
```

---

## 5. Sistema Anti-Detecção do TikTok

O TikTok usa múltiplos vetores de detecção simultâneos. A solução precisa endereçar todos eles de forma integrada — desabilitar qualquer um compromete todo o sistema.

### Vetor 1 — Fingerprinting de Navegador

O TikTok coleta fingerprints de Canvas, WebGL e AudioContext via JavaScript. Navegadores headless têm valores padrão identificáveis.

Solução: `playwright-extra` com `puppeteer-stealth` injeta scripts antes do carregamento de qualquer página para: randomizar valores de Canvas fingerprint por sessão mantendo consistência intra-sessão, substituir WebGL Renderer por valores de placas de vídeo reais (lista curada de modelos comuns), mascarar AudioContext para retornar valores coerentes com o hardware simulado, e corrigir todas as propriedades de `navigator` que identificam automação.

### Vetor 2 — Detecção de Headless

Propriedades como `navigator.webdriver`, ausência de plugins, dimensões de tela atípicas e ausência de `window.chrome` identificam headless browsers.

Solução: o plugin stealth remove `navigator.webdriver`, injeta estrutura realista de `window.chrome`, corrige dimensões de viewport para valores comuns de dispositivos reais (iPhone 14 Pro: 390×844), e simula a presença de plugins típicos de browsers móveis.

### Vetor 3 — Análise Comportamental

O TikTok analisa velocidade de scroll, timing de cliques, trajetória de mouse e padrões de interação para identificar automação.

Solução — sistema de comportamento sintético humano:
- Delay base entre ações: 2.000ms a 8.000ms em distribuição normal (não uniforme — automação usa uniforme)
- Micro-delays adicionais: 50ms a 300ms entre sub-ações dentro de uma mesma interação
- Scroll: em múltiplos passos com aceleração inicial e desaceleração no final (curva de bezier temporal)
- Padrão de fadiga: ações ficam progressivamente mais lentas após 20+ interações consecutivas, simulando cansaço humano
- Pausa periódica: a cada 5-15 ações, pausa de 3 a 12 segundos sem nenhuma interação

### Vetor 4 — Rate Limiting por Sessão

Sessões que coletam dados em ritmo acima do humano são identificadas independentemente do fingerprint.

Limites configurados e invioláveis:
- Máximo de 30 vídeos de metadados por hora por influenciador
- Intervalo mínimo de 45 minutos entre sessões do mesmo influenciador
- Máximo de 2 sessões simultâneas no sistema inteiro (não por influenciador)
- Horários preferenciais: 8h às 23h (horário de Brasília — quando o TikTok espera tráfego brasileiro)

### Vetor 5 — Consistência de Sessão e Cookies

O TikTok verifica consistência de cookies entre requisições. Sessões que não mantêm cookies coerentes são sinalizadas.

Solução: perfis de browser persistidos em disco entre sessões. Cada perfil contém cookies, localStorage e IndexedDB salvos via `storageState` do Playwright. Pool de mínimo 5 perfis por influenciador. Rotação round-robin entre perfis. Perfil com CAPTCHA repetido em menos de 1 hora entra em quarentena de 24 horas. Ao criar um perfil novo, simular atividade inicial de "aquecimento" (navegar para home, rolar brevemente) antes de iniciar scraping.

### Vetor 6 — IP de Datacenter

IPs de datacenters são flagados automaticamente pelo sistema anti-bot do TikTok.

Solução: Proxy Decudo com IPs de operadoras móveis 4G reais. Esses IPs são indistinguíveis de usuários reais no modelo de ameaças do TikTok.

### Resolução Manual de CAPTCHA

Fluxo quando CAPTCHA é detectado:

1. O scraper detecta CAPTCHA via: seletor CSS `.captcha-verify-container`, mudança de URL para padrão `/captcha`, ou título da página contendo "Verify"
2. Salvar estado completo do job: URL atual, lista de vídeos já coletados, posição no scroll, cookies da sessão
3. Inserir registro em `captcha_alerts` com `estado_salvo` e `status = 'aguardando'`
4. Supabase Realtime dispara evento para o frontend
5. Frontend exibe badge vermelho pulsante com botão "Resolver CAPTCHA"
6. Operador clica: o sistema muda o browser de headless para modo visível
7. Browser abre na tela do servidor (via VNC ou desktop remoto) ou o job é roteado para uma máquina local configurada
8. Operador resolve manualmente
9. Sistema detecta resolução (CAPTCHA desaparece do DOM)
10. Atualizar `captcha_alerts.status = 'resolvido'`
11. Job retoma a partir do estado salvo — nenhum dado coletado antes do CAPTCHA é perdido

**Nota sobre VNC:** para operação headless em servidor remoto, o worker do scraper deve ter um servidor VNC configurado para exibir o browser quando necessário. Alternativa: o job CAPTCHA envia a sessão serializada para um endpoint local (máquina do operador) que abre o browser localmente para resolução.

---

## 6. Integração Técnica do Proxy Decudo

### Regra fundamental e inviolável

Decudo é cobrado por megabyte de dados trafegados. Um vídeo de TikTok Shop tem entre 5MB e 50MB. Usar o proxy para downloads destruiria a franquia em 2-3 dias de operação.

**Decudo é usado exclusivamente para:**
- Navegação no perfil do influenciador
- Scroll do feed para descoberta de vídeos
- Coleta de metadados (views, likes, URL do vídeo)
- Nenhuma outra operação

**Decudo nunca é usado para:**
- Download de arquivos de vídeo
- Download de arquivos de áudio
- Qualquer requisição de mídia

Estimativa de consumo: scraping completo de 100 vídeos (metadados) consome aproximadamente 8MB de franquia Decudo.

### Configuração técnica

O Playwright é inicializado com o proxy Decudo definido tanto no `launch()` quanto no `newContext()`. O proxy tem autenticação HTTP básica (usuário e senha). As credenciais são armazenadas criptografadas no banco e descriptografadas em memória apenas no momento de inicialização do browser — nunca em variáveis de ambiente expostas ou logs.

A rotação de IP do Decudo ocorre a cada sessão completa. Nunca usar o mesmo IP em duas sessões consecutivas do mesmo influenciador. O mapeamento IP → perfil de browser é mantido para garantir consistência de cookies.

---

## 7. Pipeline de Extração — Modo Inicial vs Monitoramento

### Por que esses são dois modos distintos

O modo inicial coleta o histórico completo de um influenciador — pode ser 500, 1.000 ou 2.000 vídeos. Esse processo pode levar horas e deve ser resiliente a interrupções, com retomada de onde parou.

O monitoramento contínuo coleta apenas vídeos publicados após a última coleta. Deve ser rápido (terminar em minutos), discreto, e nunca re-scraping de vídeos já coletados.

Tratar os dois como o mesmo processo resulta em: re-scraping desnecessário durante monitoramento (gasta franquia Decudo), e lentidão no modo inicial por não ter otimizações específicas.

### Modo Inicial — Coleta Histórica Completa

**Trigger:** cadastro de novo influenciador ou solicitação manual de re-scan.

**Comportamento:**
- Navegar para o perfil e coletar a data do vídeo mais antigo visível
- Scroll progressivo do topo até o fundo do feed
- Para cada vídeo encontrado: verificar se `tiktok_video_id` já existe no banco (deduplicação) — se existir, pular silenciosamente
- Salvar checkpoint a cada 50 vídeos coletados (data do último vídeo processado)
- Se o job for interrompido: retomar a partir do último checkpoint
- Ao concluir: atualizar `influenciadores.ultimo_scraping_at` com timestamp atual e `influenciadores.total_videos` com contagem real
- Disparar jobs de download para todos os novos vídeos encontrados

**Limite de segurança:** máximo de 500 vídeos por execução de job. Se o influenciador tem mais, criar um segundo job encadeado que continua a partir do checkpoint.

### Modo Monitoramento — Coleta Incremental

**Trigger:** Inngest Cron a cada hora, para cada influenciador com `status_pipeline = 'ativo'`.

**Comportamento:**
- Consultar `influenciadores.ultimo_scraping_at` do banco
- Navegar para o perfil e coletar apenas vídeos publicados APÓS aquela data
- Scroll máximo de 20 posições (suficiente para capturar novos vídeos sem re-scraping)
- Se o primeiro vídeo encontrado já existe no banco: parar o scroll imediatamente
- Para cada novo vídeo encontrado: verificar deduplicação e inserir se novo
- Atualizar `ultimo_scraping_at` com timestamp atual ao concluir
- Para vídeos existentes: atualizar métricas (views, likes, comments, shares) — sem re-download

**O monitoramento nunca baixa vídeos já processados. Apenas atualiza métricas de engajamento e detecta novos vídeos.**

---

## 8. Download de Vídeos e Fallback

**Responsável:** Job `media.download` (um job por vídeo, disparado pelo modo inicial ou monitoramento)

**Processo:**
1. Recuperar `url` do vídeo no banco
2. Tentar download via yt-dlp com qualidade máxima de 720p (evitar arquivo desnecessariamente grande)
3. Verificar integridade do arquivo após download (tamanho > 0, formato válido)
4. Fazer upload para Supabase Storage em `videos/{influencer_id}/{video_id}.mp4`
5. Deletar arquivo local imediatamente após upload bem-sucedido
6. Atualizar `videos.status = 'baixado'`

**Fallback:** se yt-dlp falhar após 3 tentativas com erros de rede ou URL inválida, tentar um endpoint alternativo de scraping de vídeo (RapidAPI TikTok Scraper ou similar). Se o fallback também falhar, marcar `videos.status = 'falha_download'` e `videos.tentativas_download` com o contador. O pipeline continua para os demais vídeos.

**Vídeos deletados:** se yt-dlp retornar HTTP 404 ou 410, marcar imediatamente como `status = 'indisponivel'` sem retry — vídeo foi apagado pelo criador ou pela plataforma.

---

## 9. Processamento de Áudio

### Por que a separação vocal é obrigatória, não opcional

Vídeos de TikTok Shop frequentemente têm música de fundo em trending, efeitos sonoros e ruído ambiente. A transcrição do áudio bruto misturado resulta em:
- Substituições fonéticas incorretas (música de fundo causa "alucinação" do transcritor)
- Palavras inventadas que não existem na fala real do influenciador
- CTAs transcritas erradas — o erro mais crítico possível para o aprendizado dos agentes

Acurácia sem separação: 60-70%. Com separação via Demucs: 90-95%.

### Processo no Worker Python (Railway)

O job `audio.separate` é disparado pelo Inngest e processado pelo worker Python dedicado em Railway:

1. Receber evento do Inngest com `video_id` e caminho no Storage
2. Baixar o arquivo `.mp4` do Supabase Storage para disco local do worker
3. FFmpeg extrai canal de áudio em WAV mono, 16kHz (formato otimizado para modelos de voz)
4. Demucs modelo `htdemucs_ft` separa vocais da música de fundo
5. Resultado: dois arquivos — `vocals.wav` e `no_vocals.wav`
6. `no_vocals.wav` é deletado imediatamente — nunca é usado
7. FFmpeg converte `vocals.wav` para MP3 a 64kbps (suficiente para transcrição, menor arquivo)
8. Upload do MP3 para Supabase Storage em `audios/{influencer_id}/{video_id}.mp3`
9. Deletar o arquivo `.mp4` do Storage (não é mais necessário)
10. Deletar todos os arquivos temporários locais do worker
11. Chamar endpoint `/api/internal/audio-complete` no backend principal com `video_id`
12. Backend atualiza `videos.status = 'audio_processado'` e dispara job de transcrição

**Tempo estimado:** 15-40 segundos por vídeo em CPU (2 vCPU). GPU reduziria para 3-8 segundos mas não é necessário para o volume inicial.

---

## 10. Transcrição

**Responsável:** Job `audio.transcribe`

O Gemini 1.5 Pro aceita arquivos de áudio diretamente como input, sem necessidade de transcrição prévia. Isso elimina um serviço externo (Whisper, Assembly AI) e mantém tudo no ecossistema Google.

**Processo:**
1. Baixar MP3 do Supabase Storage para `/tmp/`
2. Enviar para Gemini 1.5 Pro com o áudio e o prompt de transcrição especializado
3. Salvar resultado no banco
4. Deletar MP3 do Storage imediatamente após transcrição bem-sucedida
5. Deletar arquivo local
6. Atualizar `videos.status = 'transcrito'`

**Prompt de transcrição:**

O prompt instrui o Gemini a transcrever com precisão preservando a fala natural — incluindo gírias, vícios de linguagem, expressões coloquiais e pausas (marcadas como `[...]`). Explicitamente proibido: corrigir gramática, normalizar vocabulário, ou remover repetições. O output deve ser JSON com dois campos: `texto_completo` (string) e `segmentos` (array de objetos com `start_ms`, `end_ms` e `texto`). O prompt especifica que o output deve ser somente JSON válido, sem markdown, sem preamble.

**Validação:** após receber o output do Gemini, o sistema tenta parsear o JSON. Se o parse falhar, faz um retry único com prompt adicional pedindo apenas o JSON sem qualquer outro texto. Se o segundo retry falhar, salva o texto bruto como `texto_completo` sem segmentos, com flag `qualidade_transcricao = 0.5`, e continua o pipeline.

---

## 11. Sistema de Memória do Influenciador — Duas Camadas

A memória é o que transforma um gerador de texto genérico em um gerador de voz específica. Ela opera em duas camadas complementares, cada uma respondendo a um tipo diferente de consulta.

### Camada 1 — Memória Vetorial (pgvector)

**O que é:** chunks de transcrição com embeddings de 768 dimensões, consultáveis por similaridade semântica.

**Para que serve:** recuperar exemplos contextuais específicos para um produto ou cenário durante a geração. Responde à pergunta: "Quais trechos do histórico do influenciador são mais relevantes para falar sobre o produto X no cenário Y?"

**Como é populada:** cada transcrição é dividida em chunks de 150 palavras com overlap de 30 palavras. Cada chunk recebe um embedding via `text-embedding-004`. Chunks são salvos na tabela `memoria_chunks` com o vetor.

**Como é consultada:** durante a geração, uma consulta de busca é montada a partir do produto e cenário, convertida em embedding, e o pgvector retorna os top-K chunks mais similares acima de um threshold de similaridade.

### Camada 2 — Memória Estruturada (JSONB)

**O que é:** dados organizados por dimensão comportamental (hooks, CTAs, vocabulário, emoção, ritmo, produto, viral, contexto), mantidos como JSONB no banco.

**Para que serve:** fornecer o perfil comportamental sintetizado do influenciador durante a geração — sem precisar de busca semântica. Responde à pergunta: "Qual é o padrão geral de comportamento deste influenciador em cada dimensão?"

**Como é populada:** os agentes especializados atualizam suas respectivas dimensões após analisar cada vídeo. A atualização é incremental — novos padrões são mesclados com os existentes.

**Como é consultada:** carregada completa no início de cada geração. É o contexto estrutural. A memória vetorial é o contexto específico.

### Por que as duas camadas são necessárias

A memória estruturada sozinha é genérica demais (percentuais e padrões estatísticos). A memória vetorial sozinha é cara e imprecisa (depende de similaridade semântica que pode não encontrar nada para produtos novos). Juntas, a estruturada fornece o perfil comportamental e a vetorial fornece os exemplos concretos mais relevantes para aquela geração específica.

---

## 12. Limites, Compressão e Consistência da Memória

### O problema de crescimento ilimitado

Com 2.000 vídeos processados, um array de exemplos em JSONB pode acumular 2.000 entradas por padrão. Isso causa:
- Consultas JSONB lentas (PostgreSQL escaneia o array inteiro)
- Contexto de geração enorme demais (todos os exemplos não cabem no prompt)
- Padrões antigos e irrelevantes diluindo padrões recentes e mais representativos

### Limites obrigatórios por dimensão

Cada padrão dentro de cada dimensão tem um limite máximo de exemplos salvos:

- **Hooks:** máximo 10 exemplos por tipo de hook. Total máximo: 80 exemplos (8 tipos × 10)
- **CTAs:** máximo 10 exemplos por tipo. Total máximo: 60 exemplos
- **Vocabulário:** máximo 50 expressões características, 30 gírias, 20 vícios de linguagem
- **Emoção:** máximo 5 exemplos de arco emocional por tipo de arco
- **Ritmo:** dados agregados (médias), não exemplos individuais — sem limite
- **Produto:** máximo 10 exemplos por categoria de produto
- **Viral:** máximo 20 templates virais ativos

### Política de compressão quando o limite é atingido

Quando um array atinge seu limite, a compressão funciona assim:

1. Ordenar os exemplos existentes por `performance_media_views` (descendente)
2. Manter os top-60% melhores performers
3. Avaliar os 40% restantes: se o novo exemplo a ser inserido tem performance superior ao pior da lista, substituir o pior
4. Se o novo exemplo tem performance inferior ao pior da lista, descartar o novo exemplo
5. Atualizar o campo `frequencia` do padrão com base na proporção de ocorrências nos vídeos processados

### Consistência e versionamento

A cada atualização da memória estruturada, incrementar `memorias_estruturadas.versao`. Manter snapshot da versão anterior por 7 dias em uma tabela separada `memorias_historico`. Isso permite rollback se uma análise corrompida for detectada.

### Validação de saída dos agentes (crítico)

LLMs retornam JSON com frequência de falha de 3-5% por chamada. Com 7 agentes em paralelo, a probabilidade de pelo menos um falhar é ~25% por vídeo. Sem validação, dados inválidos corrompem a memória silenciosamente.

Para cada agente:
1. O output é recebido como string do Gemini
2. Tentativa de parse JSON com validação de schema (campos obrigatórios e tipos)
3. Se o parse falhar: retry imediato com prompt adicional instruindo saída apenas em JSON válido
4. Se o segundo parse falhar: o agente retorna `{ confianca: 0, padroes_extraidos: {}, memoria_atualizada: memoria_atual }` — ou seja, não atualiza nada e preserva a memória como está
5. Flag `baixa_confianca: true` é registrada nos logs do job para monitoramento
6. A dimensão deste agente não é atualizada para este vídeo, mas o pipeline continua

**A memória nunca é atualizada com dados inválidos. Em caso de falha de agente, o vídeo é marcado como processado com flag de confiança baixa, e pode ser re-analisado manualmente.**

---

## 13. Agentes de Análise — Contratos e Comportamento Esperado

Todos os agentes são chamadas ao Gemini com prompts especializados. Cada agente recebe: a transcrição completa do vídeo, os metadados de engajamento (views, likes, etc.), e a memória atual da sua dimensão. Cada agente retorna: os padrões encontrados neste vídeo, a memória atualizada (mesclagem de atual + novos), um score de confiança (0.0 a 1.0), e observações livres.

### Agente Hook

**Missão:** identificar e classificar o gancho de abertura do vídeo — os primeiros 3 a 8 segundos que determinam se o espectador continua assistindo.

**O que analisa:** os primeiros 15-20% do texto da transcrição. Identifica o tipo de hook, extrai o texto exato, estima a duração, avalia a força do gancho em uma escala de 1 a 10.

**Tipos de hook classificados:**
- `pergunta_chocante`: pergunta que gera curiosidade ou choque ("Você sabe quanto custa isso?")
- `afirmacao_bold`: afirmação forte e direta sobre o produto ou resultado ("Esse produto mudou minha pele em 7 dias")
- `historia_pessoal`: começa com experiência pessoal ("Eu sofri com isso por anos")
- `problema_comum`: identifica um problema que o público reconhece ("Se você tem cabelo oleoso, isso é pra você")
- `comparacao`: compara diretamente com alternativa ("Esse custa 1/3 do preço do Samsung")
- `numero_especifico`: usa número ou estatística como gancho ("47 mil pessoas já compraram isso")
- `novidade`: "acabei de descobrir / chegou agora / lançamento exclusivo"
- `antes_depois`: promessa explícita de transformação

**Como atualiza a memória:** para cada tipo de hook encontrado, adicionar o exemplo ao array correspondente. Se o array está no limite, aplicar política de compressão. Atualizar `frequencia` do tipo com base na proporção acumulada. Atualizar `performance_media_views` com média ponderada (mais recentes têm peso maior).

### Agente CTA

**Missão:** mapear todas as chamadas para ação do vídeo, não apenas a CTA final.

**O que analisa:** o texto completo em busca de todos os momentos em que o influenciador pede uma ação do espectador.

**Para cada CTA encontrada, extrai:** texto exato, posição no vídeo em percentual, tipo (link_bio / comentario / salvar / compartilhar / comprar_agora / seguir), urgência (baixa / media / alta / extrema), emoção associada (curiosidade / medo_de_perder / prova_social / exclusividade / pertencimento), e efetividade estimada baseada no engajamento do vídeo.

**Padrões especiais de urgência para monitorar:** "corre", "só hoje", "acabando", "últimas unidades", "enquanto tem", "antes que suba o preço".

**Como atualiza a memória:** separa CTAs por tipo e por nível de urgência. Registra a posição percentual no vídeo onde cada tipo aparece — isso alimenta a lógica de timing do roteiro gerado.

### Agente Emoção

**Missão:** mapear a jornada emocional do vídeo do início ao fim.

**O que analisa:** todo o texto, identificando transições emocionais e intensidade em cada trecho.

**Emoções mapeadas:** curiosidade, surpresa, identificacao, desejo, confianca, urgencia, satisfacao, humor, empatia, medo_perda.

**Output principal:** arco emocional como array ordenado de pontos `{ posicao_percentual, emocao, intensidade }`, emoção dominante do vídeo, transição emocional principal (a mudança mais impactante: de qual emoção para qual, em qual momento), e compatibilidade com tipos de produto (quais categorias de produto funcionam bem com este arco emocional específico).

**Como atualiza a memória:** arcos emocionais são agrupados por padrão de transição principal. Arcos similares são mesclados para identificar os padrões emocionais mais usados pelo influenciador e sua correlação com performance.

### Agente Vocabulário

**Missão:** construir o léxico único do influenciador — o que torna seu jeito de falar inconfundível.

**O que analisa:** o texto completo com foco em padrões linguísticos idiossincráticos, não estatísticos gerais.

**Extrai:**
- `expressoes_caracteristicas`: frases que parecem marca registrada ("demais da conta", "olha que coisa")
- `girias_proprias`: termos informais ou inventados específicos deste criador
- `vicios_linguagem`: palavras usadas com frequência acima do normal ("cara", "tipo", "né", "mano")
- `nivel_formalidade`: escala de 1 (muito informal) a 10 (formal)
- `ritmo_frases`: curtas_e_diretas / longas_e_explicativas / misto
- `marcadores_transicao`: expressões que ele usa para mudar de assunto ou tema ("mas olha", "e aí", "agora")
- `expressoes_raras_impactantes`: expressões que aparecem raramente mas nos momentos de maior impacto — esses são os marcadores de voz mais valiosos

**Nota crítica sobre expressões raras:** a voz de um criador não é apenas suas palavras mais frequentes. É também as expressões incomuns que ele usa deliberadamente nos momentos-chave. O agente deve identificar explicitamente expressões que aparecem em menos de 10% dos vídeos mas coincidem com os momentos de maior engajamento (pico de views no segmento, comentários positivos). Esses são os diamantes da voz do influenciador.

**Como atualiza a memória:** mantém contadores de frequência por expressão. Expressões raras mas de alto impacto são marcadas com flag `alta_relevancia_criativa` independentemente da frequência.

### Agente Ritmo

**Missão:** caracterizar o padrão de fala do influenciador para calibrar o teleprompter e o timing dos roteiros.

**O que analisa:** transcrição com timestamps dos segmentos para calcular velocidade e padrões.

**Extrai:**
- `velocidade_media_wpm`: palavras por minuto calculadas pela contagem de palavras dividida pela duração total
- `velocidade_por_bloco`: variação de velocidade ao longo do vídeo (começo vs meio vs final)
- `padroes_pausa`: posições percentuais onde há pausas superiores a 1 segundo (identificadas por gaps entre segmentos de transcrição)
- `tecnica_enfase`: como ele enfatiza palavras importantes — por pausa antes, por repetição, por alongamento de vogal (identificável por "[...]" na transcrição)
- `momento_aceleracao`: percentual do vídeo onde o ritmo claramente acelera (tipicamente no CTA final)

**Como atualiza a memória:** dados de ritmo são agregados como médias ponderadas, não como lista de exemplos. A memória de ritmo é numérica, não textual. Isso alimenta diretamente o algoritmo de velocidade de rolagem do teleprompter.

### Agente Produto

**Missão:** entender como este influenciador apresenta diferentes categorias de produto e quais ângulos usa para cada uma.

**O que analisa:** o texto completo com foco em como o produto é introduzido, descrito e vendido.

**Extrai:**
- `categoria_produto`: classificação da categoria (eletrônicos / moda / beleza / casa / fitness / alimentação / outro)
- `subcategoria`: mais específico quando possível
- `angulo_apresentacao`: review_honesto / demonstracao_pratica / comparacao / historia_pessoal / lifestyle
- `atributos_destacados`: o que ele mais enfatiza (preço / qualidade / praticidade / resultado / exclusividade)
- `objecoes_tratadas`: quais dúvidas comuns o influenciador antecipa e responde no vídeo
- `elementos_prova`: que tipo de prova ele usa (resultado_proprio / numero / comparativo / depoimento_terceiro)
- `posicionamento_preco`: como ele apresenta o preço (revela cedo / revela tarde / nunca revela / compara com alternativa cara)

**Como atualiza a memória:** para cada categoria de produto, mantém um perfil de apresentação preferida. Se o influenciador apresenta celulares de um jeito e cosméticos de outro, a memória reflete essa distinção por categoria.

### Agente Viral

**Ativação:** somente para vídeos com `viral_score >= 70`.

**Missão:** identificar o elemento específico que diferenciou este vídeo e torná-lo reutilizável.

**O que analisa:** o texto completo em busca do elemento ou momento que provavelmente catalisou a viralização.

**Extrai:**
- `elemento_viral_principal`: categorização do elemento (hook_muito_forte / produto_novo_surpreendente / preco_chocante / transformacao_visual / timing_trend / emocao_muito_alta / informacao_exclusiva / humor_inesperado / revelacao_progressiva)
- `momento_gatilho`: percentual do vídeo onde o elemento viral aparece
- `replicabilidade`: pode ser replicado em outros produtos? (alta / media / baixa + justificativa)
- `template_extraido`: descrição detalhada do padrão como template reutilizável, com a estrutura sequencial que pode ser aplicada a outros produtos
- `categorias_compativeis`: tipos de produto onde este padrão funciona
- `categorias_incompativeis`: tipos de produto onde este padrão provavelmente não funciona

**Como atualiza a memória:** cada template viral é armazenado como entrada independente em `templates_virais`. A memória estruturada de virais mantém os 20 templates mais recentes e mais replicáveis.

### Agente Revisor

**Ativação:** após a geração de qualquer roteiro, antes de entregar ao usuário.

**Missão:** garantir que o roteiro gerado passa nos critérios de autenticidade, estrutura, potencial viral e adequação ao produto antes de chegar ao usuário.

O funcionamento completo do Agente Revisor está descrito na Seção 20.

---

## 14. Validação de Output dos Agentes

Este é um ponto crítico para a integridade do sistema. Repetindo por importância:

**Fluxo de validação:**

1. Receber string de resposta do Gemini
2. Tentar `JSON.parse(resposta)` — se falhar, ir para retry
3. Validar schema: verificar se campos obrigatórios existem e têm tipos corretos — se falhar, ir para retry
4. Validar valores: verificar se scores estão no range correto (0-10, 0-1.0), se strings não estão vazias onde obrigatórias — se falhar, ir para retry
5. **Retry:** chamar o Gemini novamente com o mesmo prompt + instrução adicional: "Sua resposta anterior não estava em JSON válido. Responda APENAS com o JSON, sem nenhum texto antes ou depois."
6. Se o segundo parse também falhar: o agente retorna `{ status: 'falha', confianca: 0, memoria_atualizada: memoria_atual_sem_alteracao }`
7. O job continua para os outros agentes. Este vídeo recebe flag `analise_parcial: true`
8. A memória desta dimensão permanece inalterada para este vídeo

**Regra inviolável:** a memória nunca é atualizada com dados não validados.

---

## 15. Agente Diretor — Orquestração de Análise

O Agente Diretor não é um LLM — é a lógica de orquestração que coordena os outros agentes. É implementado como função JavaScript/TypeScript no Inngest.

### Fluxo de orquestração de análise (por vídeo)

**Fase 1 — Carregamento de contexto (paralelo):**
Carregar simultaneamente: transcrição completa, metadados de engajamento, memórias estruturadas de todas as 7 dimensões.

**Fase 2 — Análise paralela dos agentes base:**
Disparar simultaneamente os 6 agentes base: Hook, CTA, Emoção, Vocabulário, Ritmo, Produto. Todos recebem a mesma transcrição e metadados, mas cada um acessa apenas a memória da sua dimensão.

**Fase 3 — Análise condicional:**
Calcular `viral_score` com base nos metadados. Se `viral_score >= 70`: disparar Agente Viral. Caso contrário: pular.

**Fase 4 — Coleta e validação de resultados:**
Aguardar conclusão de todos os agentes (com timeout individual de 60 segundos por agente). Aplicar validação de schema em cada output. Separar agentes com sucesso dos que falharam.

**Fase 5 — Atualização da memória:**
Para cada agente com sucesso: atualizar a dimensão correspondente na tabela `memorias_estruturadas` usando a `memoria_atualizada` retornada pelo agente. Para agentes que falharam: preservar memória anterior sem alteração.

**Fase 6 — Geração de embeddings:**
Chunk a transcrição em blocos de 150 palavras com overlap de 30. Para cada chunk: gerar embedding via `text-embedding-004`. Inserir na tabela `memoria_chunks`. Este passo é sequencial (não paralelo) para evitar rate limiting da API de embeddings.

**Fase 7 — Recalcular Nível de Conhecimento:**
Executar o algoritmo da Seção 28 e atualizar o campo `nivel_conhecimento_ia` do influenciador.

**Fase 8 — Atualizar status:**
Marcar o vídeo como `status = 'analisado'` no banco.

---

## 16. Estratégia de Cold Start (< 20 vídeos)

### O problema

Com 10 vídeos processados e nível de conhecimento de 15%, a IA gera roteiros com base em evidências insuficientes. Se o usuário recebe roteiros fracos logo de início, abandona a plataforma antes de ela acumular conhecimento suficiente para mostrar seu valor real.

### Três comportamentos distintos por nível

**Nível 0-20% (cold start real):**
- A plataforma NÃO gera roteiros automaticamente
- Exibe mensagem clara: "A IA está aprendendo. Com [N] vídeos analisados de [total], o nível de conhecimento está em [X]%. Aguarde [estimativa] para geração de qualidade."
- Mostra barra de progresso do pipeline em tempo real
- Opcional: permitir geração com aviso explícito de "roteiro experimental — confiança baixa"
- Se a geração experimental for solicitada: usar apenas memória estruturada disponível, sem RAG (poucos chunks), com todos os parâmetros de confiança baixa sinalizados no output

**Nível 21-40% (aprendizado ativo):**
- Permite geração mas exibe badge "Confiança: Moderada" no roteiro
- O Agente Revisor é mais tolerante neste nível — aprova roteiros com score_geral >= 60 (em vez de >= 70)
- O RAG usa threshold reduzido (0.60 em vez de 0.75) para compensar a menor densidade de chunks
- O usuário vê claramente na UI que o roteiro vai melhorar conforme mais vídeos forem processados

**Nível 41%+ (operacional):**
- Comportamento padrão descrito no restante deste documento

### Estimativa de tempo para cold start

A UI exibe estimativa baseada em:
- Total de vídeos descobertos no perfil
- Quantidade já processada
- Velocidade média de processamento do pipeline (calculada a partir dos últimos 10 jobs concluídos)
- Exemplo: "93 vídeos na fila. Estimativa: 47 minutos para atingir 40% de conhecimento"

---

## 17. O Briefing de Geração — Contrato de Dados Agentes → Gerador

O Briefing de Geração é a estrutura de dados que o Agente Diretor monta antes de chamar o Prompt Mestre. É o contrato exato entre os agentes de análise e o gerador de roteiro. Nada que não esteja no briefing chega ao gerador.

### Estrutura completa do Briefing de Geração

```
BRIEFING DE GERAÇÃO
{
  influenciador: {
    handle: string,
    nivel_conhecimento: number (0-100),
    total_videos_analisados: number
  },

  produto: {
    nome: string,
    categoria: string,
    preco: string,
    diferenciais: string[],
    objecoes_comuns: string[] (preenchido pelo operador ou inferido pelo sistema)
  },

  cenario: {
    local: string,
    tom_recomendado: string,
    vocabulario_cenario: string[],
    restricoes: string[]
  },

  duracao_alvo: {
    segundos: number,
    formato: 'short' | 'standard' | 'extended' | 'long',
    blocos_sugeridos: string[]
  },

  perfil_hooks: {
    hook_selecionado: {
      tipo: string,
      justificativa_selecao: string,
      exemplos_do_influenciador: string[] (top 3 exemplos reais)
    },
    alternativas: [{tipo, exemplo}] (2 alternativas para o Revisor considerar)
  },

  perfil_cta: {
    cta_recomendada: {
      tipo: string,
      nivel_urgencia: string,
      emocao_associada: string,
      exemplos_do_influenciador: string[] (top 3 exemplos reais)
    },
    posicao_recomendada: number (percentual do vídeo)
  },

  perfil_emocional: {
    arco_recomendado: string[],  (sequência de emoções para este produto/cenário)
    justificativa: string,
    transicao_principal: {de: string, para: string, momento: number}
  },

  perfil_vocabulario: {
    expressoes_caracteristicas: string[] (top 10),
    girias_proprias: string[] (todas),
    vicios_linguagem: string[] (top 5),
    nivel_formalidade: number,
    marcadores_transicao: string[],
    expressoes_raras_impactantes: string[] (todas com flag alta_relevancia_criativa)
  },

  perfil_ritmo: {
    velocidade_media_wpm: number,
    padroes_pausa: string,
    momento_aceleracao: number,
    tecnica_enfase: string
  },

  perfil_produto_categoria: {
    angulo_preferido_para_esta_categoria: string,
    atributos_que_ele_enfatiza: string[],
    objecoes_que_ele_trata: string[],
    posicionamento_preco_preferido: string
  },

  contexto_rag: {
    chunks_relevantes: [
      {texto: string, similaridade: number, video_id: string}
    ],  (top-K chunks mais similares, ordenados por similaridade)
    consulta_usada: string,
    threshold_aplicado: number,
    total_chunks_encontrados: number
  },

  templates_virais_ativos: [
    {
      elemento: string,
      template: string,
      replicabilidade: string,
      compativel_com_categoria: boolean
    }
  ],

  restricoes: {
    blocos_proibidos: string[],
    tom_proibido: string,
    palavras_evitar: string[]
  }
}
```

### Como o Briefing é montado

O Agente Diretor executa as seguintes operações em paralelo para montar o briefing:

1. Carregar memória estruturada completa do influenciador
2. Executar busca RAG com a consulta: `"{nome_produto} {categoria} {cenario}"` — recuperar top-20 chunks similares
3. Executar seleção de hook (Seção 19)
4. Recuperar templates virais compatíveis com a categoria do produto
5. Montar o perfil de CTA recomendada (tipo mais performático para este tipo de produto na memória)
6. Selecionar arco emocional recomendado para a combinação produto + cenário
7. Aplicar fallback do RAG se necessário (Seção 22)

---

## 18. Prompt Mestre de Geração — Estrutura Completa

O Prompt Mestre é o componente de maior impacto na qualidade dos roteiros. Ele transforma o Briefing de Geração em um roteiro canônico. É chamado ao Gemini 1.5 Pro.

### Estrutura do Prompt

O prompt é composto de cinco seções injetadas em ordem:

**Seção 1 — Identidade e Missão**

Instrui o modelo sobre o que ele está fazendo e por que. Define claramente: você está gerando um roteiro que deve soar como se tivesse sido escrito pelo próprio influenciador, não como se fosse um roteiro genérico de TikTok Shop. O critério de sucesso é que um humano familiarizado com o influenciador não conseguiria distinguir se o roteiro veio da plataforma ou do próprio criador.

**Seção 2 — Perfil do Influenciador (do Briefing)**

Injeta, em linguagem natural organizada, as informações do briefing sobre o influenciador:
- Estilo de hook preferido com exemplos reais ("Ele costuma abrir com pergunta chocante. Exemplos reais: [...]")
- Vocabulário característico com exemplos ("Ele usa frequentemente: [lista]. Gírias próprias: [lista]. Expressões raras mas impactantes: [lista]")
- Tom e formalidade ("Tom informal, nível 2 de formalidade. Fala na segunda pessoa singular.")
- Ritmo ("Fala em média 140 palavras por minuto. Faz pausa antes do CTA.")
- Como ele apresenta produtos da categoria deste produto ("Para eletrônicos, prefere demonstração prática com foco em praticidade")
- CTA preferida com exemplos reais

**Seção 3 — Contexto Específico do Produto (RAG + Produto)**

Injeta os chunks RAG mais relevantes como contexto de exemplos:
"Nos vídeos mais relevantes deste influenciador para este tipo de produto, ele disse: [chunks selecionados]"

Injeta as informações do produto: nome, categoria, preço, diferenciais, objeções comuns a tratar.

Injeta o cenário: onde o vídeo vai ser gravado e as restrições do cenário.

**Seção 4 — Template Viral (quando disponível)**

Se há template viral compatível com a categoria do produto, injeta:
"Um dos vídeos mais virais deste influenciador usou o seguinte padrão: [template]. Considere incorporar elementos deste padrão, adaptados ao produto atual."

**Seção 5 — Instruções de Geração**

Define as regras de output:
- Gerar no formato JSON canônico definido (schema completo incluído no prompt)
- Duração alvo em segundos com tolerância de ±10%
- Usar APENAS vocabulário compatível com o perfil (não inventar palavras que o influenciador não usaria)
- Cada bloco deve ter o texto exato, tom, direção de câmera, ênfases e notas
- Calcular `duracao_segundos` de cada bloco baseado na velocidade de fala do perfil (palavras do bloco ÷ wpm × 60)
- O hook deve ser do tipo especificado no briefing, usando a estrutura dos exemplos reais como referência — não copiando, mas seguindo o padrão
- Proibido: texto genérico de TikTok Shop que qualquer criador poderia dizer

### Temperatura e Parâmetros do Gemini para Geração

A temperatura de geração não é fixa — varia por dimensão:

- Para vocabulário e expressões características do influenciador: temperatura baixa (0.3) — queremos fidelidade ao perfil
- Para estrutura e sequência de blocos: temperatura média (0.7) — queremos variação na estrutura sem perder o formato
- Para o texto dentro de cada bloco: temperatura média-alta (0.8) — queremos criatividade dentro do estilo definido

Na prática com o Gemini, isso significa chamar o modelo com temperatura 0.7 geral e incluir no prompt instruções explícitas de quando ser mais criativo (texto dos blocos) e quando ser mais fiel (vocabulário e expressões).

---

## 19. Critério de Seleção de Hook na Geração

O Agente Hook durante a análise classifica e salva os tipos de hook usados pelo influenciador. Durante a geração, o sistema precisa selecionar qual tipo de hook usar para aquele produto específico naquele cenário. Este critério não pode ser arbitrário.

### Algoritmo de seleção de hook

1. **Filtro por compatibilidade com categoria de produto:**
   - Carregar todos os tipos de hook registrados na memória do influenciador
   - Para cada tipo, verificar a `performance_media_views` quando usado para produtos da mesma categoria do produto atual
   - Se não há dados para aquela categoria: usar a `performance_media_views` geral

2. **Filtro por compatibilidade com cenário:**
   - Hooks de `historia_pessoal` funcionam mal em cenário de praça/movimento — filtrar com penalidade
   - Hooks de `numero_especifico` funcionam em qualquer cenário — sem penalidade
   - Hooks de `antes_depois` funcionam melhor em cenários intimistas (quarto, mesa) — bonus

3. **Ranqueamento:**
   - Score final do hook = `performance_media_views` × `compatibilidade_cenario` × `frequencia_uso`
   - Selecionar o tipo com maior score como hook principal
   - Selecionar os dois seguintes como alternativas (para o Revisor considerar se o principal não funcionar bem no roteiro)

4. **Injetar no Briefing:**
   - `perfil_hooks.hook_selecionado` com o tipo vencedor, justificativa do score e top 3 exemplos reais daquele tipo
   - `perfil_hooks.alternativas` com os dois tipos seguintes

### O que garante que o hook não é genérico

A injeção de **exemplos reais** do influenciador usando aquele tipo de hook é o elemento crítico. O Prompt Mestre instrui o modelo a seguir o padrão dos exemplos — não copiar o texto, mas replicar a estrutura e o estilo. Isso ancora a criatividade no repertório real do influenciador.

---

## 20. Agente Revisor — Comportamento Completo

O Revisor é a última etapa antes de entregar o roteiro ao usuário. Ele avalia o roteiro gerado contra o perfil do influenciador e o produto.

### Critérios de avaliação e pesos

**Autenticidade (peso 30%):** avalia se o roteiro soa como aquele influenciador específico.
- O hook é do tipo que ele usa? Verificar contra `perfil_hooks` do briefing
- O vocabulário está dentro do padrão? Verificar expressões proibidas e expressões obrigatórias
- A formalidade está correta? Verificar `nivel_formalidade`
- A CTA usa o estilo dele? Verificar contra exemplos de CTA do briefing
- Score: 0 (completamente não autêntico) a 10 (idêntico ao estilo do influenciador)

**Estrutura (peso 25%):** avalia se o roteiro tem a estrutura de um vídeo de TikTok Shop eficaz.
- Existe hook nos primeiros 3 segundos?
- O arco emocional faz sentido para o produto?
- O timing dos blocos está dentro da duração alvo (±10%)?
- A CTA aparece nos últimos 20% do vídeo?
- Score: 0 a 10

**Potencial viral (peso 25%):** avalia o potencial de performance.
- O hook tem força suficiente para prender nos primeiros 3 segundos? (força >= 7 no critério do Agente Hook)
- Existe pelo menos um elemento dos padrões virais do influenciador?
- A urgência do CTA está calibrada?
- Score: 0 a 10

**Adequação ao produto (peso 20%):** avalia se o produto foi bem apresentado.
- O ângulo de apresentação é compatível com o produto?
- As objeções comuns foram tratadas?
- O preço foi introduzido no momento e estilo correto para este influenciador?
- Score: 0 a 10

**Score geral:** (autenticidade × 0.30) + (estrutura × 0.25) + (viral × 0.25) + (produto × 0.20) × 10

### Comportamento em aprovação

Score >= 7.0 (correspondente a >= 70 na escala 0-100): roteiro aprovado. O Revisor retorna o roteiro sem alterações, com o score e um campo `pontos_fortes` listando o que foi bem.

### Comportamento em reprovação — iteração automática

Score entre 5.0 e 6.9: o Revisor não reprova diretamente. Ele gera uma **versão revisada** do roteiro, corrigindo os problemas identificados. Retorna tanto a versão original quanto a revisada, para o sistema usar a revisada.

O processo de revisão: o Revisor chama o Gemini com o roteiro gerado + os pontos fracos identificados + instrução para corrigir especificamente aqueles pontos, mantendo tudo o que foi aprovado. Temperatura baixa (0.3) para evitar alterações além das necessárias.

Score < 5.0: o Revisor sinaliza que nenhuma revisão automática conseguirá resolver os problemas sem gerar um novo roteiro do zero. O sistema:
- Descarta o roteiro
- Registra os problemas identificados
- Dispara nova geração com parâmetros diferentes (diferente tipo de hook, diferente arco emocional)
- Se a segunda geração também reprovar com score < 5.0: entregar a melhor das duas versões com badge "Confiança baixa" e os problemas identificados para o usuário decidir

### Limite de iterações

Máximo de 2 ciclos automáticos por solicitação de roteiro. Após isso, entregar a melhor versão gerada (mesmo que reprovada) com os problemas identificados visíveis para o usuário. Nunca bloquear indefinidamente a entrega.

---

## 21. Geração em Lote — Diversidade Garantida

Quando o usuário solicita N roteiros do mesmo produto e cenário, o sistema deve garantir que os roteiros são genuinamente diferentes — não variações superficiais do mesmo texto.

### Mecanismo de diversidade

Para um lote de N roteiros, o sistema distribui as seguintes variáveis em sequência:

**Variável 1 — Tipo de hook:**
Ciclar pelos tipos de hook do influenciador em ordem de performance: roteiro 1 usa o melhor tipo, roteiro 2 usa o segundo melhor, etc. Ao esgotar os tipos disponíveis, reiniciar do primeiro mas com prompt diferente.

**Variável 2 — Arco emocional:**
Alternar entre os 3 principais arcos emocionais do influenciador. Roteiro 1: arco dominante. Roteiro 2: segundo arco. Roteiro 3: terceiro arco. Roteiro 4: volta ao dominante mas com ponto de virada em posição diferente.

**Variável 3 — Duração:**
Se quantidade >= 3: variar entre formatos (um Short, um Standard, um Extended) para dar ao usuário opções reais de uso.

**Variável 4 — Ênfase do produto:**
Roteiro 1: enfatiza preço. Roteiro 2: enfatiza resultado/transformação. Roteiro 3: enfatiza exclusividade. Roteiro 4: enfatiza praticidade. Ciclar.

**Prevenção de repetição:**
Após gerar cada roteiro, comparar o hook gerado com os hooks dos roteiros anteriores do lote. Se a similaridade textual for > 80% (medida por comparação de tokens), regenerar este roteiro com uma instrução adicional de "use um ângulo completamente diferente para o hook".

### Rastreamento de variações do lote

A tabela `lotes_roteiros` salva `configuracao` com as variáveis usadas para cada slot do lote. Isso permite ao usuário entender por que cada roteiro é diferente e também alimenta o sistema de feedback — o usuário pode aprovar variações específicas e isso informa quais combinações funcionam.

---

## 22. Fallback do RAG e Estratégias de Contexto Degradado

### O problema

O RAG busca chunks similares ao produto e cenário com threshold de 0.75. Se o influenciador nunca falou sobre produtos similares, ou se tem poucos vídeos processados, o threshold pode retornar 0 ou poucos chunks. Sem contexto específico, o gerador tem apenas a memória estruturada — que é genérica.

### Estratégia de fallback em cascata

**Nível 1 — Busca normal (threshold 0.75):**
Consulta com texto `"{produto} {categoria} {cenario}"`.
Se retornar >= 5 chunks: usar normalmente.

**Nível 2 — Threshold relaxado (threshold 0.60):**
Se nível 1 retornou < 5 chunks: repetir busca com threshold 0.60.
Se retornar >= 3 chunks: usar com flag `contexto_parcial: true` no briefing.

**Nível 3 — Consulta expandida:**
Se nível 2 retornou < 3 chunks: ampliar a consulta para apenas a categoria de produto, sem o cenário. Exemplo: buscar por "eletrônicos smartphone" em vez de "iPhone escritório".
Se retornar >= 3 chunks: usar com flag `contexto_parcial: true`.

**Nível 4 — Memória estruturada como contexto:**
Se nível 3 retornou < 3 chunks: usar apenas a memória estruturada (perfil de produto para esta categoria + vocabulário + hooks). Sem chunks RAG.
Flag `contexto_sem_rag: true` no briefing. O Prompt Mestre tem instrução específica para este caso: "Não há exemplos contextuais para este tipo de produto. Baseie-se exclusivamente no perfil comportamental do influenciador e adapte para o produto fornecido."

**Nível 5 — Cold start (< 20 vídeos):**
Se a memória estruturada também está incompleta (nível de conhecimento < 20%): comportamento da Seção 16.

### Sinalização ao usuário

Quando o roteiro é gerado com contexto degradado (nível 2 ou abaixo):
- Exibir badge "Contexto parcial" no card do roteiro
- Tooltip: "Este influenciador tem poucos vídeos sobre este tipo de produto. O roteiro usa o perfil geral mas pode ter menor autenticidade especifica para esta categoria."

---

## 23. Formato Canônico do Roteiro de TikTok Shop

Todo roteiro gerado pela plataforma segue este schema JSON sem exceção. A padronização permite renderização consistente no teleprompter, edição estruturada por bloco, e granularidade de feedback por componente.

```
SCHEMA DO ROTEIRO
{
  roteiro_id: UUID,
  influencer_id: UUID,
  lote_id: UUID | null,
  versao: number (começa em 1, incrementa a cada edição),
  
  produto: {
    nome: string,
    categoria: string,
    subcategoria: string | null,
    preco: string,
    link_shop: string | null,
    diferenciais: string[],
    objecoes_tratadas: string[]
  },
  
  cenario: {
    local: string,
    descricao: string,
    props_sugeridos: string[]
  },
  
  parametros: {
    duracao_alvo_segundos: number,
    formato: 'short' | 'standard' | 'extended' | 'long',
    contexto_qualidade: 'completo' | 'parcial' | 'sem_rag',  (do fallback RAG)
    nivel_conhecimento_no_momento: number
  },
  
  scores: {
    qualidade_geral: number,   (0-100, score do Agente Revisor)
    autenticidade: number,     (0-10)
    estrutura: number,         (0-10)
    potencial_viral: number,   (0-10)
    adequacao_produto: number, (0-10)
    hook_forca: number         (1-10, score do hook selecionado)
  },
  
  blocos: [
    {
      id: string,             (ex: "bloco_001")
      tipo: string,           (ver tipos válidos abaixo)
      ordem: number,          (posição na sequência, começa em 1)
      duracao_segundos: number,
      texto: string,          (texto exato a ser falado)
      tom: string,
      direcao_camera: string, (instrução para o influenciador)
      enfase: string[],       (palavras ou frases que devem ser enfatizadas)
      pausa_antes: boolean,
      pausa_depois: boolean,
      notas: string,          (notas de performance para o influenciador)
      marcadores_acao: string[] (ex: ["[MOSTRAR CÂMERA]", "[PEGAR PRODUTO]"])
    }
  ],
  
  duracao_total_calculada: number,
  
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'editado',
  feedback_usuario: string | null,
  aprovado_em: timestamp | null,
  
  briefing_id: UUID,  (referência ao briefing usado — para auditoria e aprendizado)
  chunks_rag_usados: UUID[],
  templates_virais_aplicados: UUID[],
  
  gerado_em: timestamp,
  ultima_edicao_em: timestamp | null
}
```

### Tipos de bloco válidos

| Tipo | Posição típica | Duração média |
|---|---|---|
| `hook` | Sempre primeiro | 2-5s |
| `problema` | Segundo | 4-8s |
| `apresentacao_produto` | Central | 10-20s |
| `demonstracao` | Após apresentação | 8-15s |
| `prova_social` | Antes do CTA | 5-10s |
| `revelacao_preco` | Próximo ao CTA | 5-10s |
| `cta_engajamento` | Penúltimo | 3-7s |
| `cta_compra` | Sempre último | 3-7s |
| `humor` | Qualquer posição | 3-6s |
| `comparacao` | Após apresentação | 5-10s |
| `transformacao` | Após demonstração | 5-8s |

### Validação do roteiro gerado

Antes de salvar qualquer roteiro no banco:
1. Verificar se `blocos[0].tipo === 'hook'` — se não, rejeitar e regenerar
2. Verificar se existe pelo menos um bloco de CTA (`cta_compra` ou `cta_engajamento`)
3. Verificar se `duracao_total_calculada` está dentro de ±15% da `duracao_alvo_segundos`
4. Verificar se todos os campos obrigatórios de cada bloco estão presentes e não vazios
5. Verificar se o JSON está completo e parseável

Se qualquer validação falhar: o roteiro não é salvo, a geração é repetida.

---

## 24. Fluxo de Edição de Roteiro no Frontend

O usuário pode editar qualquer bloco do roteiro gerado antes de aprovar. A edição é estruturada — não é edição de texto livre em um campo grande.

### Interface de edição

Cada bloco do roteiro é exibido como um card expansível com:
- Header: tipo do bloco, duração calculada, tom
- Corpo (ao expandir): o texto do bloco com botão "Editar"
- Ao clicar em Editar: o campo de texto se torna editável, os campos de tom, direção e notas também se tornam editáveis
- Botão "Salvar bloco" e "Cancelar"
- Botão "Regenerar este bloco" (gera apenas aquele bloco novamente, mantendo os outros)

Ao clicar em "Regenerar este bloco": o sistema chama o Gemini com o briefing completo mais instrução para gerar especificamente aquele tipo de bloco com as mesmas restrições. O bloco regenerado substitui o anterior no roteiro.

### Captura do diff para aprendizado

Quando o usuário salva um bloco editado, o sistema:
1. Armazena a versão original do bloco junto com a versão editada em `roteiro_edicoes`
2. Compara os dois textos e identifica: palavras/expressões removidas (potencialmente não autênticas) e palavras/expressões adicionadas (autênticas para o influenciador)
3. As expressões removidas são sinalizadas como potencialmente incompatíveis com o perfil
4. As expressões adicionadas são sinalizadas como candidatas a adicionar ao vocabulário do influenciador
5. Um job assíncrono processa este diff e atualiza a memória de vocabulário do agente correspondente

Essa é a forma mais valiosa de aprendizado do sistema — o usuário editando o que não soa certo está ensinando o sistema sobre a voz real do influenciador.

---

## 25. Sistema de Feedback e Aprendizado Incremental

### Tipos de feedback e seus efeitos

**Aprovação sem edição:**
- Incrementar `relevancia_geracao` de todos os chunks RAG usados neste roteiro em +0.05 (máximo 2.0)
- Registrar a combinação `tipo_hook + arco_emocional + categoria_produto` como eficaz
- Incrementar peso dos padrões usados na memória estruturada (frequência virtual +1)

**Rejeição:**
- Decrementar `relevancia_geracao` dos chunks RAG usados em -0.10 (mínimo 0.1 — nunca zerar)
- Registrar a combinação como ineficaz para esta categoria de produto
- Se o usuário forneceu motivo: armazenar em `roteiros.feedback_usuario` e considerar para futuras gerações (analisado por job assíncrono)

**Edição (parcial ou total):**
- Processar diff como descrito na Seção 24
- Aprovação após edição: tratada como aprovação mas com peso menor (+0.03 em vez de +0.05 para os chunks)

### Limite de impacto do feedback

Para evitar que um único roteiro aprovado ou rejeitado distorça a memória:
- Nenhum feedback individual pode alterar `relevancia_geracao` além de ±0.10 por evento
- A memória estruturada só é atualizada por feedback se o influenciador tiver >= 5 roteiros com feedback de aprovação ou rejeição (evitar distorção com poucos dados)

---

## 26. Monitor de Virais — Fórmula e Extração de Templates

### Cálculo do Viral Score

O `viral_score` é calculado durante o monitoramento contínuo, para cada vídeo com métricas atualizadas.

**Passo 1 — Score de engajamento ponderado:**

O engajamento ponderado reflete o valor diferente de cada tipo de interação. Compartilhamentos valem mais que likes porque indicam que o conteúdo foi considerado valioso o suficiente para passar adiante.

```
engagement_score = (likes × 1.0) + (comments × 3.0) + (shares × 5.0) + (saves × 4.0)
engagement_rate = engagement_score / views
```

**Passo 2 — Normalização pelo baseline do criador:**

Um vídeo com 100.000 views pode ser excepcional para um influenciador com 50k seguidores, mas abaixo da média para um com 5M. O viral score deve ser relativo ao criador.

```
baseline_30d = média de engagement_rate dos últimos 30 vídeos do influenciador
performance_ratio = engagement_rate / baseline_30d
```

**Passo 3 — Fator de velocidade para vídeos recentes:**

Vídeos com menos de 48 horas têm crescimento incompleto. O fator de velocidade detecta crescimento acima do esperado mesmo quando o total ainda é baixo.

```
Se vídeo publicado há < 48 horas:
  velocidade_esperada = média de views/hora nas primeiras 48h dos últimos 20 vídeos
  velocity_factor = views_por_hora_atual / velocidade_esperada
Caso contrário:
  velocity_factor = 1.0
```

**Passo 4 — Score final:**

```
viral_score = min(100, ((performance_ratio × 0.60) + (velocity_factor × 0.40)) × 50)
```

**Threshold de alerta:** `viral_score >= 70`

### Ações ao detectar vídeo viral

1. Atualizar `videos.is_viral = true` e `videos.viral_score`
2. Se o vídeo ainda não foi transcrito: mover para topo da fila de processamento (prioridade máxima — inserir na frente da fila de download no Inngest)
3. Se já foi transcrito: enfileirar análise pelo Agente Viral imediatamente
4. Disparar evento Supabase Realtime para o frontend
5. Frontend exibe badge vermelho pulsante no Dashboard e no Monitor de Virais

### Prioridade na fila do Inngest

O Inngest não tem prioridade de fila nativa. A solução: manter duas filas separadas — `media.download.priority` e `media.download.normal`. Vídeos virais vão para `priority`, os demais para `normal`. O worker processa toda a fila `priority` antes de consumir da `normal`. Implementado como dois jobs separados no Inngest com o worker verificando a fila de prioridade primeiro.

---

## 27. Teleprompter — Especificação Técnica Completa

### Princípio de design

O teleprompter existe durante uma gravação real. Qualquer elemento de UI que chame a atenção do influenciador é um erro de produto. A única coisa que deve existir na tela durante a gravação é o texto e controles absolutamente mínimos.

### Visual

- Fundo: preto absoluto `#000000` sem gradientes ou texturas
- Texto: branco puro `#FFFFFF`
- Fonte: Inter ou sistema sans-serif com boa legibilidade em tamanho grande
- Tamanho padrão: 48px, ajustável entre 32px e 72px
- Largura da coluna de texto: 60% da largura da tela, centralizada — margens largas reduzem o movimento ocular lateral
- Sem bordas, sem headers, sem menus durante a gravação
- Todos os controles ficam em bordas da tela, invisíveis até hover ou toque

### Marcadores visuais

O teleprompter renderiza o JSON do roteiro convertendo os campos em sinais visuais:

- `pausa_antes: true` → linha vazia antes do texto do bloco
- `pausa_depois: true` → linha vazia após o texto do bloco
- `marcadores_acao` → texto em azul claro embutido no texto do bloco (ex: "[MOSTRAR PRODUTO]" em azul)
- `enfase[]` → as palavras ou frases no array enfase são exibidas em negrito aumentado ou sublinhadas
- Bloco do tipo `cta_compra` → texto em tom levemente diferente (laranja discreto) para sinalizar o momento do CTA

### Controles durante gravação

Todos os controles são ativados por tecla ou gesto, nunca por click em botão visível durante a gravação:

- **Barra de espaço / toque central:** pausar/continuar rolagem
- **Seta para cima / swipe up:** voltar ao início do bloco atual
- **Seta para baixo / swipe down:** avançar para o próximo bloco
- **`+` / `=`:** aumentar tamanho da fonte
- **`-`:** diminuir tamanho da fonte
- **Seta esquerda / swipe left:** diminuir velocidade de rolagem
- **Seta direita / swipe right:** aumentar velocidade de rolagem
- **Tecla R:** reiniciar do início
- **Tecla E:** entrar/sair do modo de ensaio

### Algoritmo de velocidade de rolagem

A velocidade inicial é calibrada pelo perfil de ritmo do influenciador:

```
palavras_por_minuto = perfil_ritmo.velocidade_media_wpm (do banco)
palavras_por_linha = largura_coluna_em_caracteres / media_caracteres_por_palavra
linhas_por_minuto = palavras_por_minuto / palavras_por_linha
linhas_por_segundo = linhas_por_minuto / 60
pixels_por_segundo = linhas_por_segundo × altura_linha_em_pixels × velocidade_fator
```

`velocidade_fator` começa em 1.0 e é ajustado pelo slider do usuário (range 0.5x a 2.0x).

Se o perfil de ritmo não estiver disponível (influenciador com poucos vídeos processados): usar velocidade padrão de 130 palavras por minuto.

### Modo de ensaio

No modo de ensaio, o texto não rola automaticamente. Em vez disso:
- Exibe um bloco por vez
- O texto do bloco aparece na tela completo, não rolando
- O influenciador lê, memoriza, e pressiona espaço para avançar para o próximo bloco
- Indicador: "Bloco 2 de 6 — Apresentação do Produto" no canto inferior
- Ao chegar no último bloco e pressionar espaço: reiniciar do primeiro

### Indicadores durante gravação

Três indicadores mínimos, todos em posições de borda, texto pequeno e baixo contraste para não distrair:

- **Timer (canto inferior direito):** contagem regressiva do tempo alvo do roteiro, formato `0:45`
- **Progresso (linha horizontal no topo):** barra de progresso muito fina (2px), de branco transparente para branco opaco, avança conforme o texto
- **Bloco atual (canto inferior esquerdo):** `3/6` — apenas números, sem texto

---

## 28. Algoritmo de Nível de Conhecimento (0–100%)

### Fórmula geral

```
Nível = (Score_Cobertura × 0.40) + (Score_Diversidade × 0.30) + (Score_Confiança × 0.30)
```

### Score de Cobertura (40%)

Mede quantos vídeos foram processados em relação ao total disponível no perfil.

```
cobertura_base = (videos_analisados / total_videos_perfil) × 100

bônus por volume:
  10+ vídeos: +5
  50+ vídeos: +10
  200+ vídeos: +15
  500+ vídeos: +20

Score_Cobertura = min(100, cobertura_base + bonus)
```

### Score de Diversidade (30%)

Mede se os vídeos processados cobrem diferentes dimensões de conteúdo, não apenas quantidade.

```
pontos por diversidade:
  categorias de produto diferentes: +15 por categoria, máximo 75 pontos
  cenários diferentes detectados: +10 por cenário, máximo 40 pontos
  tipos de hook diferentes usados: +5 por tipo, máximo 30 pontos

Score_Diversidade = min(100, soma_pontos)
```

### Score de Confiança (30%)

Mede a consistência dos padrões — quanto mais consistentes, mais previsível e replicável é a voz do influenciador.

```
Para cada dimensão (hook, cta, emocao, vocabulario, ritmo, produto):
  evidencias = total de vídeos que alimentaram esta dimensão
  consistencia = 1.0 se os padrões se repetem (desvio padrão baixo)
               = 0.5 se os padrões variam muito
  confianca_dimensao = min(1.0, evidencias / 20) × consistencia

Score_Confiança = média(confianca_dimensoes) × 100
```

### Quando recalcular

O Nível de Conhecimento é recalculado ao final de cada job `agent.analyze`. Não é calculado em batch — é incremental. Cada vídeo processado potencialmente muda o nível.

### Interpretação dos limiares

| Range | Interpretação | Comportamento do sistema |
|---|---|---|
| 0–20% | Iniciante | Modo cold start — geração bloqueada ou com aviso severo |
| 21–40% | Aprendendo | Geração permitida com aviso moderado e confiança reduzida |
| 41–60% | Conhece bem | Geração padrão — roteiros bons mas com eventuais imperfeições |
| 61–80% | Expert | Roteiros excelentes, inclusive para categorias com poucos exemplos |
| 81–100% | Mestre | Roteiros que passam no teste de autoria cega |

---

## 29. Banco de Dados — Schema Completo

### Tabela: influenciadores

Armazena o perfil de cada criador e o estado atual do seu pipeline.

```
influenciadores
  id: UUID (PK)
  tiktok_handle: VARCHAR(30), NOT NULL, UNIQUE
  nome: VARCHAR(100)
  avatar_url: TEXT
  seguidores: INTEGER
  total_videos: INTEGER
  status_pipeline: VARCHAR(20) DEFAULT 'pendente'
    valores: pendente | descobrindo | processando | ativo | pausado | erro
  modo_atual: VARCHAR(20) DEFAULT 'inicial'
    valores: inicial | monitoramento
  nivel_conhecimento_ia: FLOAT DEFAULT 0
  score_cobertura: FLOAT DEFAULT 0
  score_diversidade: FLOAT DEFAULT 0
  score_confianca: FLOAT DEFAULT 0
  ultimo_scraping_at: TIMESTAMPTZ
  ultimo_video_encontrado_at: TIMESTAMPTZ
  checkpoint_scraping: JSONB DEFAULT '{}'
    conteúdo: { ultima_data_video: timestamp, ultimo_video_id: string, posicao_scroll: number }
  criado_em: TIMESTAMPTZ DEFAULT NOW()
  atualizado_em: TIMESTAMPTZ DEFAULT NOW()
```

### Tabela: videos

Armazena metadados e estado de processamento de cada vídeo.

```
videos
  id: UUID (PK)
  influencer_id: UUID (FK → influenciadores.id)
  tiktok_video_id: VARCHAR(50) NOT NULL
  url: TEXT NOT NULL
  thumbnail_url: TEXT
  duracao_segundos: INTEGER
  views: BIGINT DEFAULT 0
  likes: BIGINT DEFAULT 0
  comments: BIGINT DEFAULT 0
  shares: BIGINT DEFAULT 0
  saves: BIGINT DEFAULT 0
  engagement_score: FLOAT (calculado)
  viral_score: FLOAT DEFAULT 0
  is_viral: BOOLEAN DEFAULT FALSE
  data_publicacao: TIMESTAMPTZ
  status: VARCHAR(30) DEFAULT 'aguardando'
    valores: aguardando | baixando | baixado | audio_processado | transcrito | analisado
           | falha_download | falha_transcricao | falha_analise | indisponivel
  analise_parcial: BOOLEAN DEFAULT FALSE
    (true quando algum agente falhou na análise)
  tentativas_download: INTEGER DEFAULT 0
  erro_log: TEXT
  metricas_atualizadas_em: TIMESTAMPTZ
  criado_em: TIMESTAMPTZ DEFAULT NOW()
  atualizado_em: TIMESTAMPTZ DEFAULT NOW()

UNIQUE(influencer_id, tiktok_video_id)
INDEX: (influencer_id, status)
INDEX: (is_viral, viral_score DESC)
INDEX: (data_publicacao DESC)
```

### Tabela: transcricoes

Armazena o texto resultante da transcrição de cada vídeo.

```
transcricoes
  id: UUID (PK)
  video_id: UUID (FK → videos.id), UNIQUE
  influencer_id: UUID (FK → influenciadores.id)
  texto_completo: TEXT NOT NULL
  duracao_segundos: INTEGER
  palavras_total: INTEGER
  palavras_por_minuto: FLOAT
  qualidade_transcricao: FLOAT DEFAULT 1.0 (0.5 = fallback sem segmentos)
  modelo_utilizado: VARCHAR(50)
  criado_em: TIMESTAMPTZ DEFAULT NOW()

INDEX: (influencer_id)
```

### Tabela: transcricao_segmentos

Armazena a transcrição segmentada com timestamps para o Agente Ritmo.

```
transcricao_segmentos
  id: UUID (PK)
  transcricao_id: UUID (FK → transcricoes.id)
  start_ms: INTEGER NOT NULL
  end_ms: INTEGER NOT NULL
  texto: TEXT NOT NULL
  palavras: INTEGER

INDEX: (transcricao_id, start_ms)
```

### Tabela: memoria_chunks (Vector Store)

Armazena os chunks de transcrição com seus embeddings vetoriais.

```
memoria_chunks
  id: UUID (PK)
  influencer_id: UUID (FK → influenciadores.id)
  video_id: UUID (FK → videos.id)
  chunk_index: INTEGER NOT NULL
  texto: TEXT NOT NULL
  embedding: vector(768) — requer extensão pgvector
  dimensao: VARCHAR(20) | NULL
    valores: hook | cta | emocao | vocabulario | ritmo | produto | viral
  relevancia_geracao: FLOAT DEFAULT 1.0 (ajustado por feedback, range 0.1 a 2.0)
  criado_em: TIMESTAMPTZ DEFAULT NOW()

INDEX: ivfflat em embedding para busca por coseno (lists = 100)
INDEX: (influencer_id)
INDEX: (video_id)
```

### Tabela: memorias_estruturadas

Armazena o perfil comportamental sintetizado por dimensão.

```
memorias_estruturadas
  id: UUID (PK)
  influencer_id: UUID (FK → influenciadores.id)
  dimensao: VARCHAR(20) NOT NULL
    valores: hooks | ctas | emocoes | vocabulario | ritmo | produtos | virais
  dados: JSONB NOT NULL DEFAULT '{}'
  versao: INTEGER DEFAULT 1
  total_videos_analisados: INTEGER DEFAULT 0
  confianca_atual: FLOAT DEFAULT 0
  atualizado_em: TIMESTAMPTZ DEFAULT NOW()

UNIQUE(influencer_id, dimensao)
```

### Tabela: memorias_historico

Snapshots das memórias estruturadas para rollback.

```
memorias_historico
  id: UUID (PK)
  influencer_id: UUID (FK)
  dimensao: VARCHAR(20)
  dados: JSONB
  versao: INTEGER
  motivo_snapshot: VARCHAR(100)
  criado_em: TIMESTAMPTZ DEFAULT NOW()

INDEX: (influencer_id, dimensao, versao DESC)
RETENÇÃO: 7 dias — deletar via job periódico
```

### Tabela: roteiros

Armazena todos os roteiros gerados.

```
roteiros
  id: UUID (PK)
  influencer_id: UUID (FK → influenciadores.id)
  lote_id: UUID | NULL (FK → lotes_roteiros.id)
  briefing_id: UUID | NULL (referência ao briefing — armazenado em briefings)
  
  produto_nome: VARCHAR(200)
  produto_categoria: VARCHAR(50)
  produto_preco: VARCHAR(50)
  produto_detalhes: JSONB DEFAULT '{}'
  cenario: VARCHAR(50)
  
  duracao_alvo_segundos: INTEGER
  duracao_calculada_segundos: INTEGER
  formato: VARCHAR(20)
  
  conteudo: JSONB NOT NULL (schema canônico completo)
  
  score_qualidade: FLOAT
  score_autenticidade: FLOAT
  score_estrutura: FLOAT
  score_viral: FLOAT
  score_produto: FLOAT
  
  contexto_qualidade: VARCHAR(20)
    valores: completo | parcial | sem_rag
  nivel_conhecimento_no_momento: FLOAT
  
  status: VARCHAR(20) DEFAULT 'pendente'
    valores: pendente | aprovado | rejeitado | editado
  
  feedback_usuario: TEXT | NULL
  pontos_fortes: TEXT[] | NULL (do Revisor)
  pontos_fracos: TEXT[] | NULL (do Revisor)
  
  chunks_rag_usados: UUID[]
  templates_virais_aplicados: UUID[]
  
  versao: INTEGER DEFAULT 1
  versao_anterior: JSONB | NULL (conteúdo da versão anterior se editado)
  
  gerado_em: TIMESTAMPTZ DEFAULT NOW()
  aprovado_em: TIMESTAMPTZ | NULL
  ultima_edicao_em: TIMESTAMPTZ | NULL

INDEX: (influencer_id)
INDEX: (status)
INDEX: (lote_id)
```

### Tabela: roteiro_edicoes

Armazena o diff de edições para aprendizado.

```
roteiro_edicoes
  id: UUID (PK)
  roteiro_id: UUID (FK → roteiros.id)
  bloco_id: VARCHAR(20)
  texto_original: TEXT
  texto_editado: TEXT
  expressoes_removidas: TEXT[]
  expressoes_adicionadas: TEXT[]
  processado_para_aprendizado: BOOLEAN DEFAULT FALSE
  criado_em: TIMESTAMPTZ DEFAULT NOW()
```

### Tabela: briefings

Armazena os briefings de geração para auditoria e debugging.

```
briefings
  id: UUID (PK)
  influencer_id: UUID (FK)
  roteiro_id: UUID | NULL (FK após geração)
  conteudo: JSONB NOT NULL (estrutura completa do briefing)
  chunks_recuperados: INTEGER
  threshold_aplicado: FLOAT
  nivel_fallback: INTEGER (1-5)
  criado_em: TIMESTAMPTZ DEFAULT NOW()

RETENÇÃO: 30 dias — deletar via job periódico
```

### Tabela: lotes_roteiros

```
lotes_roteiros
  id: UUID (PK)
  influencer_id: UUID (FK)
  produto_nome: VARCHAR(200)
  quantidade_total: INTEGER
  quantidade_gerada: INTEGER DEFAULT 0
  quantidade_aprovada: INTEGER DEFAULT 0
  status: VARCHAR(20) DEFAULT 'gerando'
    valores: gerando | concluido | erro_parcial | cancelado
  configuracao: JSONB
    conteúdo: { cenarios: [], duracoes: [], variacoes_usadas: [] }
  criado_em: TIMESTAMPTZ DEFAULT NOW()
  concluido_em: TIMESTAMPTZ | NULL
```

### Tabela: templates_virais

```
templates_virais
  id: UUID (PK)
  influencer_id: UUID (FK)
  video_id: UUID (FK)
  elemento_principal: VARCHAR(100)
  descricao: TEXT
  estrutura: JSONB
  categorias_compativeis: TEXT[]
  categorias_incompativeis: TEXT[]
  replicabilidade: VARCHAR(10) (alta | media | baixa)
  viral_score_original: FLOAT
  views_gerados: BIGINT
  vezes_aplicado: INTEGER DEFAULT 0
  ativo: BOOLEAN DEFAULT TRUE
  criado_em: TIMESTAMPTZ DEFAULT NOW()
```

### Tabela: jobs_pipeline

```
jobs_pipeline
  id: UUID (PK)
  influencer_id: UUID (FK) | NULL
  video_id: UUID (FK) | NULL
  etapa: VARCHAR(50) NOT NULL
  modo: VARCHAR(20) DEFAULT 'normal'
    valores: normal | priority
  status: VARCHAR(20) DEFAULT 'pendente'
  tentativas: INTEGER DEFAULT 0
  max_tentativas: INTEGER DEFAULT 4
  proximo_retry_em: TIMESTAMPTZ | NULL
  payload: JSONB DEFAULT '{}'
  resultado: JSONB | NULL
  erro_log: TEXT | NULL
  iniciado_em: TIMESTAMPTZ | NULL
  concluido_em: TIMESTAMPTZ | NULL
  criado_em: TIMESTAMPTZ DEFAULT NOW()

INDEX: (status, etapa)
INDEX: (status, proximo_retry_em) WHERE status = 'falha'
INDEX: (modo, status) WHERE status = 'pendente'
```

### Tabela: captcha_alerts

```
captcha_alerts
  id: UUID (PK)
  influencer_id: UUID (FK)
  job_id: UUID (FK → jobs_pipeline.id)
  status: VARCHAR(20) DEFAULT 'aguardando'
    valores: aguardando | resolvido | abandonado
  estado_salvo: JSONB
    conteúdo: { url_atual: string, videos_coletados: [], posicao_scroll: number, cookies: [] }
  criado_em: TIMESTAMPTZ DEFAULT NOW()
  resolvido_em: TIMESTAMPTZ | NULL
  resolvido_por: VARCHAR(50) | NULL
```

### Tabela: configuracoes

```
configuracoes
  id: UUID (PK)
  chave: VARCHAR(100) NOT NULL UNIQUE
  valor_criptografado: TEXT | NULL (para chaves sensíveis)
  valor_texto: TEXT | NULL (para configurações não sensíveis)
  descricao: TEXT
  atualizado_em: TIMESTAMPTZ DEFAULT NOW()

Chaves sensíveis (usar valor_criptografado):
  gemini_api_key, decudo_username, decudo_password, decudo_server

Chaves não sensíveis (usar valor_texto):
  max_videos_por_sessao_inicial, max_videos_por_sessao_monitoramento,
  delay_min_ms, delay_max_ms, viral_score_threshold,
  nivel_conhecimento_minimo_geracao, max_exemplos_por_padrao
```

### Tabela: api_keys

```
api_keys
  id: UUID (PK)
  nome: VARCHAR(100) NOT NULL
  chave_hash: VARCHAR(64) NOT NULL UNIQUE (SHA-256 da chave real)
  chave_prefixo: VARCHAR(10) NOT NULL (primeiros chars para identificação visual)
  permissoes: TEXT[] DEFAULT '{}'
  rate_limit_por_hora: INTEGER DEFAULT 100
  ativa: BOOLEAN DEFAULT TRUE
  criada_em: TIMESTAMPTZ DEFAULT NOW()
  ultimo_uso_em: TIMESTAMPTZ | NULL
```

### Funções SQL obrigatórias

**Função de busca semântica:**

```sql
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
    1 - (mc.embedding <=> p_embedding) AS similaridade,
    mc.relevancia_geracao
  FROM memoria_chunks mc
  WHERE mc.influencer_id = p_influencer_id
    AND 1 - (mc.embedding <=> p_embedding) >= p_similaridade_minima
  ORDER BY (mc.embedding <=> p_embedding) * (1.0 / mc.relevancia_geracao)
  LIMIT p_top_k;
END;
$$;
```

A fórmula de ordenação pondera pela `relevancia_geracao` — chunks aprovados por feedback têm maior peso na ordenação, garantindo que o sistema aprende quais exemplos geram os melhores roteiros.

---

## 30. Sistema de Filas e Jobs (Inngest)

### Jobs definidos

**`scrape.discover.initial`** — coleta histórica completa de um influenciador. Disparado uma única vez no cadastro ou por re-scan manual. Usa modo inicial do scraper.

**`scrape.discover.monitor`** — coleta incremental de novos vídeos. Disparado pelo Inngest Cron a cada hora para influenciadores com `status_pipeline = 'ativo'`. Usa modo monitoramento do scraper.

**`media.download.normal`** — download de vídeo via yt-dlp. Disparado para cada novo vídeo descoberto.

**`media.download.priority`** — mesmo que normal, mas para vídeos virais. Processado antes dos normais.

**`audio.separate`** — delega ao worker Python no Railway via webhook. Aguarda callback.

**`audio.transcribe`** — transcrição via Gemini Audio.

**`agent.analyze`** — dispara o Agente Diretor para análise completa de um vídeo.

**`metrics.update`** — atualiza métricas de engajamento (views, likes, etc.) para vídeos existentes. Disparado pelo monitor.

**`viral.detect`** — calcula viral_score para vídeos com métricas recém-atualizadas e dispara ações se threshold atingido.

**`memory.compress`** — verifica se alguma dimensão da memória estruturada ultrapassou os limites e executa compressão. Disparado diariamente via Inngest Cron.

**`cleanup.briefings`** — deleta briefings com mais de 30 dias. Disparado semanalmente.

**`cleanup.memory_historico`** — deleta snapshots de memória com mais de 7 dias.

### Política de retry

```
Tentativa 1: imediata
Tentativa 2: 2 minutos depois
Tentativa 3: 8 minutos depois
Tentativa 4: 32 minutos depois
Após 4 falhas: status 'falha_permanente', notificação no dashboard

Exceções sem retry automático:
  - CAPTCHA detectado: pausa até resolução manual
  - HTTP 403 ou 410 (vídeo indisponível): status 'indisponivel' imediato
  - API key inválida: pausar pipeline inteiro e alertar operador
  - Falha no worker Python (Railway offline): alertar operador, não retentar automaticamente
```

---

## 31. Telas e Módulos da Plataforma

### Dashboard Principal

Exibe o estado geral da operação:
- Cards de todos os influenciadores com avatar, handle, nível de conhecimento AI (barra visual 0-100%), quantidade de vídeos processados de total, status do pipeline com ícone animado
- Painel de atividade: log em tempo real das últimas ações via Supabase Realtime (ex: "vídeo #847 transcrito", "memória de hooks atualizada")
- Alertas: banner vermelho quando há CAPTCHA pendente, badge vermelho quando há viral detectado nas últimas 2h
- Botão "Adicionar Influenciador"

### Perfil do Influenciador

**Seção de identidade:** avatar, handle, nome, seguidores, total de vídeos, status atual do pipeline.

**Painel de Conhecimento da IA:**
- Barra principal: Nível Geral XX%
- Grid de dimensões: uma barra por dimensão (Hooks, CTAs, Vocabulário, Emoção, Ritmo, Produtos, Viral) com percentual e número de evidências
- Badge de confiança por dimensão: Alta / Moderada / Baixa
- Estimativa de tempo para próximo nível (se aplicável)

**Timeline de vídeos:**
- Lista paginada com thumbnail (quando disponível), views, data de publicação, viral_score (badge colorido por range), status de processamento
- Ordenação padrão: mais recentes primeiro
- Filtro por status de processamento

**Insights automáticos:**
- Top 3 hooks mais usados com exemplos reais e performance
- Top 3 CTAs com frequência e performance
- Categorias de produto cobertas
- Vídeos virais dos últimos 30 dias

### Gerador de Roteiros

**Formulário:**
- Influenciador: dropdown com avatar e nível de conhecimento visível
- Produto: nome, categoria, preço, lista de diferenciais (tags input), objeções comuns a tratar (tags input)
- Cenário: cards visuais (Mesa, Praça, Quarto, Cozinha, Outro com campo customizado)
- Duração: seleção de formato (Short 15-20s / Standard 30-45s / Extended 60-90s / Long 3-5min)
- Quantidade: 1 / 5 / 10 / Personalizado
- Opções avançadas (expansível): tom especial, blocos a incluir/excluir, nível de urgência do CTA

**Resultado:**
- Loading com etapas visíveis: "Montando briefing → Consultando memória → Gerando roteiro → Revisando → Pronto"
- Cada roteiro em card com: score de qualidade (barra colorida), score viral, duração calculada, badge de contexto (Completo / Parcial / Sem RAG)
- Expansão do card: blocos do roteiro em acordeão, cada um com texto + direções + notas + botão Editar
- Botões no card: Editar | Aprovar | Rejeitar | Abrir no Teleprompter | Exportar TXT | Exportar PDF

### Monitor de Virais

- Feed em tempo real, atualizado a cada hora
- Card de vídeo viral: thumbnail, handle, viral_score com badge (70-80 laranja, 80+ vermelho), views atuais, crescimento em views/hora nas últimas 24h
- Expansão: análise completa do Agente Viral, template extraído em linguagem clara, botão "Usar este padrão no próximo roteiro"
- Filtros: por influenciador, por range de viral_score, por categoria de produto, por data

### Histórico de Roteiros

- Lista paginada de todos os roteiros
- Filtros: influenciador, produto, cenário, status (aprovado/rejeitado/pendente/editado), data de geração
- Score de qualidade e contexto visíveis em cada item da lista
- Ação rápida: abrir no Teleprompter, duplicar com novos parâmetros

### Configurações

**APIs:**
- Gemini API Key: campo password mostrando apenas últimos 4 caracteres. Botão "Testar" que faz chamada real e exibe latência e modelo confirmado
- Decudo: servidor/porta, usuário, senha. Botão "Testar" que navega para um URL de diagnóstico de IP e exibe o IP do proxy retornado
- Status do Worker Python (Railway): indicador de online/offline com URL do worker configurável

**Pipeline:**
- Máximo de vídeos por sessão inicial (padrão: 500)
- Máximo de vídeos por sessão de monitoramento (padrão: 20 novas posições de scroll)
- Delay mínimo entre ações em ms (padrão: 2000)
- Delay máximo entre ações em ms (padrão: 8000)
- Horários permitidos para scraping (time range picker, padrão: 08:00-23:00)
- Threshold do Viral Score para alertas (padrão: 70)
- Nível mínimo de conhecimento para geração sem aviso (padrão: 40%)

**Custo e Uso:**
- Estimativa de gasto Gemini no mês atual (calculado por tokens consumidos registrados em log)
- Consumo estimado de MB no Decudo no mês atual
- Alertas configuráveis: alerta quando Gemini > R$ X/mês, quando Decudo > Y MB/mês

---

## 32. Segurança e Gestão de Chaves

### Criptografia de credenciais sensíveis

As chaves do Gemini e Decudo nunca são armazenadas em texto puro no banco. O mecanismo:

- Cada credencial é criptografada com AES-256-GCM antes de ser salva
- A `MASTER_ENCRYPTION_KEY` existe apenas como variável de ambiente no Vercel — nunca no banco
- A criptografia usa nonce aleatório por operação — mesmo a mesma string produz ciphertexts diferentes
- O formato armazenado no banco: `nonce_hex:ciphertext_hex`
- A descriptografia acontece apenas em memória, no momento de usar a credencial
- Nunca logar credenciais descriptografadas, mesmo em modo de debug

### Row Level Security

RLS habilitado em todas as tabelas com dados do usuário:
- `influenciadores`, `videos`, `transcricoes`, `roteiros`, `memorias_estruturadas`, `memoria_chunks`
- Política básica: apenas usuários autenticados acessam (sistema single-tenant)

### Rate Limiting nas APIs externas

Middleware de rate limiting via Upstash em todas as rotas `/api/v1/`:
- 100 requisições por hora por API Key
- Sliding window (não reset fixo — impede burst no reset)
- Headers de resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Autenticação de usuários

Sistema single-tenant: Supabase Auth com email/senha. Magic link como alternativa. Sessões com expiração de 7 dias, renováveis automaticamente enquanto o usuário estiver ativo. Middleware de autenticação protege todas as rotas do Next.js antes de qualquer lógica de negócio.

---

## 33. Custo e Monitoramento

### Estimativa de custo por 1.000 vídeos processados

| Operação | Ferramenta | Custo estimado |
|---|---|---|
| Scraping de metadados | Decudo (~80MB) | ~$0,50 |
| Download de vídeos | yt-dlp (gratuito) | $0,00 |
| Separação vocal (Demucs) | Worker Railway (CPU) | ~$2,00 |
| Transcrição (1.000 × 45s áudio) | Gemini 1.5 Pro Audio | ~$1,40 |
| Embeddings (1.000 chunks × 768 dims) | text-embedding-004 | ~$0,10 |
| Análise de 7 agentes × 1.000 vídeos | Gemini 1.5 Flash | ~$8,00 |
| **Total por 1.000 vídeos** | | **~$12,00** |

### Estimativa de custo por roteiro gerado

| Operação | Ferramenta | Custo estimado |
|---|---|---|
| Embedding de consulta RAG | text-embedding-004 | ~$0,001 |
| Busca pgvector | Supabase (incluso) | $0,00 |
| Montagem de briefing | Sem chamada LLM | $0,00 |
| Geração do draft | Gemini 1.5 Pro | ~$0,006 |
| Revisão | Gemini 1.5 Flash | ~$0,001 |
| **Total por roteiro** | | **~$0,008** |

### Registro de custos

Cada chamada à API do Gemini deve registrar os tokens utilizados em log. Um job periódico (diário) soma os tokens por tipo de operação e armazena em uma tabela de uso. O frontend exibe o custo estimado do mês atual baseado neste log, usando os preços atuais do Gemini como multiplicador.

---

## 34. Fases de Desenvolvimento com Critérios de Aceitação

### Fase 1 — Pipeline de Extração e Transcrição (Semanas 1-3)

**Objetivo:** dado um @handle, o sistema coleta, baixa, processa e transcreve vídeos de forma automatizada e resiliente.

**Entregas obrigatórias:**
- Setup de todos os serviços: Supabase (banco + schema completo), Inngest (filas), Worker Python no Railway (Demucs + FFmpeg)
- Cadastro de influenciador via interface
- Modo inicial de scraping com Playwright + Decudo
- Deduplicação de vídeos
- Download via yt-dlp
- Separação vocal via Demucs no worker Railway
- Transcrição via Gemini Audio
- Política de retenção de arquivos (deletar mídia após transcrição)
- Resolução manual de CAPTCHA com estado salvo e retomada
- Dashboard básico com status em tempo real via Supabase Realtime
- Tela de configurações com teste de conectividade de cada serviço

**Critério de aceitação:** inserir @handle de um influenciador com 50+ vídeos. Sem intervenção manual além de eventuais CAPTCHAs, após 2 horas ter >= 30 vídeos com `status = 'transcrito'` e o texto das transcrições visível no banco, preservando gírias e expressões sem normalização.

### Fase 2 — Sistema de Memória e Agentes de Análise (Semanas 4-6)

**Objetivo:** as transcrições alimentam uma memória multidimensional precisa do influenciador.

**Entregas obrigatórias:**
- pgvector configurado com índice ivfflat
- Chunking de transcrições com overlap
- Geração de embeddings e inserção no banco
- Função SQL `buscar_chunks_similares` com ponderação por relevância
- Todos os 7 agentes de análise implementados com validação de JSON de output
- Agente Diretor com orquestração paralela
- Atualização incremental da memória estruturada com limites e compressão
- Cálculo do Nível de Conhecimento
- Painel visual de conhecimento por dimensão
- Modo monitoramento do scraper (diferenciado do inicial)

**Critério de aceitação:** com 50 vídeos analisados de um influenciador real, a memória de hooks deve identificar corretamente os 3 principais tipos que ele usa, com exemplos reais de cada tipo. A memória de vocabulário deve listar pelo menos 5 expressões características verificáveis nos vídeos originais.

### Fase 3 — Geração de Roteiros (Semanas 7-10)

**Objetivo:** o sistema gera roteiros que passam no teste de autoria cega.

**Entregas obrigatórias:**
- Lógica de montagem do Briefing de Geração
- Prompt Mestre de Geração implementado com todas as 5 seções
- Critério de seleção de hook
- RAG com todos os níveis de fallback
- Estratégia de cold start com avisos na UI
- Agente Revisor com iteração automática
- Geração unitária de roteiro
- Geração em lote com diversidade garantida
- Sistema de feedback: aprovação, rejeição e edição
- Captura e processamento de diff de edições para aprendizado
- Ajuste de `relevancia_geracao` por feedback
- Histórico de roteiros com filtros
- Exportação de roteiro (TXT e PDF)
- Fluxo de edição de roteiro por bloco no frontend

**Critério de aceitação:** com 100 vídeos analisados, gerar 3 roteiros para produtos que o influenciador nunca abordou. Submeter anonimamente a uma pessoa familiarizada com o influenciador. Pelo menos 2 dos 3 roteiros devem ser considerados "poderia ser do influenciador" pelo avaliador.

### Fase 4 — Teleprompter e Monitor de Virais (Semanas 11-12)

**Objetivo:** módulos de uso operacional diário funcionando sem atrito.

**Entregas obrigatórias:**
- Teleprompter com todas as especificações da Seção 27
- Modo de ensaio do teleprompter
- Monitor de Virais com Viral Score calculado em tempo real
- Agente Viral analisando vídeos com score >= 70
- Templates virais extraídos e exibíveis
- Detecção de novos vídeos e virais via monitoramento horário
- Alertas em tempo real

**Critério de aceitação:** teleprompter funcionando em dispositivo móvel sem nenhum elemento de UI visível durante a "gravação". Monitor detecta vídeo viral e exibe template extraído em menos de 2 horas após publicação.

### Fase 5 — Segurança e Produção (Semanas 13-14)

**Objetivo:** plataforma robusta, segura e pronta para uso contínuo.

**Entregas obrigatórias:**
- Criptografia AES-256-GCM de todas as credenciais
- RLS habilitado em todas as tabelas
- Rate limiting via Upstash nas APIs externas
- Autenticação completa via Supabase Auth
- Painel de custo e monitoramento de uso
- Jobs de cleanup periódico (briefings, historico de memória)
- Deploy definitivo com variáveis de ambiente configuradas

**Critério de aceitação:** sistema operacional sem erros por 72 horas consecutivas processando 2 influenciadores simultaneamente.

---

## 35. Regras e Princípios Invioláveis

1. **Zero dados mockados.** Qualquer tela ou funcionalidade usa dados reais ou exibe estado de loading/empty state explícito. Nunca dados falsos.

2. **Proxy Decudo exclusivamente para metadados.** Nenhum byte de arquivo de vídeo ou áudio passa pelo Decudo. Violação desta regra esgota a franquia em dias.

3. **A memória cresce por mescla, não por substituição.** Ao processar um novo vídeo, os agentes mesclam os novos padrões com os existentes, ponderando por frequência e performance. Nunca sobrescrever a memória com resultado de um único vídeo.

4. **Limites de memória são invioláveis.** Nenhum array de exemplos em JSONB pode crescer além dos limites definidos na Seção 12. A compressão acontece automaticamente.

5. **A validação de JSON dos agentes é obrigatória.** Nenhum dado não validado entra na memória. Em caso de falha dupla de parse, a memória permanece inalterada para aquele vídeo.

6. **O Briefing de Geração é a única fonte de verdade para o gerador.** Nada que não esteja no briefing chega ao Prompt Mestre. O briefing é documentado, auditável e versionado.

7. **O Prompt Mestre é a parte mais crítica da plataforma.** Mudanças no prompt devem ser tratadas como mudanças de versão — testadas com exemplos de referência antes de deploy.

8. **Anti-detecção não é opcional e não tem modo de emergência.** Delays, rotação de perfis e comportamento sintético humano estão ativos em 100% das sessões. Não existe "modo rápido" sem anti-detecção.

9. **O formato canônico do roteiro é inviolável.** Todo roteiro gerado segue o schema JSON completo. Sem exceções para "versões simplificadas".

10. **Chaves nunca em texto puro.** Nenhuma credencial de terceiros em variável de ambiente do servidor, log, ou banco sem criptografia. A `MASTER_ENCRYPTION_KEY` nunca no banco — apenas em variável de ambiente do Vercel.

11. **O pipeline é tolerante a falhas individuais.** Nenhum vídeo com falha bloqueia o processamento dos demais. O sistema registra falhas, tenta retry conforme política, e continua.

12. **O feedback do usuário alimenta o sistema imediatamente.** Aprovação, rejeição ou edição de roteiro dispara ajuste de relevância dos chunks RAG usados e processamento do diff (se houver edição) de forma assíncrona — nunca bloqueante para a UI.

13. **O teleprompter é um instrumento profissional, não uma página web.** Qualquer elemento de UI durante a gravação que chame a atenção do influenciador é um bug de produto.

14. **Modo inicial e modo monitoramento do scraper são processos distintos.** Nunca misturar os comportamentos, limites e estratégias dos dois modos.

15. **O cold start é tratado como estado de produto, não como erro.** Usuários em cold start veem progresso claro, estimativa de tempo, e geração gradual — nunca uma experiência de produto quebrada.

---

*Master Plan v3.0 — auditoria técnica completa aplicada. 35 seções. Zero ambiguidades estruturais. Pronto para implementação pela Antgravity.*
