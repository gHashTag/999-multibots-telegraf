import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A GUEST IN THE GAME'S TRI FRAME IS TOLD WHERE THE SCREEN WORKS, NOT LEFT AT A DEAD END.
 *
 * Inside the frame on t27.ai the app never holds a session
 * (lib/framedSession.ts). Measured on lang=en before this change: profile was
 * a hard-coded Russian "open the app inside Telegram" page, CRM showed four
 * "Could not load: 401" blocks, chat greeted in Russian while every call
 * returned 401, and script offered a Generate form. None offered a way out.
 *
 * Each of those screens now shows one panel in the game's language, with a
 * link that opens the same screen in the app in a new tab. It does not send
 * the tab to a sign-in that returns here: the frame is still a guest after
 * signing in, which made that a loop. The route table is mounted for real;
 * the pages the panel must replace are sentinels, and the CRM pages are real
 * so their 401 is real.
 */

const embed = vi.hoisted(() => ({ on: true }))

vi.mock('@/lib/embed', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/embed')),
  get IS_EMBED() {
    return embed.on
  },
  embedLang: () => 'en',
}))
vi.mock('@/pages/Chat', () => ({
  default: () => <div>CHAT_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Profile', () => ({
  default: () => <div>PROFILE_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Feed', () => ({
  default: () => <div>FEED_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Script', () => ({
  default: () => <div>SCRIPT_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Generate', () => ({
  default: () => <div>GENERATE_PAGE_SENTINEL</div>,
}))
vi.mock('@/pages/Editor', () => ({
  default: () => <div>EDITOR_PAGE_SENTINEL</div>,
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { AppRoutes } from '../App'

const ACCESS = 'trinity.app.session.access'
const EXPIRES = 'trinity.app.session.expires-at'
const CYRILLIC = /\p{Script=Cyrillic}/u
const STAGES = ['script', 'audio', 'image', 'avatar', 'video', 'editor']
const appHref = (screen: string) =>
  `https://app.t27.ai${STAGES.includes(screen) ? `/generate/${screen}` : `/${screen}`}`
const GUEST_MODULE = import.meta.glob('../lib/embedGuest.ts')

let host: HTMLDivElement
let root: Root

function answer(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ result: { structuredContent: {} } }),
    }))
  )
}

beforeEach(() => {
  answer(200)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  embed.on = true
  // The "server refused this session" mark lives for the document; each test
  // starts without it. A glob, so the file still loads where the module is
  // absent (the run before the change).
  for (const load of Object.values(GUEST_MODULE)) {
    const guest = (await load()) as { forgetEmbedSignInNeeded(): void }
    guest.forgetEmbedSignInNeeded()
  }
})

async function settle(done: () => boolean) {
  for (let i = 0; i < 40 && !done(); i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })
  }
}

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
  await settle(() => !host.textContent?.includes('LOADING'))
}

const panel = () => host.querySelector<HTMLElement>('[data-embed-guest]')

const GATED: Array<[string, string]> = [
  ['/chat', 'chat'],
  ['/profile', 'profile'],
  ['/crm', 'crm'],
  ['/crm/12345', 'crm'],
  ['/crm/12345/chat', 'crm'],
  ['/generate/script', 'script'],
  ['/generate/audio', 'audio'],
  ['/generate/image', 'image'],
  ['/generate/avatar', 'avatar'],
  ['/generate/video', 'video'],
  ['/generate/editor', 'editor'],
]

