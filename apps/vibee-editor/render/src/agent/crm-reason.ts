/**
 * WHY THIS PERSON, IN ONE LINE, FOR THE CARD THE OWNER PRESSES.
 *
 * Its own module because both sides of the card path need it and they already
 * point at each other: crm-offer-tool imports `propose` from telegram-tools,
 * so telegram-tools cannot import back. A shared fact belongs in neither of
 * the two files that use it.
 *
 * Measured 16.09.2026: five cards have ever left the seller, four of them in
 * the last week, against 316 people waiting -- and the limiter is the owner's
 * press. What stands in front of a press is having to open the chat to
 * remember who this is and what they said.
 */
import type { ToolContext } from './tools'
import { LATER_RETURNS_AFTER_DAYS, NO_ANSWER_AFTER_DAYS } from './crm-segments'

/**
 * One line about the person, for the card: what the queue says, and what they
 * last wrote. Both come from the owner's own memory of the correspondence.
 *
 * Their words are third-party text: quoted, flattened and cut here, and cut
 * again by the card. Nothing is interpreted -- a quote is a quote.
 */
export async function reasonFor(
  ctx: ToolContext | undefined,
  lead: string
): Promise<string> {
  const pool = ctx?.pool as never
  if (!pool || !lead) return ''
  const owner = String(ctx?.telegramId ?? '')
  const parts: string[] = []
  try {
    const { touchesFor } = await import('./crm-touches')
    const { waitingOn } = await import('./crm-stages')
    const touches = await touchesFor(pool, owner, lead)
    const w = waitingOn({
      touches: touches.map(t => ({ kind: t.kind, at: t.at })),
      noAnswerAfterDays: NO_ANSWER_AFTER_DAYS,
      laterAfterDays: LATER_RETURNS_AFTER_DAYS,
      // A card is being offered, so the question "has this person paid" is
      // not what the line is about; the queue's own quiet window is not
      // applied here either -- this is one card, already chosen.
      paid: false,
      quietDays: 0,
    })
    if (w) parts.push(`${w.because}, ${w.days} дн.`)
  } catch {
    // The queue's opinion is a nicety; the quote below is the useful half.
  }
  try {
    const { leadContext } = await import('./chat-memory')
    const story = await leadContext(pool, owner, lead, 10)
    const last = [...story.messages].reverse().find(m => !m.out)
    if (last?.text) parts.push(`сам писал: «${last.text}»`)
  } catch {
    // No memory of this person yet -- the card simply says less.
  }
  return parts.join('; ').slice(0, 300)
}
