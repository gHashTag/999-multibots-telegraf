/**
 * THE HIVE JOURNAL -- WHAT HAPPENS, AND WHO GETS TO SEE IT.
 *
 * Owner, 2026-09-07: "the Queen should see every event and I am the
 * super-admin", and "show me the bot logs right in the agent chat -- the pulse
 * of the project, so I can react in time".
 *
 * MEASURED BEFORE CREATING A NEW TABLE
 *
 * On 2026-09-07 every write path in both repositories was surveyed. Result:
 *
 *   - There is NO general event log. Of the 19 tables that actually exist in
 *     Supabase, not one is one. Names such as `ai_requests` and
 *     `bot_skills_log` appear in code but are absent from the database, so
 *     `skillManager.ts:41` writes into nothing.
 *
 *   - `payments_v2` is the only cross-cutting stream, but it covers money
 *     alone, and it is NOT append-only: `status` is rewritten in six places.
 *     As evidence of what happened it does not qualify.
 *
 *   - trios has `gardener_decisions` and `railway_audit_events`. Both are
 *     append-only, and both have zero readers. That is how this kind of work
 *     dies: the journal is written, nobody looks at it, and a month later it
 *     is just occupying space.
 *
 * Hence the rule of this file: the reader (`feed`) is written together with the
 * writer and wired to the pulse the same day. A journal without a screen is not
 * started here.
 *
 * THE VISIBILITY BORDER -- THE MAIN THING IN THIS FILE
 *
 * By construction the journal holds the events of ALL clients. That makes it
 * the most dangerous place in the system: one unfiltered read, and a bot owner
 * sees a neighbour's revenue.
 *
 * So it may be read ONLY through `visibilityOf` from `roles.ts`:
 *
 *   keeper -- the whole farm;
 *   owner  -- events of THEIR bots plus their own;
 *   bee    -- their own only.
 *
 * An event with no `bot_name` is visible to its subject and to the keeper. That
 * is neither a detail nor a rare case: the survey found the tenant knowable at
 * only 8 sites out of 31. A rejected Robokassa signature knows only the invoice
 * id; a refused pairing claim knows nobody at all. An unknown tenant is a
 * reason to hide, not to show widely.
 *
 * WHAT DOES NOT GO IN HERE
 *
 * No message text, no prompts, no phone numbers, no tokens, no file links. The
 * journal answers "what happened and to whom", not "what the person wrote".
 * Otherwise it becomes a second store of personal data -- with the same duties
 * and nobody's consent.
 */

import { type Visibility, botFilter } from './roles'

export interface JournalPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

/**
 * What happened. A closed list: a free-form string turns the feed into noise,
 * and in six months into forty spellings of the same thing.
 *
 * Kinds are named after the RESULT, not the route: `sign-in`, not
 * `POST /api/auth/telegram`. Routes get renamed; the event stays the same.
 */
export type EventKind =
  // access
  | 'sign-in'
  | 'sign-in-refused'
  | 'code-issued'
  | 'code-claimed'
  | 'code-refused'
  | 'sign-out'
  | 'telegram-connected'
  | 'telegram-disconnected'
  // money
  | 'payment'
  /** An invoice left the cashier; nothing has followed yet. */
  | 'invoice'
  /** Telegram or the cashier refused; the person did not pay. */
  | 'payment-failed'
  /** The person closed the cashier without paying. */
  | 'payment-cancelled'
  | 'payment-lost'
  | 'payment-forged'
  | 'tokens-spent'
  | 'tokens-refunded'
  // content
  | 'created'
  | 'published'
  | 'unpublished'
  | 'approved'
  // the seller's proactive sweep (bot service, via /api/hive/note)
  | 'sweep-idle'
  | 'sweep-card'
  | 'sweep-failed'
  /*
   * THE PRESS ITSELF. The central act of this product left no trace anywhere.
   *
   * A confirmed card wrote a `written` touch only when the draft carried a
   * lead, the log line for a successful press does not exist, and the journal
   * had nothing for it. So "how often does the owner press" -- the number the
   * whole design's throughput IS -- could not be answered from production at
   * all. An investigation on 2026-09-16 named it as the one thing it could
   * not establish, and it was right: there was nothing to read.
   */
  | 'card-pressed'
  /*
   * A DRAWING NOBODY SENT IS A COST, NOT A FAILURE.
   *
   * One draft per owner, so a later proposal -- including the owner's own
   * next question -- replaces a waiting card, and a picture that was already
   * paid for at the provider goes unseen. That is expected behaviour with a
   * price, and it was being written as `failure`.
   *
   * Measured 2026-09-16: FORTY-ONE of the forty-one failures in the journal's
   * window were this one line. A channel where every entry is the same entry
   * is not a channel -- and the thing it was burying is the one that matters,
   * `tokens-refunded` turning into `failure` when a refund does NOT go
   * through. Somebody's money not coming back must not sit in a list of
   * eight-a-day expected events.
   */
  | 'draft-unsent'
  // other
  | 'failure'

/**
 * How urgent this is FOR A PERSON, not for a log.
 *
 * Not a "log level": the pulse has a different job. `alarm` means "look now, or
 * we lose money or let a stranger in". Everything else is read when there is
 * time.
 */
export type Severity = 'normal' | 'attention' | 'alarm'

export interface HiveEvent {
  kind: EventKind
  /** Whose event this is. Empty means nobody's, and only a keeper may see it. */
  who?: string | null
  /** Whose bot. Empty means outside a tenant: subject and keeper only. */
  bot?: string | null
  amount?: number | null
  /** A short human note: "video, 6 scenes" -- NOT a prompt and not a link. */
  what?: string | null
  severity?: Severity
}

