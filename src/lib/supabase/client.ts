import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente Supabase para uso no browser (client components).
 * Usa createBrowserClient para ler/gravar cookies de sessão,
 * garantindo que o JWT do usuário seja enviado nas queries
 * e as políticas RLS funcionem corretamente.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
