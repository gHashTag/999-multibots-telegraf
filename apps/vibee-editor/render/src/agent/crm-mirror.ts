/**
 * ONE MIRROR, AT ONCE.
 *
 * Every message in the owner's correspondence -- read by the ingest, written
 * by the seller after the owner's press, exchanged in the business DM by the
 * agent -- lands in the same two places the moment it exists: the Postgres
 * memory (crm_messages, keyed by Telegram's own message id, so nothing is
 * kept twice) and Zep, which turns the thread into a summary and facts the
 * agent reads before answering. The owner asked for exactly this: the
 * correspondence in Zep immediately, so the agent sees the whole picture
 * without waiting for the next sweep.
 *
 * Only what is NEW in Postgres reaches Zep: the same message read twice must
 * not be posted twice. A Zep failure is logged, never raised -- the memory in
 * Postgres is already written, and a mirror that is down must not stop an
 * ingest or a send.
 */

import { rememberMessagesFresh, type StoredMessage } from './chat-memory'
import {
  zepConfigured,
  zepEnsureUser,
  zepEnsureThread,
  zepAddMessages,
} from './zep-memory'

type Pool = Parameters<typeof rememberMessagesFresh>[0]

export async function mirrorNow(
  pool: Pool,
  owner: string,
  lead: string,
  msgs: StoredMessage[],
  name?: string | null
): Promise<{ fresh: number; zep: number }> {
  const fresh = await rememberMessagesFresh(pool, owner, lead, msgs)
  let zep = 0
  if (fresh.length && zepConfigured()) {
    try {
      await zepEnsureUser(lead, name ?? null)
      await zepEnsureThread(owner, lead)
      zep = await zepAddMessages(owner, lead, fresh)
    } catch (e) {
      console.warn(
        `[crm-mirror] zep did not take ${fresh.length} message(s) for ${lead}: ${String(e).slice(0, 120)}`
      )
    }
  }
  return { fresh: fresh.length, zep }
}
