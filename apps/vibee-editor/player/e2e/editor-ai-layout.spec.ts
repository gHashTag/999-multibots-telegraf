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
  })
}
