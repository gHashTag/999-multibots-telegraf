import { act } from 'react'
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
import HivePage from './Hive'

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
    act(() => root.render(<HivePage />))

    const expected = `https://t27.ai/?lang=${lang}#/queen`
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      expected
    )
    expect(container.querySelector('a.hive-out')?.getAttribute('href')).toBe(
      expected
    )
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
    act(() => root.render(<HivePage />))
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
      expect(modal()).not.toBeNull()
      expect(window.location.href).toBe(before)
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
      act(() => root.render(<HivePage />))
      const iframe = container.querySelector('iframe')!
      expect(iframe.getAttribute('src')).toBe('https://t27.ai/?lang=ru#/queen')
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
