/**
 * Test DIRECT POST to Railway render-server endpoint
 * Railway has its own /api/inngest endpoint that accepts direct HTTP calls
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { createHmac } from 'crypto'

const RAILWAY_URL = 'https://render-v3-production.up.railway.app/api/inngest'
const SIGNING_KEY = process.env.RENDER_INNGEST_SIGNING_KEY!
const EVENT_KEY = process.env.RENDER_INNGEST_EVENT_KEY!

function createSignature(body: string, timestamp: number): string {
  const hmac = createHmac('sha256', SIGNING_KEY)
  hmac.update(timestamp.toString())
  hmac.update(body)
  return `t=${timestamp}&s=${hmac.digest('hex')}`
}

const payload = {
  job_id: '00000000-0000-0000-0000-000000000003',
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
  kie_api_key: process.env.KIE_AI_API_KEY,
  cover_url: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
  intro_text_1: 'Ai-Stars',
  intro_text_2: 'News',
  upper_intro_text: 'Ai-Stars',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY,
    avatar_photo_url:
      'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/avatar-dima.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech:
      'AGENTS.md — это новый, открытый формат файла для проектов, который служит как своеобразный README для AI-агентов-кодеров. Его цель — предоставить отдельное, удобное место для инструкций и контекста, необходимых именно искусственным агентам, а не людям. AGENTS.md помогает агентам быстрее понимать архитектуру проекта, правила взаимодействия с кодом и предпочтительные практики разработки, минимизируя необходимость дополнительных пояснений от человека.',
  },
}

console.log('🧪 Testing DIRECT POST to Railway render-server...\n')
console.log('URL:', RAILWAY_URL)
console.log('Job ID:', payload.job_id)
console.log('')

const bodyString = JSON.stringify(payload)
const timestamp = Math.floor(Date.now() / 1000)
const signature = createSignature(bodyString, timestamp)

console.log('📤 Sending direct POST request...')
console.log('Timestamp:', timestamp)
console.log('Signature:', signature.substring(0, 50) + '...')
console.log('')

fetch(RAILWAY_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Inngest-Signature': signature,
    Authorization: `Bearer ${EVENT_KEY}`,
  },
  body: bodyString,
})
  .then(async (response) => {
    console.log('Response status:', response.status, response.statusText)

    const text = await response.text()
    console.log('Response body:', text)

    if (response.ok) {
      console.log('\n✅ SUCCESS! Railway render-server accepted the request!')
      process.exit(0)
    } else {
      console.log('\n❌ Failed:', response.status)
      process.exit(1)
    }
  })
  .catch((error) => {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
