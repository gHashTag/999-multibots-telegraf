/**
 * THE BALL BOARD: EVERYTHING THE OWNER IS IN THE MIDDLE OF, BY CLIENT.
 *
 * Owner, 2026-10-01: compare the CRM's tasks with the mail contacts so the
 * work is tied by client, show where the ball is, and put everything in work
 * and every bug on the board -- "so I see the status of all tasks".
 *
 * The spec of record is gHashTag/t27 specs/automation/ball-board.t27, vendored
 * as src/spec/ball-board.t27 with its generated module; every number and name
 * below comes from there. The spec's `fn`s are implemented here, once, and
 * bound to the spec's tests by src/spec/ball-board.test.ts.
 *
 * THREE SOURCES, NONE RE-DERIVED
 *
 * - CRM: `crm_waiting` is CALLED with the caller's own context. Its scope
 *   gate and its `waitingOn` are the only ones; a second copy here is how two
 *   boards come to disagree about who is waiting (the 2-vs-316 incident in
 *   crm-touch-tools.ts).
 * - Mail: jcrm's `crm_matter_digest`, the table automation/mail-push already
 *   receives. jcrm decides what a matter is and who owes the reply; this side
 *   translates `owes_reply` and nothing else.
 * - Code work: open PRs and bugs, pushed by `tri ball push` from the owner's
 *   machine through `ball_work_push` -- the mail digest's pattern, so no
 *   GitHub token lives in production. Raw facts travel; the ball is computed
 *   HERE, at read time, so the rule has one home.
 *
 * Mail and code work are the owner's alone, and are refused BEFORE they are
 * read (the hive board's law): a source the caller may not see comes back as
 * `not_yours`, never as rows that happened to be filtered.
 *
 * v2, from the first live read: a domain link on a domain strangers share
 * (hh.ru was on 50 unrelated matters) is refused; a `title` link claims work
 * by its title's first word ("blog: ..."); every card names the .t27 spec it
 * stands on, and code work that names none is counted as `unspecced`.
 *
 * v3: the agent's browser is a fourth source, read for the CALLER'S OWN
 * session only -- the owner included. A card says what the agent is on and
 * whether it asks the person; it carries no token, endpoint or pod (those
 * columns are never selected) and opens the app's /game/browser view.
 *
 * v4: the caller's own meetings are a fifth source. An ended meeting nobody
 * answered is due, one starting within a day is ours. A card carries the five
 * MEETING_FIELDS -- never the tap or calendar token, the call link or the place.
 *
 * v5: jcrm owes the reply whenever the newest message is inbound, and a
 * machine's message always is. A matter whose every address is a machine's or
 * the owner's own domain has nobody to answer: its ball is none, and it is
 * counted as `automated`, never dropped.
 *
 * v6: hh.ru is a relay. An employer's message arrives from its no-reply
 * address, so an address on `RELAY_DOMAIN` is never a machine's.
 *
 * v7: jcrm keys a matter by domain, so a mailbox provider (gmail.com) is one
 * matter of many people under one stage. Such a matter is counted as `pooled`
 * and its card says so; the ball stays jcrm's -- there is no per-person stage
 * here to replace it. No CRM person matched a mail matter when measured, so
 * the CRM-mail join stays the explicit `ball_link`.
 */

import { ensureApprovals, pendingApprovalFor } from '../browser/approvals'
import { inputRequestView, pendingInput } from '../browser/input-request'
import { readJournal } from '../browser/journal'
import * as SPEC from '../spec/ball-board.gen'
import { TABLE as MEETINGS_TABLE } from '../spec/meeting-reminders.gen'
import * as GRANTS from '../spec/ball-grants.gen'
import {
  grantCovers,
  liveGrantsFor,
  mayReadMail,
  recordRead,
} from './ball-grants'
import { CRM_TOUCH_TOOLS } from './crm-touch-tools'
import { OWNER_TELEGRAM_ID, requireOwner } from './telegram-tools'
import type { AgentTool, ToolContext } from './tools'

type Pool = ToolContext['pool']
type Ball = 'ours' | 'due' | 'theirs' | 'none'
type Source = 'crm' | 'mail' | 'github' | 'browser' | 'meeting'
type LinkKind = 'email' | 'domain' | 'repo' | 'label' | 'title'

/* ------------------------------------------------------ the spec's decisions */

/** The spec's `mail_ball`: jcrm's owes_reply in the board's words. */
export function mailBall(owesReply: string | null | undefined): Ball {
  if (owesReply === 'us') return SPEC.BALL_OURS as Ball
  if (owesReply === 'them') return SPEC.BALL_THEIRS as Ball
  return SPEC.BALL_NONE as Ball
}

