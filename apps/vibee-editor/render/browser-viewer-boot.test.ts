import { describe, it, expect } from 'vitest'
import {
  BOOT_FAST_WATCH_MS,
  BOOT_GIVE_UP_MS,
  BOOT_SAID_EN,
  BOOT_SCRIPT,
  LANG_SCRIPT,
  RU_EXPR,
  VIEWER_LANG_KEY,
  WATCH_KEY_PREFIX,
  WATCH_SAID,
  injectSkin,
} from './src/browser/skin'
import {
  authorizeLive,
  loginUrlFor,
  parseLive,
  viewerLangOf,
} from './src/browser/live-proxy'
import type { Queryable } from './src/browser/sessions'

/**
 * THE VIEWER THAT SAT ON "STARTING YOUR BROWSER" (owner, 2026-10-06, iPhone
 * in Telegram): a dimmed picture under a ring, live video never started, and
 * the loader in English under a Russian app.
 *
 * The boot script runs against a hand-made page -- no DOM library in this
 * package -- with timers recorded by delay, so "after 8 s" is a fact the test
 * can fire rather than wait for.
 */

const ID = 'sessAbCd1234'

interface Video {
  attrs: Record<string, string>
  paused: boolean
  readyState: number
  muted: boolean
  defaultMuted: boolean
  playsInline: boolean
  plays: number
  on: Record<string, () => void>
  setAttribute(k: string, v: string): void
  addEventListener(k: string, f: () => void): void
  play(): Promise<void>
}

function video(): Video {
  const v: Video = {
    attrs: {},
    paused: true,
    readyState: 0,
    muted: false,
    defaultMuted: false,
    playsInline: false,
    plays: 0,
    on: {},
    setAttribute(k, val) {
      v.attrs[k] = val
    },
    addEventListener(k, f) {
      v.on[k] = f
    },
    play() {
      v.plays++
      return Promise.resolve()
    },
  }
  return v
}

function page(
  opts: {
    search?: string
    language?: string
    store?: Map<string, string>
    lang?: string
  } = {}
) {
  const store = opts.store ?? new Map<string, string>()
  const sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  const sockets: Array<{ onmessage?: (e: unknown) => void; close(): void }> = []
  class WebSocket {
    binaryType = ''
    onmessage?: (e: unknown) => void
    onclose?: () => void
    constructor() {
      sockets.push(this)
    }
    close() {}
  }
  const poster = { style: { visibility: '' }, src: '', onload: null as unknown }
  const said = { textContent: '' }
  const hint = { textContent: '' }
  const bootAttrs: Record<string, string> = {}
  const boot = {
    querySelector: (s: string) =>
      s === 'img.poster' ? poster : s === '.said' ? said : hint,
    setAttribute(k: string, v: string) {
      bootAttrs[k] = v
    },
    parentNode: null,
  }
  const rootAttrs: Record<string, string> = {}
  if (opts.lang) rootAttrs['data-t27-lang'] = opts.lang
  let current: Video | null = null
  const listeners: Record<string, Array<() => void>> = {}
  const document = {
    getElementById: () => boot,
    querySelector: (s: string) => (s === 'video' ? current : null),
    documentElement: {
      getAttribute: (k: string) => rootAttrs[k] ?? null,
      setAttribute: (k: string, v: string) => void (rootAttrs[k] = v),
    },
    addEventListener: (k: string, f: () => void) => {
      ;(listeners[k] ??= []).push(f)
    },
    removeEventListener: (k: string, f: () => void) => {
      listeners[k] = (listeners[k] ?? []).filter(g => g !== f)
    },
  }
  let mutated: (() => void) | null = null
  class MutationObserver {
    constructor(f: () => void) {
      mutated = f
    }
    observe() {}
  }
  const timers: Array<{ ms: number; fn: () => void }> = []
  const window: Record<string, unknown> = {
    devicePixelRatio: 1,
    WebSocket,
    URL: { createObjectURL: () => 'blob:1' },
  }
  new Function(
    'document',
    'navigator',
    'setTimeout',
    'MutationObserver',
    'location',
    'window',
    'WebSocket',
    'URL',
    'innerWidth',
    'innerHeight',
    'sessionStorage',
    BOOT_SCRIPT
  )(
    document,
    { language: opts.language ?? 'en' },
    (fn: () => void, ms: number) => timers.push({ fn, ms }),
    MutationObserver,
    {
      pathname: `/live/${ID}/`,
      protocol: 'https:',
      host: 'app.t27.ai',
      search: opts.search ?? '',
    },
    window,
    WebSocket,
    { createObjectURL: () => 'blob:1', revokeObjectURL() {} },
    390,
    700,
    sessionStorage
  )
  return {
    store,
    said,
    hint,
    bootAttrs,
    listeners,
    frame: () => sockets[sockets.length - 1]?.onmessage?.({ data: {} }),
    after: (ms: number) => timers.filter(t => t.ms === ms).forEach(t => t.fn()),
    addVideo: (v: Video) => {
      current = v
      mutated?.()
    },
    fire: (k: string) => (listeners[k] ?? []).forEach(f => f()),
  }
}

