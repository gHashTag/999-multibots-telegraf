/**
 * Test new environment variable names for Inngest
 */

import * as dotenv from 'dotenv'
dotenv.config()

// Import after loading .env
import { inngestProvider } from '../src/inngest_app/inngest-provider'

async function testNewEnvVars() {
  console.log('🧪 Testing new Inngest environment variable names...\n')

  // Check environment variables
  console.log('📝 Environment variables loaded:')
  console.log('BOT_INNGEST_EVENT_KEY:', process.env.BOT_INNGEST_EVENT_KEY ? '✅ SET' : '❌ NOT SET')
  console.log('BOT_INNGEST_SIGNING_KEY:', process.env.BOT_INNGEST_SIGNING_KEY ? '✅ SET' : '❌ NOT SET')
  console.log('BOT_INNGEST_BASE_URL:', process.env.BOT_INNGEST_BASE_URL || 'default')
  console.log('')
  console.log('RENDER_INNGEST_EVENT_KEY:', process.env.RENDER_INNGEST_EVENT_KEY ? '✅ SET' : '❌ NOT SET')
  console.log('RENDER_INNGEST_SIGNING_KEY:', process.env.RENDER_INNGEST_SIGNING_KEY ? '✅ SET' : '❌ NOT SET')
  console.log('RENDER_INNGEST_BASE_URL:', process.env.RENDER_INNGEST_BASE_URL || 'default')
  console.log('')

  // Check provider configuration
  console.log('🔍 Checking inngestProvider configuration...\n')
  const instances = inngestProvider.getAvailableInstances()
  console.log('Available instances:', instances)
  console.log('')

  for (const instance of instances) {
    const config = inngestProvider.getConfig(instance)
    if (config) {
      console.log(`✅ ${instance} instance configured:`)
      console.log('   - baseUrl:', config.baseUrl)
      console.log('   - hasEventKey:', !!config.eventKey)
      console.log('   - hasSigningKey:', !!config.signingKey)
      console.log('   - hasClient:', !!config.client)
      console.log('')
    } else {
      console.log(`❌ ${instance} instance NOT configured`)
      console.log('')
    }
  }

  // Check availability
  console.log('🌐 Checking instance availability...\n')
  const status = await inngestProvider.getStatus()
  for (const [instance, info] of Object.entries(status)) {
    console.log(`${instance}:`)
    console.log('   - configured:', info.configured ? '✅' : '❌')
    console.log('   - available:', info.available ? '✅' : '❌')
    console.log('')
  }

  console.log('✅ Test completed!')
}

testNewEnvVars()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
