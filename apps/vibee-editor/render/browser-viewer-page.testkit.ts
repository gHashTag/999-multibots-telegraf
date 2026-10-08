import { BOOT_SCRIPT, LANG_SCRIPT } from './src/browser/skin'

/**
 * A hand-made viewer page for the scripts skin.ts injects -- no DOM library in
 * this package -- shared by browser-viewer-boot.test.ts and the spec binding
 * test src/spec/browser-viewer-boot.test.ts. Timers are recorded by delay, so
 * "after 8 s" is a fact a test can fire rather than wait for.
 */

export const ID = 'sessAbCd1234'

export interface Video {
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

export function video(): Video {
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

export function page(
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

/* Runs LANG_SCRIPT against an address and a tab store. */
export function lang(search: string, store = new Map<string, string>()) {
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
