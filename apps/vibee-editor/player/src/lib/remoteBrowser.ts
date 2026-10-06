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
  /** Typed (password, email, code, text) or pressed (choice, action). */
  kind: 'password' | 'email' | 'code' | 'text' | 'choice' | 'action'
  /** The buttons for choice and action. */
  options: string[]
  /** The agent's words: what it is for. */
  why: string
  host: string
  label: string
}

function inputRequestOf(raw: unknown): InputRequestView | null {
  const r = (raw ?? null) as Partial<InputRequestView> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null
  const kind =
    r.kind === 'password' ||
    r.kind === 'email' ||
    r.kind === 'code' ||
    r.kind === 'choice' ||
    r.kind === 'action'
      ? r.kind
      : 'text'
  return {
    id: r.id,
    kind,
    options: Array.isArray(r.options)
      ? r.options.filter((o): o is string => typeof o === 'string')
      : [],
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
export function absoluteViewUrl(viewUrl: string, lang?: 'ru' | 'en'): string {
  const url = new URL(viewUrl, window.location.origin)
  /*
   * The window speaks the APP's language, not the phone's (owner, 2026-10-06:
   * Russian app, English "Starting your browser" under it). The proxy keeps
   * `lang` through its login redirect; the window keeps it for the tab
   * (render skin.ts LANG_SCRIPT).
   */
  if (lang === 'ru' || lang === 'en') url.searchParams.set('lang', lang)
  return url.toString()
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
  // A renewal that failed for a moment is not "this deployment has no pods":
  // that answer latches the watcher off for the page's life (useBrowserWatch).
  if ((e as ApiError | undefined)?.code === 'session_renewal_unavailable')
    throw e
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
  /**
   * Networks the import actually lit up (a live login cookie landed), by the
   * name the person calls them. `imported` counts what the browser took;
   * this says what a login now works for -- proof of the work, not the
   * import. Absent when the broker could not read it back: never an empty
   * list standing in for "could not tell".
   */
  signedIn?: string[]
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
    ...(Array.isArray(answer.signedIn)
      ? { signedIn: answer.signedIn.map(String) }
      : {}),
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

/**
 * A ROUND OF THE CONNECTED ACCOUNTS, STARTED BY HAND (render agent/rounds.ts).
 *
 * The agent walks the person's own accounts every few hours and sends one
 * message about what is new. "Every few hours" is not something anybody can
 * watch, so this is the same walk, now: the answer comes back as the line
 * the log keeps, and the message itself arrives in their chat.
 */
export async function walkMyAccounts(
  /* Which desk to walk (render agent/profiles.ts); all of them by default. */
  profile?: string
): Promise<string | null> {
  try {
    const answer = await apiFetch<{ round?: unknown }>(
      `${API_BASE}/api/browser/round${profile ? `?profile=${encodeURIComponent(profile)}` : ''}`,
      { method: 'POST' }
    )
    return typeof answer?.round === 'string' ? answer.round : ''
  } catch {
    return null
  }
}

/**
 * THE RUNS THE AGENT CAN REPEAT (render agent/scenarios.ts): each one is a
 * short list of plain steps the person can read before starting it. Never
 * throws; an empty list simply draws nothing.
 */
export interface Scenario {
  id: string
  name: string
  steps: string[]
}

export async function readScenarios(): Promise<Scenario[]> {
  try {
    const answer = await apiFetch<{ scenarios?: unknown }>(
      `${API_BASE}/api/browser/scenarios`
    )
    const raw = Array.isArray(answer?.scenarios) ? answer.scenarios : []
    return raw.flatMap(s => {
      const r = s as { id?: unknown; name?: unknown; steps?: unknown }
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return []
      return [
        {
          id: r.id,
          name: r.name,
          steps: Array.isArray(r.steps)
            ? r.steps.filter((x): x is string => typeof x === 'string')
            : [],
        },
      ]
    })
  } catch {
    return []
  }
}

/** Start one. Returns the lines of what it did, or null when it could not. */
export async function runScenario(id: string): Promise<string[] | null> {
  try {
    const answer = await apiFetch<{
      ran?: { lines?: unknown; failed?: unknown }
    }>(`${API_BASE}/api/browser/scenarios?id=${encodeURIComponent(id)}`, {
      method: 'POST',
    })
    const lines = Array.isArray(answer?.ran?.lines)
      ? answer.ran.lines.filter((x): x is string => typeof x === 'string')
      : []
    const failed =
      typeof answer?.ran?.failed === 'string' && answer.ran.failed
        ? [`✗ ${answer.ran.failed}`]
        : []
    return [...lines, ...failed]
  } catch {
    return null
  }
}

/**
 * THE DESKS: every line of work the agent keeps for this person, with the
 * accounts that belong to it (render agent/profiles.ts). Never throws; an
 * empty list simply draws no cabinets.
 */
export interface Desk {
  id: string
  name: string
  about: string
  sites: Array<{ name: string; url: string }>
}

export async function readDesks(): Promise<Desk[]> {
  try {
    const answer = await apiFetch<{ desks?: unknown }>(
      `${API_BASE}/api/browser/desks`
    )
    const raw = Array.isArray(answer?.desks) ? answer.desks : []
    return raw.flatMap(d => {
      const r = d as {
        id?: unknown
        name?: unknown
        about?: unknown
        inUse?: { sites?: unknown }
      }
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return []
      const sites = Array.isArray(r.inUse?.sites) ? r.inUse.sites : []
      return [
        {
          id: r.id,
          name: r.name,
          about: typeof r.about === 'string' ? r.about : '',
          sites: sites.flatMap(s => {
            const site = s as { name?: unknown; url?: unknown }
            return typeof site.name === 'string' && typeof site.url === 'string'
              ? [{ name: site.name, url: site.url }]
              : []
          }),
        },
      ]
    })
  } catch {
    return []
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

export type BrowserKey = 'Tab' | 'Escape' | 'Enter'
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

/** The agent's request is answered by pressing, not typing. Pure. */
export function isPressedAsk(r: InputRequestView | null): boolean {
  return r?.kind === 'choice' || r?.kind === 'action'
}

/** The person pressed one of the agent's options. True when it counted. */
export async function chooseInBrowser(
  id: string,
  option: string
): Promise<boolean> {
  try {
    await apiFetch(`${API_BASE}/api/browser/choose`, {
      method: 'POST',
      body: JSON.stringify({ id, option }),
    })
    return true
  } catch {
    return false
  }
}

/*
 * THE PERSON'S OWN SITE LIST (render/src/browser/site-rules.ts).
 *
 * "ask": acting there needs their yes, as on a bank. "block": the agent does
 * not open, read or shoot it at all. The app is the person's door, so it may
 * loosen (remove a site, block -> ask); an agent key may only tighten.
 */
export type SiteRule = 'ask' | 'block'

export interface SiteRuleRow {
  site: string
  rule: SiteRule
  by: 'person' | 'agent'
}

/** Null when the server could not read the list -- not an empty list. */
export async function readSiteRules(): Promise<SiteRuleRow[] | null> {
  try {
    const answer = await apiFetch<{ sites?: unknown }>(
      `${API_BASE}/api/browser/sites`
    )
    return siteRowsOf(answer.sites)
  } catch (e) {
    if ((e as ApiError | undefined)?.status === 503) return null
    throw e
  }
}

/**
 * What the screen shows after a read. Only a 503 is "unreadable" -- the
 * server's own word that it cannot say where the person said no, which stops
 * the agent. A 401 or a dropped network says nothing about the list, so it is
 * an error of this screen, not a claim about the agent.
 */
export type SiteListState =
  | { rows: SiteRuleRow[] }
  | { unreadable: true }
  | { failed: string }

export async function readSiteListState(): Promise<SiteListState> {
  try {
    const rows = await readSiteRules()
    return rows === null ? { unreadable: true } : { rows }
  } catch (e) {
    return { failed: siteRuleReason(e) }
  }
}

/** The row's one-tap flip: never <-> ask first. */
export function nextRule(rule: SiteRule): SiteRule {
  return rule === 'block' ? 'ask' : 'block'
}

/*
 * The server's refusals are English sentences; the person reads their own
 * language. Known statuses get a dictionary key, the rest the raw reason.
 */
export function siteRuleFailKey(e: unknown): string | null {
  switch ((e as ApiError | undefined)?.status) {
    case 400:
      return 'browser.sites.badSite'
    case 409:
      return 'browser.sites.full'
    case 503:
      return 'browser.sites.unreadableNow'
    default:
      return null
  }
}

/** The server's error code, or the message: what "Not saved: …" quotes. */
export function siteRuleReason(e: unknown): string {
  return (
    (e as { code?: string } | null)?.code ||
    (e instanceof Error ? e.message : String(e))
  )
}

export async function putSiteRule(site: string, rule: SiteRule): Promise<void> {
  await apiFetch(`${API_BASE}/api/browser/sites`, {
    method: 'POST',
    body: JSON.stringify({ site, rule }),
  })
}

export async function dropSiteRule(site: string): Promise<void> {
  await apiFetch(
    `${API_BASE}/api/browser/sites?site=${encodeURIComponent(site)}`,
    { method: 'DELETE' }
  )
}

/** Only well-formed rows; a row the app cannot name is not shown as a rule. */
export function siteRowsOf(raw: unknown): SiteRuleRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(r => {
    const row = r as Partial<SiteRuleRow> | null
    if (!row || typeof row.site !== 'string' || !row.site) return []
    if (row.rule !== 'ask' && row.rule !== 'block') return []
    return [
      {
        site: row.site,
        rule: row.rule,
        by: row.by === 'agent' ? ('agent' as const) : ('person' as const),
      },
    ]
  })
}

/* ────────────────────────────────────────────────────────────────────────
 * THE TAB STRIP (owner, 2026-10-06; spec browser-tab-strip.t27). Every page
 * in the person's browser, as the server chose to describe it: an id, a
 * clipped title, a host and whether it is in front. Never a path.
 * ──────────────────────────────────────────────────────────────────────── */
export interface BrowserTab {
  id: string
  title: string
  host: string
  active: boolean
}

export type TabAction = 'activate' | 'new' | 'close'

/** Only well-formed tabs; a tab without an id cannot be pressed. Pure. */
export function tabsOf(raw: unknown): BrowserTab[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(r => {
    const t = r as Partial<BrowserTab> | null
    if (!t || typeof t.id !== 'string' || !t.id) return []
    return [
      {
        id: t.id,
        title: typeof t.title === 'string' ? t.title : '',
        host: typeof t.host === 'string' ? t.host : '',
        active: t.active === true,
      },
    ]
  })
}

/** The tabs open now; null when they cannot be read. Never throws. */
export async function readBrowserTabs(): Promise<BrowserTab[] | null> {
  try {
    const a = await apiFetch<{ tabs?: unknown }>(
      `${API_BASE}/api/browser/strip`
    )
    return tabsOf(a.tabs)
  } catch {
    return null
  }
}

/** Switch, open or close; the tabs after it, or null when refused. */
export async function actOnBrowserTab(
  action: TabAction,
  id?: string
): Promise<BrowserTab[] | null> {
  try {
    const a = await apiFetch<{ tabs?: unknown }>(
      `${API_BASE}/api/browser/strip`,
      { method: 'POST', body: JSON.stringify(id ? { action, id } : { action }) }
    )
    return tabsOf(a.tabs)
  } catch {
    return null
  }
}
