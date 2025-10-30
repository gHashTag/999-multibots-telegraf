/**
 * Test correct baseUrl для self-hosted Inngest
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { Inngest } from 'inngest'

const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY

// Try different baseUrl formats
const tests = [
  {
    name: 'With /api/inngest (current)',
    baseUrl: 'https://render-v3-production.up.railway.app/api/inngest',
    expectedUrl: 'https://render-v3-production.up.railway.app/api/inngest/e/{key}',
  },
  {
    name: 'With /api only',
    baseUrl: 'https://render-v3-production.up.railway.app/api',
    expectedUrl: 'https://render-v3-production.up.railway.app/api/e/{key}',
  },
  {
    name: 'Root only',
    baseUrl: 'https://render-v3-production.up.railway.app',
    expectedUrl: 'https://render-v3-production.up.railway.app/e/{key}',
  },
]

for (const test of tests) {
  console.log(`\n📝 Test: ${test.name}`)
  console.log(`   baseUrl: ${test.baseUrl}`)

  const client = new Inngest({
    name: 'test-client',
    eventKey: renderEventKey,
    inngestBaseUrl: test.baseUrl,
  })

  const actualUrl = (client as any).inngestApiUrl?.href
  console.log(`   Actual URL: ${actualUrl}`)
  console.log(`   Expected: ${test.expectedUrl.replace('{key}', 'xxx...')}`)
}

console.log('\n💡 Self-hosted Inngest обычно использует /api/events, а не /api/e/{eventKey}')
console.log('🤔 Но SDK всегда добавляет /e/{eventKey}')
console.log('')
console.log('✅ Решение: нужно проверить, что ожидает Railway render-server')
