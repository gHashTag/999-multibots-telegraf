/**
 * HOW MUCH DID IT DO WITHOUT ME -- THE NUMBER NOBODY HAD.
 *
 * Every assistant on the market that sells an outcome publishes one measured
 * figure: Intercom's Fin sells "76% of conversations resolved", and that is
 * the whole pitch. This product could not answer the same question about
 * itself. The owner saw cards, receipts and a switch, and had no way to say
 * whether the week went better than the one before.
 *
 * IT IS COUNTED FROM ROWS THAT ALREADY EXIST, and that is the design rule
 * here: `hive_events` records a press (`card-pressed`, with "отправил" or
 * "не отправил" as its text), a sweep that drew a card, a sweep that found
 * nothing, and -- since the same change as this file -- a card that left
 * under AUTO (`card-auto-sent`). A number invented from a new counter would
 * start at zero and mean nothing for a week; a number derived from the
 * journal is true about the past as well.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. This is not a "resolution rate": we do
 * not know whether the client was satisfied, and inventing a percentage from
 * sends would be the kind of number that survives exactly until somebody
 * checks it. It answers a narrower question honestly -- of the messages that
 * went out from your account, how many needed your finger.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

type Pool = {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

/** The counts, per kind, over a window. One query, grouped in Postgres. */
export const OUTCOMES_SQL = `SELECT kind, what, count(*)::int AS n
   FROM hive_events
  WHERE who = $1
    AND at > now() - ($2 || ' days')::interval
    AND kind IN ('card-auto-sent', 'card-pressed', 'sweep-card', 'sweep-idle', 'sweep-failed')
  GROUP BY kind, what`

/**
 * THE SAME COUNT, ONE WINDOW EARLIER -- so a number has something to be
 * compared with.
 *
 * A single figure answers "how much went out without me"; two answer the
 * question a person actually has, which is "is it getting better?". The
 * window before this one, same length, ending where this one starts: for a
 * 7-day window that is days 8..14 ago.
 */
export const OUTCOMES_BEFORE_SQL = `SELECT kind, what, count(*)::int AS n
   FROM hive_events
  WHERE who = $1
    AND at >  now() - ($2 || ' days')::interval * 2
    AND at <= now() - ($2 || ' days')::interval
    AND kind IN ('card-auto-sent', 'card-pressed', 'sweep-card', 'sweep-idle', 'sweep-failed')
  GROUP BY kind, what`

/**
 * ANSWERS THE AGENT GAVE CLIENTS IN HIS OWN CHATS -- the work that was
 * invisible to this figure until 2026-09-24.
 *
 * The first reading said "0% without you", and it was wrong by omission: it
 * counted cards, which is the rare path, and not the common one -- a client
 * writes to the owner's Telegram, the agent answers, and the owner never
 * touches it. Measured the morning this shipped: 263 such answers in seven
 * days against 13 card presses.
 *
 * Scoped to THIS owner's people: an answer counts when the person it went to
 * is one of his leads (`crm_messages`). Without that join the number would be
 * every seller's work on one seller's screen.
 */
export const OUTCOMES_DM_SQL = `SELECT count(*)::int AS n
   FROM agent_messages a
  WHERE a.surface = 'business'
    AND a.role = 'assistant'
    AND a.created_at > now() - ($2 || ' days')::interval
    AND EXISTS (
      SELECT 1 FROM crm_messages c
       WHERE c.owner_id = $1 AND c.lead_id = a.telegram_id
    )`

export const OUTCOMES_DM_BEFORE_SQL = `SELECT count(*)::int AS n
   FROM agent_messages a
  WHERE a.surface = 'business'
    AND a.role = 'assistant'
    AND a.created_at >  now() - ($2 || ' days')::interval * 2
    AND a.created_at <= now() - ($2 || ' days')::interval
    AND EXISTS (
      SELECT 1 FROM crm_messages c
       WHERE c.owner_id = $1 AND c.lead_id = a.telegram_id
    )`

