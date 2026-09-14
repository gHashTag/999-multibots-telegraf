import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE BRIDGE PAGE THE GAME FRAMES WHEN IT RUNS TOP-LEVEL ON https://t27.ai.
 *
 * public/bridge/bridge.js is a plain script, so it is run here against a fake
 * `window`: every property it reads on window and every storage key it
 * touches is recorded. The storage is seeded with the refresh token and
 * Telegram's launch data, so a bridge that read them would get a value and
 * show up in the record.
 *
 * Each guard has a negative control: the same test against a copy of the
 * script with that guard cut out must see the guard's absence. mutate() fails
 * if its target text is not in the script exactly once, so a control cannot
 * silently turn into a copy of the real script.
 */

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../public/bridge/bridge.js'),
  'utf8'
)

const GAME = 'https://t27.ai'
const ACCESS = 'trinity.app.session.access'
const EXPIRES = 'trinity.app.session.expires-at'
const REFRESH = 'trinity.app.session.refresh'
const CONSENT = 'trinity.bridge.consent'
const MINT =
  'https://vibee-render-production.up.railway.app/api/auth/game-token'

const SIGNED_IN = {
  game_token: 'fake-game-1',
  expires_in: 300,
  telegram_id: '42',
}

function mutate(from: string, to: string): string {
  const parts = SOURCE.split(from)
  if (parts.length !== 2) {
    throw new Error(`mutant target occurs ${parts.length - 1} times: ${from}`)
  }
  return parts.join(to)
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

type Listener = (event: Record<string, unknown>) => void

interface BootOptions {
  source?: string
  storage?: Record<string, string>
  fetch?: () => Promise<unknown>
}

function session(extra: Record<string, string> = {}): Record<string, string> {
  return {
    [ACCESS]: 'fake-access-1',
    [EXPIRES]: String(Date.now() + 600_000),
    [REFRESH]: 'fake-refresh-1',
    __telegram__initParams: '{"tgWebAppData":"fake-init-1"}',
    't27.crm.key': 'fake-agent-1',
    ...extra,
  }
}

function boot(options: BootOptions = {}) {
  const values = new Map(Object.entries(options.storage ?? {}))
  const keysRead: string[] = []
  const keysWritten: string[] = []
  const storage = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'getItem') {
          return (key: string) => {
            keysRead.push(String(key))
            return values.get(key) ?? null
          }
        }
        if (prop === 'setItem') {
          return (key: string, value: string) => {
            keysWritten.push(String(key))
            values.set(key, String(value))
          }
        }
        keysRead.push(`property:${String(prop)}`)
        return undefined
      },
    }
  )

  const posts: { message: Record<string, unknown>; target: string }[] = []
  const parent = {
    postMessage(message: Record<string, unknown>, target: string) {
      posts.push({ message, target })
    },
  }
  const listeners: Record<string, Listener[]> = {}
  const documentListeners: Record<string, Listener[]> = {}
  const clicks: Listener[] = []
  const button = {
    hidden: true,
    addEventListener: (_type: string, fn: Listener) => clicks.push(fn),
  }
  const document = {
    visibilityState: 'visible',
    getElementById: (id: string) => (id === 'tri-continue' ? button : null),
    addEventListener: (type: string, fn: Listener) =>
      (documentListeners[type] ||= []).push(fn),
  }
  const fetch = vi.fn(options.fetch ?? (async () => response(200, SIGNED_IN)))
  const target: Record<string, unknown> = {
    document,
    sessionStorage: storage,
    parent,
    fetch,
    addEventListener: (type: string, fn: Listener) =>
      (listeners[type] ||= []).push(fn),
  }
  const windowRead = new Set<string>()
  const win = new Proxy(target, {
    get(t, prop) {
      windowRead.add(String(prop))
      return t[prop as string]
    },
  })

  new Function('window', options.source ?? SOURCE)(win)

  return {
    posts,
    fetch,
    button,
    values,
    keysRead,
    keysWritten,
    windowRead,
    parent,
    ask(
      nonce = 'n-1',
      from: { origin?: string; source?: unknown; data?: unknown } = {}
    ) {
      const data =
        'data' in from
          ? from.data
          : { v: 1, type: 'tri-identity-request', nonce }
      for (const fn of listeners.message ?? []) {
        fn({
          data,
          origin: from.origin ?? GAME,
          source: 'source' in from ? from.source : parent,
        })
      }
    },
    click(isTrusted = true) {
      for (const fn of clicks) fn({ isTrusted })
    },
    storageEvent(key: string | null) {
      for (const fn of listeners.storage ?? []) fn({ key })
    },
    becomeVisible() {
      document.visibilityState = 'visible'
      for (const fn of documentListeners.visibilitychange ?? []) fn({})
    },
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('the bridge answers only its parent on https://t27.ai', () => {
  const others = [
    'https://app.t27.ai',
    'https://evil.example',
    'https://t27.ai.evil.example',
    'http://t27.ai',
    'null',
  ]

  it.each(others)('ignores a request from origin %s', async origin => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    b.ask('n-1', { origin })
    await flush()
    expect(b.posts).toEqual([])
    expect(b.fetch).not.toHaveBeenCalled()
  })

  it('ignores a request from a window that is not its parent', async () => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    b.ask('n-1', { source: { postMessage() {} } })
    b.ask('n-2', { source: null })
    await flush()
    expect(b.posts).toEqual([])
    expect(b.fetch).not.toHaveBeenCalled()
  })

  it('ignores anything that is not a v1 identity request', async () => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    const bad = [
      JSON.stringify({ v: 1, type: 'tri-identity-request', nonce: 'n' }),
      { v: 2, type: 'tri-identity-request', nonce: 'n' },
      { v: 1, type: 'tri-identity', nonce: 'n' },
      { v: 1, type: 'tri-identity-request' },
      { v: 1, type: 'tri-identity-request', nonce: '' },
      { v: 1, type: 'tri-identity-request', nonce: 7 },
      { v: 1, type: 'tri-identity-request', nonce: 'x'.repeat(129) },
      null,
    ]
    for (const data of bad) b.ask('unused', { data })
    await flush()
    expect(b.posts).toEqual([])
  })

  it('control: the same request from the parent on https://t27.ai is answered', async () => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    b.ask('n-1')
    await flush()
    expect(b.posts).toHaveLength(1)
  })

  it('negative control: without the origin check another origin is answered', async () => {
    const b = boot({
      source: mutate('event.origin !== GAME_ORIGIN || ', ''),
      storage: session({ [CONSENT]: GAME }),
    })
    b.ask('n-1', { origin: 'https://evil.example' })
    await flush()
    expect(b.posts).toHaveLength(1)
  })

  it('negative control: without the source check another window is answered', async () => {
    const b = boot({
      source: mutate(' || event.source !== window.parent', ''),
      storage: session({ [CONSENT]: GAME }),
    })
    b.ask('n-1', { source: null })
    await flush()
    expect(b.posts).toHaveLength(1)
  })

  it('every reply is posted to https://t27.ai, never "*"', async () => {
    const b = boot({ storage: session() })
    b.ask('n-1')
    b.click()
    await flush()
    expect(b.posts.length).toBeGreaterThan(1)
    expect(new Set(b.posts.map(p => p.target))).toEqual(new Set([GAME]))
  })
})

