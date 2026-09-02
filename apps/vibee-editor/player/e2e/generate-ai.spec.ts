import { test, expect } from '@playwright/test'

// ============================================================
// Mock helpers
// ============================================================

const FAKE_USER = {
  id: 999,
  first_name: 'Test',
  username: 'testuser',
  is_admin: true,
}

async function setupAuth(page: import('@playwright/test').Page) {
  // Browser mock mode is explicitly no-network/no-charge and is the correct
  // contract for generation UI tests. Signed identity has separate tests.
  await page.goto('/generate/image?mock=1', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await expect
    .poll(() => page.evaluate(() => (window as any).vibeeMock?.(true)))
    .toBe(true)
}

async function setupMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/widget', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-access',
        refresh_token: 'e2e-refresh',
        expires_in: 3600,
        telegram_user: FAKE_USER,
      }),
    })
  })

  // Mock voices
  await page.route('**/api/voices', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        voices: [
          {
            id: 'voice-sarah',
            name: 'Sarah',
            category: 'premade',
            labels: { gender: 'female', accent: 'American' },
          },
          {
            id: 'voice-josh',
            name: 'Josh',
            category: 'premade',
            labels: { gender: 'male', accent: 'American' },
          },
          {
            id: 'voice-custom',
            name: 'My Voice',
            category: 'cloned',
            labels: { gender: 'female' },
          },
        ],
      }),
    })
  })

  // Mock render quota
  await page.route('**/api/render-quota**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_renders: 0,
        free_remaining: 10,
        is_admin: true,
      }),
    })
  })

  // Mock render log
  await page.route('**/api/render-log', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
    })
  })

  // Mock Instagram
  await page.route('**/api/instagram/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Mock WebSocket
  await page.route('**/ws', route => route.abort())

  // Mock image generation (FAL.AI)
  await page.route('**/api/generate/image', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        url: 'https://picsum.photos/512/512',
      }),
    })
  })

  // Mock Replicate API (return Replicate format)
  await page.route('**/api/replicate/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'succeeded',
        output: ['https://picsum.photos/512/512?replicate'],
        id: 'test-prediction-123',
      }),
    })
  })

  // Mock video generation
  await page.route('**/api/generate/video', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
      }),
    })
  })

  // Mock audio generation
  await page.route('**/api/generate/audio', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      }),
    })
  })
}

// ============================================================
// 1. Navigation & Layout
// ============================================================

