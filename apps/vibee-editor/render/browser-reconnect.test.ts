import { describe, it, expect } from 'vitest'
import {
  BRAND_CSS,
  BRAND_NAME,
  BOOT_SCRIPT,
  BOOT_SAID,
  BOOT_SAID_EN,
  BOOT_HINT_EN,
  CONNECT_SCRIPT,
  LOGO_URL,
  LOST_WORDS,
  RECONNECT_PAUSE_MS,
  RECONNECT_SETTLE_MS,
  RECONNECT_TRIES,
  WINDOW_EVENT,
  injectSkin,
} from './src/browser/skin'
import { LOGIN_PLACEHOLDER, loginUrlFor } from './src/browser/live-proxy'

/**
 * THE CARD THAT ASKED FOR A PASSWORD NOBODY HAS.
 *
 * neko falls back to a name-and-password form when its first connection
 * fails. The password is a generated token the person never sees, so the
 * form was a dead end. These tests run the window's connect script against
 * a small stand-in for the page -- no DOM library in this package -- and
 * check what it does, not what it contains.
 */

const ID = 'sessAbCd1234'

interface Node {
  attrs: Record<string, string>
  setAttribute(k: string, v: string): void
  querySelector(sel: string): Node | null
  closest(sel: string): Node | null
}

function world(
  opts: { language?: string; storage?: 'ok' | 'broken'; framed?: boolean } = {}
) {
  const posts: Array<{ msg: any; origin: string }> = []
  const shown = new Set<string>()
  const nodes: Record<string, Node> = {}
  const node = (name: string): Node => {
    if (nodes[name]) return nodes[name]
    const n: Node = {
      attrs: {},
      setAttribute(k, v) {
        n.attrs[k] = v
      },
      querySelector(sel) {
        const inner = `${name} ${sel}`
        return shown.has(inner) ? node(inner) : null
      },
      closest(sel) {
        if (sel === '.connect .message')
          return name.startsWith('.connect .message') ? node(sel) : null
        if (sel === 'button') return name.endsWith('button') ? n : null
        return null
      },
    }
    nodes[name] = n
    return n
  }

  const timers: { at: number; fn: () => void; id: number }[] = []
  let now = 0
  let nextId = 1
  const listeners: Record<string, (e: unknown) => void> = {}
  let observer: (() => void) | null = null
  const store = new Map<string, string>()
  const went: string[] = []

  const document = {
    querySelector: (sel: string) => (shown.has(sel) ? node(sel) : null),
    getElementById: (id: string) =>
      shown.has(`#${id}`) ? node(`#${id}`) : null,
    documentElement: {},
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn
    },
  }
  const sessionStorage =
    opts.storage === 'broken'
      ? {
          getItem: () => {
            throw new Error('denied')
          },
          setItem: () => {
            throw new Error('denied')
          },
          removeItem: () => {
            throw new Error('denied')
          },
        }
      : {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
          removeItem: (k: string) => void store.delete(k),
        }
  const setTimeout = (fn: () => void, ms: number) => {
    const id = nextId++
    timers.push({ at: now + ms, fn, id })
    return id
  }
  const clearTimeout = (id: number) => {
    const i = timers.findIndex(t => t.id === id)
    if (i !== -1) timers.splice(i, 1)
  }
  class MutationObserver {
    constructor(fn: () => void) {
      observer = fn
    }
    observe() {}
  }

  function run(path = `/live/${ID}/`) {
    const location = {
      pathname: path,
      origin: 'https://app.t27.ai',
      replace: (url: string) => void went.push(url),
    }
    const self: any = {}
    self.parent = opts.framed
      ? {
          postMessage: (msg: any, origin: string) =>
            void posts.push({ msg, origin }),
        }
      : self
    const navigator = { language: opts.language ?? 'en-US' }
    new Function(
      'document',
      'location',
      'navigator',
      'sessionStorage',
      'setTimeout',
      'clearTimeout',
      'MutationObserver',
      'window',
      CONNECT_SCRIPT
    )(
      document,
      location,
      navigator,
      sessionStorage,
      setTimeout,
      clearTimeout,
      MutationObserver,
      self
    )
  }

  function advance(ms: number) {
    const until = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > until) break
      timers.shift()
      now = next.at
      next.fn()
    }
    now = until
  }

  /** neko is not connected and shows the form with its three controls. */
  function showForm() {
    for (const sel of [
      '.connect',
      '.connect .window',
      '.connect .message',
      '.connect .message span',
      '.connect .message button',
    ])
      shown.add(sel)
    observer?.()
  }
  function hideForm() {
    shown.delete('.connect .message')
    observer?.()
  }
  /** neko is connected: the whole card goes. */
  function connected() {
    for (const sel of [...shown])
      if (sel.startsWith('.connect')) shown.delete(sel)
    observer?.()
  }

  function fire(type: string, targetName: string) {
    let stopped = false
    let prevented = false
    listeners[type]?.({
      type,
      target: node(targetName),
      preventDefault: () => {
        prevented = true
      },
      stopImmediatePropagation: () => {
        stopped = true
      },
    })
    return { stopped, prevented }
  }

  return {
    run,
    advance,
    showForm,
    hideForm,
    connected,
    fire,
    went,
    posts,
    store,
    shown,
    node,
  }
}