describe('a guest in the TRI frame', () => {
  it.each(GATED)(
    '%s shows the panel opening screen=%s in the app, and sends nothing',
    async (path, screen) => {
      await open(path)
      const p = panel()
      expect(p).not.toBeNull()
      expect(p!.dataset.embedGuest).toBe(screen)
      expect(host.textContent).not.toContain('_PAGE_SENTINEL')

      const links = p!.querySelectorAll('a')
      expect(links).toHaveLength(1)
      const link = links[0]
      // A new tab: never _top, which would take the tab out of the game, the
      // Hive or Telegram, to a sign-in that cannot change this frame.
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.textContent?.trim()).toBeTruthy()
      expect(link.getAttribute('href')).toBe(appHref(screen))
      expect(link.getAttribute('href')).not.toContain('return=')

      // lang=en: not one Cyrillic letter on the screen.
      expect(host.textContent).not.toMatch(CYRILLIC)
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  it('control: the feed is not gated', async () => {
    await open('/feed')
    expect(panel()).toBeNull()
    expect(host.textContent).toContain('FEED_PAGE_SENTINEL')
  })

  it('control: outside embed the same routes open their pages', async () => {
    embed.on = false
    await open('/chat')
    expect(panel()).toBeNull()
    expect(host.textContent).toContain('CHAT_PAGE_SENTINEL')
    act(() => root.unmount())
    root = createRoot(host)
    await open('/generate/script')
    expect(panel()).toBeNull()
    expect(host.textContent).toContain('SCRIPT_PAGE_SENTINEL')
  })

  it('control: a frame that holds a session opens the page', async () => {
    sessionStorage.setItem(ACCESS, 'fake-access-1')
    await open('/chat')
    expect(panel()).toBeNull()
    expect(host.textContent).toContain('CHAT_PAGE_SENTINEL')
  })
})

describe('the tab signed in on app.t27.ai, the frame by t27.ai stays a guest', () => {
  // The sign-in stored a live session in the tab. A frame with a t27.ai
  // ancestor never reads it (lib/framedSession.ts), so a link back to a
  // sign-in that returns here would show this panel again, forever.
  const realTop = Object.getOwnPropertyDescriptor(window, 'top')

  beforeEach(() => {
    sessionStorage.setItem(ACCESS, 'fake-access-1')
    sessionStorage.setItem(EXPIRES, String(Date.now() + 600000))
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => ({ not: 'this window' }),
    })
  })

  afterEach(() => {
    if (realTop) Object.defineProperty(window, 'top', realTop)
    delete (window.location as { ancestorOrigins?: unknown }).ancestorOrigins
  })

  function ancestors(list: string[]) {
    Object.defineProperty(window.location, 'ancestorOrigins', {
      configurable: true,
      value: list,
    })
  }

  it.each([
    ['the TRI tab', ['https://t27.ai']],
    ['the Hive', ['https://t27.ai', 'https://app.t27.ai']],
  ])(
    'in %s the panel opens the CRM in the app in a new tab, with no way back into this frame',
    async (_where, list) => {
      ancestors(list)
      expect(window.self === window.top).toBe(false)
      await open('/crm')
      const p = panel()
      expect(p?.dataset.embedGuest).toBe('crm')
      const link = p!.querySelector('a')!
      expect(link.getAttribute('href')).toBe('https://app.t27.ai/crm')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(host.querySelector('a[target="_top"]')).toBeNull()
      expect(host.querySelector('a[href*="return="]')).toBeNull()
    }
  )

  it('control: framed by the app itself (app.t27.ai/game/), the same session opens the CRM', async () => {
    ancestors([window.location.origin])
    await open('/crm')
    await settle(() => !!host.querySelector('.crm'))
    expect(panel()).toBeNull()
    expect(host.querySelector('.crm')).not.toBeNull()
  })
})

describe('a session the server refuses shows the same panel', () => {
  beforeEach(() => {
    sessionStorage.setItem(ACCESS, 'fake-access-1')
  })

  it('control: a 500 from /mcp keeps the four "Could not load" blocks', async () => {
    answer(500)
    await open('/crm')
    await settle(() => host.querySelectorAll('.crm__unreachable').length > 0)
    expect(panel()).toBeNull()
    expect(host.querySelectorAll('.crm__unreachable')).toHaveLength(4)
  })

  it('control: outside embed a 401 keeps the blocks', async () => {
    embed.on = false
    answer(401)
    await open('/crm')
    await settle(() => host.querySelectorAll('.crm__unreachable').length > 0)
    expect(panel()).toBeNull()
    expect(host.querySelectorAll('.crm__unreachable')).toHaveLength(4)
  })

  it('in the frame a 401 from /mcp replaces the CRM with the panel', async () => {
    answer(401)
    await open('/crm')
    await settle(() => panel() !== null)
    expect(panel()?.dataset.embedGuest).toBe('crm')
    expect(host.querySelectorAll('.crm__unreachable')).toHaveLength(0)
  })

  it('in the frame a 401 on one client page does the same', async () => {
    answer(401)
    await open('/crm/12345')
    await settle(() => panel() !== null)
    expect(panel()?.dataset.embedGuest).toBe('crm')
  })
})
