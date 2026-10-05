/**
 * WHICH AGENT A JUST-CREATED BOT IS FOR.
 *
 * Telegram's "bot created" message carries the bot and nothing of the button
 * that asked for it (ManagedBotCreated has no request_id). So pressing
 * "create" in /agents leaves a claim here -- this person, this agent, for
 * CLAIM_TTL_MS -- and the creation that follows takes it. The suggested
 * username t27_<id>_bot says the same when the person kept it.
 *
 * Only for the team (ADMIN_IDS): binding moves the agent onto the new bot,
 * and a stranger who squatted t27_blogger_bot must not take the Blogger.
 */

import { claimFresh, agentIdOfUsername } from './rules'
import { hiveAgent } from './catalogue'

const claims = new Map<number, { agentId: string; at: number }>()

export function claimAgent(
  ownerId: number,
  agentId: string,
  now = Date.now()
): void {
  claims.set(ownerId, { agentId, at: now })
}

/** The agent this creation is for, or null; a claim is used once. */
export function claimedAgent(
  event: { ownerId: number; botUsername: string },
  now = Date.now()
): string | null {
  const claim = claims.get(event.ownerId)
  if (claim) claims.delete(event.ownerId)
  if (claim && claimFresh(now - claim.at)) return claim.agentId
  const byName = agentIdOfUsername(event.botUsername)
  return hiveAgent(byName ?? undefined) ? byName : null
}

/** For tests. */
export function clearClaims(): void {
  claims.clear()
}
