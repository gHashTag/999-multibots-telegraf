/**
 * THE WELCOME LADDER SPEAKS IN THE WALLET'S NUMBERS.
 *
 * Promise, proof, gift, how, packages: every figure a person reads on the way
 * (reels a month, the start tokens, a portrait's price, tokens per dollar, the
 * days before a month burns) comes from specs/automation/token-wallet.t27
 * through packages/vibee-atoms/src/token-wallet.ts. These tests read the
 * screen and compare it with that module, so a price that moves moves here
 * too, and a sentence typed by hand fails.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_PACKAGES } from '../../../packages/vibee-atoms/src/agent-packages'
import {
  MONTH_DAYS,
  monthTokens,
  PORTRAIT_TOKENS,
  REEL_TOKENS,
  reelsIn,
  START_TOKENS,
  WARN_DAYS_FIRST,
} from '../../../packages/vibee-atoms/src/token-wallet'

const ui = vi.hoisted(() => ({ lang: 'en' as 'en' | 'ru' }))

vi.mock('@/hooks/useAgentAvatars', () => ({ useAgentAvatars: () => ({}) }))
vi.mock('@/hooks/useAgentAcceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAgentAcceptance')>()),
  useAgentAcceptance: () => null,
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: ui.lang,
    setLang: () => {},
    t: (k: string) => k,
  }),
}))

import { WelcomePage } from '@/pages/Welcome'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const featured = AGENT_PACKAGES.find(pkg => pkg.popular)!

let host: HTMLDivElement
let root: Root | null = null

function show(lang: 'en' | 'ru' = 'en') {
  ui.lang = lang
  act(() => {
    root = createRoot(host)
    root.render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>
    )
  })
}

const text = (sel: string) => host.querySelector(sel)?.textContent ?? ''

beforeEach(() => {
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
})

describe('the promise', () => {
  it('names what the featured month buys, in reels', () => {
    show()
    const reels = reelsIn(monthTokens(featured.monthlyUsd))
    expect(text('.welcome-outcome')).toBe(
      `${featured.name.en}: ≈${reels} reels with your face, every month.`
    )
  })
})

describe('the gift', () => {
  it('gives the start tokens and says what they buy', () => {
    show()
    expect(text('.welcome-gift__title')).toContain(`${START_TOKENS} tokens`)
    expect(text('.welcome-gift__body')).toContain(`(${PORTRAIT_TOKENS} tokens)`)
  })

  it('the start tokens really do cover the portrait', () => {
    expect(START_TOKENS).toBeGreaterThanOrEqual(PORTRAIT_TOKENS)
  })

  it('opens the live agent at work', () => {
    show()
    expect(host.querySelector('.welcome-gift__cta')?.getAttribute('href')).toBe(
      `/agents/${featured.agentId}/work`
    )
  })

  it('comes before the packages, and how ordering works sits between', () => {
    show()
    const order = [
      ...host.querySelectorAll(
        '.welcome-gift, .welcome-how, .welcome-packages'
      ),
    ].map(el => el.className)
    expect(order).toEqual(['welcome-gift', 'welcome-how', 'welcome-packages'])
  })
})

describe('the wallet', () => {
  it('turns a dollar into tokens and names the burn', () => {
    show()
    const wallet = text('.welcome-wallet')
    expect(wallet).toContain(`$1 = ${monthTokens(1)} tokens`)
    expect(wallet).toContain(`A month lives ${MONTH_DAYS} days`)
    expect(wallet).toContain(`${WARN_DAYS_FIRST} days before`)
    expect(wallet).toContain(`≈ ${REEL_TOKENS} tokens`)
  })

  it('and in Russian', () => {
    show('ru')
    const wallet = text('.welcome-wallet')
    expect(wallet).toContain(`$1 = ${monthTokens(1)} токенов`) // cyrillic-ok
    expect(wallet).toContain(`Месяц живёт ${MONTH_DAYS} дней`) // cyrillic-ok
  })

  it('every package card shows its month in tokens, and reels only where it makes them', () => {
    show()
    for (const pkg of AGENT_PACKAGES) {
      const line = text(
        `[data-testid="package-${pkg.id}"] .package-card__tokens`
      )
      const month = monthTokens(pkg.monthlyUsd).toLocaleString('en-US')
      expect(line).toBe(
        pkg.media
          ? `${month} tokens a month ≈ ${reelsIn(monthTokens(pkg.monthlyUsd))} reels`
          : `${month} tokens a month for client replies · text only`
      )
    }
  })

  it('never offers reels on the Manager Agent card: a text model for the CRM', () => {
    show()
    const card = text('[data-testid="package-manager"]')
    expect(card).not.toMatch(/reel|face|voice clone/i)
  })
})

describe('the pinned button', () => {
  it('offers the gift before the packages are in view', () => {
    show()
    const primary = host.querySelector('.welcome-exit--primary')
    expect(primary?.getAttribute('data-stage')).toBe('gift')
    expect(primary?.textContent).toContain(`${START_TOKENS} tokens free`)
  })

  it('orders the featured package once the packages are in view', () => {
    const seen: Array<(e: unknown[]) => void> = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: unknown[]) => void) {
          seen.push(cb)
        }
        observe() {}
        disconnect() {}
      }
    )
    try {
      show()
      act(() =>
        seen[0]([{ isIntersecting: true, boundingClientRect: { top: 10 } }])
      )
      const primary = host.querySelector('.welcome-exit--primary')
      expect(primary?.getAttribute('data-stage')).toBe('order')
      expect(primary?.getAttribute('href')).toContain(`agentpkg_${featured.id}`)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