/** The spec's `work_ball`: whose move an open PR or issue is. */
export function workBall(
  isPr: boolean,
  reviewAskedOfOthers: boolean,
  waitingLabel: boolean
): Ball {
  if (isPr && reviewAskedOfOthers) return SPEC.BALL_THEIRS as Ball
  if (!isPr && waitingLabel) return SPEC.BALL_THEIRS as Ball
  return SPEC.BALL_OURS as Ball
}

/** The spec's `ball_rank`: the column's place, lower first. */
export function ballRank(ball: string): number {
  if (ball === SPEC.BALL_OURS) return 0
  if (ball === SPEC.BALL_DUE) return 1
  if (ball === SPEC.BALL_THEIRS) return 2
  return 3
}

/** The spec's `fresh`: a pushed snapshot is shown only while it is young. */
export function fresh(ageH: number): boolean {
  return ageH <= SPEC.STALE_H
}

/** The spec's `may_read`: an owner-only source is read for the owner only. */
export function mayRead(ownerOnly: boolean, callerIsOwner: boolean): boolean {
  return !ownerOnly || callerIsOwner
}

/** A label that puts an issue's move on somebody else. */
export function isWaitingLabel(label: string): boolean {
  return label.toLowerCase().includes(SPEC.WAITING_LABEL)
}

/** The spec's `shared_domain`: a domain many unrelated senders share. */
export function sharedDomain(domain: string): boolean {
  return SHARED_DOMAINS.has(domain.trim().toLowerCase())
}

// The spec's list, in the spec's order: job boards and ATSs, mailbox
// providers, lists and submission systems.
const SHARED_DOMAINS = new Set([
  'hh.ru',
  'getmatch.ru',
  'linkedin.com',
  'greenhouse.io',
  'lever.co',
  'workable.com',
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'mail.ru',
  'yandex.ru',
  'proton.me',
  'groups.io',
  'googlegroups.com',
  'editorialmanager.com',
  'github.com',
])

const LINK_KINDS: readonly string[] = [
  SPEC.LINK_EMAIL,
  SPEC.LINK_DOMAIN,
  SPEC.LINK_REPO,
  SPEC.LINK_LABEL,
  SPEC.LINK_TITLE,
]

/** The spec's `may_link`: only a domain link can claim strangers. */
export function mayLink(kind: string, value: string): boolean {
  if (kind === SPEC.LINK_DOMAIN && sharedDomain(value)) return false
  return LINK_KINDS.includes(kind)
}

/** A title's head: its first word, lower-cased, cut at the first ':' or space. */
export function titleHead(title: string): string {
  return title.trim().toLowerCase().split(/[:\s]/)[0] ?? ''
}

/** The spec's `title_claims`: a title link claims work by the title's head. */
export function titleClaims(head: string, value: string): boolean {
  return value !== '' && head === value
}

/** A .t27 path a title names, if any: a path under specs/ ending in .t27. */
export function specInTitle(title: string): string {
  return /\bspecs\/[\w./-]+\.t27\b/.exec(title)?.[0] ?? ''
}

/** The spec's `card_spec`: the title's path, else the source's spec of record. */
export function cardSpec(source: string, titleSpec: string): string {
  if (titleSpec !== '') return titleSpec
  if (source === SPEC.SOURCE_CRM) return SPEC.SPEC_OF_CRM
  if (source === SPEC.SOURCE_MAIL) return SPEC.SPEC_OF_MAIL
  if (source === SPEC.SOURCE_BROWSER) return SPEC.SPEC_OF_BROWSER
  if (source === SPEC.SOURCE_MEETING) return SPEC.SPEC_OF_MEETING
  return ''
}

/* ------------------------------------------------------------------ clients */

/* -------------------------------------------------- the agent's browser (v3) */

/** An open ask, or the person at the wheel, is the person's move. */
export function browserBall(
  asksPerson: boolean,
  personHasWheel: boolean
): Ball {
  return asksPerson || personHasWheel
    ? (SPEC.BALL_OURS as Ball)
    : (SPEC.BALL_THEIRS as Ball)
}

export function browserIsCard(state: string): boolean {
  return state === SPEC.STATE_LIVE || state === SPEC.STATE_STARTING
}

/**
 * The only browser_sessions columns a card may carry. Everything else there is
 * a key to the stream or the pod, so the read SELECTs exactly these -- a column
 * added later is refused by default, never leaked by a `SELECT *`.
 */
export const BROWSER_FIELDS = [
  'state',
  'last_seen_at',
  'person_wheel_until',
] as const

