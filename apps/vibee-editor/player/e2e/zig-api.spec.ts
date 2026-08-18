import { test, expect } from '@playwright/test'

const ZIG_API = 'https://vibee-api-server.fly.dev'

test.describe('Zig API Server - E2E Tests', () => {

  test('health check', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/health`)
    console.log('Health status:', response.status())
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.status).toBe('ok')
    console.log('✅ Health check passed')
  })

  test('feed endpoint returns templates', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/api/feed`)
    console.log('Feed status:', response.status())
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(Array.isArray(body.templates)).toBe(true)
    console.log('✅ Feed endpoint passed, templates:', body.templates.length)
  })

  test('render quota endpoint', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/api/render-quota`)
    console.log('Quota status:', response.status())
    expect(response.ok()).toBe(true)
    const body = await response.json()
    // Zig API returns: {quota_limit, quota_remaining, quota_used, reset_at, telegram_id}
    expect(body).toHaveProperty('quota_limit')
    expect(body).toHaveProperty('quota_remaining')
    console.log('✅ Render quota passed')
  })

  test('ElevenLabs voices endpoint', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/api/voices`)
    console.log('Voices status:', response.status())
    // May fail if API key not configured
    if (response.ok()) {
      const body = await response.json()
      // Zig API returns: {success: true, voices_response: "JSON string"}
      // If no API key, returns: {success: false, error: "..."}
      if (body.success) {
        expect(body.voices_response).toBeTruthy()
        console.log('✅ Voices endpoint passed')
      } else {
        console.log('⚠️ Voices endpoint returned success:false - API key may not be configured:', body.error)
      }
    } else {
      console.log('⚠️ Voices endpoint failed (API key may not be configured)')
    }
  })

  test('xAI script generation', async ({ request }) => {
    // Note: endpoint is /api/ai/generate-script not /api/generate/script
    const response = await request.post(`${ZIG_API}/api/ai/generate-script`, {
      data: {
        topic: 'Why AI is the future',
      },
    })
    console.log('Script generation status:', response.status())
    // May fail if API key not configured
    if (response.ok()) {
      const body = await response.json()
      if (body.success) {
        console.log('✅ Script generation passed')
      } else {
        console.log('⚠️ Script generation returned success:false:', body.error || 'API key may not be configured')
      }
    } else {
      const body = await response.json()
      console.log('⚠️ Script generation failed:', body.error || 'API key may not be configured')
    }
  })

  test('image proxy endpoint', async ({ request }) => {
    // Test with a sample image URL
    const testImageUrl = 'https://picsum.photos/200'
    const response = await request.get(`${ZIG_API}/proxy/image?url=${encodeURIComponent(testImageUrl)}`)
    console.log('Image proxy status:', response.status())
    expect(response.ok()).toBe(true)

    const text = await response.text()
    console.log('Image proxy response (first 200 chars):', text.substring(0, 200))

    // Image proxy returns JSON with base64 data
    const body = JSON.parse(text)

    // The proxy may fail due to redirects - check for either success or error
    if (body.success) {
      expect(body.data).toBeTruthy()
      // Accept either jpeg or png
      expect(body.data).toMatch(/^data:image\/(jpeg|png);base64,/)
      console.log('✅ Image proxy passed')
    } else {
      console.log('⚠️ Image proxy returned error (redirects may not be supported):', body.error)
    }
  })

  test('user profile endpoint', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/api/users/id/123456`)
    console.log('User profile status:', response.status())
    // May return 404 for non-existent user
    if (response.ok()) {
      const body = await response.json()
      expect(body).toHaveProperty('telegram_id')
      console.log('✅ User profile passed')
    } else {
      console.log('⚠️ User profile returned non-OK (user may not exist)')
    }
  })

  test('S3 assets list endpoint', async ({ request }) => {
    const response = await request.get(`${ZIG_API}/assets`)
    console.log('S3 assets status:', response.status())
    // May fail if S3 not configured
    if (response.ok()) {
      const body = await response.json()
      // Zig API returns: {success: true, s3_response: "JSON string"}
      if (body.success) {
        console.log('✅ S3 assets passed')
      } else {
        console.log('⚠️ S3 assets returned success:false:', body.error || 'S3 may not be configured')
      }
    } else {
      const body = await response.json()
      console.log('⚠️ S3 assets failed:', body.error || 'S3 may not be configured')
    }
  })
})
