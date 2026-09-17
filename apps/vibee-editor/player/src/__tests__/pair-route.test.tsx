import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE SIGN-IN CODE MUST NOT BE BEHIND THE CLUB PRICE.
 *
 * Found 2026-09-17, in production, on a person who had already paid: she
 * pressed "Sign in to the app", and the mini app showed her a bill for 10 000
 * Stars. Nothing failed. The button worked, the deep link worked, the route
 * resolved -- and the screen it resolved to had been quietly turned into
 * onboarding underneath it.
 *
 * `pages/Profile.tsx` returns `<WelcomeOnboarding/>` INSTEAD of `<ProfileTabs/>`
 * for anyone the welcome road applies to (landed #2304, lost its "later" button
 * #2320), and the road's third card is the club price. `PairWithApp` -- the one
 * component in this app that mints a code -- lives inside those tabs. So the
 * screen the bot advertises as "a window with your code" stopped containing a
 * code for exactly the people most likely to ask for one: the new ones.
 *
 * The server never agreed to that gate. `/api/auth/pair/start` checks the
 * Telegram launch signature and the sign-out cutoff, and nothing about money.
 * The paywall in front of the code was a routing accident, not a decision --
 * which is why the fix is a route of its own rather than a hole in
 * `profileGate.ts` (the gate is the owner's rule, and it stays byte-identical).
 *
 * This test mounts the REAL route table. A file-level check could not catch
 * what happened here: every literal involved was correct all along.
 */

vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
vi.mock('@/lib/apiFetch', () => ({
  authHeaders: () => new Headers(),
  apiFetch: vi.fn(async () => ({ code: '12345678', expires_in: 120 })),
}))
vi.mock('@/hooks/useLanguage', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/hooks/useLanguage')),
  useLanguage: () => ({
    lang: 'ru',
    setLang: () => {},
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
// A sentinel, not the real profile: `/:username` is the last route in the
// table, and a `/pair` that lost to it would render a stranger's profile
// without throwing -- the same silent way `/crm/:clientId` could have lost.
vi.mock('@/pages/Profile', () => ({
  default: () => <div>PROFILE_PAGE_SENTINEL</div>,
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { AppRoutes } from '../App'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  )
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<div>LOADING</div>}>
          <AppRoutes />
        </Suspense>
      </MemoryRouter>
    )
  })
  // Lazy chunks resolve on a later tick; wait until the fallback is gone.
  for (let i = 0; i < 20 && host.textContent?.includes('LOADING'); i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })
  }
}

describe('the sign-in code has an address of its own', () => {
  it('/pair shows the code panel to someone with no profile loaded', async () => {
    // No jotai Provider is seeded: every atom holds its default, which is the
    // state of a person arriving for the first time -- the person the welcome
    // road exists for, and the person who was shown the bill.
    await open('/pair')

    expect(host.querySelector('.pair-with-app')).not.toBeNull()
  })

  it('/pair is not the welcome road, and not the profile', async () => {
    await open('/pair')

    // The road itself. Its presence here would mean the code screen had been
    // re-annexed by onboarding -- the exact 2026-09-17 defect, returning.
    expect(host.querySelector('[data-testid="welcome-onboarding"]')).toBeNull()
    // And `/pair` must not have fallen through to `/:username`.
    expect(host.textContent).not.toContain('PROFILE_PAGE_SENTINEL')
  })

  it('a plain /someone is still the profile', async () => {
    // The control: proves the sentinel is reachable at all, so the assertion
    // above is not satisfied by a profile route that is simply broken.
    await open('/someone')

    expect(host.textContent).toContain('PROFILE_PAGE_SENTINEL')
    expect(host.querySelector('.pair-with-app')).toBeNull()
  })
})
