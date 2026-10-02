/**
 * A PACKAGE IS BOUGHT FOR STARS FROM ITS CARD.
 *
 * The button names the price in Stars from the one catalogue rate, asks the
 * render for the invoice, lets Telegram open it, and says "paid until" only
 * after the render booked the charge -- never on Telegram's "paid" alone.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PACKAGES,
  agentPackageStars,
} from '../../../../../packages/vibee-atoms/src/agent-packages'
import { PackageCards } from '../PackageCards'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root | null = null
let calls: { url: string; method: string }[] = []
let pressed: [string, string][] = []

function draw(lang: 'en' | 'ru') {
  act(() => {
    root = createRoot(host)
    root.render(
      <MemoryRouter>
        <PackageCards lang={lang} onAction={(a, id) => pressed.push([a, id])} />
      </MemoryRouter>
    )
  })
}

function server(verify: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET' })
      const u = String(url)
      if (u.includes('/api/agents/packages/invoice')) {
        return {
          json: async () => ({
            ok: true,
            link: 'https://t.me/$inv',
            charge: 'month',
            stars: 10000,
          }),
        }
      }
      if (u.includes('/api/agents/packages/verify'))
        return { json: async () => verify }
      return { json: async () => ({ ok: true }) }
    })
  )
}

const button = (id: string) =>
  host.querySelector<HTMLButtonElement>(
    `[data-testid="package-${id}"] .package-card__buy`
  )!

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  calls = []
  pressed = []
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  vi.unstubAllGlobals()
  delete (window as { Telegram?: unknown }).Telegram
})

describe('the Stars button on a package card', () => {
  it('names the monthly price in Stars and its dollar equivalent', () => {
    draw('ru')
    for (const pkg of AGENT_PACKAGES) {
      const stars = agentPackageStars(pkg).toLocaleString('ru-RU')
      expect(button(pkg.id).textContent).toBe(`Купить за ${stars} ⭐ в месяц`)
      expect(button(pkg.id).getAttribute('aria-label')).toContain(pkg.name.ru)
      const note = host.querySelector(
        `[data-testid="package-${pkg.id}"] .package-card__buy-note`
      )
      expect(note?.textContent).toContain(`$${pkg.monthlyUsd} в месяц`)
    }
    // Above Telegram's subscription cap the month is a one-off invoice.
    const card = (id: string) =>
      host.querySelector(`[data-testid="package-${id}"]`)?.textContent ?? ''
    expect(card('blogger')).toContain('подписка звёздами Telegram')
    expect(card('twin')).toContain('один месяц за платёж')
  })

  it('outside Telegram it mints nothing and says where paying works', async () => {
    server({})
    draw('en')
    await act(async () => button('blogger').click())
    expect(calls.filter(c => c.url.includes('/api/agents/packages'))).toEqual(
      []
    )
    expect(host.textContent).toContain('Paying in Stars works inside Telegram')
    expect(pressed).toContainEqual(['buy', 'blogger'])
  })

  it('asks for the invoice, opens it, and says paid-until only after the render booked it', async () => {
    server({
      ok: true,
      booked: [{ packageId: 'blogger' }],
      packages: [
        { id: 'blogger', active: true, until: '2026-10-31T00:00:00.000Z' },
      ],
    })
    let done: Promise<void> = Promise.resolve()
    ;(window as { Telegram?: unknown }).Telegram = {
      WebApp: {
        openInvoice: (link: string, cb: (s: string) => Promise<void>) => {
          expect(link).toBe('https://t.me/$inv')
          done = cb('paid')
        },
      },
    }
    draw('ru')
    await act(async () => button('blogger').click())
    await act(async () => done)
    expect(calls.map(c => new URL(c.url, 'http://x').pathname)).toEqual(
      expect.arrayContaining([
        '/api/agents/packages/invoice',
        '/api/agents/packages/verify',
      ])
    )
    expect(calls[0].url).toContain('package=blogger')
    expect(host.textContent).toContain('Агент оплачен до 31 октября')
  })
})