export function browserFieldShown(field: string): boolean {
  return (BROWSER_FIELDS as readonly string[]).includes(field)
}

export function browserVisible(rowIsCallers: boolean): boolean {
  return rowIsCallers
}

/* ------------------------------------------------------- meetings (v4) */

/** The spec's `meeting_ball`: an ended, unanswered meeting is due; a near one is ours. */
export function meetingBall(
  ended: boolean,
  answered: boolean,
  startsSoon: boolean
): Ball {
  if (ended && !answered) return SPEC.BALL_DUE as Ball
  if (ended) return SPEC.BALL_NONE as Ball
  if (startsSoon) return SPEC.BALL_OURS as Ball
  return SPEC.BALL_NONE as Ball
}

/**
 * The only meeting columns a card may carry. The tap and calendar tokens are
 * keys, the call link and the place are the person's own, so the read SELECTs
 * exactly these -- a column added later is refused by default.
 */
export const MEETING_FIELDS = [
  'title',
  'starts_at',
  'ends_at',
  'mode',
  'status',
] as const

export function meetingFieldShown(field: string): boolean {
  return (MEETING_FIELDS as readonly string[]).includes(field)
}

/** The page a journal step was on, without its query or fragment. */
function bareUrl(detail: Record<string, unknown> | null | undefined): string {
  const u = detail?.url
  if (typeof u !== 'string') return ''
  try {
    const x = new URL(u)
    return `${x.host}${x.pathname === '/' ? '' : x.pathname}`
  } catch {
    return ''
  }
}

export interface Link {
  client: string
  kind: LinkKind
  value: string
}

/**
 * The key a client is grouped under. A CRM person is their telegram id; a
 * link whose client is all digits names that same person, which is exactly
 * how a mail matter joins the row of the Telegram contact it belongs to.
 */
export function clientKey(client: string): string {
  const c = client.trim()
  return /^\d+$/.test(c) ? `tg:${c}` : `name:${c.toLowerCase()}`
}

function addressOf(raw: string): string {
  const angled = /<([^<>]+)>/.exec(raw)
  return (angled ? angled[1] : raw).trim().toLowerCase()
}

// The spec's `automated_marker` list, in the spec's order.
const AUTOMATED_MARKERS = [
  'noreply',
  'donotreply',
  'mailerdaemon',
  'postmaster',
  'bounce',
  'dmarc',
  'notification',
] as const

export function automatedMarker(marker: string): boolean {
  return (AUTOMATED_MARKERS as readonly string[]).includes(marker)
}

/** A machine's address (a marker, separators removed) or the owner's own domain. */
export function relayDomain(domain: string): boolean {
  return (
    domain === SPEC.RELAY_DOMAIN || domain.endsWith(`.${SPEC.RELAY_DOMAIN}`)
  )
}

export function machineOrOwn(raw: string): boolean {
  const a = addressOf(raw)
  const domain = a.split('@')[1] ?? ''
  if (domain === SPEC.OWN_DOMAIN || domain.endsWith(`.${SPEC.OWN_DOMAIN}`))
    return true
  // A relay's no-reply delivers a person's words (v6): never a machine.
  if (relayDomain(domain)) return false
  const flat = a.replace(/[.\-_+]/g, '')
  return AUTOMATED_MARKERS.some(m => flat.includes(m))
}

/** The spec's `nobody_to_answer`: a matter with no address is not judged. */
export function nobodyToAnswer(
  addresses: number,
  machineOrOwnN: number
): boolean {
  return addresses > 0 && machineOrOwnN === addresses
}

/** The spec's `pooled_matter`: a shared-domain matter with more than one person. */
export function pooledMatter(matterIsShared: boolean, people: number): boolean {
  return matterIsShared && people > 1
}

/** The spec's `mail_ball_weighed`: nobody to answer is none, else jcrm's call. */
export function mailBallWeighed(
  owesReply: string | null | undefined,
  nobody: boolean
): Ball {
  return nobody ? (SPEC.BALL_NONE as Ball) : mailBall(owesReply)
}

/** The client of a mail matter: an exact address link first, then a domain. */
export function mailClient(
  counterparties: string[],
  links: Link[]
): string | null {
  const addrs = counterparties.map(addressOf)
  for (const a of addrs) {
    const hit = links.find(
      l => l.kind === SPEC.LINK_EMAIL && l.value.toLowerCase() === a
    )
    if (hit) return hit.client
  }
  for (const a of addrs) {
    const domain = a.split('@')[1]
    if (!domain) continue
    const hit = links.find(
      l => l.kind === SPEC.LINK_DOMAIN && l.value.toLowerCase() === domain
    )
    if (hit) return hit.client
  }
  return null
}

