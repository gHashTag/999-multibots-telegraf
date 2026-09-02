import { test, expect } from '@playwright/test'

for (const width of [390, 1024]) {
  test(`cloud project controls are explicit at ${width}px`, async ({
    page,
  }) => {
    await page.route('**/api/projects', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: 'welcome-reel',
              name: 'Welcome reel',
              updated_at: '2026-09-02T00:00:00.000Z',
            },
          ],
        }),
      })
    )
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/generate/editor', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Cloud projects' }).click()

    const dialog = page.getByRole('dialog', { name: 'Cloud projects' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Shared by web, iPhone, and your agent')
    await expect(
      dialog.getByRole('button', { name: /Save current project/ })
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: /Welcome reel/ })
    ).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box ? box.x + box.width : 0) - width).toBeLessThanOrEqual(0)
  })
}
