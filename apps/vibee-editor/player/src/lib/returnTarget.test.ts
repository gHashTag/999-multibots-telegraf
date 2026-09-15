import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QUEEN_VIEWS,
  TRI_SCREEN_IDS,
  captureReturnTarget,
  hasReturnTarget,
  returnTargetOf,
  returnWhenSignedIn,
  takeReturnTarget,
} from './returnTarget'

/**
 * THE WAY BACK TO THE GAME AFTER SIGNING IN.
 *
 * The game's sign-in chip links to https://app.t27.ai/?return=<Queen view>.
 * Only the exact addresses the game can produce are accepted, and the URL
 * followed is rebuilt from constants, never the input: anything else would be
 * an open redirect on the app's origin.
 */

const QUEEN = 'https://t27.ai/#/queen'

function memoryStore() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

let counter = 0
function fakeWindow(search: string, hash = '', pathname = '/') {
  const replaced: string[] = []
  return {
    replaced,
    location: { search, hash, pathname },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) =>
        void replaced.push(url),
    },
    crypto: {
      getRandomValues: <T extends ArrayBufferView>(bytes: T): T => {
        const view = bytes as unknown as Uint8Array
        counter += 1
        for (let i = 0; i < view.length; i++) view[i] = (counter * 31 + i) % 256
        return bytes
      },
    },
  }
}

afterEach(() => {
  // Module state: one pending return per document.
  takeReturnTarget(memoryStore())
})

describe('returnTargetOf accepts only the Queen and its known views', () => {
  it.each([
    QUEEN,
    `${QUEEN}?tab=tri`,
    `${QUEEN}?tab=specs`,
    `${QUEEN}?tab=tri&screen=crm`,
    `${QUEEN}?tab=tri&screen=feed`,
  ])('%s', url => {
    expect(returnTargetOf(url)).toBe(url)
  })

  it('every copied Queen view and every TRI screen', () => {
    for (const view of QUEEN_VIEWS) {
      expect(returnTargetOf(`${QUEEN}?tab=${view}`)).toBe(
        `${QUEEN}?tab=${view}`
      )
    }
    for (const screen of TRI_SCREEN_IDS) {
      expect(returnTargetOf(`${QUEEN}?tab=tri&screen=${screen}`)).toBe(
        `${QUEEN}?tab=tri&screen=${screen}`
      )
    }
  })

  it.each([
    'https://evil.example',
    'https://evil.example/#/queen',
    '//evil.example',
    '//evil.example/#/queen',
    '/\\evil.example',
    'javascript:alert(1)',
    'JavaScript:alert(1)//https://t27.ai/#/queen',
    'data:text/html,<script>alert(1)</script>',
    'https://t27.ai.evil.example',
    'https://t27.ai.evil.example/#/queen',
    'https://t27.ai@evil.example/#/queen',
    'https://user@t27.ai/#/queen',
    'https://t27.ai/leela/',
    'https://t27.ai/leela/#/queen',
    'https://t27.ai/',
    'https://t27.ai/#/queen/',
    'https://t27.ai/#/clients',
    `${QUEEN}?tab=nope`,
    `${QUEEN}?tab=TRI`,
    `${QUEEN}?tab=`,
    `${QUEEN}?embed=1`,
    `${QUEEN}?tab=tri&embed=1`,
    `${QUEEN}?tab=tri&screen=crm&embed=1`,
    `${QUEEN}?tab=tri&path=/crm/123`,
    `${QUEEN}?tab=tri&screen=profile&path=%2Falice`,
    `${QUEEN}?tab=tri&screen=nope`,
    `${QUEEN}?tab=specs&screen=crm`,
    `${QUEEN}?screen=crm`,
    `${QUEEN}?tab=tri&tab=comb`,
    `${QUEEN}#x`,
    `${QUEEN}\n`,
    ` ${QUEEN}`,
    'http://t27.ai/#/queen',
    'HTTPS://T27.AI/#/queen',
    'https://t27.ai:443/#/queen',
    'https://t27.ai/?lang=en#/queen',
    'https://app.t27.ai/feed',
    `${QUEEN}?tab=tri&screen=crm`.padEnd(300, 'x'),
    '',
  ])('refuses %j', value => {
    expect(returnTargetOf(value)).toBeNull()
  })

  it.each([null, undefined, 42, {}, [QUEEN]])(
    'refuses non-string %j',
    value => {
      expect(returnTargetOf(value)).toBeNull()
    }
  )
})

