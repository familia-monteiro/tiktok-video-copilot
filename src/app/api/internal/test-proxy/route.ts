import { NextResponse } from 'next/server'
import { getConfigs } from '@/lib/config/get-config'

export async function GET() {
  try {
    const configs = await getConfigs([
      'decodo_host',
      'decodo_port_from',
      'decodo_username',
      'decodo_password',
    ])

    const host = configs.decodo_host || process.env.DECODO_SERVER || 'br.decodo.com'
    const port_from = parseInt(configs.decodo_port_from || '10001', 10) || 10001
    const port_to = parseInt(configs.decodo_port_to || '10010', 10) || 10010
    const username = configs.decodo_username || process.env.DECODO_USERNAME || 'fallback_user'
    const password = configs.decodo_password || process.env.DECODO_PASSWORD || 'fallback_pass'

    const proxyObj = { host, port_from, port_to, username, password }
    
    return NextResponse.json({
      success: true,
      proxyObj: { ...proxyObj, password_hidden: proxyObj.password ? '***' + proxyObj.password.slice(-2) : null },
      configsRaw: { ...configs, decodo_password: '***' }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message })
  }
}
