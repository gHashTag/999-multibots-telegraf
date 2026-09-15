/**
 * EMBED MODE: THE APP INSIDE THE GAME'S TRI TAB.
 *
 * The Queen board on https://t27.ai has a TRI tab that frames this app's
 * screens (`/feed?embed=1&lang=ru`, `/chat?embed=1`, ...). Inside that frame
 * the app hides its own header and tab bar (the game draws the navigation),
 * takes the game's language, and tells the game which route it is on.
 *
 * STORAGE IS SHARED WITH THE REAL APP
 *
 * t27.ai and app.t27.ai are one site, so the frame is not partitioned: it
 * reads and writes the real app's localStorage, as a second tab would
 * (measured in headless Chrome). Embed suppresses only the two writes that
 * change how the real app opens: the language (atoms/language.ts) and the
 * last route (RouteMemory). Everything else persisted in localStorage is
 * shared: the agent chat, drafts, script data, generated results, bookmarks,
 * the selected voice, the leads filters. The Bearer session and the persisted
 * user are a separate matter, kept out of every frame by another site, embed
 * or not (lib/framedSession.ts).
 *
 * WHO IS EMBED, DECIDED ONCE, BEFORE REACT MOUNTS
 *
 *  - A top-level visit is never embed, whatever the address says.
 *  - A framed first load is embed when it carries `?embed=1` AND its direct
 *    parent is the game (https://t27.ai, or https://app.t27.ai/game/). A
 *    Telegram Web Mini App is framed too, by web.telegram.org, and must never
 *    turn into embed mode.
 *  - The decision and the parent origin are kept in `window.name`. A frame's
 *    name survives reloads and full navigations of THAT frame only
 *    (`<a href="/feed">`, `location.reload()` after a pushState), and never
 *    leaks into another frame or a later Mini App launch the way a
 *    sessionStorage flag would.
 *  - The parent origin is captured on the first load and not recomputed from
 *    `document.referrer`: after any full in-frame navigation the referrer is
 *    app.t27.ai itself. Where `location.ancestorOrigins` exists (Chromium,
 *    Safari) the live parent must still match.
 */

/** Who may frame the app in embed mode. Mirrors the nginx frame-ancestors. */
export const EMBED_PARENTS: readonly string[] = [
  'https://t27.ai',
  'https://app.t27.ai',
]

/** The only ancestor Telegram's login widget frame accepts. */
export const APP_ORIGIN = 'https://app.t27.ai'

const NAME_PREFIX = 't27-embed:'

export type EmbedLang = 'ru' | 'en'

export interface EmbedState {
  /** Origin of the game page that frames the app, captured on first load. */
  parent: string
  /** The game's language as the app knows it, or null if none was sent. */
  lang: EmbedLang | null
}

/** The part of `window` detection reads. A plain object in tests. */
export interface EmbedWindow {
  self: unknown
  top: unknown
  name: string
  location: { search: string; ancestorOrigins?: ArrayLike<string> }
  document: { referrer: string }
}

