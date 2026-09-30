/**
 * THE WELCOME SCREEN OPENS ONCE, AND NEVER IN SOMEONE ELSE'S WAY.
 *
 * Owner, 2026-09-30: "a welcome screen right when the app opens". The root
 * already had two masters -- a link that names a screen, and the screen the
 * person was interrupted on -- and both have to keep winning where they won:
 * a pairing code must not lose to a greeting, and a returning person must
 * not be greeted again after a version bump sweeps the storage.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { STORAGE_KEYS } from '@vibee/atoms'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PACKAGES,
  agentPackageOrderUrl,
} from '../../../packages/vibee-atoms/src/agent-packages'
import { survivesStorageReset } from '@/lib/storageReset'

vi.mock('@/hooks/useTelegramWebApp', () => ({
  useTelegramWebApp: () => undefined,
}))
vi.mock('@/hooks/useAgentAvatars', () => ({ useAgentAvatars: () => ({}) }))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'ru', setLang: () => {}, t: (k: string) => k }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

async function freshMemory() {
  vi.resetModules()
  const memory = await import('@/components/Navigation/RouteMemory')
  const { markWelcomed } = await import('@/lib/welcomeMemory')
  return { ...memory, markWelcomed }
}

function WhereAmI({ report }: { report: (path: string) => void }) {
  const l = useLocation()
  report(l.pathname)
  return null
}

describe('the first launch', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  async function landing(
    memory?: Awaited<ReturnType<typeof freshMemory>>
  ): Promise<string> {
    memory ??= await freshMemory()
    let landedOn = ''
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/']}>
          <memory.LaunchRedirect />
          <WhereAmI report={p => (landedOn = p)} />
        </MemoryRouter>
      )
    })
    return landedOn
  }

  it('greets a person who was never greeted', async () => {
    expect(await landing()).toBe('/welcome')
  })

  it('greets them even over a remembered screen', async () => {
    window.localStorage.setItem(STORAGE_KEYS.lastRoute, '/chat')
    expect(await landing()).toBe('/welcome')
  })

  it('returns a greeted person where they were', async () => {
    window.localStorage.setItem(STORAGE_KEYS.welcomeSeen, '1')
    window.localStorage.setItem(STORAGE_KEYS.lastRoute, '/chat')
    expect(await landing()).toBe('/chat')
  })

  it('sends a greeted person with no memory to the feed', async () => {
    window.localStorage.setItem(STORAGE_KEYS.welcomeSeen, '1')
    expect(await landing()).toBe('/feed')
  })

  it('lets a link that names a screen outrank the greeting', async () => {
    window.history.replaceState({}, '', '/?tgWebAppStartParam=pair')
    // TelegramProvider takes it from the feed to /pair.
    expect(await landing()).toBe('/feed')
  })

  it('does not greet twice in one session -- the header logo links to "/"', async () => {
    const memory = await freshMemory()
    memory.markWelcomed()
    // Even when the write to storage was lost.
    window.localStorage.clear()
    expect(await landing(memory)).toBe('/feed')
  })

  it('does not greet on every launch when storage cannot be written', async () => {
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
    try {
      expect(await landing()).toBe('/feed')
    } finally {
      write.mockRestore()
    }
  })

  it('keeps "greeted" through the storage reset', () => {
    expect(survivesStorageReset(STORAGE_KEYS.welcomeSeen)).toBe(true)
  })
})

describe('the welcome screen', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
    window.localStorage.clear()
  })

  async function render() {
    const { WelcomePage } = await import('@/pages/Welcome')
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/welcome']}>
          <WelcomePage />
        </MemoryRouter>
      )
    })
  }

  it('marks the person greeted as soon as it is shown', async () => {
    await render()
    expect(window.localStorage.getItem(STORAGE_KEYS.welcomeSeen)).toBe('1')
  })

  it('offers the three agents from the catalogue, at its prices', async () => {
    await render()
    for (const pkg of AGENT_PACKAGES) {
      const card = host.querySelector(`[data-testid="package-${pkg.id}"]`)
      expect(card, pkg.id).not.toBeNull()
      expect(card!.textContent).toContain(pkg.name.ru)
      expect(card!.textContent).toContain(`$${pkg.setupUsd}`)
      expect(card!.textContent).toContain(`$${pkg.monthlyUsd}`)
    }
  })

  it('never says "exchange" (325-FZ art. 9)', async () => {
    await render()
    expect(host.textContent).not.toMatch(/бирж|exchange/i) // cyrillic-ok
  })

  it('always has a way out to the market and to the feed', async () => {
    await render()
    const targets = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(targets).toContain('/agents')
    expect(targets).toContain('/feed')
  })

  it('lets a person skip from the first screen, not only from the bottom', async () => {
    await render()
    const skip = host.querySelector('.welcome-topline a[href="/feed"]')
    expect(skip).not.toBeNull()
    expect(skip?.getAttribute('aria-label')).toMatch(/ленту/) // cyrillic-ok
  })

  it('names every section by its own heading', async () => {
    await render()
    const sections = host.querySelectorAll('section')
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby')
      expect(id, section.className).toBeTruthy()
      expect(host.querySelector(`#${id}`)?.tagName).toBe('H2')
    }
  })

  it('names which agent each order button orders', async () => {
    await render()
    for (const pkg of AGENT_PACKAGES) {
      const button = host.querySelector(
        `[data-testid="package-${pkg.id}"] .package-card__order`
      )
      expect(button?.getAttribute('aria-label'), pkg.id).toContain(pkg.name.ru)
    }
  })

  it('says what happens after "Order", in three steps', async () => {
    await render()
    expect(host.querySelectorAll('.welcome-steps li')).toHaveLength(3)
  })

  it('orders through a real link, so a browser or the game frame can follow it', async () => {
    await render()
    for (const pkg of AGENT_PACKAGES) {
      const order = host.querySelector(
        `[data-testid="package-${pkg.id}"] .package-card__order`
      )
      expect(order?.tagName, pkg.id).toBe('A')
      expect(order?.getAttribute('href')).toBe(agentPackageOrderUrl(pkg))
      expect(order?.getAttribute('target')).toBe('_blank')
    }
  })
})
