import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_ORIGIN,
  answerIdentityRequests,
  identityRequestNonce,
  mintForGame,
} from './hive'

/**
 * THE HIVE TAB TELLS THE FRAMED GAME WHO THE VISITOR IS.
 *
 * The same request and reply shapes as the bridge page (public/bridge/),
 * minted with the player's own credential, never handing that credential
 * over, never an agent key. Negative controls for the origin and source
 * guards run as mutants against lib/hive.ts (see the PR notes).
 */

const API = 'https://api.example.test'
const REQUEST = { v: 1, type: 'tri-identity-request', nonce: 'n-1' }
const SIGNED_IN = {
  game_token: 'fake-game-1',
  expires_in: 300,
  telegram_id: '42',
}

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('not json')
      return body
    },
  } as Response
}

function fakeFetch(status = 200, body: unknown = SIGNED_IN) {
  return vi.fn(async () => response(status, body))
}

type Init = RequestInit & { headers: Record<string, string> }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('identityRequestNonce', () => {
  it('accepts a v1 identity request', () => {
    expect(identityRequestNonce(REQUEST)).toBe('n-1')
  })

  it.each([
    ['a JSON string', JSON.stringify(REQUEST)],
    ['v 2', { ...REQUEST, v: 2 }],
    ['another type', { ...REQUEST, type: 'tri-identity' }],
    ['no nonce', { v: 1, type: 'tri-identity-request' }],
    ['an empty nonce', { ...REQUEST, nonce: '' }],
    ['a number nonce', { ...REQUEST, nonce: 7 }],
    ['a 129-char nonce', { ...REQUEST, nonce: 'x'.repeat(129) }],
    ['null', null],
  ])('refuses %s', (_label, data) => {
    expect(identityRequestNonce(data)).toBeNull()
  })
})

describe('mintForGame', () => {
  it('a browser session mints with its Bearer, credentials omitted', async () => {
    const fetch = fakeFetch()
    const reply = await mintForGame(
      'n-1',
      { initData: '', accessToken: 'fake-access-1' },
      API,
      fetch
    )
    expect(reply).toEqual({
      v: 1,
      type: 'tri-identity',
      nonce: 'n-1',
      state: 'signed-in',
      ...SIGNED_IN,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, Init]
    expect(url).toBe(`${API}/api/auth/game-token`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer fake-access-1',
    })
    expect(JSON.parse(String(init.body))).toEqual({ aud: GAME_ORIGIN })
  })

  it('inside Telegram it sends the signed initData instead, and passes the refusal through', async () => {
    const fetch = fakeFetch(403, { error: 'game_token_launch_bots_unset' })
    const reply = await mintForGame(
      'n-1',
      { initData: 'fake-init-1', accessToken: 'fake-access-1' },
      API,
      fetch
    )
    const [, init] = fetch.mock.calls[0] as unknown as [string, Init]
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': 'fake-init-1',
    })
    expect(reply).toEqual({
      v: 1,
      type: 'tri-identity',
      nonce: 'n-1',
      state: 'unavailable',
      code: 'game_token_launch_bots_unset',
    })
  })

  it('without a credential it is signed-out and calls nothing', async () => {
    const fetch = fakeFetch()
    const reply = await mintForGame(
      'n-1',
      { initData: '', accessToken: '' },
      API,
      fetch
    )
    expect(reply).toEqual({
      v: 1,
      type: 'tri-identity',
      nonce: 'n-1',
      state: 'signed-out',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never sends an agent key, even in a dev build that has one', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_AGENT_KEY', 'fake-agent-1')
    const fetch = fakeFetch()
    await mintForGame('n-1', { initData: '', accessToken: '' }, API, fetch)
    expect(fetch).not.toHaveBeenCalled()
    await mintForGame(
      'n-2',
      { initData: '', accessToken: 'fake-access-1' },
      API,
      fetch
    )
    const [, init] = fetch.mock.calls[0] as unknown as [string, Init]
    const names = Object.keys(init.headers).map(h => h.toLowerCase())
    expect(names).not.toContain('x-agent-key')
    expect(JSON.stringify(init)).not.toContain('fake-agent-1')
  })

  it.each([
    [403, { error: 'game_token_parent_not_web' }, 'game_token_parent_not_web'],
    [429, { error: 'game_token_rate_limited' }, 'game_token_rate_limited'],
    [500, undefined, 'http_500'],
    [200, { game_token: 'fake-game-1' }, 'bad_response'],
  ])('HTTP %i %j is unavailable: %s', async (status, body, code) => {
    const reply = await mintForGame(
      'n-1',
      { initData: '', accessToken: 'fake-access-1' },
      API,
      fakeFetch(status, body)
    )
    expect(reply).toEqual({
      v: 1,
      type: 'tri-identity',
      nonce: 'n-1',
      state: 'unavailable',
      code,
    })
  })

  it('a network failure is unavailable: network', async () => {
    const reply = await mintForGame(
      'n-1',
      { initData: '', accessToken: 'fake-access-1' },
      API,
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    )
    expect(reply).toMatchObject({ state: 'unavailable', code: 'network' })
  })
})

