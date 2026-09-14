import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

/**
 * INSIDE THE GAME'S TRI FRAME THE APP DROPS ITS OWN CHROME AND WRITES NOTHING
 * THE REAL APP READS. OUTSIDE IT, NOTHING CHANGES.
 *
 * Every case runs twice: with embed on, and with embed off as the control,
 * because "the tab bar is gone" passes just as well for a tab bar that never
 * rendered at all.
 */

const embed = vi.hoisted(() => ({ on: false, widget: false }))

vi.mock('@/lib/embed', () => ({
  get IS_EMBED() {
    return embed.on
  },
  embedLang: () => (embed.on ? 'ru' : null),
  parentOrigin: () => (embed.on ? 'https://t27.ai' : null),
  widgetFrameAllowed: () => !embed.on || embed.widget,
  postToParent: () => {},
  APP_ORIGIN: 'https://app.t27.ai',
}))

// The real widget injects telegram-widget.js; a stub says whether it rendered.
vi.mock('@/components/Auth/TelegramLoginButton', () => ({
  TelegramLoginButton: () => <div className="tg-widget-stub" />,
  UserAvatar: () => <div className="user-avatar-stub" />,
}))

import { showLoginModalAtom } from '@/atoms'
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar'
import { RouteMemory } from '@/components/Navigation/RouteMemory'
import { LoginModal } from '@/components/Auth/LoginModal'
import { Header } from '@/components/Header/Header'
import HivePage from '@/pages/Hive'

let host: HTMLDivElement
let root: Root | null = null

beforeAll(() => {
  // jsdom has no scrollIntoView; the tab bar calls it for the active tab.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  localStorage.clear()
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  embed.on = false
  embed.widget = false
  localStorage.clear()
  vi.unstubAllGlobals()
})

function mount(ui: ReactNode) {
  root = createRoot(host)
  act(() => root!.render(ui))
}

describe('the tab bar', () => {
  const bar = () =>
    mount(
      <MemoryRouter initialEntries={['/feed']}>
        <TelegramTabBar />
      </MemoryRouter>
    )

  it('is not rendered in embed, and no space is reserved for it', () => {
    embed.on = true
    bar()
    expect(host.querySelector('nav.tma-tabbar')).toBeNull()
    expect(document.body.hasAttribute('data-tabbar')).toBe(false)
  })

  it('renders outside embed (control)', () => {
    bar()
    expect(host.querySelector('nav.tma-tabbar')).not.toBeNull()
    expect(document.body.getAttribute('data-tabbar')).toBe('visible')
  })
})