/**
 * The client of a PR or issue: a label link first, then a title link, then
 * its repository -- the more specific claim first.
 */
export function workClient(
  repo: string,
  labels: string[],
  links: Link[],
  title = ''
): string | null {
  const lower = labels.map(l => l.toLowerCase())
  const byLabel = links.find(
    l => l.kind === SPEC.LINK_LABEL && lower.includes(l.value.toLowerCase())
  )
  if (byLabel) return byLabel.client
  const head = titleHead(title)
  const byTitle = links.find(
    l => l.kind === SPEC.LINK_TITLE && titleClaims(head, l.value.toLowerCase())
  )
  if (byTitle) return byTitle.client
  const byRepo = links.find(
    l =>
      l.kind === SPEC.LINK_REPO && l.value.toLowerCase() === repo.toLowerCase()
  )
  return byRepo ? byRepo.client : null
}

/* -------------------------------------------------------------------- cards */

export interface Card {
  source: Source
  ref: string
  title: string
  ball: Ball
  days: number | null
  because: string | null
  link: string | null
  /** The .t27 spec the card stands on, or null when it names none. */
  spec: string | null
}

export interface ClientRow {
  key: string
  name: string
  cards: Card[]
  ball: Ball
}

/**
 * Cards into client rows. A row's ball is its most urgent card's; rows run by
 * that, then by the longest wait inside it, so the first row is the first
 * thing to do.
 */
export function groupByClient(
  entries: Array<{ key: string; name: string; card: Card }>
): ClientRow[] {
  const rows = new Map<string, ClientRow>()
  for (const e of entries) {
    const row = rows.get(e.key) ?? {
      key: e.key,
      name: e.name,
      cards: [],
      ball: SPEC.BALL_NONE as Ball,
    }
    // A Telegram name beats a link's bare id or a matter's subject line.
    if (e.key.startsWith('tg:') && e.card.source === 'crm') row.name = e.name
    row.cards.push(e.card)
    if (ballRank(e.card.ball) < ballRank(row.ball)) row.ball = e.card.ball
    rows.set(e.key, row)
  }
  const oldest = (r: ClientRow) =>
    Math.max(-1, ...r.cards.map(c => c.days ?? -1))
  for (const r of rows.values()) {
    r.cards.sort(
      (a, b) =>
        ballRank(a.ball) - ballRank(b.ball) || (b.days ?? -1) - (a.days ?? -1)
    )
  }
  return [...rows.values()].sort(
    (a, b) => ballRank(a.ball) - ballRank(b.ball) || oldest(b) - oldest(a)
  )
}

/* ----------------------------------------------------------------- storage */

