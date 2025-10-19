/**
 * Test direct POST to Railway Inngest without SDK
 * To understand what endpoint Railway expects
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { createHmac } from 'crypto'

const RAILWAY_URL = 'https://render-v3-production.up.railway.app'
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY
const SIGNING_KEY = process.env.RENDER_INNGEST_SIGNING_KEY

function createSignature(body: string, timestamp: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY!)
  hmac.update(timestamp.toString())
  hmac.update(body)
  const signature = hmac.digest('hex')
  return `t=${timestamp}&s=${signature}`
}

async function testEndpoint(endpoint: string) {
  const payload = {
    name: 'test/connection',
    data: { test: true, timestamp: Date.now() },
    ts: Date.now(),
  }

  const bodyString = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createSignature(bodyString, timestamp)

  console.log(`\n🧪 Testing endpoint: ${endpoint}`)

  try {
    const response = await fetch(`${RAILWAY_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inngest-Signature': signature,
        'Authorization': `Bearer ${EVENT_KEY}`,
      },
      body: bodyString,
    })

    console.log(`   Status: ${response.status} ${response.statusText}`)

    const text = await response.text()
    console.log(`   Response: ${text.substring(0, 200)}`)

    if (response.ok) {
      console.log(`   ✅ SUCCESS!`)
      return true
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
  }

  return false
}

async function main() {
  console.log('🔍 Testing different endpoints on Railway render-server...')
  console.log(`Base URL: ${RAILWAY_URL}`)
  console.log('')

  const endpoints = [
    '/api/inngest', // Функции
    '/api/events', // Self-hosted Inngest обычно использует
    `/api/e/${EVENT_KEY}`, // SDK формат
    '/api/v1/events', // Альтернативный формат
  ]

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint)
    if (success) {
      console.log(`\n🎉 Found working endpoint: ${endpoint}`)
      break
    }
  }
}

main().catch(console.error)
