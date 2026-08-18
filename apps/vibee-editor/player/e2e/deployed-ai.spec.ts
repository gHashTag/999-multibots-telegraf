import { test, expect } from '@playwright/test'

const PROD_API = 'https://vibee-ai-server.fly.dev'

test.describe('Deployed AI Server - Production Tests', () => {

  test('root endpoint returns API info', async ({ request }) => {
    const response = await request.get(`${PROD_API}/`)
    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.name).toBe('VIBEE AI Media Server')
    expect(Array.isArray(body.endpoints)).toBe(true)
    console.log('✅ Root endpoint passed')
  })

  test('health check', async ({ request }) => {
    const response = await request.get(`${PROD_API}/health`)
    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.services.xai).toBe(true)
    expect(body.services.cartesia).toBe(true)
    console.log('✅ Health check passed')
  })

  test('generate audio via Cartesia', async ({ request }) => {
    const response = await request.post(`${PROD_API}/generate/audio`, {
      data: {
        text: 'Hello from deployed server!',
        voice_id: '694f9389-aac1-45b6-b726-9d9369183238',
      },
    })

    console.log('Audio response status:', response.status())
    const body = await response.json()
    console.log('Audio response body:', JSON.stringify(body).substring(0, 200))

    expect(response.ok()).toBe(true)

    expect(body.success).toBe(true)
    expect(body.audio).toBeTruthy()
    console.log('✅ Audio generation passed, base64 length:', body.audio.length)
  })

  test('generate image via xAI Grok', async ({ request }) => {
    const response = await request.post(`${PROD_API}/generate/image`, {
      data: {
        prompt: 'A cat sitting on a fence',
        aspect_ratio: '1:1',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.url || body.image).toBeTruthy()
    console.log('✅ Image generation passed, URL:', body.url || body.image)
  })

  test('generate script via xAI Grok', async ({ request }) => {
    const response = await request.post(`${PROD_API}/ai/generate-script`, {
      data: {
        topic: 'Why AI is the future',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.choices).toBeTruthy()
    expect(Array.isArray(body.choices)).toBe(true)
    console.log('✅ Script generation passed')
  })
})