/**
 * WITH WHOM THE OWNER HAD TO STEP IN.
 *
 * "You stepped in thirteen times" is half a sentence. The half worth acting
 * on is WHICH conversations needed him -- those are the ones where the
 * assistant's words were not good enough, and they are the only place a next
 * improvement can come from.
 *
 * Presses recorded before 2026-09-24 carry no client at all (the column did
 * not exist), so rows without one are counted separately and SAID, never
 * quietly dropped: a list that silently showed three of thirteen would read
 * as "these are the three".
 */
export const STEPPED_IN_SQL = `SELECT lead_id, count(*)::int AS n
   FROM hive_events
  WHERE who = $1
    AND at > now() - ($2 || ' days')::interval
    AND kind = 'card-pressed'
  GROUP BY lead_id
  ORDER BY n DESC`

/** How many conversations the answer names. The rest are counted, not named. */
export const STEPPED_IN_SHOWN = 5

export interface Outcomes {
  days: number
  /** Client messages the agent answered in his chats, with no press at all. */
  dm_answered: number
  /** Cards that left with nobody pressing anything. */
  auto_sent: number
  /** Cards the owner sent by pressing. */
  pressed_sent: number
  /** Cards the owner refused. */
  cancelled: number
  /** Cards drawn by the sweep (auto + pressed + still waiting + refused). */
  cards_drawn: number
  /** Sweeps that found nothing worth writing. */
  quiet: number
  /** Sweeps that failed. */
  failed: number
  /** Of everything that LEFT, the share that needed no finger. 0..100, or null. */
  without_you_percent: number | null
  /** Said out loud when the journal has nothing yet, so 0 is not read as "bad". */
  note?: string
  /**
   * THE SAME WINDOW BEFORE THIS ONE, or null when there is nothing there.
   *
   * Null is not zero: a week with no rows at all means the journal did not
   * exist yet or nothing happened, and drawing "+13" against it would invent
   * a trend out of an empty file.
   */
  before?: {
    auto_sent: number
    pressed_sent: number
    dm_answered: number
    left: number
    without_you_percent: number | null
  } | null
  /** Which clients needed his finger, most first. Ids, never names. */
  stepped_in?: Array<{ lead: string; times: number }>
  /** Presses whose client is unknown -- rows written before the column. */
  stepped_in_unknown?: number
}

export function outcomesFrom(
  rows: Array<{ kind: string; what: string | null; n: number }>,
  days: number
): Outcomes {
  const sum = (k: string, what?: string) =>
    rows
      .filter(r => r.kind === k && (what === undefined || r.what === what))
      .reduce((a, r) => a + Number(r.n || 0), 0)

  const auto = sum('card-auto-sent')
  // Counted apart from the journal, so `outcomesFrom` stays a pure function
  // over rows: the caller adds it (outcomesFor) and the shares are recomputed
  // there. Zero here means "not asked", never "none happened".
  const dm = 0
  // The press writes its outcome as the TEXT of the row -- the word for
  // "sent" -- and anything else is a refusal. Counting `card-pressed` alone
  // would call a refusal a send.
  const pressedSent = sum('card-pressed', 'отправил') // cyrillic-ok: journal text
  const cancelled = sum('card-pressed') - pressedSent
  const left = auto + pressedSent
  return {
    days,
    dm_answered: dm,
    auto_sent: auto,
    pressed_sent: pressedSent,
    cancelled,
    cards_drawn: sum('sweep-card'),
    quiet: sum('sweep-idle'),
    failed: sum('sweep-failed'),
    without_you_percent: left ? Math.round((auto / left) * 100) : null,
    ...(left || cancelled || sum('sweep-card')
      ? {}
      : { note: 'за это время не было ни карточек, ни отправок' }), // cyrillic-ok: user-facing
  }
}

/**
 * WHAT COUNTS AS "WITHOUT YOU", AND WHY THE SHARE IS COMPUTED HERE.
 *
 * Everything that reached a client from his account: an answer the agent gave
 * in a DM, a card that left under AUTO, and a card he sent by pressing. The
 * first two happened without his finger; the third did not. Cancelled cards
 * are not in it at all -- nothing reached anybody.
 *
 * `outcomesFrom` stays a pure function over journal rows and does not know
 * about DMs, so the share is recomputed once here, where both numbers exist.
 */
