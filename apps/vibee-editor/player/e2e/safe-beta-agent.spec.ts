import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const safeTools = [
  {
    name: 'whoami',
    description: 'Verified owner profile',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'feed_stats',
    description: 'Owner feed statistics',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'content_plan_prepare',
    description: 'Create an owner-scoped draft',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'draft', requiresOwnerApproval: false },
  },
] as const

const viewports = [
  { width: 390, height: 844 },
  { width: 720, height: 900 },
  { width: 1024, height: 768 },
] as const

async function mockSafeBeta(page: Page) {
  await page.route('**/branding', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ branded: false, resolved: true }),
    })
  )
  await page.route('**/mcp', async route => {
    const request = route.request()
    const body = request.postDataJSON() as {
      id?: string | number
      method?: string
    }
    if (body.method !== 'tools/list') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id ?? null,
          error: {
            code: -32601,
            message: 'Only discovery is enabled in UI QA',
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: { tools: safeTools },
      }),
    })
  })
}

for (const viewport of viewports) {
  test(`Agent SAFE BETA is responsive at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await mockSafeBeta(page)

    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await page.goto('/chat')
    await expect(
      page.getByRole('heading', { name: 'Агент', exact: true })
    ).toBeVisible()
    await expect(page.getByText('3 / 3 live tools')).toBeVisible()
    await expect(page.getByText('whoami', { exact: true })).toBeVisible()
    await expect(page.getByText('feed_stats', { exact: true })).toBeVisible()
    await expect(
      page.getByText('content_plan_prepare', { exact: true })
    ).toBeVisible()

    const copy = page.getByRole('button', { name: 'Скопировать агенту' })
    await expect(copy).toBeDisabled()
    await expect(page.getByText('Публикация выключена')).toBeVisible()
    await expect(page.getByText(/Платные действия выключены/)).toBeVisible()

    const agentGeometry = await page
      .locator('.agent-control')
      .evaluate(node => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }))
    expect(agentGeometry.scrollHeight).toBeLessThanOrEqual(
      agentGeometry.clientHeight + 1
    )

    for (const locator of [
      page.getByRole('button', { name: 'Подготовить мой контент-план' }),
      page.getByText('content_plan_prepare', { exact: true }),
    ]) {
      const containedByAgent = await locator.evaluate(node => {
        const agent = node.closest('.agent-control')
        if (!agent) return false
        const itemBox = node.getBoundingClientRect()
        const agentBox = agent.getBoundingClientRect()
        return (
          itemBox.top >= agentBox.top - 1 &&
          itemBox.bottom <= agentBox.bottom + 1
        )
      })
      expect(containedByAgent).toBe(true)
    }

    const chatGeometry = await page
      .locator('.chat-container')
      .evaluate(node => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }))
    expect(chatGeometry.scrollHeight).toBeLessThanOrEqual(
      chatGeometry.clientHeight + 1
    )

    const warningEndsBeforeComposer = await page.evaluate(() => {
      const warning = document.querySelector('.chat-model-lock')
      const composer = document.querySelector('.chat-input-area')
      if (!warning || !composer) return false
      return (
        warning.getBoundingClientRect().bottom <=
        composer.getBoundingClientRect().top + 1
      )
    })
    expect(warningEndsBeforeComposer).toBe(true)

    const header = page.locator('header.header')
    const alert = page.locator('.header-diagnostic-alert')
    await expect(header).toBeVisible()
    await expect(alert).toBeVisible()
    const [headerBox, alertBox] = await Promise.all([
      header.boundingBox(),
      alert.boundingBox(),
    ])
    expect(headerBox).not.toBeNull()
    expect(alertBox).not.toBeNull()
    expect(alertBox!.y).toBeGreaterThanOrEqual(
      headerBox!.y + headerBox!.height - 1
    )
    expect(alertBox!.x).toBeGreaterThanOrEqual(0)
    expect(alertBox!.x + alertBox!.width).toBeLessThanOrEqual(
      viewport.width + 1
    )

    const geometry = await page.evaluate(() => ({
      bodyClient: document.body.clientWidth,
      bodyScroll: document.body.scrollWidth,
      rootClient: document.documentElement.clientWidth,
      rootScroll: document.documentElement.scrollWidth,
    }))
    expect(geometry.bodyScroll).toBeLessThanOrEqual(geometry.bodyClient)
    expect(geometry.rootScroll).toBeLessThanOrEqual(geometry.rootClient)

    const desktopNav = page.locator('.header-tabs')
    const compactNav = page.locator('.tma-tabbar')
    if (viewport.width < 1024) {
      await expect(desktopNav).toBeHidden()
      await expect(compactNav).toBeVisible()
    } else {
      await expect(desktopNav).toBeVisible()
      await expect(compactNav).toBeHidden()
    }

    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: path.join(
        process.env.SAFE_BETA_E2E_OUTPUT || '/tmp/trinity-safe-beta-e2e',
        `agent-${viewport.width}.png`
      ),
      fullPage: true,
    })
  })
}
