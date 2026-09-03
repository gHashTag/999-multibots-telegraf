import { createHash } from 'node:crypto'

/**
 * A paid autopilot layer, claimed before it is paid for.
 *
 * WHY THIS EXISTS. The autopilot's paid layers were authorised purely by
 * durable SUCCESS state and left no trace of themselves: the cycle's only write
 * happens after publication. Everything between the money moving and that write
 * -- the render ceiling, a publish failure, a redeploy killing the child --
 * left the durable state byte-identical to before the spend, so the next tick
 * re-derived the same authorisation, picked the same topic, and bought the same
 * thing AGAIN. What was already paid for is persisted nowhere. At a 30-minute
 * interval that repeats until a cycle finally survives to the end.
 *
 * TWO LAYERS USE THIS, and they differ in how often they can bleed. The b-roll
 * runs on the day's last post only (paidSlotDue); the poster engraving runs on
 * EVERY post and defaults ON, so it is the one that repeats fastest. The `kind`
 * in the key keeps their claims apart on a day when both run for one topic.
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
export const CLAIM_CREDITS = 0

/**
 * Stable across a retry of the same cycle, which is the whole point.
 *
 * Uses the RAW topic title: the A/B rewrite assigns to a separate variable and
 * never touches topic.title, so a retried cycle produces the same key. Sliced
 * because a title is free text and the column is a primary key.
 */
export function spendClaimId(
  kind: 'broll' | 'poster',
  day: string,
  title: string
): string {
  const t = String(title)
  /**
   * The slice keeps the key readable in the table; the digest keeps it UNIQUE.
   * Blog-derived topics take their RSS title unsliced, so two long titles can
   * share the first 120 characters -- and a shared key means one topic's claim
   * silently blocks another topic's layer.
   */
  const digest = createHash('sha256').update(t).digest('hex').slice(0, 8)
  return `${kind}-${day}-${t.slice(0, 80)}-${digest}`
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
export async function claimSpend(
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
        CLAIM_CREDITS,
        'автопилот: заявка записана до оплаты', // cyrillic-ok: ledger text
      ]
    )
    return claimed.rows.length > 0 ? 'claimed' : 'taken'
  } catch (e) {
    log(`заявка: журнал не ответил (${String(e).slice(0, 100)})`)
    return 'silent'
  }
}

/**
 * It arrived: settle the row AND keep the address of what was bought.
 *
 * The url goes into task_id, the column the portrait uses for its provider
 * task. Keeping it is what makes a lost cycle recoverable instead of merely
 * cheap: without it the claim only stops the second purchase, and the post that
 * triggered the first one publishes without the layer it already paid for.
 */
export async function settleSpend(
  db: Db | null,
  id: string,
  log: Log,
  url?: string
): Promise<void> {
  if (!db) return
  try {
    await db.query(
      `UPDATE autopilot_spend
          SET state = 'delivered', reason = $2, task_id = COALESCE($3, task_id)
        WHERE id = $1`,
      [id, 'автопилот: оплаченное получено', url ?? null] // cyrillic-ok: ledger text
    )
  } catch (e) {
    log(`заявка: не закрыл (${String(e).slice(0, 100)})`)
  }
}

/**
 * What this claim already bought, if anything is still recorded.
 *
 * Only a SETTLED row answers. An 'intent' row means the money moved and the
 * cycle died before anything came back -- there is nothing to reuse, and
 * pretending otherwise would publish a broken address.
 */
export async function recallSpend(
  db: Db | null,
  id: string,
  log: Log
): Promise<string | null> {
  if (!db) return null
  try {
    const r = await db.query(
      `SELECT task_id FROM autopilot_spend
        WHERE id = $1 AND state = 'delivered' AND task_id IS NOT NULL`,
      [id]
    )
    const url = r.rows?.[0]?.task_id
    return typeof url === 'string' && url.startsWith('http') ? url : null
  } catch (e) {
    log(`заявка: не смог перечитать (${String(e).slice(0, 100)})`)
    return null
  }
}

/**
 * Is the thing we paid for STILL THERE?
 *
 * Providers hand back their own addresses and they do not live forever. Reusing
 * a dead one would be worse than skipping: the render fetches it, fails, the
 * cycle dies, and the next tick reuses the same dead address again -- a
 * permanent loop for that topic instead of one plainer post. So a recalled
 * address is used only if it still answers.
 */
export async function assetStillThere(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const r = await fetchImpl(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    })
    return r.ok
  } catch {
    return false
  }
}
