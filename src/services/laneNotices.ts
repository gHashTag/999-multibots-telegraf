/**
 * WHO IS TOLD WHEN THE PROCESS STOPS BEFORE A TURN IS DONE.
 *
 * Before the agent lanes (services/agentLanes.ts) a turn still running at
 * SIGTERM held Telegraf's polling loop, so its update was never confirmed to
 * Telegram: the next process got it again and answered it. With the turn in a
 * lane the handler returns at once, the next getUpdates confirms the update,
 * and a turn that does not finish inside the shutdown drain is gone for good.
 * Nothing will ever answer it -- unless somebody is told.
 *
 * Business chats name their clients to the seller (businessBotService.ts,
 * `tellOwnersWhoWasLeftUnanswered`). This registry covers the other two
 * kinds of lane: `dm:` (a person's own chat with the bot -- the person is
 * told to send it again) and `crm:` (the owner's prepare / sweep / ingest --
 * the owner is told it did not finish, with a button to run it again).
 *
 * A job holds its notice from the moment it is handed to a lane until it
 * ends, so a job still waiting for its turn is covered as well as the one
 * running. Several held notices for one recipient are sent once.
 *
 * The real fix for turns longer than the drain is a durable inbox (F7 in the
 * plan): a turn that survives the process instead of an apology for it.
 *
 * Logs carry counts only, never message text.
 */
import { logger } from '@/utils/logger'

export interface ShutdownNotice {
  /** One message per recipient, however many of their jobs were left. */
  recipient: string
  send: () => Promise<unknown>
}

/** Lane key -> job ticket -> the notice that job holds. */
const held = new Map<string, Map<number, ShutdownNotice>>()
let tickets = 0

/**
 * Hold `notice` for a job on lane `key` until the returned release is called
 * -- in the job's `finally`, so a job that throws lets go too.
 */
export function holdShutdownNotice(
  key: string,
  notice: ShutdownNotice
): () => void {
  const ticket = ++tickets
  let forKey = held.get(key)
  if (!forKey) {
    forKey = new Map()
    held.set(key, forKey)
  }
  forKey.set(ticket, notice)
  return () => {
    const current = held.get(key)
    if (!current) return
    current.delete(ticket)
    if (!current.size) held.delete(key)
  }
}

/** Notices held right now, for tests and for the shutdown log. */
export function heldNoticeCount(): number {
  let n = 0
  for (const forKey of held.values()) n += forKey.size
  return n
}

/**
 * Send the notices held on the unfinished lanes, one per recipient, all at
 * once: the drain has already used most of the time Railway allows. Throws
 * nothing. Returns how many were delivered.
 */
export async function sendShutdownNotices(
  unfinished: string[]
): Promise<number> {
  const byRecipient = new Map<string, ShutdownNotice>()
  for (const key of unfinished) {
    for (const notice of held.get(key)?.values() ?? []) {
      if (!byRecipient.has(notice.recipient))
        byRecipient.set(notice.recipient, notice)
    }
  }
  if (!byRecipient.size) return 0
  const results = await Promise.allSettled(
    [...byRecipient.values()].map(notice => notice.send())
  )
  const told = results.filter(r => r.status === 'fulfilled').length
  logger.warn('[lanes] left unfinished at shutdown, told the chat', {
    chats: byRecipient.size,
    told,
  })
  return told
}
