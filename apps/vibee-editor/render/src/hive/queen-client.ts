/**
 * THE QUEEN AT t27.ai -- READING HER, NOT COPYING HER.
 *
 * Owner, 2026-09-07: "the Queen is here, study how she works and connect to
 * her: https://t27.ai/#/queen".
 *
 * WHAT SHE ACTUALLY IS (measured 2026-09-07)
 *
 * The 3-D page at t27.ai/#/queen is a viewer. The live numbers come from
 * `trios-agent-server-production.up.railway.app/queen/*`:
 *
 *   /queen/status          swarm state, 4 worker slots, scheduler interval 300s
 *   /queen/public-activity an event stream with a cursor (`?since=<ms>`)
 *   /queen/public-board    a kanban of issues: backlog, blocked, running,
 *                          review, done, dropped
 *
 * She is a code-quality watchdog over `gHashTag/trios`. Her verdicts read like
 * "…breaks L3 with 1 non-ASCII characters, all of them in comments" and
 * "…exports one symbol and no test names any of them". Both classes were fixed
 * in THIS repository on the same day, by hand, because the equivalent guard
 * here was switched off by a hooks conflict. She is worth watching for that
 * reason alone.
 *
 * SHE IS A DIFFERENT HIVE, SO HER EVENTS ARE NOT WRITTEN INTO OURS
 *
 * The temptation is to pour her activity into `hive_events` so that everything
 * is "in one feed". That would be wrong twice over: her events are facts about
 * another repository, and copying them makes us a second, stale store of
 * somebody else's data — the copy drifts the moment her side changes. She is
 * read live and shown live.
 *
 * KEEPER ONLY
 *
 * Her API is public and unauthenticated, but that is not a reason to widen who
 * sees it here. Her verdicts name file paths, issue numbers and internal
 * engineering state of the platform. A bot owner's agent chat is the same
 * screen as an ordinary user's; platform internals belong to the keeper.
 *
 * HER DATA IS UNTRUSTED INPUT
 *
 * Titles come from another system and end up in a Telegram message and in a
 * model's context. They are truncated and stripped of newlines for the same
 * reason device names are in `notify-sign-in`: a title that can forge a line
 * break can forge a whole message.
 */

const BASE =
  process.env.QUEEN_BASE_URL ||
  'https://trios-agent-server-production.up.railway.app'

/**
 * How long to wait for her.
 *
 * Short on purpose. This is a status panel: an answer that arrives after ten
 * seconds is not an answer, it is a hung chat. Her being slow must read as "she
 * did not answer", not as our agent freezing.
 */
const TIMEOUT_MS = 6000

