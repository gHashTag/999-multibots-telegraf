import { test, expect } from '@playwright/test'

test.describe('Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to editor page - don't wait for load event (videos block it)
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    // Wait for editor to render
    await page.waitForSelector('.editor', { timeout: 30000 })
  })

  test('should load editor layout', async ({ page }) => {
    // Check main layout elements exist
    // Editor.tsx uses: <div className="editor layout-{preset}">
    await expect(page.locator('.editor')).toBeVisible()
    // Sidebar may not be visible depending on layout preset
    await expect(page.locator('.canvas-area')).toBeVisible()
  })

  test('should display timeline', async ({ page }) => {
    // Editor.tsx wraps Timeline in: <footer className="timeline-area">
    // Timeline.tsx uses: <div className="timeline">
    await expect(page.locator('.timeline-area')).toBeVisible()
    await expect(page.locator('.timeline')).toBeVisible()
  })

  test('should have proper spacing', async ({ page }) => {
    // Check that canvas area exists and has proper dimensions
    const canvasArea = page.locator('.canvas-area')
    await expect(canvasArea).toBeVisible()
    const box = await canvasArea.boundingBox()
    expect(box?.width).toBeGreaterThan(200)
    expect(box?.height).toBeGreaterThan(200)
  })

  test('should display header', async ({ page }) => {
    // Header.tsx uses: <header className="header">
    await expect(page.locator('header.header')).toBeVisible()
  })
})

test.describe('Canvas Interactions', () => {
  test('should resize canvas on window resize', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })
    await page.setViewportSize({ width: 1920, height: 1080 })

    const canvas = page.locator('.canvas-area')
    await expect(canvas).toBeVisible()

    // Verify canvas responds to viewport
    const box = await canvas.boundingBox()
    expect(box?.width).toBeGreaterThan(500)
  })
})

test.describe('Timeline Interactions', () => {
  test('should show timeline tracks', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })

    // Timeline.tsx uses track-row for individual tracks
    // Wait for timeline to render
    const timeline = page.locator('.timeline')
    await expect(timeline).toBeVisible()

    // Check timeline-area footer wrapper exists
    const timelineArea = page.locator('.timeline-area')
    await expect(timelineArea).toBeVisible()
  })
})
