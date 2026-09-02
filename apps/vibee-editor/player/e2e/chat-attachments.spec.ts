import { expect, test, type Page } from '@playwright/test'

async function setupChat(page: Page) {
  let agentRequest = ''
  await page.route('**/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        url: '/s3/vibee-assets/assets/portrait.png',
      }),
    })
  })
  await page.route('**/mcp', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: { баланс_токенов: 20 } }, // cyrillic-ok: wire field
      }),
    })
  )
  await page.route('**/api/tokens/verify', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    })
  )
  await page.route('**/api/agent/chat', async route => {
    agentRequest = route.request().postData() ?? ''
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: '{"тип":"текст","текст":"Вижу портрет и могу собрать рилс."}\n',
    })
  })
  await page.route('**/s3/vibee-assets/assets/portrait.png', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      ),
    })
  )
  await page.goto('/chat', { waitUntil: 'domcontentloaded' })
  return { request: () => agentRequest }
}

for (const width of [390, 1024]) {
  test(`agent accepts a photo and keeps the composer usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const capture = await setupChat(page)

    await page.locator('input[type="file"].chat-file-input').setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image'),
    })
    await expect(
      page.locator('.chat-attachment-chip', { hasText: 'portrait.png' })
    ).toBeVisible()

    const composer = page.locator('.chat-input')
    await composer.fill('Сделай приветственный рилс')
    await page.getByRole('button', { name: /send|отправить/i }).click() // cyrillic-ok: bilingual UI

    await expect(
      page.getByText('Вижу портрет и могу собрать рилс.')
    ).toBeVisible()
    await expect(
      page.locator('.message-attachment', { hasText: 'portrait.png' })
    ).toBeVisible()
    await expect
      .poll(() => capture.request())
      .toContain(
        '[attached image: portrait.png; mime=image/png; url=/s3/vibee-assets/assets/portrait.png]'
      )

    const attachButton = page.getByRole('button', {
      name: 'Добавить фото, видео или аудио',
    })
    const box = await attachButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
}
