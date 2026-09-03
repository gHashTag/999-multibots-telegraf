/**
 * The b-roll clip, claimed before it is paid for.
 *
 * WHY THIS EXISTS. The autopilot's b-roll layer was authorised purely by
 * durable SUCCESS state and left no trace of itself: the cycle's only write
 * happens after publication. Everything between the money moving and that write
 * -- the render ceiling, a publish failure, a redeploy killing the child --
 * left the durable state byte-identical to before the spend, so the next tick
 * re-derived the same authorisation, picked the same topic, and bought the clip
 * AGAIN. The one already paid for was persisted nowhere. At a 30-minute
 * interval that repeats until a cycle finally survives to the end.
 *
 * The shape is the one talking-portrait.ts already uses one layer above -- an
 * intent row written BEFORE the provider is told anything -- with two
 * deliberate differences:
 *
 *   the claim is per TOPIC, not per day. paidSlotDue currently gives the paid
 *   slot to the day's LAST post only, so the two are equivalent today -- but a
 *   per-day guard would quietly become wrong the moment that rule widens, and
 *   what is being protected is a clip bought for a topic;
 *
 *   the claim blocks by EXISTENCE rather than by a credit sum, because a b-roll
 *   is bought from the channel's purse in whole clips rather than in metered
 *   provider credits.
 *
 * ONCE CLAIMED, NEVER RELEASED. The first version released the row on an
 * "answered refusal", reasoning that a returned error had bought nothing. That
 * is a guess, and the wrong way round: the live path is the Replicate fallback,
 * which can answer {success:false} AFTER the prediction was accepted -- money
 * already moving -- while the failure that certainly costs nothing (a refused
 * connection to our own port) THROWS instead. Releasing therefore re-buys in
 * exactly the case worth protecting. Keeping the row costs one optional layer
 * on one post; releasing it costs the owner another clip every half hour.
 *
 * This lives in src/ rather than beside the script on purpose: `tsc
 * --listFilesOnly` reports zero files under scripts/, so logic put there is
 * invisible to typecheck and untestable.
 */

/** The minimal database surface, same shape autopilot-state.ts passes around. */
export type Db = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export type Log = (line: string) => void

/**
 * ZERO, AND THAT IS THE LOAD-BEARING VALUE.
 *
 * The claim blocks by row EXISTENCE (ON CONFLICT DO NOTHING), never by a sum,
 * so the number here costs the dedup nothing. But the table is shared with the
 * talking portrait, whose daily ceiling is
 *   SELECT SUM(credits) ... WHERE owner = $1 AND day = $2
 * (talking-portrait.ts SPEND_SUM) with no filter on state or kind -- and the
 * b-roll writes the SAME owner and the SAME day. A non-zero value here is
 * therefore silently subtracted from the portrait's budget: at
 * AUTOPILOT_PORTRAIT_SECONDS=8, or a daily ceiling of 108, ONE b-roll clip is
 * enough to make the portrait refuse for the rest of the day. Worse, the b-roll
 * only runs when the portrait already declined, so the row would land exactly
 * on the ticks where the portrait wants to retry.
 *
 * Zero is also the honest figure: a b-roll is Replicate dollars, not the Kie
 * credits this column meters.
 */
export const BROLL_CLIP_UNITS = 0

/**
 * Stable across a retry of the same cycle, which is the whole point.
 *
 * Uses the RAW topic title: the A/B rewrite assigns to a separate variable and
 * never touches topic.title, so a retried cycle produces the same key. Sliced
 * because a title is free text and the column is a primary key.
 */
export function brollClaimId(day: string, title: string): string {
  return `broll-${day}-${String(title).slice(0, 120)}`
}

export type ClaimOutcome = 'claimed' | 'taken' | 'silent' | 'no-db'

/**
 * Take the claim, or report why we must not spend.
 *
 * 'no-db'  -- nothing durable was ever promised; the caller proceeds, the same
 *             deliberate choice talking-portrait.ts documents for a deployment
 *             with no DATABASE_URL. Refusing here would disable the layer.
 * 'taken'  -- this topic's clip was already bought today.
 * 'silent' -- the database exists and did not answer. Spend only under a
 *             record: an unrecorded generation is exactly the state in which a
 *             repeat-spend loop cannot be seen.
 */
export async function claimBroll(
  db: Db | null,
  args: { id: string; owner: string; day: string; spendTable: string },
  log: Log
): Promise<ClaimOutcome> {
  if (!db) return 'no-db'
  try {
    await db.query(args.spendTable)
    const claimed = await db.query(
      `INSERT INTO autopilot_spend (id, owner, day, state, credits, reason, at)
       VALUES ($1, $2, $3, 'intent', $4, $5, now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        args.id,
        args.owner,
        args.day,
        BROLL_CLIP_UNITS,
        'b-roll: заявка записана до оплаты', // cyrillic-ok: ledger text
      ]
    )
    return claimed.rows.length > 0 ? 'claimed' : 'taken'
  } catch (e) {
    log(`b-roll: журнал не ответил (${String(e).slice(0, 100)})`)
    return 'silent'
  }
}

/** The clip arrived: settle the row so it reads as spent rather than pending. */
export async function settleBroll(
  db: Db | null,
  id: string,
  log: Log
): Promise<void> {
  if (!db) return
  try {
    await db.query(
      `UPDATE autopilot_spend SET state = 'delivered', reason = $2 WHERE id = $1`,
      [id, 'b-roll: клип получен'] // cyrillic-ok: ledger text
    )
  } catch (e) {
    log(`b-roll: заявку не закрыл (${String(e).slice(0, 100)})`)
  }
}