let tableReady = false

export async function ensureJournalTable(pool: JournalPool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS hive_events (
       id bigserial PRIMARY KEY,
       kind text NOT NULL,
       who text,
       bot text,
       amount numeric,
       what text,
       severity text NOT NULL DEFAULT 'normal',
       at timestamptz NOT NULL DEFAULT now()
     )`
  )
  // The feed is always read as "the latest", and almost always filtered by
  // subject or by bot. Without these indexes it gets slow at the first ten
  // thousand rows -- exactly where people start looking at it.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS hive_events_recent ON hive_events (at DESC, id DESC)`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS hive_events_who ON hive_events (who, at DESC)`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS hive_events_bot ON hive_events (bot, at DESC)`
  )
  tableReady = true
}

/** For tests only. */
export function forgetTable(): void {
  tableReady = false
}

/**
 * Record an event. NEVER throws and never waits long.
 *
 * The journal is observation, not part of the deed. A failed write must not
 * cancel a payment, a publish or a sign-in: an event for whose sake the action
 * was broken is no longer observation, it is interference. For the same reason
 * callers are free not to await it (`void record(...)`).
 */
export async function record(
  pool: JournalPool,
  e: HiveEvent
): Promise<'recorded' | 'not recorded'> {
  try {
    await ensureJournalTable(pool)
    await pool.query(
      `INSERT INTO hive_events (kind, who, bot, amount, what, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        e.kind,
        (e.who ?? '').toString().trim() || null,
        (e.bot ?? '').toString().trim() || null,
        e.amount ?? null,
        // Trimmed: a note for a person, not a place for a prompt.
        e.what ? String(e.what).slice(0, 200) : null,
        e.severity ?? 'normal',
      ]
    )
    return 'recorded'
  } catch {
    return 'not recorded'
  }
}

export interface JournalRow {
  id: number
  kind: string
  who: string | null
  bot: string | null
  amount: number | null
  what: string | null
  severity: string
  at: string
}

/**
 * The event feed WITHIN THE SCOPE OF VISIBILITY.
 *
 * The only way to read the journal. There is deliberately no "unfiltered
 * reader" here, and there must not be one: it would immediately end up in some
 * route, and the border between clients would disappear silently.
 */
export async function feed(
  pool: JournalPool,
  v: Visibility,
  { limit = 50, before }: { limit?: number; before?: number } = {}
): Promise<JournalRow[]> {
  await ensureJournalTable(pool)
  const cap = Math.min(Math.max(1, Math.trunc(limit) || 1), 200)
  const bots = botFilter(v)
  const cursor = Number.isFinite(before as number) ? Number(before) : null
  const cols = `id, kind, who, bot, amount, what, severity, at`
  const slice = cursor === null ? '' : ' AND id < $C'

  if (bots === null) {
    // Keeper: the whole farm, including events with no subject (a forged
    // signature, a refused pairing claim) -- nobody else can see those.
    const r = await pool.query(
      `SELECT ${cols} FROM hive_events
        WHERE true${slice.replace('$C', '$2')}
        ORDER BY at DESC, id DESC LIMIT $1`,
      cursor === null ? [cap] : [cap, cursor]
    )
    return r.rows as JournalRow[]
  }

  /*
   * Owner and bee: their own events PLUS the events of their bots.
   *
   * `who = $2` is required for an owner too: their own sign-ins and payments
   * often carry no `bot_name` (by the survey, most of them), and without this
   * condition they would not even see themselves.
   *
   * An empty bot list is a legitimate case (a bee). Then only `who = $2`
   * remains, and that is correct.
   *
   * `who IS NOT NULL` is implied by the equality: an event with no subject can
   * never match `$2`, so nobody's events do not leak in here.
   */
  const r = await pool.query(
    `SELECT ${cols} FROM hive_events
      WHERE (who = $2 OR (bot IS NOT NULL AND bot = ANY($3)))${slice.replace('$C', '$4')}
      ORDER BY at DESC, id DESC LIMIT $1`,
    cursor === null ? [cap, v.who, bots] : [cap, v.who, bots, cursor]
  )
  return r.rows as JournalRow[]
}

/**
 * The pulse: a short summary over a time window, also within the scope.
 *
 * Separate from the feed because "what is happening" and "how much of it" are
 * different questions. The agent chat gets the summary: nobody reads a hundred
 * feed lines, but everybody reads "12 sign-ins, 3 payments, 1 alarm".
 */
export interface Pulse {
  hours: number
  total: number
  alarms: number
  byKind: Array<{ kind: string; count: number }>
}

export async function pulse(
  pool: JournalPool,
  v: Visibility,
  { hours = 24 }: { hours?: number } = {}
): Promise<Pulse> {
  const window = Math.min(Math.max(1, Math.trunc(hours) || 1), 24 * 30)
  // Counted from the same feed rather than a separate query: two different
  // visibility conditions over the same data will drift one day, and they will
  // drift towards "showed too much".
  const rows = await feed(pool, v, { limit: 200 })
  const edge = Date.now() - window * 3600_000
  const fresh = rows.filter(r => {
    const t = new Date(r.at).getTime()
    return Number.isFinite(t) ? t >= edge : true
  })
  const tally = new Map<string, number>()
  for (const r of fresh) tally.set(r.kind, (tally.get(r.kind) ?? 0) + 1)
  return {
    hours: window,
    total: fresh.length,
    alarms: fresh.filter(r => r.severity === 'alarm').length,
    byKind: [...tally.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  }
}