export async function ensureBallTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SPEC.WORK_TABLE} (
      ref text PRIMARY KEY,
      repo text NOT NULL,
      kind text NOT NULL,
      number int NOT NULL,
      title text NOT NULL,
      url text,
      author text,
      draft boolean NOT NULL DEFAULT false,
      review_asked_of_others boolean NOT NULL DEFAULT false,
      labels text[] NOT NULL DEFAULT '{}',
      updated_at timestamptz,
      exported_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SPEC.LINK_TABLE} (
      owner text NOT NULL,
      client text NOT NULL,
      kind text NOT NULL,
      value text NOT NULL,
      PRIMARY KEY (owner, client, kind, value)
    )
  `)
}

/** The owner's links: what a granted viewer's mail cards are grouped by. */
async function ownerLinks(pool: Pool): Promise<Link[]> {
  await ensureBallTables(pool)
  const r = await pool.query(
    `SELECT client, kind, value FROM ${SPEC.LINK_TABLE} WHERE owner = $1`,
    [OWNER_TELEGRAM_ID]
  )
  return (r.rows ?? []) as Link[]
}

function callerIsOwner(ctx: ToolContext): boolean {
  try {
    requireOwner(ctx)
    return true
  } catch {
    return false
  }
}

function ageH(at: string | Date | null | undefined): number {
  if (!at) return Infinity
  const ms = Date.now() - new Date(at).getTime()
  return Number.isFinite(ms) ? Math.max(0, ms / 3_600_000) : Infinity
}

function daysSince(at: string | Date | null | undefined): number | null {
  const h = ageH(at)
  return Number.isFinite(h) ? Math.floor(h / 24) : null
}

interface SourceStatus {
  status: 'ok' | 'empty' | 'stale' | 'not_yours' | 'unreachable'
  cards: number
  age_h?: number
  why?: string
}

/* -------------------------------------------------------------------- tools */

const crmWaiting = () => {
  const t = CRM_TOUCH_TOOLS.find(x => x.name === SPEC.CRM_TOOL)
  if (!t) throw new Error(`${SPEC.CRM_TOOL} is not registered`)
  return t
}

export const BALL_BOARD_TOOLS: AgentTool[] = [
  {
    name: SPEC.TOOL,
    description:
      'Board of everything in progress, grouped by client: CRM people, mail matters, open PRs and bugs, ' +
      "and the caller's own AI-browser session (what the agent is on, whether it asks the person). " +
      'Each card says whose move it is (ours / due / theirs / none). Sends nothing.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx: ToolContext) {
      const owner = callerIsOwner(ctx)
      const entries: Array<{ key: string; name: string; card: Card }> = []
      // Mail matters only machines or the owner wrote (AUTOMATED_IS_COUNTED).
      let automated = 0
      // Matters that are a mailbox provider, not one client (POOLED_IS_COUNTED).
      let pooled = 0
      const sources: Record<Source, SourceStatus> = {
        crm: { status: 'empty', cards: 0 },
        mail: { status: 'empty', cards: 0 },
        github: { status: 'empty', cards: 0 },
        browser: { status: 'empty', cards: 0 },
        meeting: { status: 'empty', cards: 0 },
      }

      // Links are the owner's; anybody else simply has none to apply.
      let links: Link[] = []
      if (owner) {
        await ensureBallTables(ctx.pool)
        const r = await ctx.pool.query(
          `SELECT client, kind, value FROM ${SPEC.LINK_TABLE} WHERE owner = $1`,
          [String(ctx.telegramId)]
        )
        links = (r.rows ?? []) as Link[]
      }

      // CRM: called, with the caller's context -- its gate is the gate.
      try {
        const w = (await crmWaiting().handler({}, ctx)) as {
          waiting?: Array<Record<string, unknown>>
        }
        for (const p of w?.waiting ?? []) {
          const id = String(p.telegram_id)
          entries.push({
            key: clientKey(id),
            name: String(p.name ?? id),
            card: {
              source: 'crm',
              ref: id,
              title: String(p.next_why ?? p.because ?? ''),
              ball: (String(p.waiting) as Ball) || (SPEC.BALL_NONE as Ball),
              days: typeof p.days === 'number' ? p.days : null,
              because: p.because ? String(p.because) : null,
              link: p.link ? String(p.link) : null,
              spec: cardSpec(SPEC.SOURCE_CRM, '') || null,
            },
          })
          sources.crm.cards += 1
        }
        sources.crm.status = sources.crm.cards ? 'ok' : 'empty'
      } catch (e) {
        sources.crm = {
          status: 'unreachable',
          cards: 0,
          why: e instanceof Error ? e.message : String(e),
        }
      }

      // Mail: the owner's -- or a viewer's the owner granted it to
      // (automation/ball-grants) -- refused before the read either way.
      const grants = owner
        ? []
        : await liveGrantsFor(ctx.pool, String(ctx.telegramId)).catch(
            () => [] as string[]
          )
      const grantKeys = grants.map(g =>
        g === GRANTS.ALL_CLIENTS ? g : clientKey(g)
      )
      // MAIL_OWNER_ONLY, with the owner's one exception: a live grant.
      if (!mayReadMail(owner, grants.length > 0)) {
        sources.mail = { status: 'not_yours', cards: 0 }
      } else {
        try {
          // A viewer's cards find their client through the OWNER's links,
          // applied here; the links themselves never leave the server.
          const mailLinks = owner ? links : await ownerLinks(ctx.pool)
          const r = await ctx.pool.query(
            `SELECT matter, stage, owes_reply, days_since, next_action,
                    counterparties, exported_at
             FROM ${SPEC.MAIL_TABLE}`
          )
          const rows = r.rows ?? []
          const newest = Math.min(...rows.map(x => ageH(x.exported_at)))
          if (rows.length && !fresh(newest)) {
            sources.mail = {
              status: 'stale',
              cards: 0,
              age_h: Math.round(newest),
            }
          } else {
            for (const m of rows) {
              if (!fresh(ageH(m.exported_at))) continue
              const cps: string[] = m.counterparties ?? []
              const linked = mailClient(cps, mailLinks)
              // A viewer gets only the clients granted, never an unlinked
              // matter, and no count of the rest -- so this comes before the
              // automated/pooled counters below.
              if (
                !owner &&
                !grantKeys.some(g =>
                  grantCovers(g, linked ? clientKey(linked) : '')
                )
              )
                continue
              const nobody = nobodyToAnswer(
                cps.length,
                cps.filter(machineOrOwn).length
              )
              if (nobody) automated += 1
              const people = cps.filter(a => !machineOrOwn(a)).length
              const pool = pooledMatter(sharedDomain(String(m.matter)), people)
              if (pool) pooled += 1
              entries.push({
                key: linked ? clientKey(linked) : `mail:${m.matter}`,
                name: linked ?? String(m.matter),
                card: {
                  source: 'mail',
                  ref: String(m.matter),
                  title: String(m.next_action ?? m.stage ?? m.matter),
                  ball: mailBallWeighed(m.owes_reply, nobody),
                  days: typeof m.days_since === 'number' ? m.days_since : null,
                  because: nobody
                    ? 'only machines or our own address wrote'
                    : pool
                      ? `${people} people share ${m.matter}: one stage for all of them`
                      : m.stage
                        ? String(m.stage)
                        : null,
                  link: null,
                  spec: cardSpec(SPEC.SOURCE_MAIL, '') || null,
                },
              })
              sources.mail.cards += 1
            }
            sources.mail.status = sources.mail.cards ? 'ok' : 'empty'
            if (rows.length) sources.mail.age_h = Math.round(newest)
            // The owner sees who looked (ball-grants READ_RECORDED).
            if (!owner) await recordRead(ctx.pool, String(ctx.telegramId))
          }
        } catch (e) {
          sources.mail = {
            status: 'unreachable',
            cards: 0,
            why: e instanceof Error ? e.message : String(e),
          }
        }
      }

      // Code work: the owner's, refused before the read.
      if (!mayRead(SPEC.WORK_OWNER_ONLY, owner)) {
        sources.github = { status: 'not_yours', cards: 0 }
      } else {
        const r = await ctx.pool.query(
          `SELECT ref, repo, kind, number, title, url, draft,
                  review_asked_of_others, labels, updated_at, exported_at
           FROM ${SPEC.WORK_TABLE}`
        )
        const rows = r.rows ?? []
        const newest = Math.min(...rows.map(x => ageH(x.exported_at)))
        if (rows.length && !fresh(newest)) {
          sources.github = {
            status: 'stale',
            cards: 0,
            age_h: Math.round(newest),
          }
        } else {
          for (const w of rows) {
            const isPr = w.kind === 'pr'
            const labels: string[] = w.labels ?? []
            const linked = workClient(w.repo, labels, links, String(w.title))
            entries.push({
              key: linked ? clientKey(linked) : `name:${SPEC.PROJECT_CLIENT}`,
              name: linked ?? SPEC.PROJECT_CLIENT,
              card: {
                source: 'github',
                ref: w.ref,
                title: `${isPr ? 'PR' : 'issue'} #${w.number} ${w.title}`,
                ball: workBall(
                  isPr,
                  Boolean(w.review_asked_of_others),
                  labels.some(isWaitingLabel)
                ),
                days: daysSince(w.updated_at),
                because: isPr
                  ? w.draft
                    ? 'draft'
                    : w.review_asked_of_others
                      ? 'review asked of others'
                      : 'open, awaits our merge'
                  : labels.join(', ') || null,
                link: w.url ?? null,
                spec:
                  cardSpec(SPEC.SOURCE_WORK, specInTitle(String(w.title))) ||
                  null,
              },
            })
            sources.github.cards += 1
          }
          sources.github.status = sources.github.cards ? 'ok' : 'empty'
          if (rows.length) sources.github.age_h = Math.round(newest)
        }
      }

      // The agent's browser: the caller's own session, whoever the caller is
      // (BROWSER_OWN_ONLY). Only BROWSER_FIELDS are selected; the card opens
      // the app's own view (BROWSER_OPEN_AT), never the stream.
      try {
        const me = String(ctx.telegramId)
        const r = await ctx.pool.query(
          `SELECT telegram_id, ${BROWSER_FIELDS.join(', ')}
             FROM browser_sessions WHERE telegram_id = $1`,
          [me]
        )
        const row = (r.rows ?? []).find(x =>
          browserVisible(String(x.telegram_id) === me)
        )
        if (row && browserIsCard(String(row.state))) {
          const ask = inputRequestView(pendingInput(me))
          await ensureApprovals(ctx.pool)
          const approval = await pendingApprovalFor(
            ctx.pool,
            me,
            SPEC.ASK_TTL_MIN * 60_000
          )
          const wheel =
            row.person_wheel_until != null &&
            new Date(row.person_wheel_until).getTime() > Date.now()
          const [last] = await readJournal(ctx.pool, me, 1, { probes: false })
          const lastStep = last
            ? `${last.tool}${bareUrl(last.detail) ? ` ${bareUrl(last.detail)}` : ''}`
            : null
          const title = ask
            ? `asks: ${ask.why || ask.label || ask.kind}`
            : approval
              ? `asks to approve: ${approval.what}`
              : wheel
                ? 'you hold the wheel'
                : (lastStep ?? `browser ${row.state}`)
          entries.push({
            key: `name:${SPEC.SOURCE_BROWSER}`,
            name: SPEC.SOURCE_BROWSER,
            card: {
              source: 'browser',
              ref: me,
              title,
              ball: browserBall(Boolean(ask || approval), wheel),
              days: daysSince(row.last_seen_at),
              because: ask || approval ? lastStep : String(row.state),
              link: SPEC.BROWSER_OPEN_AT,
              spec: cardSpec(SPEC.SOURCE_BROWSER, '') || null,
            },
          })
          sources.browser.cards += 1
        }
        sources.browser.status = sources.browser.cards ? 'ok' : 'empty'
      } catch (e) {
        // No browser was ever started here: no table is no browser, not an outage.
        const msg = e instanceof Error ? e.message : String(e)
        sources.browser = /does not exist/.test(msg)
          ? { status: 'empty', cards: 0 }
          : { status: 'unreachable', cards: 0, why: msg }
      }

      // Meetings: the caller's own (MEETING_OWN_ONLY), open, from
      // MEETING_ASK_BACK_H behind to MEETING_AHEAD_H ahead. Only MEETING_FIELDS
      // are selected; a card has no link -- the call link is not the board's.
      try {
        const r = await ctx.pool.query(
          `SELECT id, ${MEETING_FIELDS.join(', ')}
             FROM ${MEETINGS_TABLE}
            WHERE telegram_id = $1 AND status = $2
              AND starts_at < now() + make_interval(hours => $3)
              AND ends_at > now() - make_interval(hours => $4)
            ORDER BY starts_at`,
          [
            String(ctx.telegramId),
            SPEC.MEETING_OPEN_STATUS,
            SPEC.MEETING_AHEAD_H,
            SPEC.MEETING_ASK_BACK_H,
          ]
        )
        const now = Date.now()
        for (const m of r.rows ?? []) {
          const starts = new Date(m.starts_at).getTime()
          const ended = new Date(m.ends_at).getTime() <= now
          const ball = meetingBall(
            ended,
            String(m.status) !== SPEC.MEETING_OPEN_STATUS,
            !ended && starts - now <= SPEC.MEETING_SOON_H * 3_600_000
          )
          entries.push({
            key: `name:${SPEC.SOURCE_MEETING}`,
            name: SPEC.SOURCE_MEETING,
            card: {
              source: 'meeting',
              ref: String(m.id),
              title: String(m.title),
              ball,
              days: ended ? daysSince(m.ends_at) : null,
              because: ended
                ? 'ended, not answered'
                : `${m.mode} ${new Date(m.starts_at).toISOString()}`,
              link: null,
              spec: cardSpec(SPEC.SOURCE_MEETING, '') || null,
            },
          })
          sources.meeting.cards += 1
        }
        sources.meeting.status = sources.meeting.cards ? 'ok' : 'empty'
      } catch (e) {
        // Nobody ever booked a meeting here: no table is no meetings, not an outage.
        const msg = e instanceof Error ? e.message : String(e)
        sources.meeting = /does not exist/.test(msg)
          ? { status: 'empty', cards: 0 }
          : { status: 'unreachable', cards: 0, why: msg }
      }

      const clients = groupByClient(entries)
      const counts = { ours: 0, due: 0, theirs: 0, none: 0 }
      for (const e of entries) counts[e.card.ball] += 1
      // A card with no spec is counted, never given one (UNSPECCED_IS_COUNTED).
      const unspecced = entries.filter(e => !e.card.spec).length
      // Counts over everything; only CARDS_MAX cards travel.
      let budget = SPEC.CARDS_MAX
      const shown = clients
        .map(c => {
          const cards = c.cards.slice(0, Math.max(0, budget))
          budget -= cards.length
          return { ...c, cards, hidden: c.cards.length - cards.length }
        })
        .filter(c => c.cards.length > 0)
      return {
        total: entries.length,
        counts,
        unspecced,
        automated,
        pooled,
        sources,
        clients: shown,
        clients_total: clients.length,
      }
    },
  },
  {
    name: SPEC.PUSH_TOOL,
    description:
      'Owner only. Replace the open-work snapshot of the given repositories (PRs and issues).',
    parameters: {
      type: 'object',
      properties: {
        repos: { type: 'array', items: { type: 'string' } },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              repo: { type: 'string' },
              kind: { type: 'string', enum: ['pr', 'issue'] },
              number: { type: 'number' },
              title: { type: 'string' },
              url: { type: ['string', 'null'] },
              author: { type: ['string', 'null'] },
              draft: { type: 'boolean' },
              review_asked_of_others: { type: 'boolean' },
              labels: { type: 'array', items: { type: 'string' } },
              updated_at: { type: ['string', 'null'] },
            },
            required: ['repo', 'kind', 'number', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['repos', 'items'],
      additionalProperties: false,
    },
    async handler(args, ctx: ToolContext) {
      requireOwner(ctx)
      await ensureBallTables(ctx.pool)
      const repos: string[] = (args.repos ?? []).map(String)
      if (!repos.length)
        throw new Error('repos must name at least one repository')
      const refused: Array<{ ref: string; why: string }> = []
      const good = (args.items ?? []).filter((it: Record<string, unknown>) => {
        const ref = `${it.repo}#${it.number}`
        if (!repos.includes(String(it.repo))) {
          refused.push({ ref, why: 'repo is not in this push' })
          return false
        }
        return true
      })
      // The snapshot IS the truth of its repos (SNAPSHOT_REPLACES): what is
      // not in it was closed or merged, and leaves the board. Upsert first,
      // prune after: a pool hands each query its own connection, so a BEGIN
      // here would wrap nothing, and in this order a failure halfway leaves
      // a closed PR shown a little longer -- never an open one missing.
      const refs: string[] = []
      for (const it of good) {
        const ref = `${it.repo}#${it.number}`
        refs.push(ref)
        await ctx.pool.query(
          `INSERT INTO ${SPEC.WORK_TABLE}
             (ref, repo, kind, number, title, url, author, draft,
              review_asked_of_others, labels, updated_at, exported_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
           ON CONFLICT (ref) DO UPDATE SET
             kind = $3, title = $5, url = $6, author = $7, draft = $8,
             review_asked_of_others = $9, labels = $10, updated_at = $11,
             exported_at = now()`,
          [
            ref,
            it.repo,
            it.kind,
            it.number,
            it.title,
            it.url ?? null,
            it.author ?? null,
            Boolean(it.draft),
            Boolean(it.review_asked_of_others),
            (it.labels ?? []).map(String),
            it.updated_at ?? null,
          ]
        )
      }
      await ctx.pool.query(
        `DELETE FROM ${SPEC.WORK_TABLE}
         WHERE repo = ANY($1) AND NOT (ref = ANY($2))`,
        [repos, refs]
      )
      return {
        accepted: good.length,
        repos,
        refused,
        stamped_by: 'receiver clock',
      }
    },
  },
  {
    name: SPEC.LINK_TOOL,
    description:
      'Owner only. Tie an email, domain, repo, label or title head (e.g. "blog") to a client ' +
      '(a CRM telegram id or a name), or untie it. A domain many strangers share (hh.ru, gmail.com) is refused.',
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        kind: {
          type: 'string',
          enum: ['email', 'domain', 'repo', 'label', 'title'],
        },
        value: { type: 'string' },
        remove: { type: 'boolean' },
      },
      required: ['client', 'kind', 'value'],
      additionalProperties: false,
    },
    async handler(args, ctx: ToolContext) {
      requireOwner(ctx)
      await ensureBallTables(ctx.pool)
      const client = String(args.client ?? '').trim()
      const kind = String(args.kind ?? '') as LinkKind
      const value = String(args.value ?? '')
        .trim()
        .toLowerCase()
      if (!client || !value)
        throw new Error('client and value must be non-empty')
      if (!LINK_KINDS.includes(kind))
        throw new Error(`kind must be ${LINK_KINDS.join(', ')}`)
      // Untying is always allowed: a link set before v2 must be removable.
      if (!args.remove && !mayLink(kind, value))
        throw new Error(
          `${value} is shared by many unrelated senders -- link the address, not the domain`
        )
      const owner = String(ctx.telegramId)
      if (args.remove) {
        await ctx.pool.query(
          `DELETE FROM ${SPEC.LINK_TABLE}
           WHERE owner = $1 AND client = $2 AND kind = $3 AND value = $4`,
          [owner, client, kind, value]
        )
        return { removed: { client, kind, value } }
      }
      await ctx.pool.query(
        `INSERT INTO ${SPEC.LINK_TABLE} (owner, client, kind, value)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [owner, client, kind, value]
      )
      return { linked: { client, kind, value } }
    },
  },
]

/** For the binding test: the owner the gate compares against. */
export const BALL_OWNER = OWNER_TELEGRAM_ID
