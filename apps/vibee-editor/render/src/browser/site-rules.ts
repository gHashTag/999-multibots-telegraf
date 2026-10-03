/**
 * THE PERSON'S OWN SITE LIST: WHERE AN AGENT ASKS FIRST, AND WHERE IT NEVER GOES.
 *
 * `guard.ts` keeps one list for everyone: banks, mail, payment pages. That is
 * the right default and the wrong ceiling. The person knows places nobody else
 * can name -- their clinic's portal, the shop where their card is saved, the work
 * chat they do not want an agent near -- and Comet lets its user block sites
 * for its assistant outright. Here the same, per person, two rules:
 *
 *   ask    acting there (click, type, run code) needs a yes from the last
 *          five minutes, exactly as on a bank (guard.ts PERMISSION_WINDOW_MS)
 *   block  the agent does not open, read, shoot or act there at all, with or
 *          without a yes
 *
 * ── WHO MAY CHANGE IT ─────────────────────────────────────────────────────
 *
 * The list only gets TIGHTER from the agent's side. An agent may add a site
 * or move it from ask to block -- the person says "never open my bank" in
 * the chat and it is done in the same turn. It may not remove a rule or move
 * block to ask: a page that talked an agent into "unblock this" would turn
 * the person's own brake into the agent's. Loosening is the person's door
 * only (`/api/browser/sites`, DELETE or POST without an agent key).
 *
 * ── MATCHING ──────────────────────────────────────────────────────────────
 *
 * By host suffix and path prefix, never by substring: the shared list's
 * `includes` would make "x.com" match netflix.com. "bank.com" covers
 * bank.com and every sub-domain of it; "yandex.ru/mail" covers the inbox and
 * not the search engine. A leading "www." or "*." is dropped, because the
 * person who wrote "www.bank.com" meant the bank.
 *
 * ── WHEN THE LIST CANNOT BE READ ──────────────────────────────────────────
 *
 * `siteRulesOf` answers null, and every caller treats null as "we do not know
 * where they said no": opening and reading are refused, and acting anywhere
 * needs a fresh yes. This is guard.ts's own rule (an unreadable address is
 * sensitive) applied to the list, and it costs nothing in practice: the list
 * lives in the same Postgres as the session row, and without that row no
 * tool works anyway.
 */
import type { Queryable } from './sessions'

export type SiteRule = 'ask' | 'block'

export interface SiteRuleRow {
  /** Normalized `host` or `host/path`, see `siteOf`. */
  site: string
  rule: SiteRule
  by: 'person' | 'agent'
  at: string
}

/** More than this is not a list anybody reads; refuse rather than grow. */
export const MAX_SITE_RULES = 200

const RULES: readonly SiteRule[] = ['ask', 'block']

export function isSiteRule(v: unknown): v is SiteRule {
  return RULES.includes(v as SiteRule)
}

/**
 * "https://WWW.Bank.com/cards/?x=1#y" -> "bank.com/cards". Null for anything
 * that is not one place on the web: no dot in the host, spaces, a non-web
 * scheme, a query-only or empty input.
 */
export function siteOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim().toLowerCase()
  if (!s || s.length > 300 || /\s/.test(s)) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  let host = u.hostname.replace(/^\*\./, '').replace(/^www\./, '')
  host = host.replace(/\.$/, '')
  if (!host.includes('.') || host.startsWith('.')) return null
  const path = u.pathname.replace(/\/+$/, '')
  return path ? `${host}${path}` : host
}

/**
 * The rule that covers this address, block beating ask. Null for a page no
 * rule names, and for anything that is not http(s) -- the browser's own pages
 * are guard.ts's business, not the list's.
 */
export function ruleFor(url: string, rules: SiteRuleRow[]): SiteRule | null {
  let host: string
  let path: string
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    host = u.hostname.toLowerCase().replace(/\.$/, '')
    path = u.pathname.toLowerCase()
  } catch {
    return null
  }
  let found: SiteRule | null = null
  for (const r of rules) {
    const slash = r.site.indexOf('/')
    const h = slash < 0 ? r.site : r.site.slice(0, slash)
    const p = slash < 0 ? '' : r.site.slice(slash)
    if (host !== h && !host.endsWith(`.${h}`)) continue
    if (p && path !== p && !path.startsWith(`${p}/`)) continue
    if (r.rule === 'block') return 'block'
    found = 'ask'
  }
  return found
}