describe('captureReturnTarget', () => {
  const encoded = encodeURIComponent(`${QUEEN}?tab=tri`)

  it('keeps a valid target for this tab under a random key and strips it from the address', () => {
    const store = memoryStore()
    const win = fakeWindow(`?return=${encoded}&lang=ru`, '#top', '/feed')
    captureReturnTarget(win, store, true)
    expect(hasReturnTarget()).toBe(true)
    const keys = [...store.values.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^trinity\.return\.[0-9a-f]{32}$/)
    expect(store.values.get(keys[0])).toBe(`${QUEEN}?tab=tri`)
    expect(win.replaced).toEqual(['/feed?lang=ru#top'])

    expect(takeReturnTarget(store)).toBe(`${QUEEN}?tab=tri`)
    expect(store.values.size).toBe(0)
    expect(hasReturnTarget()).toBe(false)
    expect(takeReturnTarget(store)).toBeNull()
  })

  it('two captures use two different keys', () => {
    const store = memoryStore()
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const first = [...store.values.keys()][0]
    takeReturnTarget(memoryStore())
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const second = [...store.values.keys()].find(k => k !== first)
    expect(second).toMatch(/^trinity\.return\.[0-9a-f]{32}$/)
  })

  it('a hostile target is stripped from the address and never stored', () => {
    const store = memoryStore()
    const win = fakeWindow(
      `?return=${encodeURIComponent('https://evil.example/')}`
    )
    captureReturnTarget(win, store, true)
    expect(hasReturnTarget()).toBe(false)
    expect(store.values.size).toBe(0)
    expect(win.replaced).toEqual(['/'])
  })

  it('embed, Telegram or a frame: the address and storage are left alone', () => {
    const store = memoryStore()
    const win = fakeWindow(`?return=${encoded}`)
    captureReturnTarget(win, store, false)
    expect(hasReturnTarget()).toBe(false)
    expect(store.values.size).toBe(0)
    expect(win.replaced).toEqual([])
  })

  it('no return parameter: nothing happens', () => {
    const store = memoryStore()
    const win = fakeWindow('?lang=ru')
    captureReturnTarget(win, store, true)
    expect(hasReturnTarget()).toBe(false)
    expect(win.replaced).toEqual([])
  })

  it('a stored value changed by another document is checked again when taken', () => {
    const store = memoryStore()
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const key = [...store.values.keys()][0]
    store.values.set(key, 'https://evil.example/')
    expect(takeReturnTarget(store)).toBeNull()
  })
})

describe('returnWhenSignedIn', () => {
  const encoded = encodeURIComponent(`${QUEEN}?tab=tri&screen=crm`)

  function deps(
    store: ReturnType<typeof memoryStore>,
    live: boolean,
    refresh: () => Promise<unknown>
  ) {
    return { store, live: () => live, refresh: vi.fn(refresh), assign: vi.fn() }
  }

  it('already signed in on arrival: goes back at once, no refresh', async () => {
    const store = memoryStore()
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const d = deps(store, true, async () => ({}))
    await expect(returnWhenSignedIn(d)).resolves.toBe('returned')
    expect(d.assign).toHaveBeenCalledTimes(1)
    expect(d.assign).toHaveBeenCalledWith(`${QUEEN}?tab=tri&screen=crm`)
    expect(d.refresh).not.toHaveBeenCalled()
    expect(hasReturnTarget()).toBe(false)
  })

  it('an expired access token that refreshes silently goes back', async () => {
    const store = memoryStore()
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const d = deps(store, false, async () => ({}))
    await expect(returnWhenSignedIn(d)).resolves.toBe('returned')
    expect(d.refresh).toHaveBeenCalledTimes(1)
    expect(d.assign).toHaveBeenCalledWith(`${QUEEN}?tab=tri&screen=crm`)
  })

  it('no session: asks for sign-in and keeps the target for after it', async () => {
    const store = memoryStore()
    captureReturnTarget(fakeWindow(`?return=${encoded}`), store, true)
    const d = deps(store, false, async () => {
      throw new Error('browser session is not available')
    })
    await expect(returnWhenSignedIn(d)).resolves.toBe('sign-in')
    expect(d.assign).not.toHaveBeenCalled()
    expect(hasReturnTarget()).toBe(true)
    expect(takeReturnTarget(store)).toBe(`${QUEEN}?tab=tri&screen=crm`)
  })

  it('nothing pending: does nothing', async () => {
    const d = deps(memoryStore(), true, async () => ({}))
    await expect(returnWhenSignedIn(d)).resolves.toBe('none')
    expect(d.assign).not.toHaveBeenCalled()
    expect(d.refresh).not.toHaveBeenCalled()
  })
})
