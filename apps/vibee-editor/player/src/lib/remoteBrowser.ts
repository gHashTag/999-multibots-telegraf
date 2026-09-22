/**
 * THE PERSON'S OWN BROWSER, FROM THE MINI APP'S SIDE.
 *
 * One door on the server (`/api/browser/*`), one door here. Everything this
 * module knows about the browser is what the server chose to tell it: a
 * state, a session id and a path. It never learns where the pod is, and it
 * never holds the admin token -- see the server's `publicView` and the test
 * that searches the response for both.
 *
 * WHY "unavailable" AND "signin" ARE STATES AND NOT ERRORS. Railway runs the
 * broker but cannot run pods, so 503 there is by design; and a visitor who
 * has not signed in gets 401, which is the ordinary first visit. Measured by
 * opening the page in a plain browser: the screen showed the server's own
 * words, "no X-Api-Key and no Telegram initData". That is a sentence for
 * whoever wrote the server, not for the person holding the phone.
 */
import { API_BASE } from '../config'
import { apiFetch, type ApiError } from '@/lib/apiFetch'

export type BrowserState =
  | 'none'
  | 'starting'
  | 'live'
  | 'unavailable'
  | 'signin'

export interface BrowserSessionView {
  state: BrowserState
  sessionId?: string
  /** Path on the render server, e.g. `/live/<id>?t=<token>`. */
  viewUrl?: string
  /** Who is driving, as the server holds it (render sessions.ts). */
  wheel?: 'person' | 'agent'
  /** The agent is waiting for the person to type something (browser_ask_input). */
  inputRequest?: InputRequestView | null
}

export interface InputRequestView {
  id: string
  kind: 'password' | 'email' | 'code' | 'text'
  /** The agent's words: what it is for. */
  why: string
  host: string
  label: string
}

function inputRequestOf(raw: unknown): InputRequestView | null {
  const r = (raw ?? null) as Partial<InputRequestView> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null
  const kind =
    r.kind === 'password' || r.kind === 'email' || r.kind === 'code'
      ? r.kind
      : 'text'
  return {
    id: r.id,
    kind,
    why: typeof r.why === 'string' ? r.why : '',
    host: typeof r.host === 'string' ? r.host : '',
    label: typeof r.label === 'string' ? r.label : '',
  }
}

interface ServerAnswer {
  ok?: boolean
  state?: string
  sessionId?: string
  viewUrl?: string
  wheel?: string
  inputRequest?: unknown
}

export const asView = (a: ServerAnswer): BrowserSessionView => ({
  state: (a.state as BrowserState) || 'none',
  sessionId: a.sessionId,
  viewUrl: a.viewUrl,
  ...(a.wheel === 'person' || a.wheel === 'agent' ? { wheel: a.wheel } : {}),
  ...(a.inputRequest !== undefined
    ? { inputRequest: inputRequestOf(a.inputRequest) }
    : {}),
})

/**
 * The address the person actually opens.
 *
 * The server hands back a PATH, never a URL, because it must not publish
 * where the pod is. The origin is ours to add, and it is OUR OWN: `/live/` is
 * proxied under this app's origin by the nginx config that ships in the same
 * image as this bundle. Same origin means the viewer's cookie is first-party,
 * which is the only way a frame on a phone keeps it -- see `canEmbed`.
 *
 * A path is resolved against this app. An absolute URL, if the server ever
 * returns one, is left alone and `canEmbed` then refuses to frame it.
 */
export function absoluteViewUrl(viewUrl: string): string {
  return new URL(viewUrl, window.location.origin).toString()
}

/**
 * WHETHER THE BROWSER CAN BE SHOWN INSIDE THIS PAGE.
 *
 * The session cookie the proxy sets is `SameSite=Lax`, so it is not sent at
 * all from a cross-site frame -- the frame would load and then be refused,
 * which reads to the person as a browser that forgot them. Telegram on iOS is
 * WKWebView, which blocks third-party cookies outright, so `SameSite=None`
 * would not rescue it either.
 *
 * Since `/live/` is now proxied under this app's origin, this normally
 * answers true. It is kept, and kept honest, for the case it still catches:
 * a server that hands back an absolute URL somewhere else. That is never
 * framed -- it is opened top-level, where the cookie is first-party.
 */
export function canEmbed(viewUrl: string): boolean {
  try {
    return (
      new URL(absoluteViewUrl(viewUrl), window.location.href).origin ===
      window.location.origin
    )
  } catch {
    return false
  }
}

const statusOf = (e: unknown): number =>
  typeof e === 'object' && e && 'status' in e ? (e as ApiError).status : 0

/** Two refusals are ordinary states; everything else is a real failure. */
function stateOrThrow(e: unknown): BrowserSessionView {
  const status = statusOf(e)
  if (status === 503) return { state: 'unavailable' }
  if (status === 401) return { state: 'signin' }
  throw e
}

