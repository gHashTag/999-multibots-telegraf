/**
 * THE AGENT'S OWN MESSAGES MUST NOT SILENCE THE AGENT.
 *
 * A confirmed proposal goes out through the owner's GramJS session, so
 * Telegram Business hands it back to the bot as a `business_message` FROM
 * THE OWNER. The bot reads "the owner typed here" and pauses the AI in that
 * chat for half an hour -- and the next thing the client writes gets no
 * answer. Measured 2026-09-13 on the production bot: `[proposal] confirm
 * action=send to=504608015` at 14:16:14, `[Business] Owner replied manually,
 * AI paused` at 14:16:15, then five `Owner takeover active, AI silent` lines
 * while the client kept writing.
 *
 * The approved bytes must stay the sent bytes (no invisible markers in the
 * text), so the send is remembered HERE by Telegram's own message id and the
 * bot asks before it pauses. Process memory with a short TTL is enough: the
 * bot's question arrives within seconds of the send, and a registry that is
 * empty after a redeploy only means one pause that would have happened
 * anyway.
 */

/** How long an agent-sent message id stays answerable, ms. */
export const AGENT_SENT_TTL_MS = 15 * 60 * 1000
/** Upper bound on remembered sends; the oldest go first. */
export const AGENT_SENT_MAX = 5000

const sent = new Map<string, number>()

const keyOf = (owner: string, lead: string, msgId: number) =>
  `${owner}:${lead}:${msgId}`

function sweep(now: number): void {
  for (const [k, at] of sent) {
    if (now - at > AGENT_SENT_TTL_MS) sent.delete(k)
  }
  while (sent.size > AGENT_SENT_MAX) {
    const oldest = sent.keys().next().value
    if (oldest === undefined) break
    sent.delete(oldest)
  }
}

/** Remember that the agent sent message `msgId` to `lead` as `owner`. */
export function recordAgentSent(
  owner: string | number,
  lead: string | number,
  msgId: unknown,
  now = Date.now()
): boolean {
  const id = Number(msgId)
  if (!Number.isFinite(id) || id <= 0) return false
  sent.set(keyOf(String(owner), String(lead), id), now)
  sweep(now)
  return true
}

/** Was message `msgId` in the owner->lead chat sent by the agent recently? */
export function wasAgentSent(
  owner: string | number,
  lead: string | number,
  msgId: unknown,
  now = Date.now()
): boolean {
  const id = Number(msgId)
  if (!Number.isFinite(id)) return false
  const at = sent.get(keyOf(String(owner), String(lead), id))
  if (at === undefined) return false
  if (now - at > AGENT_SENT_TTL_MS) {
    sent.delete(keyOf(String(owner), String(lead), id))
    return false
  }
  return true
}

/** Test seam: forget everything. */
export function resetAgentSentForTests(): void {
  sent.clear()
}
