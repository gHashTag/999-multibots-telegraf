import { test, expect } from '@playwright/test'

test.describe('Design Audit - UI Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })
  })

  test('should check sidebar tabs styling', async ({ page }) => {
    // Left sidebar tabs: Templates, Avatar, Video, Image, Voice, Music
    const sidebarTabs = page.locator('.sidebar-left button, .sidebar-tabs button, aside button')
    const tabCount = await sidebarTabs.count()
    console.log(`Found ${tabCount} sidebar tab buttons`)

    // Take screenshot of sidebar
    const sidebar = page.locator('.sidebar-left, aside').first()
    if (await sidebar.isVisible()) {
      await sidebar.screenshot({ path: 'test-results/sidebar-tabs.png' })
    }

    // Check each tab has visible text
    for (let i = 0; i < Math.min(tabCount, 6); i++) {
      const tab = sidebarTabs.nth(i)
      const text = await tab.textContent()
      const box = await tab.boundingBox()
      console.log(`Tab ${i}: "${text?.trim()}" - size: ${box?.width}x${box?.height}`)
    }
  })

  test('should check properties panel tabs styling', async ({ page }) => {
    // Right panel tabs: Avatar, Layout, Effects, Audio, Captions
    // First need to select an item to show properties panel
    const propertiesPanel = page.locator('.sidebar-right, .properties-panel')

    if (await propertiesPanel.isVisible()) {
      await propertiesPanel.screenshot({ path: 'test-results/properties-tabs.png' })

      const propTabs = propertiesPanel.locator('button')
      const tabCount = await propTabs.count()
      console.log(`Found ${tabCount} properties panel tabs`)

      for (let i = 0; i < Math.min(tabCount, 5); i++) {
        const tab = propTabs.nth(i)
        const text = await tab.textContent()
        console.log(`Properties Tab ${i}: "${text?.trim()}"`)
      }
    }
  })

  test('should take full page screenshot for visual comparison', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(2000) // Wait for all assets to render

    // Full page screenshot
    await page.screenshot({
      path: 'test-results/full-editor-screenshot.png',
      fullPage: false
    })

    console.log('Full page screenshot saved to test-results/full-editor-screenshot.png')
  })

  test('should check for text overflow issues', async ({ page }) => {
    // Find all buttons and check if text is truncated
    const allButtons = page.locator('button')
    const buttonCount = await allButtons.count()

    const issues: string[] = []

    for (let i = 0; i < buttonCount; i++) {
      const button = allButtons.nth(i)
      if (await button.isVisible()) {
        const text = await button.textContent()
        const box = await button.boundingBox()

        // Check for very small buttons that might have overflow
        if (box && text && text.trim().length > 0) {
          if (box.width < 50 && text.trim().length > 5) {
            issues.push(`Button "${text.trim()}" might be too narrow (${box.width}px)`)
          }
        }
      }
    }

    if (issues.length > 0) {
      console.log('Potential text overflow issues:')
      issues.forEach(issue => console.log(`  - ${issue}`))
    } else {
      console.log('No obvious text overflow issues found')
    }
  })

  test('should check tab bar consistency', async ({ page }) => {
    // Screenshot both tab areas
    await page.setViewportSize({ width: 1920, height: 1080 })

    // Get sidebar tabs area
    const sidebarArea = page.locator('.sidebar-left').first()
    if (await sidebarArea.isVisible()) {
      const sidebarBox = await sidebarArea.boundingBox()
      console.log(`Sidebar area: ${JSON.stringify(sidebarBox)}`)
    }

    // Click on timeline item to show properties
    const timelineItem = page.locator('[class*="timeline-item"], [class*="track-item"]').first()
    if (await timelineItem.isVisible()) {
      await timelineItem.click()
      await page.waitForTimeout(500)

      // Now check properties panel
      const propsPanel = page.locator('.sidebar-right, .properties-panel').first()
      if (await propsPanel.isVisible()) {
        await propsPanel.screenshot({ path: 'test-results/properties-panel.png' })
      }
    }
  })
})
