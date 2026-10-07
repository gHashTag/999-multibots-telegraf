import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const language = vi.hoisted(() => ({ lang: 'en' }))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: language.lang, t: (key: string) => key }),
}))

// Telegram launch data, and who frames the page. jsdom runs top-level and has
// no location.ancestorOrigins, so the real sessionTrustedIn is handed the
// window a frame would have. Defaults: no launch data, jsdom's own window.
const framing = vi.hoisted(() => ({
  initData: '',
  ancestors: null as string[] | null,
}))

vi.mock('@/lib/telegram', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/telegram')>()),
  getInitData: () => framing.initData,
}))

vi.mock('@/lib/framedSession', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/framedSession')>()
  return {
    ...real,
    sessionTrustedIn: (win: Parameters<typeof real.sessionTrustedIn>[0]) =>
      framing.ancestors === null
        ? real.sessionTrustedIn(win)
        : real.sessionTrustedIn({
            self: 'this frame',
            top: 'the page framing it',
            location: {
              origin: 'https://app.t27.ai',
              ancestorOrigins: framing.ancestors,
            },
          }),
  }
})

/**
 * THE HIVE PAGE OPENS THE GAME IN THE PLAYER LANGUAGE.
 *
 * `queenPage` is tested on its own in lib/hive.test.ts; this asserts the page
 * actually hands it the player's language. A page that hard-coded 'en' would
 * pass every other test while a Russian player saw an English game.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { getDefaultStore } from 'jotai'
import { showLoginModalAtom } from '@/atoms'
import HivePage, { BOARD_GRACE_MS } from './Hive'
// Mounted here because App.tsx mounts it: ONE card above the routes, not
// one per page. Hive used to render its own, and these cases read the card
// out of the page's own tree. The page's job is to OPEN the door, and that
// is asserted on the atom below; the card is drawn by the app root, so the
// app root is what the harness has to reproduce.
import { LoginModal } from '@/components/Auth/LoginModal'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

/** Where the app's address is, as the router holds it. */
const where: { path: string; go: (to: string) => void } = {
  path: '',
  go: () => {},
}
function Where() {
  const loc = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    where.path = `${loc.pathname}${loc.search}${loc.hash}`
    where.go = to => navigate(to)
  }, [loc, navigate])
  return null
}

/** The page as App.tsx routes it: inside a router, at /game unless told. */
function Page({ at = '/game' }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <HivePage />
      <LoginModal />
      <Where />
    </MemoryRouter>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the hive page', () => {
  it.each(['ru', 'en'])('frames and links the game in %s', lang => {
    language.lang = lang
    act(() => root.render(<Page />))

    // The frame holds THIS origin's copy of the board (owner, 2026-09-26:
    // "embed the Queen's board into the app"); t27.ai is only the way out.
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `/queen/?lang=${lang}#/queen`
    )
    expect(container.querySelector('a.hive-out')?.getAttribute('href')).toBe(
      `https://t27.ai/?lang=${lang}#/queen`
    )
  })

  it('no link sits over the board once it has loaded', () => {
    // Owner, 2026-10-01, with a screenshot: the corner pill covered the
    // board's own header (LIVE, MENU). The way out lives in the placeholder.
    act(() => root.render(<Page />))
    expect(container.querySelector('a.hive-out')).toBeTruthy()
    act(() => {
      container.querySelector('iframe')!.dispatchEvent(new Event('load'))
    })
    expect(container.querySelector('a.hive-out')).toBeNull()
  })
})

/**
 * ONE ADDRESS PER VIEW, AND A WAY OUT WHEN THE BOARD NEVER DRAWS.
 *
 * The frame is this origin's /queen/, so the page reads it directly. Here its
 * window and document are doubles: jsdom does not load /queen/, and the
 * doubles say exactly what the board would -- the hash it wrote, and whether
 * its #root has children.
 */
