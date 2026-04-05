export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, string> = {}

  checks['INNGEST_BASE_URL'] = process.env.INNGEST_BASE_URL ? 'SET' : 'MISSING'
  checks['INNGEST_EVENT_KEY'] = process.env.INNGEST_EVENT_KEY ? 'SET' : 'MISSING'
  checks['INNGEST_SIGNING_KEY'] = process.env.INNGEST_SIGNING_KEY ? 'SET' : 'MISSING'
  checks['NEXT_PUBLIC_SUPABASE_URL'] = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'
  checks['SUPABASE_SERVICE_ROLE_KEY'] = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'

  try {
    const { serve } = await import('inngest/next')
    checks['inngest_import'] = 'OK'
  } catch (e) {
    checks['inngest_import'] = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  try {
    const { inngest } = await import('@/lib/inngest/client')
    checks['inngest_client'] = 'OK'
  } catch (e) {
    checks['inngest_client'] = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  return Response.json(checks)
}
