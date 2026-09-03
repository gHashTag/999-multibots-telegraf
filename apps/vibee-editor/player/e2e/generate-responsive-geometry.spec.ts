import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env.GENERATE_RESPONSIVE_BASE_URL
const SCREENSHOT_DIR = process.env.GENERATE_RESPONSIVE_SCREENSHOT_DIR

const TABS = ['image', 'video'] as const
type GenerateTab = (typeof TABS)[number]

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 720, height: 900 },
  { width: 768, height: 900 },
  { width: 800, height: 900 },
  { width: 1024, height: 900 },
] as const

type Viewport = (typeof VIEWPORTS)[number]

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
}

async function openGenerate(page: Page, tab: GenerateTab, viewport: Viewport) {
  await page.setViewportSize(viewport)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname
    const body = pathname.endsWith('/api/voices')
      ? { success: true, voices: [] }
      : pathname.includes('/api/render-quota')
        ? { total_renders: 0, free_remaining: 10, is_admin: true }
        : { success: true }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  const target = BASE_URL ? `${BASE_URL}/generate/${tab}` : `/generate/${tab}`
  await page.goto(target, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await expect(page.locator('.generate-page')).toBeVisible()
  await expect(page.locator('.generate-form')).toBeVisible()
  await settleLayout(page)

  if (SCREENSHOT_DIR) {
    await page.screenshot({
      path: path.resolve(
        SCREENSHOT_DIR,
        `generate-${tab}-${viewport.width}x${viewport.height}.png`
      ),
      fullPage: true,
      animations: 'disabled',
    })
  }
}

async function expectNoHorizontalOverflow(
  page: Page,
  tab: GenerateTab,
  width: number
) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    root: document.querySelector<HTMLElement>('#root')?.scrollWidth ?? 0,
  }))

  expect(widths.viewport).toBe(width)
  for (const [owner, scrollWidth] of Object.entries(widths)) {
    if (owner === 'viewport') continue
    expect(
      scrollWidth,
      `${tab} @ ${width}px: ${owner} must not create horizontal overflow`
    ).toBeLessThanOrEqual(widths.viewport + 1)
  }
}

async function expectModelCardsToContainText(
  page: Page,
  tab: GenerateTab,
  width: number
) {
  const cards = await page
    .locator('.generate-panel .model-btn')
    .evaluateAll(elements =>
      elements.map(element => {
        const card = element.getBoundingClientRect()
        const text = Array.from(
          element.querySelectorAll<HTMLElement>('.model-name, .model-desc')
        ).map(node => {
          const bounds = node.getBoundingClientRect()
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          }
        })

        return {
          card: {
            left: card.left,
            right: card.right,
            top: card.top,
            bottom: card.bottom,
          },
          text,
        }
      })
    )

  expect(
    cards.length,
    `${tab} @ ${width}px must render multiple model cards`
  ).toBeGreaterThan(1)

  cards.forEach(({ card, text }, index) => {
    text.forEach((bounds, textIndex) => {
      expect(
        bounds.left >= card.left - 1 &&
          bounds.right <= card.right + 1 &&
          bounds.top >= card.top - 1 &&
          bounds.bottom <= card.bottom + 1,
        `${tab} @ ${width}px: model card ${index} text ${textIndex} must stay inside its card`
      ).toBe(true)
    })

    if (index < cards.length - 1) {
      expect(
        card.bottom,
        `${tab} @ ${width}px: model card ${index} must not overlap adjacent card ${index + 1}`
      ).toBeLessThanOrEqual(cards[index + 1].card.top + 1)
    }
  })
}

