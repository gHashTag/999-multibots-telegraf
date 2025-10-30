/**
 * Test Inngest SDK in development mode
 * Testing if SDK works WITHOUT event key in dev mode
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

console.log('🧪 Testing Inngest SDK in DEV mode...\n')

// Test 1: Create client WITHOUT eventKey (dev mode)
console.log('Test 1: Creating Inngest client WITHOUT eventKey')
const devClient = new Inngest({
  name: 'dev-test-client',
  // NO eventKey!
})

console.log('✅ Dev client created successfully\n')

// Test 2: Try to send event without event key
console.log('Test 2: Attempting to send event WITHOUT eventKey...')
devClient
  .send({
    name: 'test/dev-event',
    data: { test: true, timestamp: Date.now() },
  })
  .then((result) => {
    console.log('✅ Event sent successfully in dev mode!', result)
  })
  .catch((error) => {
    console.log('❌ Error sending event in dev mode:', error.message)
    console.log('\nThis is EXPECTED in dev mode - events should go to Inngest Dev Server, not Cloud')
  })

// Test 3: Create client WITH eventKey (production mode)
console.log('\nTest 3: Creating Inngest client WITH eventKey (production mode)')
const prodClient = new Inngest({
  name: 'prod-test-client',
  eventKey: process.env.RENDER_INNGEST_EVENT_KEY,
  inngestBaseUrl: 'https://render-v3-production.up.railway.app/api/inngest',
})

console.log('✅ Production client created\n')

setTimeout(() => {
  console.log('\n✅ Tests completed!')
  process.exit(0)
}, 2000)
