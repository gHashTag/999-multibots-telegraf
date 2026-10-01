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
 */

import * as SPEC from '../spec/ball-board.gen'
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
type Source = 'crm' | 'mail' | 'github'
type LinkKind = 'email' | 'domain' | 'repo' | 'label'

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

/* ------------------------------------------------------------------ clients */

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

/** The client of a PR or issue: a label link first, then its repository. */
export function workClient(
  repo: string,
  labels: string[],
  links: Link[]
): string | null {
  const lower = labels.map(l => l.toLowerCase())
  const byLabel = links.find(
    l => l.kind === SPEC.LINK_LABEL && lower.includes(l.value.toLowerCase())
  )
  if (byLabel) return byLabel.client
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
      'Board of everything in progress, grouped by client: CRM people, mail matters, open PRs and bugs. ' +
      'Each card says whose move it is (ours / due / theirs / none). Sends nothing.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx: ToolContext) {
      const owner = callerIsOwner(ctx)
      const entries: Array<{ key: string; name: string; card: Card }> = []
      const sources: Record<Source, SourceStatus> = {
        crm: { status: 'empty', cards: 0 },
        mail: { status: 'empty', cards: 0 },
        github: { status: 'empty', cards: 0 },
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
              const linked = mailClient(m.counterparties ?? [], mailLinks)
              // A viewer gets only the clients granted, never an unlinked
              // matter, and no count of the rest.
              if (
                !owner &&
                !grantKeys.some(g =>
                  grantCovers(g, linked ? clientKey(linked) : '')
                )
              )
                continue
              entries.push({
                key: linked ? clientKey(linked) : `mail:${m.matter}`,
                name: linked ?? String(m.matter),
                card: {
                  source: 'mail',
                  ref: String(m.matter),
                  title: String(m.next_action ?? m.stage ?? m.matter),
                  ball: mailBall(m.owes_reply),
                  days: typeof m.days_since === 'number' ? m.days_since : null,
                  because: m.stage ? String(m.stage) : null,
                  link: null,
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
            const linked = workClient(w.repo, labels, links)
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
              },
            })
            sources.github.cards += 1
          }
          sources.github.status = sources.github.cards ? 'ok' : 'empty'
          if (rows.length) sources.github.age_h = Math.round(newest)
        }
      }

      const clients = groupByClient(entries)
      const counts = { ours: 0, due: 0, theirs: 0, none: 0 }
      for (const e of entries) counts[e.card.ball] += 1
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
      'Owner only. Tie an email, domain, repo or label to a client (a CRM telegram id or a name), or untie it.',
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        kind: { type: 'string', enum: ['email', 'domain', 'repo', 'label'] },
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
      if (
        ![SPEC.LINK_EMAIL, SPEC.LINK_DOMAIN, SPEC.LINK_REPO, SPEC.LINK_LABEL]
          .map(String)
          .includes(kind)
      ) {
        throw new Error(`kind must be email, domain, repo or label`)
      }
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
