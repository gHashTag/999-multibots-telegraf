import { test, expect } from '@playwright/test'

for (const width of [390, 720, 820, 1023, 1024]) {
  test(`AI editor rows stay ordered at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/generate/editor', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.locator('.editor').waitFor()

    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector<HTMLElement>(selector)
        if (!node) throw new Error(`missing ${selector}`)
        const rect = node.getBoundingClientRect()
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        }
      }
      return {
        header: box('header.header'),
        pipeline: box('.editor > .ai-pipeline'),
        assembly: box('.editor > .ai-assembly'),
        main: box('.editor-main'),
        timeline: box('.timeline-area'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })

    expect(boxes.pipeline.top).toBeGreaterThanOrEqual(boxes.header.bottom - 1)
    expect(boxes.assembly.top).toBeGreaterThanOrEqual(boxes.pipeline.bottom - 1)
    expect(boxes.main.top).toBeGreaterThanOrEqual(boxes.assembly.bottom - 1)
    if (width >= 768) {
      expect(boxes.timeline.top).toBeGreaterThanOrEqual(boxes.main.bottom - 1)
    } else {
      // The compact timeline is intentionally pinned over the reserved lower
      // canvas area; it must still stay below the AI controls.
      expect(boxes.timeline.top).toBeGreaterThan(boxes.main.top)
    }
    expect(boxes.timeline.bottom).toBeLessThanOrEqual(901)
    expect(boxes.overflow).toBeLessThanOrEqual(0)

    if (width === 820 || width === 1023) {
      const firstClip = page.locator('.track-item').first()
      await expect(firstClip).toBeVisible()
      await firstClip.click()
      const selected = await page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector<HTMLElement>(selector)
          if (!node) throw new Error(`missing ${selector}`)
          const value = node.getBoundingClientRect()
          return { top: value.top, bottom: value.bottom }
        }
        return {
          main: rect('.editor-main'),
          assembly: rect('.editor > .ai-assembly'),
          properties: rect('.sidebar-right'),
        }
      })
      expect(selected.properties.top).toBeGreaterThanOrEqual(
        selected.main.top - 1
      )
      expect(selected.properties.top).toBeGreaterThanOrEqual(
        selected.assembly.bottom - 1
      )
      expect(selected.properties.bottom).toBeLessThanOrEqual(
        selected.main.bottom + 1
      )
    }
  })
}