describe('the video plays inline on a phone', () => {
  it('SETS playsinline, webkit-playsinline AND muted the moment the video appears', () => {
    const p = page()
    const v = video()
    p.addVideo(v)
    expect(v.attrs).toHaveProperty('playsinline')
    expect(v.attrs).toHaveProperty('webkit-playsinline')
    expect(v.attrs).toHaveProperty('muted')
    expect(v.playsInline).toBe(true)
    expect(v.muted).toBe(true)
  })

  it('keeps sound only when the address asks for it', () => {
    const p = page({ search: '?usr=you&sound=1' })
    const v = video()
    p.addVideo(v)
    expect(v.attrs).toHaveProperty('playsinline')
    expect(v.attrs).not.toHaveProperty('muted')
    expect(v.muted).toBe(false)
  })

  it('PLAYS A PAUSED VIDEO ON THE FIRST TOUCH, and stops asking once it plays', () => {
    const p = page()
    const v = video()
    p.addVideo(v)
    p.fire('touchend')
    expect(v.plays).toBe(1)
    v.paused = false
    v.on.playing?.()
    p.fire('click')
    expect(v.plays).toBe(1)
    expect(p.bootAttrs['data-done']).toBe('1')
  })

  it('does not stack listeners on every mutation', () => {
    const p = page()
    const v = video()
    p.addVideo(v)
    const first = v.on.playing
    p.addVideo(v)
    expect(v.on.playing).toBe(first)
  })
})

describe('pictures sooner when the video is late', () => {
  it('the fast fallback is well under the give-up', () => {
    expect(BOOT_FAST_WATCH_MS).toBe(8_000)
    expect(BOOT_GIVE_UP_MS).toBe(45_000)
    expect(BOOT_FAST_WATCH_MS).toBeLessThan(BOOT_GIVE_UP_MS)
  })

  it('GOES TO WATCH MODE AT 8 S when frames arrive and the video does not', () => {
    const p = page()
    p.frame()
    p.after(BOOT_FAST_WATCH_MS)
    expect(p.bootAttrs['data-watch']).toBe('1')
    expect(p.bootAttrs['data-done']).toBeUndefined()
  })

  it('keeps the loader at 8 s when no frame has come, and still leaves at 45 s', () => {
    const p = page()
    p.after(BOOT_FAST_WATCH_MS)
    expect(p.bootAttrs['data-watch']).toBeUndefined()
    expect(p.bootAttrs['data-done']).toBeUndefined()
    p.after(BOOT_GIVE_UP_MS)
    expect(p.bootAttrs['data-done']).toBe('1')
  })

  it('a first frame AFTER 8 s goes straight to watch mode', () => {
    const p = page()
    p.after(BOOT_FAST_WATCH_MS)
    p.frame()
    expect(p.bootAttrs['data-watch']).toBe('1')
  })

  it('A RELOAD AFTER WATCH MODE DOES NOT START A FRESH LONG LOADER', () => {
    const first = page()
    first.frame()
    first.after(BOOT_FAST_WATCH_MS)
    expect(first.store.get(WATCH_KEY_PREFIX + ID)).toBe('1')
    /* The reconnect script reloads: same tab, same session storage. */
    const again = page({ store: first.store })
    again.frame()
    expect(again.bootAttrs['data-watch']).toBe('1')
  })

  it('a video that plays clears the memory, so the next visit starts plain', () => {
    const p = page()
    p.frame()
    p.after(BOOT_FAST_WATCH_MS)
    const v = video()
    p.addVideo(v)
    v.paused = false
    v.on.playing?.()
    expect(p.bootAttrs['data-done']).toBe('1')
    expect(p.store.has(WATCH_KEY_PREFIX + ID)).toBe(false)
  })

  it('without the memory a frame alone does not skip the loader', () => {
    const p = page()
    p.frame()
    expect(p.bootAttrs['data-watch']).toBeUndefined()
  })
})

