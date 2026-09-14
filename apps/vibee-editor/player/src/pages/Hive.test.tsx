import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const language = vi.hoisted(() => ({ lang: 'en' }))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: language.lang, t: (key: string) => key }),
}))

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
  let fetchMock: ReturnType<typeof vi.fn>

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