describe('route memory', () => {
  const at = (path: string) =>
    mount(
      <MemoryRouter initialEntries={[path]}>
        <RouteMemory />
      </MemoryRouter>
    )

  it('embed navigation does not overwrite the real app last route', () => {
    embed.on = true
    at('/chat')
    expect(localStorage.getItem('vibee-last-route')).toBeNull()
  })

  it('outside embed the route is remembered (control)', () => {
    at('/chat')
    expect(localStorage.getItem('vibee-last-route')).toBe('/chat')
  })

  // REMEMBERED is read once at module load, so these import a fresh copy.
  const launch = async () => {
    localStorage.setItem('vibee-last-route', '/chat')
    vi.resetModules()
    const { LaunchRedirect } = await import(
      '@/components/Navigation/RouteMemory'
    )
    mount(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LaunchRedirect />} />
          <Route path="/feed" element={<p>feed-screen</p>} />
          <Route path="/chat" element={<p>chat-screen</p>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('the root in embed opens the feed, not the remembered screen', async () => {
    embed.on = true
    await launch()
    expect(host.textContent).toBe('feed-screen')
  })

  it('the root outside embed restores the remembered screen (control)', async () => {
    await launch()
    expect(host.textContent).toBe('chat-screen')
  })
})

describe('the hive page', () => {
  it('in embed shows a notice and never frames the game inside the game', () => {
    embed.on = true
    mount(<HivePage />)
    expect(host.querySelector('iframe')).toBeNull()
    const notice = host.querySelector('.hive-inside-game')
    expect(notice).not.toBeNull()
    expect(notice!.textContent).not.toContain('hive.insideGame')
    expect(notice!.textContent!.length).toBeGreaterThan(20)
  })

  it('outside embed frames the game (control)', () => {
    mount(<HivePage />)
    expect(host.querySelector('iframe')?.getAttribute('src')).toMatch(
      /^https:\/\/t27\.ai\/\?lang=(en|ru)#\/queen$/
    )
    expect(host.querySelector('.hive-inside-game')).toBeNull()
  })
})

describe('the login modal', () => {
  const open = () => {
    const store = createStore()
    store.set(showLoginModalAtom, true)
    mount(
      <Provider store={store}>
        <LoginModal />
      </Provider>
    )
  }

  it('in embed under t27.ai links out to the app instead of a blocked widget', () => {
    embed.on = true
    embed.widget = false
    open()
    expect(host.querySelector('.tg-widget-stub')).toBeNull()
    const link = host.querySelector<HTMLAnchorElement>('a.embed-open-app')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe(
      'https://app.t27.ai' + window.location.pathname
    )
    expect(link!.target).toBe('_blank')
    expect(link!.rel).toContain('noopener')
    expect(host.textContent).not.toMatch(
      /embed\.(signInTitle|signInBody|openApp)/
    )
  })

  it('in embed under app.t27.ai keeps the widget', () => {
    embed.on = true
    embed.widget = true
    open()
    expect(host.querySelector('.tg-widget-stub')).not.toBeNull()
    expect(host.querySelector('a.embed-open-app')).toBeNull()
  })

  it('outside embed shows the widget (control)', () => {
    open()
    expect(host.querySelector('.tg-widget-stub')).not.toBeNull()
    expect(host.querySelector('a.embed-open-app')).toBeNull()
  })
})

describe('the header', () => {
  const render = () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 }))
    )
    const store = createStore()
    store.set(showLoginModalAtom, true)
    mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/feed']}>
          <Header />
        </MemoryRouter>
      </Provider>
    )
  }

  it('in embed keeps only its modals: sign-in still opens', () => {
    embed.on = true
    render()
    expect(host.querySelector('header.header')).toBeNull()
    expect(host.querySelector('.header-tabs')).toBeNull()
    expect(host.querySelector('.login-modal')).not.toBeNull()
  })

  it('outside embed renders the header with its modals (control)', () => {
    render()
    expect(host.querySelector('header.header')).not.toBeNull()
    expect(host.querySelector('.login-modal')).not.toBeNull()
  })
})

describe('the language atom', () => {
  const fresh = async () => {
    vi.resetModules()
    return (await import('@/atoms/language')).languageAtom
  }

  it('in embed reads the game language, over a stored one, and never writes it', async () => {
    embed.on = true
    // Under app.t27.ai/game/ the frame shares localStorage with the real app.
    localStorage.setItem('vibee-lang', JSON.stringify('en'))
    const languageAtom = await fresh()
    const store = createStore()
    expect(store.get(languageAtom)).toBe('ru')
    store.set(languageAtom, 'en')
    expect(store.get(languageAtom)).toBe('en')
    expect(localStorage.getItem('vibee-lang')).toBe(JSON.stringify('en'))
    localStorage.removeItem('vibee-lang')
    store.set(languageAtom, 'ru')
    expect(localStorage.getItem('vibee-lang')).toBeNull()
  })

  it('outside embed it persists as before (control)', async () => {
    const languageAtom = await fresh()
    const store = createStore()
    store.set(languageAtom, 'ru')
    expect(localStorage.getItem('vibee-lang')).toBe(JSON.stringify('ru'))
  })
})
