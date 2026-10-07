import { describe, it, expect } from 'vitest'
import {
  FREEZE_SCRIPT,
  FROZEN_AFTER_MS,
  FROZEN_CHECK_MS,
  LOST_WORDS,
  WINDOW_EVENT,
  injectSkin,
} from './src/browser/skin'
import { loginUrlFor } from './src/browser/live-proxy'

/**
 * A PICTURE THAT STOPPED MUST SAY SO.
 *
 * neko's socket can stay up while no new frame arrives: the person saw the
 * last picture and took it for a browser that ignores them. The window's
 * freeze script counts frames and says "the picture has stopped", and why.
 * Run here against a small stand-in for the page -- no DOM library in this
 * package -- checking what the script does, not what its text contains.
 */

const ID = 'sessAbCd1234'

interface Opts {
  language?: string
  rvfc?: boolean
  quality?: boolean
}

function world(opts: Opts = {}) {
  const posts: Array<{ state: string; session: string; origin: string }> = []
  const went: string[] = []
  const shown = new Set<string>()
  let bootDone: string | null = '1'
  let now = 0
  let tick: (() => void) | null = null
  let callbacks: Array<() => void> = []
  let decoded = 0

  const video: any = {
    paused: false,
    readyState: 4,
  }
  if (opts.rvfc !== false)
    video.requestVideoFrameCallback = (fn: () => void) =>
      void callbacks.push(fn)
  if (opts.quality)
    video.getVideoPlaybackQuality = () => ({ totalVideoFrames: decoded })

  const children: any[] = []
  const make = (tag: string): any => {
    const el: any = {
      tag,
      id: '',
      attrs: {} as Record<string, string>,
      style: { cssText: '' },
      textContent: '',
      kids: [] as any[],
      parentNode: null as any,
      listeners: {} as Record<string, () => void>,
      setAttribute(k: string, v: string) {
        el.attrs[k] = v
      },
      appendChild(c: any) {
        c.parentNode = el
        el.kids.push(c)
      },
      removeChild(c: any) {
        const i = el.kids.indexOf(c)
        if (i !== -1) el.kids.splice(i, 1)
        c.parentNode = null
      },
      addEventListener(type: string, fn: () => void) {
        el.listeners[type] = fn
      },
    }
    return el
  }
  const body = make('body')
  body.kids = children

  const document: any = {
    visibilityState: 'visible',
    body,
    createElement: make,
    querySelector: (sel: string) => {
      if (sel === 'video') return shown.has('video') ? video : null
      return shown.has(sel) ? {} : null
    },
    getElementById: (id: string) =>
      id === 't27-boot' && shown.has('#t27-boot')
        ? { getAttribute: () => bootDone }
        : null,
  }
  const navigator: any = { language: opts.language ?? 'en-US', onLine: true }
  const location = {
    pathname: `/live/${ID}/`,
    origin: 'https://app.t27.ai',
    replace: (url: string) => void went.push(url),
  }
  const self: any = {
    parent: {
      postMessage: (msg: any, origin: string) => {
        expect(msg.source).toBe(WINDOW_EVENT)
        posts.push({ state: msg.state, session: msg.session, origin })
      },
    },
  }
  const setInterval = (fn: () => void, ms: number) => {
    expect(ms).toBe(FROZEN_CHECK_MS)
    tick = fn
    return 1
  }
  const Date = { now: () => now }

  new Function(
    'document',
    'location',
    'navigator',
    'window',
    'setInterval',
    'Date',
    FREEZE_SCRIPT
  )(document, location, navigator, self, setInterval, Date)

  /** One painted frame: every pending callback fires and re-arms itself. */
  function paint() {
    decoded++
    const due = callbacks
    callbacks = []
    for (const fn of due) fn()
  }
  /** Time passes; `frames` says whether neko keeps sending meanwhile. */
  function pass(ms: number, frames: boolean) {
    for (let t = 0; t < ms; t += FROZEN_CHECK_MS) {
      now += FROZEN_CHECK_MS
      if (frames) paint()
      tick?.()
    }
  }
  const strip = () => children.find(c => c.id === 't27-frozen') ?? null
  const said = () => strip()?.kids[0]?.textContent ?? null

  shown.add('video')
  return {
    video,
    navigator,
    document,
    shown,
    posts,
    went,
    pass,
    strip,
    said,
    setBootDone: (v: string | null) => {
      bootDone = v
    },
    get ticking() {
      return tick !== null
    },
  }
}