test.describe('Generate Page — Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
  })

  test('should load generate page with sidebar and results area', async ({
    page,
  }) => {
    await page.goto('/generate/image', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-page', { timeout: 30000 })

    await expect(page.locator('.generate-page')).toBeVisible()
    await expect(page.locator('.generate-sidebar')).toBeVisible()
    await expect(page.locator('section.generate-content')).toBeVisible()
  })

  test('should display header', async ({ page }) => {
    await page.goto('/generate/image', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-page', { timeout: 30000 })

    await expect(page.locator('header.header')).toBeVisible()
  })

  test('should navigate to all tab routes', async ({ page }) => {
    await page.goto('/generate/image', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
    await expect(page.locator('.model-btn-image').first()).toBeVisible()

    await page.goto('/generate/video', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
    await expect(page.locator('.model-btn-video').first()).toBeVisible()

    await page.goto('/generate/audio', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
    await expect(page.locator('.model-btn-audio').first()).toBeVisible()

    await page.goto('/generate/avatar', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
    await expect(page.locator('.audio-source-btn').first()).toBeVisible()
  })

  test('should redirect invalid tab to /generate/image', async ({ page }) => {
    await page.goto('/generate/nonsense', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })

    await expect(page.locator('.model-btn-image').first()).toBeVisible()
    expect(page.url()).toContain('/generate/image')
  })

  for (const width of [390, 1024]) {
    test(`reviewed Kie controls stay in bounds at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      for (const route of ['image', 'video', 'audio', 'avatar']) {
        await page.goto(`/generate/${route}`)
        await page.locator('.generate-form').waitFor()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        )
        expect(overflow).toBeLessThanOrEqual(0)
      }
    })
  }
})

// ============================================================
// 2. Image Tab
// ============================================================

test.describe('Generate Page — Image Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.waitForSelector('.generate-form', { timeout: 30000 })
  })

  test('should render image form elements', async ({ page }) => {
    await expect(page.locator('.model-btn-image')).toHaveCount(5) // 4 FAL.AI + 1 reviewed Kie model
    await expect(page.locator('.form-textarea')).toBeVisible()
    await expect(page.locator('.form-chip')).toHaveCount(4)
    await expect(page.locator('.generate-btn')).toBeVisible()
  })

  test('should have Nano Banana Pro as default model', async ({ page }) => {
    const activeModel = page.locator('.model-btn-image.active')
    await expect(activeModel).toHaveCount(1)
    await expect(activeModel.locator('.model-name')).toContainText(
      'Nano Banana Pro'
    )
  })

  test('should switch model on click', async ({ page }) => {
    await page.locator('.model-btn-image').first().click()
    await expect(
      page.locator('.model-btn-image.active').locator('.model-name')
    ).toContainText('FLUX Ultra')
  })

  test('should switch aspect ratio on click', async ({ page }) => {
    await page.locator('.form-chip', { hasText: '9:16' }).click()
    await expect(page.locator('.form-chip.active')).toContainText('9:16')
  })

  test('should disable generate button when prompt is empty', async ({
    page,
  }) => {
    await expect(page.locator('.generate-btn')).toBeDisabled()
  })

  test('should enable generate button when prompt has text', async ({
    page,
  }) => {
    await page
      .locator('.form-textarea')
      .fill('A beautiful sunset over the ocean')
    await expect(page.locator('.generate-btn')).toBeEnabled()
  })

  test('should generate image and show result', async ({ page }) => {
    await page.locator('.form-textarea').fill('A beautiful sunset')
    await page.locator('.generate-btn').click()

    await page.waitForSelector('.result-item-image', { timeout: 15000 })
    await expect(page.locator('.result-item-image')).toBeVisible()
  })
})

// ============================================================
// 2.5. Image Tab via Kie.ai - MOCKED (never spends provider credits)
// ============================================================

test.describe('Generate Page — Image via Kie.ai', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.goto('/generate/image', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
  })

  test('should show the reviewed Kie model in image tab', async ({ page }) => {
    const modelButtons = page.locator('.model-btn-image')
    await expect(modelButtons).toHaveCount(5)
    await expect(
      page.locator('.model-btn-image', { hasText: 'Kie · Nano Banana' })
    ).toBeVisible()
  })

  test('should select the Kie model', async ({ page }) => {
    await page
      .locator('.model-btn-image', { hasText: 'Kie · Nano Banana' })
      .click()
    const activeModel = page.locator('.model-btn-image.active')
    await expect(activeModel.locator('.model-name')).toContainText(
      'Kie · Nano Banana'
    )
  })

  test('should generate image via the mocked Kie route', async ({ page }) => {
    await page
      .locator('.model-btn-image', { hasText: 'Kie · Nano Banana' })
      .click()
    await page.locator('.form-textarea').fill('A mountain landscape at sunset')
    await page.locator('.generate-btn').click()

    await page.waitForSelector('.result-item-image', { timeout: 15000 })
    await expect(page.locator('.result-item-image')).toBeVisible()
  })
})

test('browser session authenticates a real Kie request with Bearer', async ({
  page,
}) => {
  let authorization = ''
  let requestedModel = ''
  await page.addInitScript(() => {
    sessionStorage.setItem('trinity.app.session.access', 'e2e-access')
    sessionStorage.setItem('trinity.app.session.refresh', 'e2e-refresh')
    sessionStorage.setItem(
      'trinity.app.session.expires-at',
      String(Date.now() + 600_000)
    )
    sessionStorage.setItem(
      'vibee-user',
      JSON.stringify({
        id: 999,
        first_name: 'Browser owner',
        username: 'browser_owner',
        is_admin: true,
      })
    )
    localStorage.removeItem('vibee_mock')
  })
  await page.route('**/api/generate/image', async route => {
    authorization = route.request().headers()['authorization'] ?? ''
    requestedModel = String(route.request().postDataJSON()?.model ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        url: '/s3/vibee-assets/assets/kie-result.png',
        provider: 'kie/google/nano-banana',
      }),
    })
  })
  await page.route('**/s3/vibee-assets/assets/kie-result.png', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: '' })
  )

  await page.goto('/generate/image', { waitUntil: 'domcontentloaded' })
  await page
    .locator('.model-btn-image', { hasText: 'Kie · Nano Banana' })
    .click()
  await page.locator('.form-textarea').fill('A safe authenticated request')
  await page.locator('.generate-btn').click()

  await expect.poll(() => authorization).toBe('Bearer e2e-access')
  expect(requestedModel).toBe('kie/google/nano-banana')
})

// ============================================================
// 3. Video Tab
// ============================================================

test.describe('Generate Page — Video Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.goto('/generate/video', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
  })

  test('should render video form elements', async ({ page }) => {
    await expect(page.locator('.model-btn-video')).toHaveCount(3)
    await expect(page.locator('.form-textarea')).toBeVisible()
    await expect(page.locator('.form-chip', { hasText: '5s' })).toBeVisible()
    await expect(page.locator('.form-chip', { hasText: '10s' })).toBeVisible()
    await expect(page.locator('.generate-btn')).toBeVisible()
  })

  test('should have Veo3 Fast as default model', async ({ page }) => {
    const activeModel = page.locator('.model-btn-video.active')
    await expect(activeModel).toHaveCount(1)
    await expect(activeModel.locator('.model-name')).toContainText('Veo3 Fast')
  })

  test('should toggle duration chips', async ({ page }) => {
    await page.locator('.form-chip', { hasText: '10s' }).click()
    await expect(
      page.locator('.form-chip.active', { hasText: '10s' })
    ).toBeVisible()
  })

  test('uses the documented 6-second option for Kie Grok video', async ({
    page,
  }) => {
    await page
      .locator('.model-btn-video', { hasText: 'Kie · Grok Imagine' })
      .click()
    await expect(page.locator('.form-chip', { hasText: '6s' })).toBeVisible()
    await expect(page.locator('.form-chip', { hasText: '5s' })).toHaveCount(0)
  })

  test('should disable generate button when prompt empty', async ({ page }) => {
    await expect(page.locator('.generate-btn')).toBeDisabled()
  })

  test('should generate video and show result', async ({ page }) => {
    await page.locator('.form-textarea').fill('Drone flying over mountains')
    await page.locator('.generate-btn').click()

    await page.waitForSelector('.result-item-video', { timeout: 15000 })
    await expect(page.locator('.result-item-video')).toBeVisible()
  })
})

// ============================================================
// 4. Audio Tab
// ============================================================

test.describe('Generate Page — Audio Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.goto('/generate/audio', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
  })

  test('should render audio form elements', async ({ page }) => {
    await expect(page.locator('.model-btn-audio').first()).toBeVisible()
    await expect(page.locator('.form-textarea')).toBeVisible()
    await expect(page.locator('.form-range')).toBeVisible()
    await expect(page.locator('.generate-btn')).toBeVisible()
  })

  test('should load voices from API', async ({ page }) => {
    await expect(page.locator('.model-btn-audio')).toHaveCount(5, {
      timeout: 10000,
    })
    await expect(
      page.locator('.model-btn-audio', { hasText: 'Sarah' })
    ).toBeVisible()
    await expect(
      page.locator('.model-btn-audio', { hasText: 'Josh' })
    ).toBeVisible()
    await expect(page.locator('.voice-badge')).toBeVisible()
  })

  test('should select voice on click', async ({ page }) => {
    await page.locator('.model-btn-audio', { hasText: 'Josh' }).click()
    await expect(
      page.locator('.model-btn-audio.active', { hasText: 'Josh' })
    ).toBeVisible()
  })

  test('shows the Kie multilingual TTS provider separately from a voice', async ({
    page,
  }) => {
    await expect(
      page.locator('.model-btn-audio', { hasText: 'Kie · Multilingual Voice' })
    ).toBeVisible()
  })

  test('should disable generate button when text empty', async ({ page }) => {
    await expect(page.locator('.generate-btn')).toBeDisabled()
  })

  test('should enable generate button when text provided', async ({ page }) => {
    await page.locator('.form-textarea').fill('Hello, this is a test voiceover')
    await expect(page.locator('.generate-btn')).toBeEnabled()
  })

  test('should generate audio and show result', async ({ page }) => {
    await page.locator('.form-textarea').fill('Hello world, this is a test.')
    await page.locator('.generate-btn').click()

    await page.waitForSelector('.result-item-audio', { timeout: 15000 })
    await expect(page.locator('.result-item-audio')).toBeVisible()
  })
})

// ============================================================
// 5. Lipsync Tab
// ============================================================

test.describe('Generate Page — Lipsync Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.goto('/generate/avatar', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await page.waitForSelector('.generate-form', { timeout: 30000 })
  })

  test('should render lipsync form elements', async ({ page }) => {
    await expect(
      page.locator('.model-btn', { hasText: 'Kie · Fabric' })
    ).toBeVisible()
    await expect(page.locator('.audio-source-btn')).toHaveCount(3)
    await expect(page.locator('.form-chip', { hasText: '480p' })).toBeVisible()
    await expect(page.locator('.form-chip', { hasText: '720p' })).toBeVisible()
    await expect(page.locator('.generate-btn')).toBeVisible()
  })

  test('should disable generate button when no audio/image provided', async ({
    page,
  }) => {
    await expect(page.locator('.generate-btn')).toBeDisabled()
  })

  test('should toggle resolution chips', async ({ page }) => {
    await page.locator('.form-chip', { hasText: '720p' }).click()
    await expect(
      page.locator('.form-chip.active', { hasText: '720p' })
    ).toBeVisible()
  })
})

// ============================================================
// 6. Results Gallery
// ============================================================

test.describe('Generate Page — Results Gallery', () => {
  test('should show empty state when no results', async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.waitForSelector('.generate-page', { timeout: 30000 })

    await expect(page.locator('.generate-panel .result-item')).toHaveCount(0)
  })

  test('should make result items draggable after generation', async ({
    page,
  }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.waitForSelector('.generate-form', { timeout: 30000 })

    await page.locator('.form-textarea').fill('Test')
    await page.locator('.generate-btn').click()
    await page.waitForSelector('.result-item', { timeout: 15000 })

    await expect(page.locator('.result-item').first()).toHaveAttribute(
      'draggable',
      'true'
    )
  })

  test('should remove result on delete button click', async ({ page }) => {
    await setupMocks(page)
    await setupAuth(page)
    await page.waitForSelector('.generate-form', { timeout: 30000 })

    await page.locator('.form-textarea').fill('Test')
    await page.locator('.generate-btn').click()
    await page.waitForSelector('.result-item', { timeout: 15000 })
    await expect(page.locator('.result-item')).toHaveCount(1)

    await page.locator('.result-remove-btn').first().click()
    await expect(page.locator('.result-item')).toHaveCount(0)
  })
})
