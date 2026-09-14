/**
 * THE BROWSER SESSION BELONGS TO THE APP, NOT TO A PAGE THAT FRAMES IT.
 *
 * nginx lets https://t27.ai frame the app, for the game's TRI tab. That origin
 * is not only the game: it serves every GitHub Pages site published under
 * t27.ai (t27.ai/leela/, t27.ai/trinity/, ...). t27.ai and app.t27.ai are one
 * site, so such a frame reads the app's first-party storage, and
 * sessionStorage belongs to the tab. A sign-in made on app.t27.ai top level is
 * still there when the same tab moves on to t27.ai (measured 2026-09-15,
 * headless Chrome, local stub pages). Any t27.ai page could then frame the
 * signed-in app, with or without ?embed=1, and trick a click on send, spend or
 * delete.
 *
 * So the Bearer session and the persisted user and profile are read from the
 * real sessionStorage only when nothing but the app itself or Telegram frames
 * the page: the nginx frame-ancestors minus t27.ai. In any other frame they
 * live in memory for this document. The frame starts as a guest, and nothing
 * it does (a sign-in, a logout) touches the tab's real session.
 *
 * Without location.ancestorOrigins (Firefox) the framer cannot be known, so a
 * framed page counts as untrusted. A Telegram Web launch there still
 * authenticates: authHeaders sends the signed initData first.
 *
 * Left as is while such a frame is a guest: telegram-web-app.js posts its
 * outgoing WebApp events to window.parent with targetOrigin '*'.
 */

export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The part of `window` the decision reads. A plain object in tests. */
export interface FramedWindow {
  self: unknown
  top: unknown
  location: { origin: string; ancestorOrigins?: ArrayLike<string> }
}

/** `https://web.telegram.org https://*.telegram.org` in the nginx CSP. */
const TELEGRAM = /^https:\/\/([a-z0-9-]+\.)+telegram\.org$/

export function sessionTrustedIn(win: FramedWindow): boolean {
  if (win.self === win.top) return true
  const list = win.location.ancestorOrigins
  if (!list || typeof list.length !== 'number' || list.length === 0) {
    return false
  }
  return Array.from(list).every(
    origin => origin === win.location.origin || TELEGRAM.test(origin)
  )
}

const memory = new Map<string, string>()
const MEMORY: SessionStore = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, String(value))
  },
  removeItem: key => {
    memory.delete(key)
  },
}

/**
 * Where the session and the persisted user live: the tab's sessionStorage, or
 * this document's memory inside a frame by another site. Memory as well when
 * the browser refuses storage outright (the getter throws), which reads as no
 * session. Never null or undefined: jotai's createJSONStorage overloads
 * reject a getter that may return undefined.
 */
export function sessionStore(): SessionStore {
  if (typeof window === 'undefined') return MEMORY
  if (!sessionTrustedIn(window as unknown as FramedWindow)) return MEMORY
  try {
    return window.sessionStorage
  } catch {
    return MEMORY
  }
}