describe('the picture stops, and the window says so', () => {
  it('frames flow: nothing is said', () => {
    const w = world()
    w.pass(60_000, true)
    expect(w.strip()).toBeNull()
    expect(w.posts).toEqual([])
  })

  it('no frame for the limit: the strip names the server side and tells the app', () => {
    const w = world()
    w.pass(5_000, true)
    w.pass(FROZEN_AFTER_MS - FROZEN_CHECK_MS, false)
    expect(w.strip()).toBeNull()
    w.pass(FROZEN_CHECK_MS, false)
    expect(w.said()).toBe(`${LOST_WORDS.en.frozen}. ${LOST_WORDS.en.frozenPod}`)
    expect(w.strip().attrs.role).toBe('status')
    expect(w.posts).toEqual([
      { state: 'frozen', session: ID, origin: 'https://app.t27.ai' },
    ])
  })

  it('frames come back: the strip goes and the app hears "connected"', () => {
    const w = world()
    w.pass(3_000, true)
    w.pass(FROZEN_AFTER_MS + 2_000, false)
    expect(w.strip()).not.toBeNull()
    w.pass(FROZEN_CHECK_MS, true)
    expect(w.strip()).toBeNull()
    expect(w.posts.map(p => p.state)).toEqual(['frozen', 'connected'])
  })

  it('it says it once, not every second', () => {
    const w = world()
    w.pass(3_000, true)
    w.pass(60_000, false)
    expect(w.posts.map(p => p.state)).toEqual(['frozen'])
  })

  it('the person is offline: it says the network is on their side', () => {
    const w = world()
    w.pass(3_000, true)
    w.navigator.onLine = false
    w.pass(FROZEN_AFTER_MS, false)
    expect(w.said()).toBe(`${LOST_WORDS.en.frozen}. ${LOST_WORDS.en.frozenNet}`)
  })

  it('in Russian when the browser asks for Russian', () => {
    const w = world({ language: 'ru-RU' })
    w.pass(3_000, true)
    w.pass(FROZEN_AFTER_MS, false)
    expect(w.said()).toBe(`${LOST_WORDS.ru.frozen}. ${LOST_WORDS.ru.frozenPod}`)
    expect(w.strip().kids[1].textContent).toBe(LOST_WORDS.ru.again)
  })

  it('the button reconnects through the login address', () => {
    const w = world()
    w.pass(3_000, true)
    w.pass(FROZEN_AFTER_MS, false)
    w.strip().kids[1].listeners.click()
    expect(w.went).toEqual([loginUrlFor(ID)])
  })
})

describe('it stays quiet where there is nothing to judge', () => {
  it('a hidden tab paints no frames by design', () => {
    const w = world()
    w.pass(3_000, true)
    w.document.visibilityState = 'hidden'
    w.pass(120_000, false)
    expect(w.strip()).toBeNull()
    /* Shown again: the count starts over, no instant alarm. */
    w.document.visibilityState = 'visible'
    w.pass(FROZEN_CHECK_MS, false)
    expect(w.strip()).toBeNull()
  })

  it("neko's own card is speaking", () => {
    const w = world()
    w.pass(3_000, true)
    w.shown.add('.connect')
    w.pass(60_000, false)
    expect(w.strip()).toBeNull()
  })

  it('our loader is still up, or holding the picture in watch mode', () => {
    const w = world()
    w.shown.add('#t27-boot')
    w.setBootDone(null)
    w.pass(3_000, true)
    w.pass(60_000, false)
    expect(w.strip()).toBeNull()
  })

  it('a paused video', () => {
    const w = world()
    w.pass(3_000, true)
    w.video.paused = true
    w.pass(60_000, false)
    expect(w.strip()).toBeNull()
  })

  it('a video that never showed a frame: that is the loader’s case, not this one', () => {
    const w = world()
    w.pass(60_000, false)
    expect(w.strip()).toBeNull()
  })

  it('a strip already up goes when the window goes quiet', () => {
    const w = world()
    w.pass(3_000, true)
    w.pass(FROZEN_AFTER_MS, false)
    expect(w.strip()).not.toBeNull()
    w.document.visibilityState = 'hidden'
    w.pass(FROZEN_CHECK_MS, false)
    expect(w.strip()).toBeNull()
  })
})

describe('what it counts', () => {
  it('decoded frames where requestVideoFrameCallback is missing', () => {
    const w = world({ rvfc: false, quality: true })
    w.pass(3_000, true)
    w.pass(FROZEN_AFTER_MS, false)
    expect(w.strip()).not.toBeNull()
  })

  it('no measure, no alarm: currentTime runs on with no frames', () => {
    const w = world({ rvfc: false, quality: false })
    w.video.currentTime = 1
    w.pass(3_000, true)
    w.pass(60_000, false)
    expect(w.strip()).toBeNull()
  })
})

describe('the window carries it', () => {
  it('in the head, after the connect script, outside /live/ it does nothing', () => {
    const html = injectSkin('<html><head></head><body></body></html>')
    const connect = html.indexOf('data-t27-connect')
    const freeze = html.indexOf('data-t27-freeze')
    expect(connect).toBeGreaterThan(-1)
    expect(freeze).toBeGreaterThan(connect)
    expect(freeze).toBeLessThan(html.indexOf('</head>'))
  })

  it('every placeholder was filled', () => {
    expect(FREEZE_SCRIPT).not.toMatch(/__[A-Z]+__/)
    expect(() => new Function(FREEZE_SCRIPT)).not.toThrow()
  })

  it('a page outside /live/ starts no watch', () => {
    let started = false
    new Function('location', 'setInterval', FREEZE_SCRIPT)(
      { pathname: '/other/' },
      () => {
        started = true
      }
    )
    expect(started).toBe(false)
  })
})