function shareWithout(dm: number, auto: number, pressed: number) {
  const left = dm + auto + pressed
  return {
    left,
    percent: left ? Math.round(((dm + auto) / left) * 100) : null,
  }
}

/** The named conversations and the count of the ones that cannot be named. */
export function steppedInFrom(
  rows: Array<{ lead_id: string | null; n: number }>
): Pick<Outcomes, 'stepped_in' | 'stepped_in_unknown'> {
  const named = rows
    .filter(r => String(r.lead_id ?? '').trim())
    .map(r => ({ lead: String(r.lead_id), times: Number(r.n || 0) }))
    .sort((a, b) => b.times - a.times)
  const unknown = rows
    .filter(r => !String(r.lead_id ?? '').trim())
    .reduce((a, r) => a + Number(r.n || 0), 0)
  return {
    ...(named.length ? { stepped_in: named.slice(0, STEPPED_IN_SHOWN) } : {}),
    ...(unknown ? { stepped_in_unknown: unknown } : {}),
  }
}

export async function outcomesFor(
  pool: Pool,
  owner: string,
  days: number
): Promise<Outcomes> {
  const count = async (sql: string) => {
    try {
      const r = await pool.query(sql, [String(owner), String(days)])
      return Number((r.rows ?? [])[0]?.n ?? 0) || 0
    } catch {
      // A figure that cannot read one of its halves says zero for that half
      // rather than refusing the whole answer; the other numbers are true.
      return 0
    }
  }
  const [now, before, dm, dmBefore, steppedIn] = await Promise.all([
    pool.query(OUTCOMES_SQL, [String(owner), String(days)]),
    pool
      .query(OUTCOMES_BEFORE_SQL, [String(owner), String(days)])
      .catch(() => ({ rows: [] })),
    count(OUTCOMES_DM_SQL),
    count(OUTCOMES_DM_BEFORE_SQL),
    /*
     * A statement of its own, not a join: this one groups by client and the
     * first groups by kind, and asking one query for both would multiply
     * every sweep row by the number of clients. A database without the
     * column answers the share fine, so its failure costs only the names.
     */
    pool
      .query(STEPPED_IN_SQL, [String(owner), String(days)])
      .catch(() => ({ rows: [] })),
  ])
  const out = outcomesFrom((now.rows ?? []) as never, days)
  const prev = outcomesFrom((before.rows ?? []) as never, days)
  const here = shareWithout(dm, out.auto_sent, out.pressed_sent)
  const there = shareWithout(dmBefore, prev.auto_sent, prev.pressed_sent)
  return {
    ...out,
    dm_answered: dm,
    without_you_percent: here.percent,
    // Nothing at all in the earlier window is "no comparison", not "zero".
    before:
      there.left || prev.cancelled || prev.cards_drawn
        ? {
            auto_sent: prev.auto_sent,
            pressed_sent: prev.pressed_sent,
            dm_answered: dmBefore,
            left: there.left,
            without_you_percent: there.percent,
          }
        : null,
    // The note was about an empty journal; a week with DM answers in it is
    // not empty, whatever the cards say.
    ...(dm && out.note ? { note: undefined } : {}),
    ...steppedInFrom((steppedIn.rows ?? []) as never),
  }
}

export const OUTCOMES_TOOLS: AgentTool[] = [
  {
    name: 'crm_outcomes',
    /*
     * Short on purpose: this tool is in the compact kit (`^crm_`), whose whole
     * budget is 7000 tokens for a 16k window. The long version cost 92 of
     * them and pushed the kit over -- measured, not guessed (provider.test.ts).
     */
    description:
      'Сколько ушло БЕЗ владельца за N дней: авто, его кнопкой, отменено, ' +
      'обходы. Читающий.',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'окно в днях (1..90, по умолчанию 7)',
        },
      },
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const raw = Number(a?.days)
      const days = Number.isFinite(raw)
        ? Math.min(90, Math.max(1, Math.round(raw)))
        : 7
      return outcomesFor(
        ctx?.pool as never,
        String(ctx?.telegramId ?? ''),
        days
      )
    },
  },
]