export async function readBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`)
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

export async function openBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`, {
        method: 'POST',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

/** Closes the browser and KEEPS the logins. The ordinary thing. */
export async function closeBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`, {
        method: 'DELETE',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

/** Forget me: stops the browser AND wipes the profile. Irreversible. */
export async function forgetBrowserProfile(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/profile`, {
        method: 'DELETE',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

/**
 * Ask the pod to become the shape of the box the person is watching in.
 *
 * Returns what it ACTUALLY became. A pod that will not resize is still a pod,
 * so a refusal is null and the frame keeps its current shape -- the person
 * goes on watching, which matters more than the letterbox.
 */
export async function fitBrowserScreen(box: {
  width: number
  height: number
}): Promise<{ width: number; height: number; rate: number } | null> {
  try {
    const a = await apiFetch<{
      ok?: boolean
      screen?: { width: number; height: number; rate: number }
    }>(
      `${API_BASE}/api/browser/screen?w=${Math.round(
        box.width
      )}&h=${Math.round(box.height)}`,
      { method: 'POST' }
    )
    return a.screen ?? null
  } catch {
    return null
  }
}

/** What the broker says after bringing the person's logins in. */
export interface LoginsImported {
  imported: number
  skipped: number
  /** Site names and how many cookies each got. Never a value. */
  sites: Record<string, number>
}

/**
 * The person's own cookie export, into their own browser. The text goes to
 * the broker as it is and straight into the pod; nothing keeps it. See
 * render/src/browser/cookie-import.ts for what is read and what is refused.
 */
export async function importBrowserLogins(
  exported: string
): Promise<LoginsImported> {
  const answer = await apiFetch<Partial<LoginsImported>>(
    `${API_BASE}/api/browser/cookies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: exported,
    }
  )
  return {
    imported: Number(answer.imported ?? 0),
    skipped: Number(answer.skipped ?? 0),
    sites: answer.sites ?? {},
  }
}

/** "habr.com, github.com and 12 more" -- the busiest sites first. */
export function sitesInWords(
  sites: Record<string, number>,
  andMore: (n: number) => string,
  show = 3
): string {
  const names = Object.entries(sites)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([site]) => site)
  const head = names.slice(0, show).join(', ')
  const rest = names.length - show
  return rest > 0 ? `${head} ${andMore(rest)}` : head
}

/**
 * Tell the server who holds the wheel. The person's door (an agent key is
 * refused there). A failure is swallowed: the glow on screen still says who
 * is driving, and the next touch tries again.
 */
export async function setBrowserWheel(
  holder: 'person' | 'agent'
): Promise<boolean> {
  try {
    await apiFetch(`${API_BASE}/api/browser/wheel?holder=${holder}`, {
      method: 'POST',
    })
    return true
  } catch {
    return false
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * TYPING FROM THE PHONE'S OWN KEYBOARD (render/src/browser/person-type.ts).
 *
 * Typing through the video stream was too hard to sign in with (owner,
 * 2026-09-22). The app's own field goes into whichever field has focus in
 * the person's browser. The person's door only; the text is never kept.
 * ──────────────────────────────────────────────────────────────────────── */
export interface BrowserFocus {
  host: string
  /** password | email | text | ... | none */
  field: string
  label: string
}

function focusFrom(raw: unknown): BrowserFocus | null {
  const f = (raw ?? null) as Partial<BrowserFocus> | null
  if (!f || typeof f !== 'object') return null
  return {
    host: typeof f.host === 'string' ? f.host : '',
    field: typeof f.field === 'string' ? f.field : 'none',
    label: typeof f.label === 'string' ? f.label : '',
  }
}

/** Where typed text would land now; null when it cannot be told. */
export async function readBrowserFocus(): Promise<BrowserFocus | null> {
  try {
    const answer = await apiFetch<{ focus?: unknown }>(
      `${API_BASE}/api/browser/type`
    )
    return focusFrom(answer.focus)
  } catch {
    return null
  }
}

export type TypeOutcome =
  | { ok: true; focus: BrowserFocus | null }
  | { ok: false; reason: 'no-field' | 'failed'; focus: BrowserFocus | null }

/** Type into the focused field; `enter` presses Enter after. Never throws. */
export async function typeInBrowser(
  text: string,
  enter: boolean
): Promise<TypeOutcome> {
  try {
    const answer = await apiFetch<{ focus?: unknown }>(
      `${API_BASE}/api/browser/type`,
      { method: 'POST', body: JSON.stringify({ text, enter }) }
    )
    return { ok: true, focus: focusFrom(answer.focus) }
  } catch (e) {
    const status = (e as ApiError).status
    return {
      ok: false,
      reason: status === 409 ? 'no-field' : 'failed',
      focus: null,
    }
  }
}

/** A field that hides what is typed: the sheet hides it too, by default. */
export function isSecretField(focus: BrowserFocus | null): boolean {
  return focus?.field === 'password'
}

/* ────────────────────────────────────────────────────────────────────────
 * THE AGENT'S QUESTION AND THE PHONE'S MISSING KEYS (owner, 2026-09-22).
 * The question used to live only in Telegram; the page's buttons sat below
 * the edge with no way to scroll from a phone.
 * ──────────────────────────────────────────────────────────────────────── */
export interface PendingApproval {
  id: string
  what: string
}

/** The agent's open question to this person; null when none or unreadable. */
export async function readPendingApproval(): Promise<PendingApproval | null> {
  try {
    const a = await apiFetch<{ approval?: Partial<PendingApproval> | null }>(
      `${API_BASE}/api/browser/decide`
    )
    const p = a.approval
    return p && typeof p.id === 'string' && typeof p.what === 'string'
      ? { id: p.id, what: p.what }
      : null
  } catch {
    return null
  }
}

/** The person's answer. True when it counted. Never throws. */
export async function answerApproval(
  id: string,
  allow: boolean
): Promise<boolean> {
  try {
    await apiFetch(`${API_BASE}/api/browser/decide`, {
      method: 'POST',
      body: JSON.stringify({ id, allow }),
    })
    return true
  } catch {
    return false
  }
}

export type BrowserKey = 'Tab' | 'Escape'
export type BrowserScroll = 'up' | 'down'

/** Scroll the page or press a key the video cannot carry. Never throws. */
export async function pressInBrowser(
  what: { key: BrowserKey } | { scroll: BrowserScroll }
): Promise<boolean> {
  try {
    await apiFetch(`${API_BASE}/api/browser/type`, {
      method: 'POST',
      body: JSON.stringify(what),
    })
    return true
  } catch {
    return false
  }
}
