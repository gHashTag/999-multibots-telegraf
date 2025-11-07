/**
 * Test using baseUrl parameter instead of inngestBaseUrl
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
const renderBaseUrl = 'https://render-v3-production.up.railway.app'

console.log('🧪 Testing baseUrl parameter...\n')

// Try creating client with baseUrl (from new docs)
const client = new Inngest({
  name: 'test-baseurl',
  eventKey: renderEventKey,
  baseUrl: renderBaseUrl, // ← Using baseUrl instead of inngestBaseUrl
} as any)

console.log('✅ Client created with baseUrl parameter')
console.log('Client details:')
console.log('- name:', client.name)
console.log('- inngestBaseUrl:', (client as any).inngestBaseUrl?.href)
console.log('- inngestApiUrl:', (client as any).inngestApiUrl?.href)
console.log('')

console.log('📤 Sending test event...')

client
  .send({
    name: 'test/baseurl-test',
    data: {
      test: true,
      timestamp: Date.now(),
    },
  })
  .then(() => {
    console.log('✅ Event sent successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error.message)
    process.exit(1)
  })
