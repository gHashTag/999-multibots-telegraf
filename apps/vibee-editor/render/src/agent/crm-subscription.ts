/**
 * WHEN A SUBSCRIBER LEAVES, THE CRM SHOULD LEARN IT THE SAME DAY.
 *
 * Until now the only sign that somebody stopped paying was silence, and
 * silence takes a month to become a `winback` segment (crm-segments.ts). It is
 * also ambiguous: a person who cancelled and a person who is merely busy look
 * identical from here.
 *
 * Bot API 10.2 (14 Jul 2026) added BotSubscriptionUpdated, which names the day
 * and says which of three things happened -- `canceled`, `active` (a cancelled
 * subscription switched back on) or `failed` (the charge did not go through).
 * `failed` is the warmest of the three: the person did not decide to leave,
 * they ran out of stars, and that is worth a message today.
 *
 * What lands in the log is a `note`, not a new touch kind. A note is a fact
 * about the person that the seller can read; it deliberately does NOT move
 * their stage or segment, because what a cancellation should mean for the
 * queue is a product decision, not a side effect of wiring an update up.
 */
import type { Pool } from 'pg'
import { recordTouch } from './crm-touches'

/** The three states Telegram reports, and nothing else. */
export const SUBSCRIPTION_STATES = ['canceled', 'active', 'failed'] as const
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number]

export const SUBSCRIPTION_NOTES: Record<SubscriptionState, string> = {
  canceled: 'подписка отменена: списаний больше не будет',
  active: 'подписка возобновлена',
  failed: 'платёж по подписке не прошёл — возможно, кончились звёзды',
}

/**
 * The person a subscription payload belongs to.
 *
 * `subtokens:<tokens>:<telegram_id>` is minted by token-invoice.ts, and the
 * payload is the ONLY thing BotSubscriptionUpdated carries that identifies
 * anybody: there is no invoice id and no chat. A one-off `tokens:` payload is
 * refused here rather than tolerated -- a one-off has no subscription to
 * cancel, so seeing one means something upstream is wrong and should be
 * visible instead of quietly recorded against the right person for the wrong
 * reason.
 */
export function subscriptionLead(
  payload: unknown
): { tokens: number; lead: string } | null {
  const m = /^subtokens:(\d+):(\d{5,15})$/.exec(String(payload ?? ''))
  if (!m) return null
  const tokens = Number(m[1])
  if (!(tokens > 0)) return null
  return { tokens, lead: m[2] }
}

/**
 * Whose CRM this person is in.
 *
 * A subscriber is a client of some owner, and the touch log is keyed by both.
 * Nobody stores that pair anywhere else, so it is read from the conversation
 * itself: the owner is whoever has exchanged messages with this person. It
 * returns a list rather than one id because the same person can be a lead of
 * two owners, and dropping one of them silently would lose a fact.
 *
 * An empty list is an ordinary answer, not a failure: somebody who subscribed
 * inside the app without ever writing to an owner is nobody's lead.
 */
export async function ownersOfLead(
  pool: Pool,
  lead: string
): Promise<string[]> {
  try {
    const r = await pool.query(
      `SELECT DISTINCT owner_id FROM crm_messages WHERE lead_id = $1`,
      [String(lead)]
    )
    return (r.rows as Array<{ owner_id?: unknown }>)
      .map(x => String(x?.owner_id ?? ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export interface SubscriptionChange {
  payload: unknown
  state: unknown
  /** The bot the money was flowing through, for the log line. */
  botName?: string | null
}

/**
 * Record the change against every owner who knows this person.
 *
 * Returns what happened rather than throwing: the caller is a payment-adjacent
 * path in the bot, and a CRM note that could not be written must never look
 * like a payment that failed.
 */
export async function recordSubscriptionChange(
  pool: Pool,
  change: SubscriptionChange
): Promise<{ recorded: number; lead?: string; reason?: string }> {
  const who = subscriptionLead(change.payload)
  if (!who) return { recorded: 0, reason: 'payload is not a subscription' }
  const state = String(change.state ?? '')
  if (!(SUBSCRIPTION_STATES as readonly string[]).includes(state)) {
    // An unknown state is not written as if it were understood. Telegram may
    // add a fourth, and a note reading "undefined" helps nobody.
    return { recorded: 0, lead: who.lead, reason: `unknown state: ${state}` }
  }
  const owners = await ownersOfLead(pool, who.lead)
  if (!owners.length) {
    return { recorded: 0, lead: who.lead, reason: 'nobody has this lead' }
  }
  const note = `${SUBSCRIPTION_NOTES[state as SubscriptionState]} (${who.tokens})`
  let recorded = 0
  for (const owner of owners) {
    const r = await recordTouch(pool, {
      owner,
      lead: who.lead,
      kind: 'note',
      note,
      botName: change.botName ?? null,
    })
    if (r === 'recorded') recorded += 1
  }
  return { recorded, lead: who.lead }
}
