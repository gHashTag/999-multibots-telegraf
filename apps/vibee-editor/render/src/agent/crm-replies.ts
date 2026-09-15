/**
 * THE `replied` TOUCH, WRITTEN BY NOBODY UNTIL NOW.
 *
 * crm_touch accepted the kind and TOUCH_KINDS validated it, but the only
 * automatic writer in the whole system was the confirmed-send path, which
 * writes `written` or `bought`. So nothing ever recorded that a client
 * ANSWERED -- which left the `ours` segment (crm-segments.ts) permanently
 * empty and the button built on SCOPE_VERBS pointing at nothing. A whole
 * segment and a whole button were dead UI.
 *
 * The owner's decision, 2026-09-15: write it automatically, at the moment the
 * client replies.
 *
 * ONE WRITER, IN THE ONE FUNNEL. Every message in the correspondence -- read
 * by the sweep, sent by the seller, exchanged in the business DM -- passes
 * through mirrorNow. Deriving the touch anywhere else would give the same
 * fact two sources, which is how this CRM earned its other inconsistencies.
 */
import { recordTouch } from './crm-touches'
import type { StoredMessage } from './chat-memory'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>
}

/**
 * How recent an inbound message must be to count as a reply happening NOW.
 *
 * recordTouch stamps the row with now(), it cannot backdate. The sweep
 * re-reads up to fifty messages per dialog every thirty minutes, so without
 * this window the first pass over an old correspondence would stamp today's
 * date on replies from weeks ago and make the whole base look freshly
 * active. Two hours comfortably covers a reply that arrived between sweeps
 * and excludes history.
 */
export const REPLY_IS_FRESH_MS = 2 * 60 * 60 * 1000

/**
 * Did this batch bring a reply, and has it already been recorded?
 *
 * A reply is an inbound message with an outbound BEFORE it: somebody writing
 * to us for the first time has not replied to anything. And it is recorded
 * once per turn of ours, not once per message -- five messages in a row are
 * one reply, and the next `replied` only follows after we have written again.
 * That is exactly what `ours` reads: they answered, we answered, silence.
 */
export async function noteReply(
  pool: Pool,
  owner: string,
  lead: string,
  fresh: StoredMessage[],
  now = Date.now()
): Promise<'recorded' | 'not recorded'> {
  try {
    if (!owner || !lead) return 'not recorded'
    const inbound = (fresh ?? []).filter(m => m && !m.out)
    if (!inbound.length) return 'not recorded'
    const newest = inbound.reduce((a, b) =>
      new Date(b.at).getTime() > new Date(a.at).getTime() ? b : a
    )
    const at = new Date(newest.at)
    const stamp = at.getTime()
    if (!Number.isFinite(stamp)) return 'not recorded'
    // History being re-read, not somebody answering. See REPLY_IS_FRESH_MS.
    if (now - stamp > REPLY_IS_FRESH_MS) return 'not recorded'

    /*
     * The last `replied` that still stands. Both exclusions are the ones
     * every other reader uses: a row a live correction names is not an act
     * any more, and the correction itself is bookkeeping about the log.
     */
    const last = await pool.query(
      `SELECT max(t.at) AS at
         FROM crm_touches t
        WHERE t.owner_id = $1 AND t.lead_id = $2 AND t.kind = 'replied'
          AND t.reverts_id IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM crm_touches c
                 WHERE c.reverts_id = t.id AND c.owner_id = t.owner_id
              )`,
      [String(owner), String(lead)]
    )
    const since = (last.rows?.[0] as { at?: unknown } | undefined)?.at
    const sinceAt = since ? new Date(String(since)) : new Date(0)

    /*
     * Our own word, after the last reply we recorded and before this one. No
     * such word means either they wrote first (nothing to reply to) or they
     * are still talking into the same silence, and a second `replied` would
     * only make the newest touch mean "they are still typing".
     */
    const ours = await pool.query(
      `SELECT 1 FROM crm_messages
        WHERE owner_id = $1 AND lead_id = $2 AND "out"
          AND at > $3 AND at < $4
        LIMIT 1`,
      [String(owner), String(lead), sinceAt.toISOString(), at.toISOString()]
    )
    if (!ours.rows?.length) return 'not recorded'

    return await recordTouch(pool as never, {
      owner: String(owner),
      lead: String(lead),
      kind: 'replied',
      botName: null,
    })
  } catch {
    // A touch that could not be written must never break the mirror: the
    // messages themselves are already in memory, and losing a derived fact
    // is cheaper than losing the correspondence.
    return 'not recorded'
  }
}