describe('one language on one screen', () => {
  function lang(search: string, store = new Map<string, string>()) {
    const attrs: Record<string, string> = {}
    new Function('location', 'sessionStorage', 'document', LANG_SCRIPT)(
      { search },
      {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      {
        documentElement: {
          setAttribute: (k: string, v: string) => void (attrs[k] = v),
        },
      }
    )
    return { attrs, store }
  }

  it('reads the app language off the address and keeps it for the tab', () => {
    const r = lang('?usr=you&pwd=x&lang=ru')
    expect(r.attrs['data-t27-lang']).toBe('ru')
    expect(r.store.get(VIEWER_LANG_KEY)).toBe('ru')
    /* neko strips the address; the reload lands bare and still knows. */
    expect(lang('?usr=you&pwd=x', r.store).attrs['data-t27-lang']).toBe('ru')
  })

  it('ignores a language it has no words for', () => {
    expect(lang('?lang=de').attrs['data-t27-lang']).toBeUndefined()
  })

  it('THE LOADER PREFERS THE APP LANGUAGE over the phone', () => {
    const p = page({ language: 'en-US', lang: 'ru' })
    expect(p.said.textContent).toBe('')
    p.frame()
    p.after(BOOT_FAST_WATCH_MS)
    expect(p.said.textContent).toBe(WATCH_SAID)
  })

  it('and falls back to the phone when the app did not say', () => {
    const p = page({ language: 'en-US' })
    expect(p.said.textContent).toBe(BOOT_SAID_EN)
  })

  it('every script of the window asks the same question', () => {
    expect(BOOT_SCRIPT).toContain(RU_EXPR)
    expect(BOOT_SCRIPT).not.toContain('__RU__')
    const html = injectSkin('<html><head></head><body></body></html>')
    expect(html).not.toContain('__RU__')
    /* First in the head, before anything that speaks. */
    expect(html.indexOf('data-t27-lang')).toBeLessThan(
      html.indexOf('data-t27-connect')
    )
  })
})

describe('the language survives the login redirect', () => {
  const SESSION = {
    telegram_id: 'tg-900000001',
    session_id: 'sess-abcdefgh',
    pod_id: 'browser-sess-abcdefgh',
    endpoint: '127.0.0.1:55000',
    cdp_endpoint: '127.0.0.1:55001',
    state: 'live',
    view_token: 'view-token-aaaaaaaaaaaa', // secret-guard-ok: fixture, twelve letter a
    admin_token: 'admin-token-bbbbbbbbbbb', // secret-guard-ok: fixture, letter b
  }
  const pool: Queryable = {
    async query(sql, params = []) {
      if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
      return { rows: String(params[0]) === SESSION.session_id ? [SESSION] : [] }
    },
  }

  it('carries lang=ru from the app address to the login address', async () => {
    const d = await authorizeLive(
      pool,
      parseLive(`/live/sess-abcdefgh?t=${SESSION.view_token}&lang=ru`)!,
      { secure: false }
    )
    if (d.kind !== 'redirect') throw new Error('expected a redirect')
    expect(d.location).toBe(loginUrlFor('sess-abcdefgh', 'ru'))
    expect(d.location).toContain('&lang=ru')
    expect(d.location).toContain('pwd=')
  })

  it('drops anything that is not ru or en', () => {
    expect(viewerLangOf('de')).toBeNull()
    expect(parseLive('/live/sess-abcdefgh/?lang=%3Cx%3E')?.lang).toBeUndefined()
    expect(loginUrlFor('sess-abcdefgh')).not.toContain('lang=')
  })
})