let tableReady = false

export async function ensureSiteRules(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_site_rules (
       telegram_id text NOT NULL,
       site        text NOT NULL,
       rule        text NOT NULL,
       by_whom     text NOT NULL,
       at          timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (telegram_id, site)
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetSiteRulesCache(): void {
  tableReady = false
}

/** Their list, or null when it could not be read (see the header). */
export async function siteRulesOf(
  q: Queryable,
  telegramId: string
): Promise<SiteRuleRow[] | null> {
  try {
    await ensureSiteRules(q)
    const { rows } = await q.query(
      `SELECT site, rule, by_whom, at FROM browser_site_rules
        WHERE telegram_id = $1 ORDER BY site`,
      [telegramId]
    )
    return rows
      .filter(r => isSiteRule(r.rule))
      .map(r => ({
        site: String(r.site),
        rule: r.rule as SiteRule,
        by: r.by_whom === 'agent' ? 'agent' : 'person',
        at: new Date(String(r.at)).toISOString(),
      }))
  } catch (e) {
    console.warn('[browser:sites] unreadable', String(e).slice(0, 200))
    return null
  }
}

export type SetResult =
  | { ok: true; site: string; rule: SiteRule; was: SiteRule | null }
  | { ok: false; status: 400 | 403 | 409 | 503; error: string }

/**
 * Write one rule. `by: 'agent'` may only tighten: a new site, or ask -> block.
 * Setting what is already there is a no-op that still answers ok.
 */
export async function setSiteRule(
  q: Queryable,
  telegramId: string,
  raw: unknown,
  rule: unknown,
  by: 'person' | 'agent'
): Promise<SetResult> {
  const site = siteOf(raw)
  if (!site) {
    return {
      ok: false,
      status: 400,
      error:
        'site must be one web address, e.g. "bank.com" or "yandex.ru/mail"',
    }
  }
  if (!isSiteRule(rule)) {
    return { ok: false, status: 400, error: 'rule must be "ask" or "block"' }
  }
  const rules = await siteRulesOf(q, telegramId)
  if (rules === null) {
    return { ok: false, status: 503, error: 'the site list could not be read' }
  }
  const was = rules.find(r => r.site === site)?.rule ?? null
  if (was === rule) return { ok: true, site, rule, was }
  if (by === 'agent' && was === 'block') {
    return {
      ok: false,
      status: 403,
      error:
        `${site} is blocked; only the person can loosen that ` +
        '(the Browser tab in the app, or /api/browser/sites without an agent key)',
    }
  }
  if (was === null && rules.length >= MAX_SITE_RULES) {
    return {
      ok: false,
      status: 409,
      error: `the list already holds ${MAX_SITE_RULES} sites`,
    }
  }
  await q.query(
    `INSERT INTO browser_site_rules (telegram_id, site, rule, by_whom)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id, site)
     DO UPDATE SET rule = EXCLUDED.rule, by_whom = EXCLUDED.by_whom, at = now()`,
    [telegramId, site, rule, by]
  )
  return { ok: true, site, rule, was }
}

/** The person's door only (routes.ts checks the actor). True if it was there. */
export async function removeSiteRule(
  q: Queryable,
  telegramId: string,
  raw: unknown
): Promise<boolean> {
  const site = siteOf(raw)
  if (!site) return false
  await ensureSiteRules(q)
  const { rows } = await q.query(
    `DELETE FROM browser_site_rules WHERE telegram_id = $1 AND site = $2
     RETURNING site`,
    [telegramId, site]
  )
  return rows.length > 0
}

/**
 * The sentence an agent gets at a blocked site. It names no way around,
 * because there is none it may take: the person unblocks, or the task skips
 * the site.
 */
export function blockedError(url: string): Error {
  let where = url
  try {
    where = new URL(url).host
  } catch {
    /* Keep the raw string; it is only for the message. */
  }
  return new Error(
    `${where} is on the person's blocked list: the agent does not open, read ` +
      'or act there, even with permission. Tell the person and skip it; only ' +
      'they can unblock it, in the Browser tab.'
  )
}

export const UNREADABLE_LIST =
  "the person's site list could not be read, so no page can be opened or " +
  'read until it can (we do not know where they said no). Try again shortly.'
