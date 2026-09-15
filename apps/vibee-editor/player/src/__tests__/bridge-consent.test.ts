import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE CONSENT POPUP THE BRIDGE OPENS (public/bridge/consent.js).
 *
 * Run against a fake `window` like bridge-page.test.ts. The popup is the one
 * place a click means consent, because it is a top-level window no framer can
 * hide or cover. Each guard has a negative control on a mutated copy; mutate()
 * fails if its target is not in the script exactly once.
 */

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../public/bridge/consent.js'),
  'utf8'
)

const APP = 'https://app.t27.ai'
const CONSENT = { v: 1, type: 'tri-consent' }

function mutate(from: string, to: string): string {
  const parts = SOURCE.split(from)
  if (parts.length !== 2) {
    throw new Error(`mutant target occurs ${parts.length - 1} times: ${from}`)
  }
  return parts.join(to)
}

type Listener = (event: Record<string, unknown>) => void

interface BootOptions {
  source?: string
  framed?: boolean
  opener?: boolean
  focused?: boolean
  visibility?: string
  /** The popup's query string: the bridge forwards ?lang=. */
  search?: string
}

function boot(options: BootOptions = {}) {
  const posts: { message: unknown; target: string }[] = []
  const opener =
    options.opener === false
      ? null
      : {
          postMessage(message: unknown, target: string) {
            posts.push({ message, target })
          },
        }
  const listeners: Record<string, Listener[]> = {}
  const documentListeners: Record<string, Listener[]> = {}
  const clicks: Listener[] = []
  const declineClicks: Listener[] = []
  const element = (onClick?: Listener[]) => ({
    hidden: true,
    textContent: '',
    addEventListener: (_type: string, fn: Listener) => onClick?.push(fn),
  })
  const button = element(clicks)
  const decline = element(declineClicks)
  // consent.html: what is shared, Continue, Not now, how long it lasts.
  const elements: Record<string, ReturnType<typeof element>> = {
    'tri-consent': button,
    'tri-decline': decline,
    'tri-consent-asks': element(),
    'tri-consent-note': element(),
  }
  const state = {
    focused: options.focused ?? true,
    visibility: options.visibility ?? 'visible',
  }
  const document = {
    get visibilityState() {
      return state.visibility
    },
    hasFocus: () => state.focused,
    documentElement: { lang: 'en' },
    title: '',
    getElementById: (id: string) => elements[id] ?? null,
    addEventListener: (type: string, fn: Listener) =>
      (documentListeners[type] ||= []).push(fn),
  }
  const close = vi.fn()
  const target: Record<string, unknown> = {
    document,
    location: { search: options.search ?? '' },
    opener,
    close,
    addEventListener: (type: string, fn: Listener) =>
      (listeners[type] ||= []).push(fn),
  }
  target.self = target
  target.top = options.framed ? {} : target
  const windowRead = new Set<string>()
  const win = new Proxy(target, {
    get(t, prop) {
      windowRead.add(String(prop))
      return t[prop as string]
    },
  })
  // self/top compare the proxy, as a real window compares its WindowProxy.
  target.self = win
  if (!options.framed) target.top = win

  new Function('window', options.source ?? SOURCE)(win)

  return {
    posts,
    button,
    decline,
    elements,
    document,
    close,
    windowRead,
    click(isTrusted = true) {
      for (const fn of clicks) fn({ isTrusted })
    },
    notNow(isTrusted = true) {
      for (const fn of declineClicks) fn({ isTrusted })
    },
    focus() {
      state.focused = true
      for (const fn of listeners.focus ?? []) fn({})
    },
    blur() {
      state.focused = false
      for (const fn of listeners.blur ?? []) fn({})
    },
    visibility(value: string) {
      state.visibility = value
      for (const fn of documentListeners.visibilitychange ?? []) fn({})
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

describe('the consent popup', () => {
  it('a trusted click after 500 ms visible and focused tells its opener, on app.t27.ai only, and closes', () => {
    const p = boot()
    expect(p.button.hidden).toBe(false)
    later(500)
    p.click()
    expect(p.posts).toEqual([{ message: CONSENT, target: APP }])
    expect(p.close).toHaveBeenCalledTimes(1)
    expect(p.button.hidden).toBe(true)
  })

  it('a click as the window appears (the second half of a double-click) is not consent', () => {
    const p = boot()
    later(499)
    p.click()
    expect(p.posts).toEqual([])
    expect(p.close).not.toHaveBeenCalled()
  })

  it('a script-made click is not consent', () => {
    const p = boot()
    later(1000)
    p.click(false)
    expect(p.posts).toEqual([])
  })

  it('framed, it shows nothing and sends nothing', () => {
    const p = boot({ framed: true })
    later(1000)
    p.click()
    expect(p.button.hidden).toBe(true)
    expect(p.posts).toEqual([])
  })

  it('with no opener, it shows nothing', () => {
    const p = boot({ opener: false })
    later(1000)
    p.click()
    expect(p.button.hidden).toBe(true)
    expect(p.close).not.toHaveBeenCalled()
  })

  it('not focused at load: no click counts until 500 ms after focus', () => {
    const p = boot({ focused: false })
    later(5000)
    p.click()
    expect(p.posts).toEqual([])
    p.focus()
    later(499)
    p.click()
    expect(p.posts).toEqual([])
    later(1)
    p.click()
    expect(p.posts).toHaveLength(1)
  })

  it('losing focus or visibility starts the wait again', () => {
    const p = boot()
    later(1000)
    p.blur()
    p.click()
    p.focus()
    p.click()
    later(1000)
    p.visibility('hidden')
    p.click()
    p.visibility('visible')
    p.click()
    expect(p.posts).toEqual([])
    later(500)
    p.click()
    expect(p.posts).toHaveLength(1)
  })

  it('on window it reads no storage, cookies or parent', () => {
    const p = boot()
    later(500)
    p.click()
    expect(
      [...p.windowRead].filter(
        k =>
          ![
            'document',
            // ?lang= only, forwarded by the bridge.
            'location',
            'opener',
            'top',
            'self',
            'addEventListener',
            'close',
          ].includes(k)
      )
    ).toEqual([])
  })

  it('negative control: without the wait an early click is consent', () => {
    const p = boot({
      source: mutate(
        '!event.isTrusted || Date.now() < armedAt',
        '!event.isTrusted'
      ),
    })
    p.click()
    expect(p.posts).toHaveLength(1)
  })

  it('negative control: without the frame check a framed copy sends consent', () => {
    const p = boot({
      source: mutate('window.top !== window.self || ', ''),
      framed: true,
    })
    later(500)
    p.click()
    expect(p.posts).toHaveLength(1)
  })

  it('negative control: without isTrusted a script click is consent', () => {
    const p = boot({
      source: mutate(
        '!event.isTrusted || Date.now() < armedAt',
        'Date.now() < armedAt'
      ),
    })
    later(500)
    p.click(false)
    expect(p.posts).toHaveLength(1)
  })

  it("negative control: targetOrigin '*' is caught", () => {
    const p = boot({
      source: mutate(
        "opener.postMessage({ v: 1, type: 'tri-consent' }, APP_ORIGIN)",
        "opener.postMessage({ v: 1, type: 'tri-consent' }, '*')"
      ),
    })
    later(500)
    p.click()
    expect(p.posts).not.toEqual([{ message: CONSENT, target: APP }])
  })

  it('negative control: without the blur reset a click after losing focus is consent', () => {
    const p = boot({
      source: mutate(
        "  window.addEventListener('blur', function () {\n    armedAt = Infinity\n  })\n",
        ''
      ),
    })
    later(1000)
    p.blur()
    p.click()
    expect(p.posts).toHaveLength(1)
  })
})

const CYRILLIC = /\p{Script=Cyrillic}/u

describe('Not now, and the language the game plays in', () => {
  const DECLINED = { v: 1, type: 'tri-consent-declined' }

  it('English by default: what is shared, for how long, Continue and Not now', () => {
    const p = boot()
    expect(p.document.documentElement.lang).toBe('en')
    expect(p.document.title).toBe('TRI: continue on t27.ai?')
    expect(p.elements['tri-consent-asks'].textContent).toBe(
      'asks who you are on TRI: your Telegram id, name and picture.'
    )
    expect(p.elements['tri-consent-note'].textContent).toBe(
      'This lasts for this tab only. Sign out in TRI to withdraw it.'
    )
    expect(p.button.textContent).toBe('Continue with TRI')
    expect(p.decline.textContent).toBe('Not now')
  })

  it('?lang=ru: Russian copy and lang=ru', () => {
    const p = boot({ search: '?lang=ru' })
    expect(p.document.documentElement.lang).toBe('ru')
    for (const text of [
      p.document.title,
      p.elements['tri-consent-asks'].textContent,
      p.elements['tri-consent-note'].textContent,
      p.button.textContent,
      p.decline.textContent,
    ]) {
      expect(text).toMatch(CYRILLIC)
    }
  })

  it('Not now tells the opener, on app.t27.ai only, and closes, with no wait', () => {
    const p = boot()
    expect(p.decline.hidden).toBe(false)
    p.notNow()
    expect(p.posts).toEqual([{ message: DECLINED, target: APP }])
    expect(p.close).toHaveBeenCalledTimes(1)
    expect(p.button.hidden).toBe(true)
    expect(p.decline.hidden).toBe(true)
  })

  it('framed, or without an opener, Not now is hidden and sends nothing', () => {
    for (const p of [boot({ framed: true }), boot({ opener: false })]) {
      expect(p.decline.hidden).toBe(true)
      p.notNow()
      expect(p.posts).toEqual([])
      expect(p.close).not.toHaveBeenCalled()
    }
  })

  it('control: Continue still waits 500 ms next to Not now', () => {
    const p = boot()
    later(499)
    p.click()
    expect(p.posts).toEqual([])
    later(1)
    p.click()
    expect(p.posts).toEqual([{ message: CONSENT, target: APP }])
  })

  it("negative control: a decline posted to '*' is caught", () => {
    const p = boot({
      source: mutate(
        "opener.postMessage({ v: 1, type: 'tri-consent-declined' }, APP_ORIGIN)",
        "opener.postMessage({ v: 1, type: 'tri-consent-declined' }, '*')"
      ),
    })
    p.notNow()
    expect(p.posts).toEqual([{ message: DECLINED, target: '*' }])
  })
})