const KEY = `t27-reconnect-${ID}`
const FIRST_ATTEMPT = RECONNECT_SETTLE_MS + RECONNECT_PAUSE_MS

describe('the window reconnects instead of asking for a password', () => {
  it('LANDS ON THE LOGIN ADDRESS, the one the proxy knows how to finish', () => {
    const w = world()
    w.run()
    w.showForm()
    w.advance(FIRST_ATTEMPT)
    expect(w.went).toEqual([loginUrlFor(ID)])
    /* The placeholder, never a token: the address is logged and referred. */
    expect(w.went[0]).toContain(encodeURIComponent(LOGIN_PLACEHOLDER))
  })

  it('IGNORES THE FORM THAT FLASHES ON EVERY LOAD', () => {
    const w = world()
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS - 100)
    w.hideForm()
    w.advance(10_000)
    expect(w.went).toEqual([])
  })

  it('counts its attempts and waits longer each time', () => {
    const w = world()
    w.run()
    w.showForm()
    w.advance(FIRST_ATTEMPT)
    expect(w.store.get(KEY)).toBe('1')

    /* The reload is a new page: a new script, the same tab storage. */
    const again = world()
    again.store.set(KEY, '1')
    again.run()
    again.showForm()
    again.advance(RECONNECT_SETTLE_MS + RECONNECT_PAUSE_MS)
    expect(again.went).toEqual([])
    again.advance(RECONNECT_PAUSE_MS)
    expect(again.went).toEqual([loginUrlFor(ID)])
    expect(again.store.get(KEY)).toBe('2')
  })

  it('STOPS AFTER ITS TRIES and hands the person a button', () => {
    const w = world()
    w.store.set(KEY, String(RECONNECT_TRIES))
    w.shown.add('#t27-boot')
    w.run()
    w.showForm()
    w.advance(60_000)
    expect(w.went).toEqual([])
    expect(w.node('.connect .window').attrs['data-t27']).toBe('stuck')
    expect(w.node('.connect .message button').attrs['data-say']).toBe(
      LOST_WORDS.en.again
    )
    /* The loader must not sit on top of the only thing left to press. */
    expect(w.node('#t27-boot').attrs['data-done']).toBe('1')
  })

  it('says it is trying while it is trying', () => {
    const w = world()
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS)
    expect(w.node('.connect .window').attrs['data-t27']).toBe('retry')
    expect(w.node('.connect .message span').attrs['data-say']).toBe(
      LOST_WORDS.en.lost
    )
  })

  it('FORGETS THE COUNT THE MOMENT IT IS CONNECTED', () => {
    const w = world()
    w.store.set(KEY, '2')
    w.run()
    w.showForm()
    w.hideForm()
    w.connected()
    expect(w.store.has(KEY)).toBe(false)
  })

  it('does not forget before the card has even appeared', () => {
    /* The page starts with no card at all, before neko has rendered. */
    const w = world()
    w.store.set(KEY, '2')
    w.run()
    expect(w.store.get(KEY)).toBe('2')
  })

  it('NEVER LOOPS WHEN IT CANNOT COUNT', () => {
    const w = world({ storage: 'broken' })
    w.run()
    w.showForm()
    w.advance(60_000)
    expect(w.went).toEqual([])
    expect(w.node('.connect .window').attrs['data-t27']).toBe('stuck')
  })

  it('STOPS THE ENGINE SUBMIT, which would send a password nobody has', () => {
    const w = world()
    w.run()
    w.showForm()
    const click = w.fire('click', '.connect .message button')
    expect(click).toEqual({ stopped: true, prevented: true })
    expect(w.went).toEqual([loginUrlFor(ID)])

    const enter = w.fire('submit', '.connect .message')
    expect(enter.stopped).toBe(true)
  })

  it('leaves every other click alone', () => {
    const w = world()
    w.run()
    expect(w.fire('click', '.header .menu li')).toEqual({
      stopped: false,
      prevented: false,
    })
    /* A click in the card that is not the button is not a request. */
    expect(w.fire('click', '.connect .message span').stopped).toBe(false)
    expect(w.went).toEqual([])
  })

  it('speaks Russian to a browser that asks for it', () => {
    const w = world({ language: 'ru-RU' })
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS)
    expect(w.node('.connect .message span').attrs['data-say']).toBe(
      LOST_WORDS.ru.lost
    )
  })

  it('does nothing on a page that is not a live window', () => {
    const w = world()
    w.run('/somewhere/else')
    w.showForm()
    w.advance(60_000)
    expect(w.went).toEqual([])
  })

  it('is in the document the proxy serves', () => {
    const page = '<html><head></head><body><div id="neko"></div></body></html>'
    expect(injectSkin(page)).toContain('data-t27-connect')
  })
})