function originOf(url: string): string | null {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

function isParent(origin: string | null | undefined): origin is string {
  return !!origin && EMBED_PARENTS.includes(origin)
}

function ancestorsOf(win: Pick<EmbedWindow, 'location'>): string[] | null {
  const list = win.location.ancestorOrigins
  return list && typeof list.length === 'number' ? Array.from(list) : null
}

/** The game sends en ru de zh es; the app speaks ru and en. */
export function embedLangOf(code: string | null): EmbedLang | null {
  if (!code) return null
  return code.toLowerCase() === 'ru' ? 'ru' : 'en'
}

function readMarker(name: string): EmbedState | null {
  if (typeof name !== 'string' || !name.startsWith(NAME_PREFIX)) return null
  try {
    const value = JSON.parse(name.slice(NAME_PREFIX.length))
    if (!isParent(value?.parent)) return null
    const lang = value.lang === 'ru' || value.lang === 'en' ? value.lang : null
    return { parent: value.parent, lang }
  } catch {
    return null
  }
}

export function detectEmbed(win: EmbedWindow): EmbedState | null {
  if (win.self === win.top) return null

  const ancestors = ancestorsOf(win)
  const live = ancestors && ancestors.length > 0 ? ancestors[0] : null
  const stored = readMarker(win.name)
  const params = new URLSearchParams(win.location.search)

  if (params.get('embed') === '1') {
    const parent = live ?? stored?.parent ?? originOf(win.document.referrer)
    if (!isParent(parent)) return null
    const state: EmbedState = {
      parent,
      lang: embedLangOf(params.get('lang')) ?? stored?.lang ?? null,
    }
    win.name = NAME_PREFIX + JSON.stringify(state)
    return state
  }

  if (!stored) return null
  if (live !== null && live !== stored.parent) return null
  return stored
}

/**
 * Telegram's login widget frame sends `frame-ancestors https://app.t27.ai`,
 * checked against EVERY ancestor (measured 2026-09-14: under a t27.ai
 * ancestor Chrome blocks it). Outside embed nothing changes.
 */
export function widgetFrameAllowedFor(
  state: EmbedState | null,
  win: Pick<EmbedWindow, 'location'>
): boolean {
  if (!state) return true
  const ancestors = ancestorsOf(win)
  if (ancestors && ancestors.length > 0) {
    return ancestors.every(origin => origin === APP_ORIGIN)
  }
  return state.parent === APP_ORIGIN
}

export type EmbedMessageKind = 'ready' | 'route'

interface ParentWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void }
}

/**
 * A structured object, never a JSON string: telegram-web-app.js inside the
 * frame posts JSON strings to the parent with '*', and the game tells the two
 * apart by shape. Only the pathname is sent, never the search string.
 */
export function postToParentFrom(
  state: EmbedState | null,
  win: ParentWindow,
  kind: EmbedMessageKind,
  path: string
): void {
  if (!state) return
  win.parent.postMessage({ v: 1, type: 't27-app', kind, path }, state.parent)
}

/**
 * Why the screen in the frame cannot work, so the game can offer a way out
 * instead of waiting for a `ready`:
 *  - 'boundary': the page threw into the app's ErrorBoundary; no `ready`
 *    follows for this document.
 *  - 'storage_blocked': the browser refuses this frame its storage (the
 *    getter throws). The screen may still render and say `ready`, but nothing
 *    persists and a sign-in inside the frame cannot hold.
 */
export type EmbedErrorCode = 'boundary' | 'storage_blocked'

export function postErrorToParentFrom(
  state: EmbedState | null,
  win: ParentWindow,
  code: EmbedErrorCode
): void {
  if (!state) return
  win.parent.postMessage(
    { v: 1, type: 't27-app', kind: 'error', code },
    state.parent
  )
}

/**
 * Posts 'storage_blocked' once when reading localStorage or sessionStorage
 * throws (site data blocked). True when it posted.
 */
export function announceStorageBlockedFrom(
  state: EmbedState | null,
  win: ParentWindow & { localStorage?: unknown; sessionStorage?: unknown }
): boolean {
  if (!state) return false
  try {
    void win.localStorage
    void win.sessionStorage
    return false
  } catch {
    postErrorToParentFrom(state, win, 'storage_blocked')
    return true
  }
}

const EMBED: EmbedState | null =
  typeof window === 'undefined'
    ? null
    : detectEmbed(window as unknown as EmbedWindow)

export const IS_EMBED = EMBED !== null

export function embedLang(): EmbedLang | null {
  return EMBED?.lang ?? null
}

export function parentOrigin(): string | null {
  return EMBED?.parent ?? null
}

export function widgetFrameAllowed(): boolean {
  return typeof window === 'undefined'
    ? true
    : widgetFrameAllowedFor(EMBED, window)
}

export function postToParent(kind: EmbedMessageKind, path: string): void {
  if (typeof window === 'undefined') return
  postToParentFrom(EMBED, window, kind, path)
}

export function postErrorToParent(code: EmbedErrorCode): void {
  if (typeof window === 'undefined') return
  postErrorToParentFrom(EMBED, window, code)
}

export function announceStorageBlocked(): void {
  if (typeof window === 'undefined') return
  announceStorageBlockedFrom(EMBED, window)
}
