/**
 * Inicialização do browser com anti-detecção.
 * Referência: Seção 5 (Vetores 1-6) e Seção 6 (Proxy Decodo) do Master Plan v3.0
 *
 * Usa playwright-extra + puppeteer-stealth para mascarar:
 * - Canvas fingerprint (randomizado por sessão)
 * - WebGL renderer (substituído por valores reais)
 * - AudioContext
 * - navigator.webdriver
 * - window.chrome
 * - Dimensões de viewport (iPhone 14 Pro: 390×844)
 */

import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import path from 'path'
import fs from 'fs'
import type { Browser, BrowserContext } from 'playwright'
import { getConfig } from '@/lib/config/get-config'

// Aplicar plugin stealth globalmente
chromium.use(StealthPlugin())

const PROFILES_DIR = path.join(process.cwd(), '.scraper-profiles')

export interface BrowserProfile {
  id: string
  influencer_id: string
  storage_state_path: string
  last_used_at: Date
  captcha_count_1h: number
  in_quarantine: boolean
  quarantine_until: Date | null
}

/**
 * Inicializa browser com proxy Decodo e perfil persistente.
 * Referência: Seções 5 e 6 do Master Plan.
 *
 * @param profileId - ID do perfil de browser a usar
 * @param proxyConfig - Configuração do proxy Decodo
 */
export async function launchBrowser(
  profileId: string,
  proxyConfig: { server: string; username: string; password: string }
): Promise<{ browser: Browser; context: BrowserContext }> {
  // Garantir que o diretório de perfis existe
  const profileDir = path.join(PROFILES_DIR, profileId)
  fs.mkdirSync(profileDir, { recursive: true })

  const storageStatePath = path.join(profileDir, 'storage-state.json')

  const browser = await chromium.launch({
    headless: true,
    proxy: {
      server: proxyConfig.server,
      username: proxyConfig.username,
      password: proxyConfig.password,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=390,844',   // iPhone 14 Pro
    ],
  })

  // Carregar estado de storage salvo (cookies, localStorage, IndexedDB)
  const storageState = fs.existsSync(storageStatePath)
    ? storageStatePath
    : undefined

  const context = await browser.newContext({
    proxy: {
      server: proxyConfig.server,
      username: proxyConfig.username,
      password: proxyConfig.password,
    },
    storageState,
    viewport: { width: 390, height: 844 },    // iPhone 14 Pro — Seção 5 Vetor 2
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    geolocation: { latitude: -23.5505, longitude: -46.6333 }, // São Paulo
    permissions: ['geolocation'],
  })

  return { browser, context }
}

/**
 * Salva o estado do browser profile em disco (cookies, localStorage).
 * Seção 5 — Vetor 5: "perfis de browser persistidos em disco entre sessões"
 */
export async function saveProfileState(
  context: BrowserContext,
  profileId: string
): Promise<void> {
  const profileDir = path.join(PROFILES_DIR, profileId)
  fs.mkdirSync(profileDir, { recursive: true })
  const storageStatePath = path.join(profileDir, 'storage-state.json')
  await context.storageState({ path: storageStatePath })
}

/**
 * Seleciona o próximo perfil disponível para um influenciador.
 * Mantém mínimo de 5 perfis, rotação round-robin.
 * Seção 5 — Vetor 5.
 */
export function selectProfile(influencerId: string): string {
  const profilesDir = PROFILES_DIR
  fs.mkdirSync(profilesDir, { recursive: true })

  const profilePrefix = `inf_${influencerId.slice(0, 8)}`

  // Listar perfis existentes para este influenciador
  const existing = fs.readdirSync(profilesDir)
    .filter((d) => d.startsWith(profilePrefix))

  // Garantir mínimo de 5 perfis
  while (existing.length < 5) {
    const newId = `${profilePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    fs.mkdirSync(path.join(profilesDir, newId), { recursive: true })
    existing.push(newId)
  }

  // Round-robin baseado em timestamp atual
  const index = Math.floor(Date.now() / (45 * 60 * 1000)) % existing.length
  return existing[index]
}

/**
 * Obtém configuração do proxy Decodo do banco de dados com rotação de porta.
 * Lê: decodo_host, decodo_port_from, decodo_port_to, decodo_username, decodo_password.
 * Seleciona uma porta aleatória no intervalo a cada chamada para rotação de IP.
 * Seção 6 do Master Plan.
 */
export async function getProxyConfig(): Promise<{ server: string; username: string; password: string }> {
  const [host, portFromStr, portToStr, username, password] = await Promise.all([
    getConfig('decodo_host'),
    getConfig('decodo_port_from'),
    getConfig('decodo_port_to'),
    getConfig('decodo_username'),
    getConfig('decodo_password'),
  ])

  if (!host || !portFromStr || !username || !password) {
    throw new Error(
      'Credenciais do proxy Decodo incompletas. Configure no painel de Configurações: ' +
      'Host, Porta inicial, Porta final, Usuário, Senha.'
    )
  }

  const portFrom = parseInt(portFromStr, 10)
  const portTo = parseInt(portToStr ?? portFromStr, 10)

  // Rotação: porta aleatória no intervalo a cada sessão
  const port = portFrom + Math.floor(Math.random() * (portTo - portFrom + 1))

  return {
    server: `http://${host}:${port}`,
    username,
    password,
  }
}