describe('the game address follows the board, and the board the address', () => {
  type Board = {
    hash: string
    drawn: boolean
    replace: ReturnType<typeof vi.fn>
  }
  let board: Board

  beforeEach(() => {
    vi.useFakeTimers()
    language.lang = 'en'
    board = { hash: '#/queen', drawn: true, replace: vi.fn() }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function open(at = '/game') {
    act(() => root.render(<Page at={at} />))
    const iframe = container.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      get: () => ({
        location: {
          get hash() {
            return board.hash
          },
          href: `https://app.t27.ai/queen/?lang=en${board.hash}`,
          replace: board.replace,
        },
        postMessage: () => {},
      }),
    })
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get: () => ({
        getElementById: (id: string) =>
          id === 'root' ? { childElementCount: board.drawn ? 1 : 0 } : null,
      }),
    })
    act(() => {
      iframe.dispatchEvent(new Event('load'))
    })
    return iframe
  }
  const tick = (ms = 400) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  it('/game/<view> opens that view in the frame, the rest of the query with it', () => {
    act(() => root.render(<Page at="/game/tri?screen=chat" />))
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe(
      '/queen/?lang=en#/queen?tab=tri&screen=chat'
    )
  })

  it('a view picked inside the board becomes the address /game/<view>', () => {
    open()
    board.hash = '#/queen?tab=kanban'
    tick()
    expect(where.path).toBe('/game/kanban')
    board.hash = '#/queen?tab=skills&skill=t27%2Ftri'
    tick()
    expect(where.path).toBe('/game/skills?skill=t27%2Ftri')
    // The address followed the board; the board is not sent anywhere for it
    // (a replace here would reload her view on every pick).
    expect(board.replace).not.toHaveBeenCalled()
  })

  it('a bookmark from before /game (its view in the hash) lands on the same view', () => {
    // nginx sends app.t27.ai/queen/#/queen?tab=wars to /game, fragment kept.
    act(() => root.render(<Page at="/game#/queen?tab=wars" />))
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe(
      '/queen/?lang=en#/queen?tab=wars'
    )
  })

  it('the address moved by the app (Back, a link) moves the frame, once', () => {
    open('/game/kanban')
    board.hash = '#/queen?tab=kanban'
    tick()
    act(() => where.go('/game/wars'))
    expect(board.replace).toHaveBeenCalledTimes(1)
    expect(board.replace).toHaveBeenCalledWith(
      'https://app.t27.ai/queen/?lang=en#/queen?tab=wars'
    )
    // The board writing the view it already shows moves nothing back.
    board.hash = '#/queen?tab=wars'
    tick()
    expect(where.path).toBe('/game/wars')
    expect(board.replace).toHaveBeenCalledTimes(1)
  })

  it('a hash that is not her board leaves the address alone', () => {
    open('/game/kanban')
    board.hash = '#/profile'
    tick()
    expect(where.path).toBe('/game/kanban')
  })

  it('a board that never draws brings the way out back after the grace', () => {
    // The black rectangle of 25.09.2026: the frame fired `load` for the
    // browser's error page. Now the page can look, so it does.
    board.drawn = false
    open()
    tick(BOARD_GRACE_MS - 400)
    expect(container.querySelector('a.hive-out')).toBeNull()
    tick(800)
    const out = container.querySelector('a.hive-out')
    expect(out, 'a board that is not there must say where it is').toBeTruthy()
    expect(out!.getAttribute('href')).toContain('t27.ai')
    expect(container.textContent).toContain('hive.stuck')
  })

  it('control: a board that drew itself keeps the screen to itself', () => {
    open()
    tick(BOARD_GRACE_MS + 800)
    expect(container.querySelector('a.hive-out')).toBeNull()
  })

  it('the tab names the game with no view word, on every view, and is put back on the way out', () => {
    // Owner, 2026-10-04, a screenshot of /game/browser: the tab still said
    // "AI Video Editor | Powered by V5 Ultra-Minimal Language". Then, of the
    // first fix: "BROWSER ·" is not a word the tab should carry.
    document.title = 'before the game'
    open('/game/browser')
    expect(document.title).toBe('app.title')
    board.hash = '#/queen?tab=kanban'
    tick()
    expect(document.title).toBe('app.title')
    expect(document.title).not.toMatch(/BROWSER|KANBAN|·/)
    act(() => root.unmount())
    expect(document.title).toBe('before the game')
    root = createRoot(container)
  })
})

/**
 * THE PAGE WIRES THE IDENTITY ANSWER TO ITS OWN FRAME.
 *
 * lib/hive-identity.test.ts covers the rules; this asserts the page listens,
 * that `frame` is this iframe's window, and that the listener goes away with
 * the page. The browser session is a fake token in sessionStorage.
 */
