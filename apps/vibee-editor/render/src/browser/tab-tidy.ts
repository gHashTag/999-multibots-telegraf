/**
 * TABS NOBODY WILL COME BACK TO, CLOSED ONLY ON THE PERSON'S YES.
 *
 * 2026-10-03, the first sweep that read every tab (#3398) found ten open on
 * the owner's pod and four of them dead weight: a Reddit submit form for an
 * article already decided, an Instagram sign-in stuck at its two-step screen,
 * two raw GitHub files fetched once. tab-sweep.ts closes duplicates on its
 * own above the cap; it must not decide that a half-filled form is litter --
 * that is the person's call, and closing through the agent door also starts a
 * visit, which messages him (liveSession) at whatever hour the loop runs.
 *
 * So three steps, and only the last one touches the browser:
 *
 *  1. LIST: which tabs look abandoned, and why. Read from /json/list through
 *     the door that starts nothing (podToLookAt). Pure: `tidyCandidates`.
 *  2. ASK: one card with the list, answerable for a day. The exact ids and
 *     URLs asked about are stored with the question, so a yes is a yes to
 *     THOSE tabs, not to whatever the next listing holds.
 *  3. APPLY: after an allowed answer, close each stored tab that still shows
 *     the stored URL. A tab that moved on was reused by someone -- skipped,
 *     and named. Applied once: the claim is one atomic UPDATE.
 */
import type { Queryable } from './sessions'
import { APPROVAL_TTL_MS } from './approvals'

export type TidyWhy =
  | 'unfinished form'
  | 'stuck sign-in'
  | 'raw file'
  | 'empty tab'
  | 'duplicate'
  | 'named by hand'

export interface TidyTab {
  id: string
  url: string
  why: TidyWhy
}

/** What the card says for each reason, in the owner's language. */
const WHY_RU: Record<TidyWhy, string> = {
  'unfinished form': 'недописанная форма', // cyrillic-ok: user-facing card
  'stuck sign-in': 'вход остановился на полпути', // cyrillic-ok
  'raw file': 'сырой файл, открытый агентом', // cyrillic-ok
  'empty tab': 'пустая вкладка', // cyrillic-ok
  duplicate: 'вторая копия той же страницы', // cyrillic-ok
  'named by hand': 'отмечена вручную', // cyrillic-ok
}

const RAW_HOSTS = new Set([
  'raw.githubusercontent.com',
  'api.github.com',
  'gist.githubusercontent.com',
  'objects.githubusercontent.com',
])

/** Why one page looks abandoned, from its URL alone, or null. Pure. */
export function whyAbandoned(url: string): TidyWhy | null {
  if (url === 'chrome://newtab/' || url === 'about:blank') return 'empty tab'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  if (RAW_HOSTS.has(u.hostname)) return 'raw file'
  const path = u.pathname.toLowerCase()
  if (
    /\/(submit|compose)(\/|$)/.test(path) ||
    u.searchParams.has('shareActive')
  )
    return 'unfinished form'
  if (
    /\/(login|signin|sign_in|two_step_verification|checkpoint|challenge)(\/|$)/.test(
      path
    )
  )
    return 'stuck sign-in'
  return null
}

/**
 * Every tab worth asking about, oldest first (the order of /json/list).
 * `named` adds tabs the operator pointed at by id. Never all of them: a
 * browser with no tabs looks broken to the person watching (tab-sweep.ts),
 * so when every page qualifies the first one stays. Pure.
 */
export function tidyCandidates(
  pages: { id: string; url: string }[],
  named: string[] = []
): TidyTab[] {
  const seen = new Set<string>()
  const out: TidyTab[] = []
  for (const p of pages) {
    let why: TidyWhy | null = named.includes(p.id) ? 'named by hand' : null
    why ??= whyAbandoned(p.url)
    /* An empty tab is litter only beside real ones; one blank page is a browser. */
    if (why === 'empty tab' && pages.length < 2) why = null
    if (!why && seen.has(p.url)) why = 'duplicate'
    seen.add(p.url)
    if (why) out.push({ id: p.id, url: p.url, why })
  }
  return out.length >= pages.length ? out.slice(1) : out
}

/** Host and path, short: the card is read on a phone. */
function where(url: string): string {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return url
    const path =
      u.pathname.length > 32 ? u.pathname.slice(0, 31) + '…' : u.pathname
    return u.hostname.replace(/^www\./, '') + (path === '/' ? '' : path)
  } catch {
    return url.slice(0, 48)
  }
}

/** Russian plural for "N extra tabs" on the card (1 / 3 / 5 forms). Pure. */
export function tabsWord(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'лишнюю вкладку' // cyrillic-ok: user-facing card
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'лишние вкладки' // cyrillic-ok
  return 'лишних вкладок' // cyrillic-ok
}

