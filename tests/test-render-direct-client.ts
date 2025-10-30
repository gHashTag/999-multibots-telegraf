/**
 * Test creating RENDER client directly like inngest-provider does
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
const renderBaseUrl = 'https://render-v3-production.up.railway.app/api/inngest'

console.log('🧪 Testing RENDER client creation...\n')
console.log('renderEventKey:', renderEventKey ? '✅ SET' : '❌ NOT SET')
console.log('renderBaseUrl:', renderBaseUrl)
console.log('')

const renderClient = new Inngest({
  name: 'render-server-client',
  eventKey: renderEventKey,
  inngestBaseUrl: renderBaseUrl,
})

console.log('✅ RENDER client created')
console.log('Client details:')
console.log('- name:', renderClient.name)
console.log('- inngestBaseUrl:', (renderClient as any).inngestBaseUrl?.href)
console.log('- inngestApiUrl:', (renderClient as any).inngestApiUrl?.href)
console.log('')

console.log('📤 Sending test event...')

renderClient
  .send({
    name: 'test/render-integration',
    data: {
      test: true,
      timestamp: Date.now(),
      source: 'test-render-direct-client',
    },
  })
  .then(() => {
    console.log('✅ Event sent successfully to Railway!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error sending event:', error.message)
    console.error('')
    console.error('Full error:', error)
    process.exit(1)
  })