describe('the hive page answers its game frame', () => {
  const REQUEST = { v: 1, type: 'tri-identity-request', nonce: 'n-1' }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  /*
   * `ReturnType<typeof vi.fn>` resolves to Mock<any[], unknown>, and newer
   * vitest types refuse to assign a precisely-typed arrow to it. What this
   * suite tests is the page's answer to its game frame, not the shape of the
   * double, so the variable is typed loosely rather than the double being bent
   * to fit a name.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: any

  beforeEach(() => {
    sessionStorage.setItem('trinity.app.session.access', 'fake-access-1')
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        game_token: 'fake-game-1',
        expires_in: 300,
        telegram_id: '42',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  function renderAndSpy() {
    act(() => root.render(<Page />))
    const frame = container.querySelector('iframe')!.contentWindow!
    const post = vi.spyOn(frame, 'postMessage').mockImplementation(() => {})
    return { frame, post }
  }

  function send(source: MessageEventSource | null, origin = 'https://t27.ai') {
    window.dispatchEvent(
      new MessageEvent('message', { data: REQUEST, origin, source })
    )
  }

  it('a request from its iframe on https://t27.ai gets a game token back there', async () => {
    const { frame, post } = renderAndSpy()
    send(frame)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      {
        v: 1,
        type: 'tri-identity',
        nonce: 'n-1',
        state: 'signed-in',
        game_token: 'fake-game-1',
        expires_in: 300,
        telegram_id: '42',
      },
      'https://t27.ai'
    )
  })

  it('control: the same request from the page itself or another origin is ignored', async () => {
    const { frame, post } = renderAndSpy()
    send(window)
    send(frame, 'https://app.t27.ai')
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  describe('only where the app session is trusted', () => {
    afterEach(() => {
      framing.initData = ''
      framing.ancestors = null
    })

    it('framed by a t27.ai page, with Telegram launch data, a request from its game frame mints nothing', async () => {
      // That page shares the game frame's origin, so it can ask through it.
      framing.initData = 'fake-init-1'
      framing.ancestors = ['https://t27.ai']
      const { frame, post } = renderAndSpy()
      send(frame)
      await flush()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    })

    it('control: framed by Telegram Web, the same request mints with the launch data', async () => {
      framing.initData = 'fake-init-1'
      framing.ancestors = ['https://web.telegram.org']
      const { frame, post } = renderAndSpy()
      send(frame)
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const init = fetchMock.mock.calls[0][1] as RequestInit & {
        headers: Record<string, string>
      }
      expect(init.headers['X-Telegram-Init-Data']).toBe('fake-init-1')
      expect(post).toHaveBeenCalledTimes(1)
    })
  })

  describe('sign-in asked by the game, and a frame that left the Queen', () => {
    const SIGN_IN = { v: 1, type: 't27-app', kind: 'sign-in' }
    const modal = () => container.querySelector('.login-modal')

    beforeEach(() => {
      language.lang = 'en'
    })

    afterEach(() => {
      getDefaultStore().set(showLoginModalAtom, false)
    })

    function renderFrame() {
      const { frame, post } = renderAndSpy()
      const iframe = container.querySelector('iframe')!
      const load = () =>
        act(() => {
          iframe.dispatchEvent(new Event('load'))
        })
      return { frame, post, load }
    }

    function deliver(
      data: unknown,
      source: MessageEventSource | null,
      origin = 'https://t27.ai'
    ) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', { data, origin, source })
        )
      })
    }

    it('a sign-in request from its game frame opens the login modal and the page stays', async () => {
      const before = window.location.href
      const { frame, load } = renderFrame()
      load()
      expect(modal()).toBeNull()
      deliver(SIGN_IN, frame)
      await flush()
      // The door the page opens...
      expect(getDefaultStore().get(showLoginModalAtom)).toBe(true)
      // ...and the card the app root draws through it.
      expect(modal()).not.toBeNull()
      expect(window.location.href).toBe(before)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('a sign-in request from the same-origin board frame opens the login modal', async () => {
      const { frame, load } = renderFrame()
      load()
      deliver(SIGN_IN, frame, window.location.origin)
      await flush()
      expect(getDefaultStore().get(showLoginModalAtom)).toBe(true)
      expect(modal()).not.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('control: the same message from another origin or window opens nothing', async () => {
      const { frame, load } = renderFrame()
      load()
      deliver(SIGN_IN, frame, 'https://evil.example')
      deliver(SIGN_IN, window)
      await flush()
      expect(modal()).toBeNull()
    })

    it('after the frame loads a second document it is not answered and cannot open the modal', async () => {
      const { frame, post, load } = renderFrame()
      load()
      load()
      send(frame)
      deliver(SIGN_IN, frame)
      await flush()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(modal()).toBeNull()
    })

    it('control: after the first load only, it is answered', async () => {
      const { frame, post, load } = renderFrame()
      load()
      send(frame)
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('a token minted while the frame navigated away is not delivered', async () => {
      let finish: (value: unknown) => void = () => {}
      fetchMock.mockImplementationOnce(
        () => new Promise(resolve => (finish = resolve))
      )
      const { frame, post, load } = renderFrame()
      load()
      send(frame)
      load()
      finish({
        ok: true,
        status: 200,
        json: async () => ({
          game_token: 'fake-game-1',
          expires_in: 300,
          telegram_id: '42',
        }),
      })
      await flush()
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(post).not.toHaveBeenCalled()
    })

    it('a new game address set by the page itself (the language) is answered again', async () => {
      const { load } = renderFrame()
      load()
      language.lang = 'ru'
      act(() => root.render(<Page />))
      const iframe = container.querySelector('iframe')!
      expect(iframe.getAttribute('src')).toBe('/queen/?lang=ru#/queen')
      load()
      // jsdom gives the frame a new window when its src changes.
      const frame = iframe.contentWindow!
      const post = vi.spyOn(frame, 'postMessage').mockImplementation(() => {})
      send(frame)
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledTimes(1)
    })
  })

  it('removes the same message listener when the page goes away', () => {
    // A request after unmount proves nothing on its own: the iframe is gone,
    // so `frame()` is null and the listener would return early anyway.
    const added = vi.spyOn(window, 'addEventListener')
    const removed = vi.spyOn(window, 'removeEventListener')
    renderAndSpy()
    const listener = added.mock.calls.find(([type]) => type === 'message')?.[1]
    expect(listener).toBeTypeOf('function')
    act(() => root.unmount())
    root = createRoot(container)
    expect(removed).toHaveBeenCalledWith('message', listener)
    added.mockRestore()
    removed.mockRestore()
  })
})