/** The one sentence on the owner's phone. Pure. */
export function tidyQuestion(tabs: TidyTab[]): string {
  return (
    `закрыть ${tabs.length} ${tabsWord(tabs.length)} в вашем браузере:\n` + // cyrillic-ok: user-facing card
    tabs.map(t => `• ${where(t.url)} — ${WHY_RU[t.why]}`).join('\n') +
    '\nВходы в аккаунты не трогаются.' // cyrillic-ok
  )
}

/**
 * What to close now: the stored tabs that still show the stored URL. A tab
 * whose URL changed was put to another use after the question -- the yes was
 * not about that page. `now` is every open page, so the never-all rule holds
 * here too: if the person closed the other tabs himself between the card and
 * his yes, the list would otherwise empty the browser (review of #3406). Pure.
 */
export function planClose(
  asked: TidyTab[],
  now: { id: string; url?: string }[]
): { close: TidyTab[]; skipped: { id: string; why: string }[] } {
  const live = new Map(now.map(p => [p.id, p.url ?? ''] as const))
  const close: TidyTab[] = []
  const skipped: { id: string; why: string }[] = []
  for (const t of asked) {
    if (!live.has(t.id)) skipped.push({ id: t.id, why: 'already closed' })
    else if (live.get(t.id) !== t.url)
      skipped.push({
        id: t.id,
        why: 'moved to another page since the question',
      })
    else close.push(t)
  }
  if (close.length > 0 && close.length >= live.size) {
    const kept = close.shift() as TidyTab
    skipped.push({ id: kept.id, why: 'last tab stays' })
  }
  return { close, skipped }
}

/** A day: the owner answers in the morning, the loop asks at night. */
export const TIDY_TTL_MS = 24 * 60 * 60 * 1000

let tableReady = false

export async function ensureTidy(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_tidy_asks (
       approval_id text PRIMARY KEY,
       telegram_id text NOT NULL,
       tabs        jsonb NOT NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),
       applied_at  timestamptz
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetTidyCache(): void {
  tableReady = false
}

export async function rememberTidyAsk(
  q: Queryable,
  approvalId: string,
  telegramId: string,
  tabs: TidyTab[]
): Promise<void> {
  await ensureTidy(q)
  await q.query(
    `INSERT INTO browser_tidy_asks (approval_id, telegram_id, tabs) VALUES ($1, $2, $3)`,
    [approvalId, telegramId, JSON.stringify(tabs)]
  )
}

/**
 * Take the stored list to apply it, once. `applied_at IS NULL` in the WHERE
 * clause is the whole guard: a second apply finds nothing. The person's own
 * telegram id is part of the key, so nobody applies somebody else's yes.
 */
export async function claimTidyAsk(
  q: Queryable,
  approvalId: string,
  telegramId: string
): Promise<TidyTab[] | null> {
  await ensureTidy(q)
  const { rows } = await q.query(
    `UPDATE browser_tidy_asks SET applied_at = now()
      WHERE approval_id = $1 AND telegram_id = $2 AND applied_at IS NULL
      RETURNING tabs`,
    [approvalId, telegramId]
  )
  const raw = rows[0]?.tabs
  if (raw === undefined) return null
  const tabs = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Array.isArray(tabs) ? (tabs as TidyTab[]) : []
}

/**
 * ONE CARD AT A TIME.
 *
 * Found 2026-10-03: `tri browser doctor` flags litter tabs on every loop tick
 * and points at `tidy ask`, and `ask` never looked for a question already on
 * the owner's phone -- each tick would have added another card for the same
 * five tabs. A question is still open while it waits (fresh and pending) or
 * once he allowed it and nobody has applied it yet. Pure.
 */
export function tidyAskOpen(
  state: string,
  ageMs: number,
  ttlMs: number = TIDY_TTL_MS
): 'pending' | 'allowed' | null {
  if (state === 'allowed') return 'allowed'
  if (state === 'pending' && ageMs >= 0 && ageMs < ttlMs) return 'pending'
  return null
}

/** The newest question about tabs that is still open, if any. */
export async function openTidyAsk(
  q: Queryable,
  telegramId: string
): Promise<{ question: string; state: 'pending' | 'allowed' } | null> {
  await ensureTidy(q)
  const { rows } = await q.query(
    `SELECT t.approval_id, a.state, a.ttl_ms,
            extract(epoch from now() - a.created_at) * 1000 AS age_ms
       FROM browser_tidy_asks t
       JOIN browser_approvals a ON a.id = t.approval_id
      WHERE t.telegram_id = $1 AND t.applied_at IS NULL
      ORDER BY t.created_at DESC LIMIT 5`,
    [telegramId]
  )
  for (const r of rows) {
    /*
     * A null ttl_ms means the approvals module's ten minutes, not a day: the
     * Allow button refuses such a question after ten minutes, so it must not
     * hold back a fresh card for the rest of the day (review of #3449).
     */
    const state = tidyAskOpen(
      String(r.state),
      Number(r.age_ms),
      Number(r.ttl_ms) || APPROVAL_TTL_MS
    )
    if (state) return { question: String(r.approval_id), state }
  }
  return null
}