async function expectRowGeometry(page: Page, tab: GenerateTab, width: number) {
  const geometry = await page.evaluate(() => {
    const rect = (element: Element) => {
      const { left, right, top, bottom, width, height } =
        element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    const main = document.querySelector<HTMLElement>('.generate-main')!
    const sidebar = main.querySelector<HTMLElement>(
      ':scope > .generate-sidebar'
    )!
    const results = main.querySelector<HTMLElement>(
      ':scope > section.generate-page__results'
    )!
    const panelContent = sidebar.querySelector<HTMLElement>(
      '.generate-panel > .generate-panel__content'
    )!
    const form = panelContent.querySelector<HTMLElement>('.generate-form')!

    return {
      main: rect(main),
      sidebar: rect(sidebar),
      results: rect(results),
      panelContent: rect(panelContent),
      form: rect(form),
      flexDirection: getComputedStyle(main).flexDirection,
    }
  })

  expect(
    geometry.flexDirection,
    `${tab} @ ${width}px must use side-by-side columns`
  ).toBe('row')
  expect(
    geometry.results.left,
    `${tab} @ ${width}px: results must start after the sidebar`
  ).toBeGreaterThanOrEqual(geometry.sidebar.right - 1)
  expect(
    Math.abs(
      geometry.main.width - geometry.sidebar.width - geometry.results.width
    ),
    `${tab} @ ${width}px: sidebar and results must fill the main row`
  ).toBeLessThanOrEqual(2)

  return geometry
}

async function expectMobileGeometry(
  page: Page,
  tab: GenerateTab,
  width: number
) {
  const main = page.locator('.generate-main')
  const tabbar = page.locator('.tma-tabbar')
  const headerNavigation = page.locator('.header-tabs')

  await expect(tabbar).toBeVisible()
  await expect(headerNavigation).toBeHidden()
  await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(1)

  const switchTargets = await page
    .locator('.gen-switch__item')
    .evaluateAll(elements =>
      elements.map(element => {
        const { width, height } = element.getBoundingClientRect()
        return { width, height }
      })
    )
  expect(switchTargets).toHaveLength(4)
  switchTargets.forEach((target, index) => {
    expect(
      target.width,
      `${tab} @ ${width}px: switch target ${index} must be at least 44px wide`
    ).toBeGreaterThanOrEqual(44)
    expect(
      target.height,
      `${tab} @ ${width}px: switch target ${index} must be at least 44px high`
    ).toBeGreaterThanOrEqual(44)
  })

  const flow = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.generate-main')!
    const sidebar = main.querySelector<HTMLElement>(
      ':scope > .generate-sidebar'
    )!
    const panelContent = sidebar.querySelector<HTMLElement>(
      '.generate-panel > .generate-panel__content'
    )!
    const results = main.querySelector<HTMLElement>(
      ':scope > .generate-page__results'
    )!
    const isActualScroller = (element: HTMLElement) => {
      const overflowY = getComputedStyle(element).overflowY
      return (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight + 1
      )
    }

    return {
      flexDirection: getComputedStyle(main).flexDirection,
      mainOverflowY: getComputedStyle(main).overflowY,
      mainPaddingBottom: Number.parseFloat(
        getComputedStyle(main).paddingBottom
      ),
      nestedScrollers: {
        sidebar: isActualScroller(sidebar),
        panelContent: isActualScroller(panelContent),
        results: isActualScroller(results),
      },
    }
  })

  expect(flow.flexDirection).toBe('column')
  expect(flow.mainOverflowY).toBe('auto')
  expect(
    Object.values(flow.nestedScrollers),
    `${tab} @ ${width}px: main must own the only nested vertical scroll`
  ).toEqual([false, false, false])
  expect(
    flow.mainPaddingBottom,
    `${tab} @ ${width}px: main must not repeat the tabbar height as a blank tail`
  ).toBeLessThanOrEqual(24)

  await main.evaluate(element => {
    element.scrollTop = 0
  })
  await page.locator('.generate-btn').evaluate(element => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await settleLayout(page)

  const cta = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.generate-main')!
    const button = main.querySelector<HTMLElement>('.generate-btn')!
    const tabbar = document.querySelector<HTMLElement>('.tma-tabbar')!
    const panelContent = main.querySelector<HTMLElement>(
      '.generate-panel__content'
    )!
    const sidebar = main.querySelector<HTMLElement>('.generate-sidebar')!
    const results = main.querySelector<HTMLElement>(
      ':scope > .generate-page__results'
    )!
    const mainRect = main.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const tabbarRect = tabbar.getBoundingClientRect()

    return {
      mainTop: mainRect.top,
      mainBottom: mainRect.bottom,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      tabbarTop: tabbarRect.top,
      scrollTop: main.scrollTop,
      maxScroll: Math.max(0, main.scrollHeight - main.clientHeight),
      nestedScrollTops: [
        sidebar.scrollTop,
        panelContent.scrollTop,
        results.scrollTop,
      ],
    }
  })

  expect(Number.isFinite(cta.scrollTop)).toBe(true)
  expect(cta.scrollTop).toBeGreaterThanOrEqual(0)
  expect(cta.scrollTop).toBeLessThanOrEqual(cta.maxScroll + 1)
  expect(
    cta.nestedScrollTops,
    `${tab} @ ${width}px: reaching the CTA must not scroll nested panels`
  ).toEqual([0, 0, 0])
  expect(cta.buttonTop).toBeGreaterThanOrEqual(cta.mainTop - 1)
  expect(
    cta.buttonBottom,
    `${tab} @ ${width}px: CTA must be fully reachable above the fixed tabbar`
  ).toBeLessThanOrEqual(Math.min(cta.mainBottom, cta.tabbarTop) + 1)
}

test.describe('Generate responsive geometry', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const viewport of VIEWPORTS) {
    for (const tab of TABS) {
      test(`${tab} @ ${viewport.width}px`, async ({ page }) => {
        await openGenerate(page, tab, viewport)
        await expectNoHorizontalOverflow(page, tab, viewport.width)
        await expectModelCardsToContainText(page, tab, viewport.width)

        if (viewport.width <= 720) {
          await expectMobileGeometry(page, tab, viewport.width)
          return
        }

        const geometry = await expectRowGeometry(page, tab, viewport.width)

        if (viewport.width === 768 || viewport.width === 800) {
          expect(
            geometry.sidebar.width / geometry.main.width,
            `${tab} @ ${viewport.width}px: sidebar should occupy approximately 40%`
          ).toBeGreaterThanOrEqual(0.38)
          expect(
            geometry.sidebar.width / geometry.main.width
          ).toBeLessThanOrEqual(0.42)
          expect(
            geometry.panelContent.width / geometry.sidebar.width,
            `${tab} @ ${viewport.width}px: inner content must fill the sidebar; ~60% means the page-level class leaked into the panel`
          ).toBeGreaterThanOrEqual(0.9)
          expect(
            geometry.form.width / geometry.sidebar.width
          ).toBeGreaterThanOrEqual(0.85)
          return
        }

        expect(
          geometry.sidebar.width,
          `${tab} @ 1024px: desktop sidebar must be 320px`
        ).toBeGreaterThanOrEqual(319)
        expect(geometry.sidebar.width).toBeLessThanOrEqual(321)
        await expect(page.locator('.header-tabs')).toBeVisible()
        await expect(page.locator('.tma-tabbar')).toBeHidden()

        const tabbarTotal = await page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--app-tabbar-total'
            )
          )
        )
        expect(tabbarTotal).toBe(0)
      })
    }
  }
})