describe('answerIdentityRequests', () => {
  function setup() {
    let onMessage: ((event: MessageEvent) => void) | null = null
    const win = {
      addEventListener: vi.fn((_type: string, fn: never) => {
        onMessage = fn
      }),
      removeEventListener: vi.fn(),
    }
    const frameWindow = { postMessage: vi.fn() } as unknown as Window
    let frame: Window | null = frameWindow
    const fetch = fakeFetch()
    const stop = answerIdentityRequests({
      win: win as never,
      frame: () => frame,
      credential: () => ({ initData: '', accessToken: 'fake-access-1' }),
      apiBase: API,
      fetchImpl: fetch,
    })
    return {
      win,
      fetch,
      frameWindow,
      post: frameWindow.postMessage as unknown as ReturnType<typeof vi.fn>,
      stop,
      replaceFrame: () => {
        frame = { postMessage: vi.fn() } as unknown as Window
      },
      send: (data: unknown, origin: string, source: unknown) =>
        onMessage!({ data, origin, source } as MessageEvent),
    }
  }

  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  it('answers the frame on https://t27.ai, to https://t27.ai', async () => {
    const s = setup()
    s.send(REQUEST, 'https://t27.ai', s.frameWindow)
    await flush()
    expect(s.post).toHaveBeenCalledTimes(1)
    expect(s.post).toHaveBeenCalledWith(
      {
        v: 1,
        type: 'tri-identity',
        nonce: 'n-1',
        state: 'signed-in',
        ...SIGNED_IN,
      },
      'https://t27.ai'
    )
  })

  it.each([
    'https://app.t27.ai',
    'https://evil.example',
    'https://t27.ai.evil.example',
    'null',
  ])('ignores origin %s, even from the frame window', async origin => {
    const s = setup()
    s.send(REQUEST, origin, s.frameWindow)
    await flush()
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.post).not.toHaveBeenCalled()
  })

  it('ignores https://t27.ai from any other window (a nested frame, the page itself)', async () => {
    const s = setup()
    s.send(REQUEST, 'https://t27.ai', { postMessage: vi.fn() })
    s.send(REQUEST, 'https://t27.ai', null)
    await flush()
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.post).not.toHaveBeenCalled()
  })

  it('ignores a malformed request from the right frame', async () => {
    const s = setup()
    s.send({ ...REQUEST, v: 2 }, 'https://t27.ai', s.frameWindow)
    await flush()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('drops the reply when the frame was replaced meanwhile', async () => {
    const s = setup()
    s.send(REQUEST, 'https://t27.ai', s.frameWindow)
    s.replaceFrame()
    await flush()
    expect(s.fetch).toHaveBeenCalledTimes(1)
    expect(s.post).not.toHaveBeenCalled()
  })

  it('unsubscribes the same listener it added', () => {
    const s = setup()
    s.stop()
    expect(s.win.removeEventListener).toHaveBeenCalledWith(
      'message',
      s.win.addEventListener.mock.calls[0][1]
    )
  })
})
