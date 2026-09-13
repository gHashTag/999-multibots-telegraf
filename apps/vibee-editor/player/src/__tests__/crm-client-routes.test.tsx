import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * `/crm/123` IS A CLIENT, NOT A PERSON CALLED "123".
 *
 * The last route in the table is `/:username`, the profile. A new nested path
 * that lost to it would show a stranger's empty profile instead of the client
 * page -- and nothing would throw. Only a test that mounts the real table and
 * looks at what came out can tell the difference.
 */

vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/hooks/useLanguage', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/hooks/useLanguage')),
  useLanguage: () => ({
    lang: 'ru',
    setLang: () => {},
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
// Sentinels: which page the router picked is read from the text, not guessed.
vi.mock('@/pages/Profile', () => ({
  default: () => <div>PROFILE_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Chat', () => ({
  default: () => <div>CHAT_PAGE_SENTINEL</div>,
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
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { structuredContent: {} } }),
    }))
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

describe('the client routes win over the profile catch-all', () => {
  it('/crm/123 opens the client page', async () => {
    await open('/crm/123')
    expect(host.textContent).not.toContain('PROFILE_PAGE_SENTINEL')
    expect(host.querySelector('.crm-client')).not.toBeNull()
    expect(host.textContent).toContain('crm.client.chatButton')
    expect(
      host
        .querySelector<HTMLAnchorElement>('a.crm-client__chat')
        ?.getAttribute('href')
    ).toBe('/crm/123/chat')
  })

  it('/crm/123/chat opens the chat page', async () => {
    await open('/crm/123/chat')
    expect(host.textContent).toContain('CHAT_PAGE_SENTINEL')
    expect(host.textContent).not.toContain('PROFILE_PAGE_SENTINEL')
  })

  it('a plain /someone is still the profile', async () => {
    // The control: proves the sentinel is reachable at all, so the two
    // assertions above are not satisfied by a broken profile route.
    await open('/someone')
    expect(host.textContent).toContain('PROFILE_PAGE_SENTINEL')
    expect(host.querySelector('.crm-client')).toBeNull()
  })
})
