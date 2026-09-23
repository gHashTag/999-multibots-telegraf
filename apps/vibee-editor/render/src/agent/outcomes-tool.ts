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

export interface Outcomes {
  days: number
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
  // The press writes its outcome as the TEXT of the row -- the word for
  // "sent" -- and anything else is a refusal. Counting `card-pressed` alone
  // would call a refusal a send.
  const pressedSent = sum('card-pressed', 'отправил') // cyrillic-ok: journal text
  const cancelled = sum('card-pressed') - pressedSent
  const left = auto + pressedSent
  return {
    days,
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

export async function outcomesFor(
  pool: Pool,
  owner: string,
  days: number
): Promise<Outcomes> {
  const r = await pool.query(OUTCOMES_SQL, [String(owner), String(days)])
  return outcomesFrom((r.rows ?? []) as never, days)
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