describe('the card is ours', () => {
  const css = BRAND_CSS

  it('HIDES THE ENGINE CAT and shows our mark and our name', () => {
    expect(css).toMatch(/\.connect \.window \.logo img \{ display: none/)
    expect(css).toContain(`url('${LOGO_URL}')`)
    expect(css).toMatch(
      new RegExp(`\\.logo span::after \\{\\s*content: '${BRAND_NAME}'`)
    )
  })

  it('does not open the engine About box from the logo', () => {
    expect(css).toMatch(
      /#neko \.connect \.window \.logo \{[^}]*pointer-events: none/
    )
  })

  it('is written against the neko id, or the pill rule wins', () => {
    /* #neko button carries an id; a class-only selector loses to it. */
    const rules = css.match(/^[^\n{]*\.connect[^\n{]*\{/gm) || []
    expect(rules.length).toBeGreaterThan(5)
    for (const rule of rules) expect(rule).toMatch(/^\s*#neko \.connect/)
  })

  it('makes the button our pill: green with black on it', () => {
    const button = css.match(
      /#neko \.connect \.window \.message button \{([^}]*)\}/
    )
    expect(button).not.toBeNull()
    expect(button![1]).toContain('background: #00ff88')
    expect(button![1]).toContain('color: #000')
  })

  it('HIDES THE FIELDS ONLY ONCE THE SCRIPT HAS THE CARD', () => {
    expect(css).toContain(
      '#neko .connect .window[data-t27] .message input { display: none'
    )
    const hiding = css.match(/^.*\.message input \{ display: none.*$/gm) || []
    expect(hiding.length).toBe(1)
    for (const rule of hiding) expect(rule).toContain('[data-t27]')
  })

  it('swaps words only where the script has put some', () => {
    expect(css).toContain('content: attr(data-say)')
    expect(css).toMatch(/\.message > span\[data-say\],/)
  })
})

describe('the loader speaks the person language', () => {
  function boot(language: string) {
    const said = { textContent: BOOT_SAID }
    const hint = { textContent: 'hint' }
    const el = {
      querySelector: (s: string) => (s === '.said' ? said : hint),
      setAttribute() {},
      parentNode: null,
    }
    const document = {
      getElementById: () => el,
      querySelector: () => null,
      documentElement: {},
    }
    class MutationObserver {
      observe() {}
    }
    new Function(
      'document',
      'navigator',
      'setTimeout',
      'MutationObserver',
      BOOT_SCRIPT
    )(document, { language }, () => 0, MutationObserver)
    return { said: said.textContent, hint: hint.textContent }
  }

  it('says it in English by default', () => {
    expect(boot('en-US')).toEqual({ said: BOOT_SAID_EN, hint: BOOT_HINT_EN })
    expect(boot('de-DE').said).toBe(BOOT_SAID_EN)
  })

  it('keeps Russian for a browser that asks for Russian', () => {
    expect(boot('ru-RU').said).toBe(BOOT_SAID)
    expect(boot('ru').said).toBe(BOOT_SAID)
  })
})

/*
 * The page around the window hears what the connection is doing. Without
 * this the Queen's panel and the app's tab showed a frozen frame while neko
 * retried, and after the session closed.
 */
describe('the window tells its parent', () => {
  const ORIGIN = 'https://app.t27.ai'

  it('a lost connection is "reconnecting", to its own origin only', () => {
    const w = world({ framed: true })
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS + 1)
    expect(w.posts).toEqual([
      {
        msg: { source: WINDOW_EVENT, state: 'reconnecting', session: ID },
        origin: ORIGIN,
      },
    ])
  })

  it('out of tries is "stuck"', () => {
    const w = world({ framed: true })
    w.store.set(KEY, String(RECONNECT_TRIES))
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS + 1)
    expect(w.posts.map(p => p.msg.state)).toEqual(['stuck'])
  })

  it('the card going away is "connected"', () => {
    const w = world({ framed: true })
    w.run()
    w.showForm()
    w.connected()
    expect(w.posts.at(-1)?.msg).toEqual({
      source: WINDOW_EVENT,
      state: 'connected',
      session: ID,
    })
  })

  it('a window opened on its own posts to nobody', () => {
    const w = world({ framed: false })
    w.run()
    w.showForm()
    w.advance(RECONNECT_SETTLE_MS + 1)
    w.connected()
    expect(w.posts).toEqual([])
  })
})
