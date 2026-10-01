/**
 * "TRY IT FIRST" SAYS WHAT IT COSTS, UNDER THE BUTTON.
 *
 * The try link opens the live agent's chat. The chat is free to the person
 * (render/src/agent/pricing.ts, FREE), but a browser with no credential is
 * refused by /api/agent/chat and asked to sign in. The note under the button
 * says both before the press, the way Lindy and Relevance AI state their
 * condition next to their own try buttons.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PACKAGES,
  tryableAgentOf,
} from '../../../../../packages/vibee-atoms/src/agent-packages'

const credential = vi.hoisted(() => ({ has: true }))

vi.mock('@/lib/embedGuest', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/embedGuest')),
  hasCredential: () => credential.has,
}))

import { PackageCards } from '../PackageCards'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRICING = path.resolve(HERE, '../../../../../render/src/agent/pricing.ts')

let host: HTMLDivElement
let root: Root | null = null

function draw(lang: 'en' | 'ru') {
  act(() => {
    root = createRoot(host)
    root.render(
      <MemoryRouter>
        <PackageCards lang={lang} />
      </MemoryRouter>
    )
  })
}

const tryable = AGENT_PACKAGES.filter(pkg => tryableAgentOf(pkg))
const notTryable = AGENT_PACKAGES.filter(pkg => !tryableAgentOf(pkg))

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  credential.has = true
})

describe('the note under "Try it first"', () => {
  it('there is at least one card to try, or this suite proves nothing', () => {
    expect(tryable.length).toBeGreaterThan(0)
  })

  it('with a credential it says the chat is free', () => {
    draw('en')
    for (const pkg of tryable) {
      const note = host.querySelector(
        `[data-testid="package-${pkg.id}"] .package-card__try-note`
      )
      expect(note?.textContent).toMatch(/free/i)
      expect(note?.textContent).not.toMatch(/sign/i)
    }
  })

  it('without one it says a Telegram sign-in comes first', () => {
    credential.has = false
    draw('ru')
    for (const pkg of tryable) {
      const note = host.querySelector(
        `[data-testid="package-${pkg.id}"] .package-card__try-note`
      )
      expect(note?.textContent).toMatch(/Бесплатно/) // cyrillic-ok
      expect(note?.textContent).toMatch(/Telegram/)
    }
  })

  it('a card with nothing to try promises no free try', () => {
    draw('en')
    for (const pkg of notTryable) {
      const card = host.querySelector(`[data-testid="package-${pkg.id}"]`)
      expect(card?.querySelector('.package-card__try-note')).toBeNull()
      expect(card?.querySelector('.package-card__try')).toBeNull()
    }
  })

  it('the link names the agent and starts with the words it shows', () => {
    draw('en')
    for (const pkg of tryable) {
      const link = host.querySelector<HTMLAnchorElement>(
        `[data-testid="package-${pkg.id}"] .package-card__try`
      )!
      const label = link.getAttribute('aria-label') ?? ''
      expect(label.startsWith(link.textContent!.trim())).toBe(true)
      expect(label).toContain(pkg.name.en)
    }
  })

  it('the "free" claim is pinned to the price list the server reads', () => {
    // If the agent chat ever leaves FREE, this note becomes a lie; fail here.
    const source = fs.readFileSync(PRICING, 'utf8')
    const free = source.slice(
      source.indexOf('export const FREE'),
      source.indexOf('export const PAID')
    )
    expect(free).toContain('Агент-чат') // cyrillic-ok
  })
})