describe('without a session the game is told signed-out', () => {
  it('replies signed-out and never calls the server', async () => {
    const b = boot()
    b.ask('n-1')
    await flush()
    expect(b.posts).toEqual([
      {
        message: {
          v: 1,
          type: 'tri-identity',
          nonce: 'n-1',
          state: 'signed-out',
        },
        target: GAME,
      },
    ])
    expect(b.fetch).not.toHaveBeenCalled()
    expect(b.button.hidden).toBe(true)
  })

  it('an access token past its expiry is no session', async () => {
    const b = boot({
      storage: session({ [EXPIRES]: String(Date.now() - 1), [CONSENT]: GAME }),
    })
    b.ask('n-1')
    await flush()
    expect(b.posts.map(p => p.message.state)).toEqual(['signed-out'])
    expect(b.fetch).not.toHaveBeenCalled()
  })

  it('negative control: without the expiry check an expired token is sent', async () => {
    const b = boot({
      source: mutate('Number(read(EXPIRES_KEY)) > Date.now()', 'true'),
      storage: session({ [EXPIRES]: String(Date.now() - 1), [CONSENT]: GAME }),
    })
    b.ask('n-1')
    await flush()
    expect(b.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('no token before a real click in this tab', () => {
  it('asks for consent, shows the button, and calls nothing', async () => {
    const b = boot({ storage: session() })
    b.ask('n-1')
    b.ask('n-2')
    await flush()
    expect(b.posts.map(p => p.message)).toEqual([
      { v: 1, type: 'tri-identity', nonce: 'n-1', state: 'consent-required' },
      { v: 1, type: 'tri-identity', nonce: 'n-2', state: 'consent-required' },
    ])
    expect(b.button.hidden).toBe(false)
    expect(b.fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(b.posts)).not.toContain('fake-game-1')
  })

  it('a script-made click is not consent', async () => {
    const b = boot({ storage: session() })
    b.ask('n-1')
    b.click(false)
    await flush()
    expect(b.fetch).not.toHaveBeenCalled()
    expect(b.values.get(CONSENT)).toBeUndefined()
    expect(b.posts.map(p => p.message.state)).toEqual(['consent-required'])
  })

  it('a click with no request waiting mints nothing', async () => {
    const b = boot({ storage: session() })
    b.click()
    await flush()
    expect(b.fetch).not.toHaveBeenCalled()
    expect(b.posts).toEqual([])
  })

  it('a real click mints once, answers the waiting request, and remembers the tab', async () => {
    const b = boot({ storage: session() })
    b.ask('n-1')
    b.ask('n-2')
    b.click()
    await flush()
    expect(b.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = b.fetch.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(url).toBe(MINT)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer fake-access-1',
    })
    expect(JSON.parse(String(init.body))).toEqual({ aud: GAME })
    expect(b.posts.at(-1)).toEqual({
      message: {
        v: 1,
        type: 'tri-identity',
        nonce: 'n-2',
        state: 'signed-in',
        ...SIGNED_IN,
      },
      target: GAME,
    })
    expect(b.button.hidden).toBe(true)
    expect(b.values.get(CONSENT)).toBe(GAME)

    // Asked again before expiry: a new token, no second click.
    b.ask('n-3')
    await flush()
    expect(b.fetch).toHaveBeenCalledTimes(2)
    expect(b.posts.at(-1)?.message).toMatchObject({
      nonce: 'n-3',
      state: 'signed-in',
    })
  })

  it('consent for another origin is not consent for this one', async () => {
    const b = boot({ storage: session({ [CONSENT]: 'https://evil.example' }) })
    b.ask('n-1')
    await flush()
    expect(b.fetch).not.toHaveBeenCalled()
    expect(b.posts.map(p => p.message.state)).toEqual(['consent-required'])
  })

  it('negative control: without the consent check the first request mints', async () => {
    const b = boot({
      source: mutate('read(CONSENT_KEY) !== GAME_ORIGIN', 'false'),
      storage: session(),
    })
    b.ask('n-1')
    await flush()
    expect(b.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(b.posts)).toContain('fake-game-1')
  })

  it('negative control: without isTrusted a script-made click mints', async () => {
    const b = boot({
      source: mutate('!event.isTrusted || ', ''),
      storage: session(),
    })
    b.ask('n-1')
    b.click(false)
    await flush()
    expect(b.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('what the bridge reads', () => {
  const ALLOWED_KEYS = new Set([ACCESS, EXPIRES, CONSENT])
  const ALLOWED_WINDOW = new Set([
    'document',
    'sessionStorage',
    'parent',
    'fetch',
    'addEventListener',
  ])

  async function everyPath(source?: string) {
    const b = boot({ source, storage: session() })
    b.ask('n-1')
    b.click()
    await flush()
    b.ask('n-2')
    await flush()
    b.values.delete(ACCESS)
    b.storageEvent(ACCESS)
    b.becomeVisible()
    b.ask('n-3')
    await flush()
    return b
  }

  it('only the access token, its expiry and the consent; writes only the consent', async () => {
    const b = await everyPath()
    expect(b.keysRead.length).toBeGreaterThan(0)
    expect(b.keysRead.filter(k => !ALLOWED_KEYS.has(k))).toEqual([])
    expect(b.keysWritten).toEqual([CONSENT])
  })

  it('on window: no localStorage, no Telegram, no cookies, no top or opener', async () => {
    const b = await everyPath()
    expect([...b.windowRead].filter(k => !ALLOWED_WINDOW.has(k))).toEqual([])
  })

  it('negative control: a bridge reading the refresh token is caught', async () => {
    const b = await everyPath(
      mutate(
        'var token = read(ACCESS_KEY)',
        'var token = read(ACCESS_KEY) || read("trinity.app.session.refresh")'
      )
    )
    expect(b.keysRead).toContain(REFRESH)
  })

  it('negative control: a bridge reading Telegram launch data or localStorage is caught', async () => {
    const b = await everyPath(
      mutate(
        "var ACCESS_KEY = 'trinity.app.session.access'",
        "var ACCESS_KEY = 'trinity.app.session.access'; window.sessionStorage.getItem('__telegram__initParams'); void window.localStorage"
      )
    )
    expect(b.keysRead).toContain('__telegram__initParams')
    expect(b.windowRead.has('localStorage')).toBe(true)
  })
})

describe('the game hears about sign-out without asking', () => {
  it('posts signed-out when the access token is removed in this tab', async () => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    b.ask('n-1')
    await flush()
    b.values.delete(ACCESS)
    b.storageEvent(ACCESS)
    expect(b.posts.at(-1)).toEqual({
      message: { v: 1, type: 'tri-identity', nonce: null, state: 'signed-out' },
      target: GAME,
    })
    // Said once, not on every later event.
    b.storageEvent(null)
    b.becomeVisible()
    expect(b.posts.map(p => p.message.state)).toEqual([
      'signed-in',
      'signed-out',
    ])
  })

  it('posts signed-out on return to the tab when the token went away meanwhile', async () => {
    const b = boot({ storage: session() })
    b.ask('n-1')
    b.values.clear()
    b.becomeVisible()
    expect(b.posts.map(p => p.message.state)).toEqual([
      'consent-required',
      'signed-out',
    ])
    expect(b.button.hidden).toBe(true)
  })

  it('control: an unrelated key changing, with the token still there, posts nothing', async () => {
    const b = boot({ storage: session({ [CONSENT]: GAME }) })
    b.ask('n-1')
    await flush()
    b.storageEvent('vibee-boot-retry')
    b.storageEvent(ACCESS)
    b.becomeVisible()
    expect(b.posts.map(p => p.message.state)).toEqual(['signed-in'])
  })

  it('control: before the game has asked, nothing is posted', () => {
    const b = boot()
    b.storageEvent(ACCESS)
    b.becomeVisible()
    expect(b.posts).toEqual([])
  })

  it('a token minted for a session that ended meanwhile is not delivered', async () => {
    let finish: (value: unknown) => void = () => {}
    const b = boot({
      storage: session({ [CONSENT]: GAME }),
      fetch: () => new Promise(resolve => (finish = resolve)),
    })
    b.ask('n-1')
    b.values.delete(ACCESS)
    finish(response(200, SIGNED_IN))
    await flush()
    expect(JSON.stringify(b.posts)).not.toContain('fake-game-1')
    expect(b.posts.at(-1)?.message).toMatchObject({ state: 'signed-out' })
  })

  it('negative control: without the storage listener nothing is posted', async () => {
    const b = boot({
      source: mutate("window.addEventListener('storage'", "void ('storage'"),
      storage: session({ [CONSENT]: GAME }),
    })
    b.ask('n-1')
    await flush()
    b.values.delete(ACCESS)
    b.storageEvent(ACCESS)
    expect(b.posts.map(p => p.message.state)).toEqual(['signed-in'])
  })
})

describe('server refusals reach the game as unavailable, with the code', () => {
  it.each([
    [403, { error: 'game_token_parent_not_web' }, 'game_token_parent_not_web'],
    [
      401,
      { error: 'game_token_credential_rejected' },
      'game_token_credential_rejected',
    ],
    [429, { error: 'game_token_rate_limited' }, 'game_token_rate_limited'],
    [502, undefined, 'http_502'],
    [200, { game_token: 'fake-game-1' }, 'bad_response'],
  ])('HTTP %i %j -> %s', async (status, body, code) => {
    const b = boot({
      storage: session({ [CONSENT]: GAME }),
      fetch: async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          if (body === undefined) throw new SyntaxError('not json')
          return body
        },
      }),
    })
    b.ask('n-1')
    await flush()
    expect(b.posts).toEqual([
      {
        message: {
          v: 1,
          type: 'tri-identity',
          nonce: 'n-1',
          state: 'unavailable',
          code,
        },
        target: GAME,
      },
    ])
  })

  it('a network failure is unavailable: network', async () => {
    const b = boot({
      storage: session({ [CONSENT]: GAME }),
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    b.ask('n-1')
    await flush()
    expect(b.posts.map(p => p.message)).toEqual([
      {
        v: 1,
        type: 'tri-identity',
        nonce: 'n-1',
        state: 'unavailable',
        code: 'network',
      },
    ])
  })
})
