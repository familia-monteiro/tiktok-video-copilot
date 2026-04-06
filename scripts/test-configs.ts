const { getConfigs } = require('./src/lib/config/get-config')
const { supabaseAdmin } = require('./src/lib/supabase/server')

async function test() {
  console.log('Fetching configs...')
  try {
    const configs = await getConfigs([
      'decodo_host',
      'decodo_port_from',
      'decodo_username',
      'decodo_password',
    ])
    console.log('Configs:', configs)
  } catch (e) {
    console.error('Error fetching configs:', e)
  }
}

test()
