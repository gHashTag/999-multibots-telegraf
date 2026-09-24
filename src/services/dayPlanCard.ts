/**
 * THE MORNING POST, HELD BETWEEN BEING WRITTEN AND BEING SENT.
 *
 * The plan for the room is composed by code (groupDayPlan) and sent by a
 * HAND. Nothing here writes to the room: the owner sees the exact words and
 * presses, or does not.
 *
 * WHY THE TEXT IS HELD HERE AND NOT IN THE BUTTON. Telegram gives a callback
 * 64 bytes; a post for a room does not fit, and putting a key in the button
 * and the text in a table would be a table for something that lives for one
 * press. So it lives in this process, one offer per owner, taken exactly once.
 *
 * WHAT A REDEPLOY DOES, SAID PLAINLY. The offer is process memory: a deploy
 * between the card and the press loses it, and the press then finds nothing.
 * That is why the press answers "nothing to send" out loud instead of
 * silently doing nothing -- a button that sometimes answers is pressed twice.
 * The cost of the loss is one missed morning post, and the alternative
 * (persisting a message that may never be sent) is a row nobody would ever
 * clean up.
 *
 * ONE OFFER PER OWNER, and a new one REPLACES the old: two morning posts
 * waiting at once is two versions of the same morning.
 */

export interface DayPlanOffer {
  /** Where it would go -- a group id, never guessed from the text. */
  chat: string
  /** The exact words the owner reads before pressing. */
  text: string
  /** When it was offered, so a stale one can be recognised. */
  at: number
}

const offers = new Map<string, DayPlanOffer>()

/** How long an unpressed offer stays sendable. A morning post is not news
 *  by the evening, and sending yesterday's plan today is worse than none. */
export const OFFER_TTL_MS = 6 * 60 * 60_000

export function offerDayPlan(
  owner: string,
  offer: Omit<DayPlanOffer, 'at'>,
  now = Date.now()
): void {
  const id = String(owner ?? '').trim()
  if (!id || !offer?.chat || !offer?.text) return
  offers.set(id, { chat: String(offer.chat), text: offer.text, at: now })
}

/**
 * The press. Returns the offer once and forgets it -- a second press must not
 * send the same post twice, which is the one irreversible mistake here.
 *
 * `null` for "nothing waiting" and for "waited too long"; the caller says
 * which, because a person who pressed deserves to know why nothing happened.
 */
export function takeDayPlan(
  owner: string,
  now = Date.now()
): { offer: DayPlanOffer | null; why: 'none' | 'stale' | 'ok' } {
  const id = String(owner ?? '').trim()
  const found = id ? offers.get(id) : undefined
  if (!found) return { offer: null, why: 'none' }
  offers.delete(id)
  if (now - found.at > OFFER_TTL_MS) return { offer: null, why: 'stale' }
  return { offer: found, why: 'ok' }
}

/** Is one waiting? Read-only: pressing is what consumes it. */
export function dayPlanWaiting(owner: string): boolean {
  return offers.has(String(owner ?? '').trim())
}

export function forgetDayPlansForTests(): void {
  offers.clear()
}