async function ask<T>(path: string): Promise<T> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, { signal: stop.signal })
    if (!res.ok) throw new Error(`the Queen answered ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Defang a string that came from another system, and keep it to `max`. */
function clean(raw: unknown, max: number): string {
  const cleaned = (raw == null ? '' : String(raw))
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>&]/g, '')
    .trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

/** Defang a title that came from another system. */
export function safeTitle(raw: unknown): string {
  return clean(raw, 160)
}

export interface QueenStatus {
  reachable: boolean
  /** Present only when reachable; otherwise `why` explains. */
  swarmState?: string
  workers?: { capacity: number; active: number; idle: number }
  tickEverySeconds?: number
  lastTickAt?: string
  /** Issues the last tick refused to start, and the reason class. */
  skipped?: number
  why?: string
}

export async function queenStatus(): Promise<QueenStatus> {
  try {
    const s = await ask<any>('/queen/status')
    return {
      reachable: true,
      swarmState: String(s?.swarmState ?? 'unknown'),
      workers: {
        capacity: Number(s?.workers?.capacity ?? 0),
        active: Number(s?.workers?.active ?? 0),
        idle: Number(s?.workers?.idle ?? 0),
      },
      tickEverySeconds: Number(s?.scheduler?.intervalSeconds ?? 0) || undefined,
      lastTickAt: s?.lastTick?.decidedAt
        ? String(s.lastTick.decidedAt)
        : undefined,
      skipped: Number(s?.lastTick?.skippedCount ?? 0),
    }
  } catch (e) {
    /*
     * Unreachable is reported, never swallowed into zeros.
     *
     * "0 bees, 0 verdicts" and "she did not answer" look identical on a
     * dashboard and mean opposite things: one is a quiet hive, the other is a
     * blind one. Guessing which would be the whole failure of this panel.
     */
    return { reachable: false, why: e instanceof Error ? e.message : String(e) }
  }
}

export interface QueenEvent {
  kind: string
  issue: number | null
  title: string
  at: string
  state: string
}

export async function queenActivity({
  limit = 20,
}: { limit?: number } = {}): Promise<{
  reachable: boolean
  events: QueenEvent[]
  why?: string
}> {
  try {
    const cap = Math.min(Math.max(1, Math.trunc(limit) || 1), 100)
    const r = await ask<any>('/queen/public-activity')
    const rows: any[] = Array.isArray(r?.events) ? r.events : []
    return {
      reachable: true,
      events: rows.slice(0, cap).map(e => ({
        kind: String(e?.kind ?? ''),
        issue: Number.isFinite(Number(e?.issue)) ? Number(e.issue) : null,
        title: safeTitle(e?.title),
        at: String(e?.at ?? ''),
        state: String(e?.state ?? ''),
      })),
    }
  } catch (e) {
    return {
      reachable: false,
      events: [],
      why: e instanceof Error ? e.message : String(e),
    }
  }
}

/** One column of her board: what she calls it, and how full it is. */
export interface QueenColumn {
  key: string
  title: string
  /** Her one-line gloss on what the column MEANS. */
  blurb: string
  count: number
}

export interface QueenBoard {
  reachable: boolean
  repo?: string
  /** Her columns, in her order, each with its count. */
  columns?: QueenColumn[]
  /** A few cards awaiting judgement, because that is the column that blocks. */
  waiting?: Array<{ issue: number; title: string }>
  why?: string
}

export async function queenBoard(): Promise<QueenBoard> {
  try {
    const b = await ask<any>('/queen/public-board')
    const cards: any[] = Array.isArray(b?.cards) ? b.cards : []

    const counted = new Map<string, number>()
    for (const c of cards) {
      const k = clean(c?.column, 30) || 'unknown'
      counted.set(k, (counted.get(k) ?? 0) + 1)
    }

    /*
     * THE COLUMNS ARE HERS, NOT OURS TO INFER FROM THE CARDS.
     *
     * Discovering them by counting loses every column that is currently empty
     * -- `blocked` and `running` are empty most of the time -- so this panel
     * reported four columns while the mini app and the phone reported six.
     * "nothing is running" and "there is no such column" are different facts.
     *
     * `player/src/lib/hive.ts` and `HiveAPI.swift` already read her declaration
     * this way; the three surfaces now agree.
     */
    const declared: any[] = Array.isArray(b?.columns) ? b.columns : []
    const columns: QueenColumn[] = declared.map(c => {
      const key = clean(c?.key, 30)
      return {
        key,
        title: clean(c?.title, 40) || key,
        blurb: clean(c?.blurb, 80),
        count: counted.get(key) ?? 0,
      }
    })

    /*
     * A card in a column she never declared -- and the fallback for her not
     * declaring any at all. Mapping over an empty declaration would render 414
     * cards as nothing, which is worse than the bug above; appending keeps her
     * order leading when she does declare.
     */
    const named = new Set(columns.map(c => c.key))
    for (const [key, count] of counted) {
      if (!named.has(key)) columns.push({ key, title: key, blurb: '', count })
    }

    return {
      reachable: true,
      repo: clean(b?.repo, 60),
      columns,
      // Only the review column, and only a handful: the board runs to hundreds
      // of cards, and a dump of them is not a report, it is a wall.
      waiting: cards
        .filter(c => String(c?.column) === 'review')
        .slice(0, 5)
        .map(c => ({
          issue: Number(c?.number ?? 0),
          title: safeTitle(c?.title),
        })),
    }
  } catch (e) {
    return { reachable: false, why: e instanceof Error ? e.message : String(e) }
  }
}
