import { test, expect } from '@playwright/test'

// ============================================================
// Real AI Integration Tests - Direct API calls to Zig server
// ============================================================
// These tests call the actual Zig AI server with xAI Grok Imagine + Cartesia
// Make sure the Zig server is running on port 3333 before running these tests
//
// Start server:
//   export XAI_API_KEY=your_key
//   export CARTESIA_API_KEY=your_key
//   ./ai-server
//
// Run tests:
//   npx playwright test e2e/generate-ai-real.spec.ts
// ============================================================

const ZIG_SERVER = 'http://localhost:3333'

test.describe('Real AI Integration — Direct API Tests', () => {

  // ============================================================
  // Health Check
  // ============================================================

  test('should verify Zig AI server is running', async ({ request }) => {
    const response = await request.get(`${ZIG_SERVER}/health`)
    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.services.xai).toBe(true)
    expect(body.services.cartesia).toBe(true)
  })

  // ============================================================
  // Audio Generation - Real Cartesia Sonic-3
  // ============================================================

  test('should generate real audio via Cartesia Sonic-3', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/generate/audio`, {
      data: {
        text: 'Hello world, this is a test.',
        voice_id: '694f9389-aac1-45b6-b726-9d9369183238',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.audio).toBeTruthy()
    expect(body.format).toBe('wav')

    // Verify base64 audio is valid
    expect(body.audio.length).toBeGreaterThan(100)
  })

  test('should generate audio with different text', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/generate/audio`, {
      data: {
        text: 'Testing voice generation with a longer sentence.',
        voice_id: '694f9389-aac1-45b6-b726-9d9369183238',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.audio).toBeTruthy()
  })

  test('should return error for empty text', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/generate/audio`, {
      data: {
        text: '',
        voice_id: '694f9389-aac1-45b6-b726-9d9369183238',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('text required')
  })

  // ============================================================
  // Image Generation - Real xAI Grok Imagine
  // ============================================================

  test('should generate real image via xAI Grok Imagine', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/generate/image`, {
      data: {
        prompt: 'A red sunset over mountains',
        aspect_ratio: '16:9',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.url || body.image).toBeTruthy()
  })

  test('should handle image generation error for empty prompt', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/generate/image`, {
      data: {
        prompt: '',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('prompt required')
  })

  // ============================================================
  // Script Generation - Real xAI Chat Completions
  // ============================================================

  test('should generate real script via xAI Grok', async ({ request }) => {
    const response = await request.post(`${ZIG_SERVER}/ai/generate-script`, {
      data: {
        topic: 'The benefits of exercise',
        style: 'engaging',
        duration: '30s',
        language: 'English',
      },
    })

    expect(response.ok()).toBe(true)

    const body = await response.json()
    // xAI returns raw chat completion format: {choices: [{message: {content: "..."}}]}
    expect(body.choices).toBeTruthy()
    expect(Array.isArray(body.choices)).toBe(true)
    expect(body.choices[0].message.content).toBeTruthy()

    // The content should be a JSON string with script data
    const content = body.choices[0].message.content
    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(50)
  })
})
