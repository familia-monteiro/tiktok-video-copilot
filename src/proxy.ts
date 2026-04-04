/**
 * Middleware Next.js — Rate limiting + proteção de rotas autenticadas.
 * Rate limit: Upstash sliding window 100 req/hora por API key nas rotas /api/v1/.
 * Auth: Supabase Auth protege todas as rotas do dashboard.
 * Referência: Seção 32 do Master Plan v3.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createServerClient } from '@supabase/ssr'

// ────────────────────────────────────────────────────────────
// Rate limiter (lazy init — apenas quando variáveis estão presentes)
// ────────────────────────────────────────────────────────────
let ratelimit: Ratelimit | null = null

function getRatelimiter(): Ratelimit | null {
  if (ratelimit) return ratelimit
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(100, '1 h'),
    analytics: false,
    prefix: 'rl:tiktok-copilot',
  })
  return ratelimit
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Rate limiting nas rotas públicas /api/v1/ ──────────────
  if (pathname.startsWith('/api/v1/')) {
    const rl = getRatelimiter()
    if (rl) {
      // Identificar por API key no header ou por IP como fallback
      const apiKey = request.headers.get('x-api-key')
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'anonymous'
      const identifier = apiKey ?? `ip:${ip}`

      const { success, limit, reset, remaining } = await rl.limit(identifier)

      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit excedido. Máximo 100 requisições por hora.' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset),
              'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            },
          }
        )
      }

      // Adicionar headers de rate limit na resposta normal
      const response = NextResponse.next()
      response.headers.set('X-RateLimit-Limit', String(limit))
      response.headers.set('X-RateLimit-Remaining', String(remaining))
      response.headers.set('X-RateLimit-Reset', String(reset))
      return response
    }

    // Se Upstash não está configurado, permitir sem rate limit (desenvolvimento)
    return NextResponse.next()
  }

  // ── Proteção de rotas do dashboard com Supabase Auth ──────
  // Rotas públicas que não precisam de auth
  const publicPaths = ['/login', '/auth/callback', '/api/inngest', '/api/internal/']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Se Supabase não está configurado, permitir acesso (ambiente de dev sem auth)
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { session } } = await supabase.auth.getSession()

  // Redirecionar para login se não autenticado
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Aplicar a todas as rotas exceto assets estáticos
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// Alias para compatibilidade
export { proxy as middleware }
