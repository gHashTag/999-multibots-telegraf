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
 *
 * Since 2026-09-15 the same funnel also derives ONE fact from what it sees: a
 * client answering us writes a `replied` touch. It belongs here for the same
 * reason everything else does -- every message passes through, so the fact
 * has one writer instead of one per path. See crm-replies.ts.
 */

import { rememberMessagesFresh, type StoredMessage } from './chat-memory'
import { noteReply } from './crm-replies'
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
  // After the messages are stored, never before: the reply is decided by
  // reading the correspondence, and this batch is part of it.
  await noteReply(pool as never, owner, lead, fresh)
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

/**
 * ONE MESSAGE INTO ZEP WHEN POSTGRES ALREADY HAD IT.
 *
 * `mirrorNow` posts to Zep only what was FRESH in Postgres, which is right for
 * every ordinary path and silently wrong for exactly one: a transcript that
 * arrives after the message. The ingest writes `[голосовое]` the moment it
 * sees a voice note; the words come minutes later and are APPENDED to that
 * row. Postgres then has them and Zep never hears -- so the agent's memory of
 * every voice message anybody ever sent is the word "[голосовое]", for ever.
 *
 * Owner, 2026-09-20: "study all my voice messages in the DMs and update the
 * Zep context, so the information is current." This is what stood in the way.
 *
 * ONLY WHEN THE WORDS ARE NEW. The caller passes what it actually appended,
 * and appends only once (the `position` guard in mirrorTranscript). Posting on
 * every attempt would teach Zep the same sentence a dozen times, which is
 * worse than silence: a summary built from repetitions reads as emphasis.
 *
 * Never raises. Zep is a mirror; Postgres is the record.
 */
export async function mirrorOneToZep(
  owner: string,
  lead: string,
  msg: StoredMessage,
  name?: string | null
): Promise<number> {
  if (!zepConfigured()) return 0
  try {
    await zepEnsureUser(lead, name ?? null)
    await zepEnsureThread(owner, lead)
    return await zepAddMessages(owner, lead, [msg])
  } catch (e) {
    console.warn(
      `[crm-mirror] zep did not take a transcript for ${lead}: ${String(e).slice(0, 120)}`
    )
    return 0
  }
}
