/**
 * ONE PERSON, ONE SEGMENT.
 *
 * The seller's plan says "hot 10, waiting 306, warm 12" and the numbers must
 * add up: every person in the memory lands in exactly one segment, decided
 * by precedence, from facts the memory already computes. The plan is built
 * from these counts by plain code -- no model, no guessing -- and each
 * segment names the one action the owner may start with a button.
 *
 * Precedence, highest first:
 *   hot       their own words asked for a price or to buy (offer/deliver)
 *   objection an objection this week, not hot -- hand only
 *   waiting   their last word is unanswered
 *   talk      wrote lately, no intent, our last word two days old or more
 *   due       asked for "later" and two weeks have passed
 *   ours      they answered our touch and we have not written since
 *   warm      quiet two to eight weeks, no refusal, never paid -- warming
 *   winback   paid once, quiet a month or more
 *   quiet     everybody else: refused lately, asked for later recently, or
 *             we wrote and are waiting
 *
 * Caps bound what one day may start; the daily cap counts every send.
 */

import { REFUSAL_HOLDS_DAYS } from './crm-stages'

export const SEGMENTS = [
  'hot',
  'objection',
  'waiting',
  'talk',
  'due',
  'ours',
  'warm',
  'winback',
  'quiet',
] as const
export type Segment = (typeof SEGMENTS)[number]
export type ActiveSegment = Exclude<Segment, 'quiet'>

export const SEGMENT_CAPS_DEFAULT: Record<ActiveSegment, number> = {
  hot: 10,
  objection: 3,
  waiting: 20,
  talk: 5,
  due: 5,
  ours: 5,
  warm: 10,
  winback: 3,
}
export const DAILY_CAP_DEFAULT = 30

/**
 * How long "later" holds somebody out of the queue.
 *
 * NAMED BECAUSE A MESSAGE PROMISES IT. The bot answers the `later` button
 * with "back on the list in two weeks", and this bare 14 was the only thing
 * that made the sentence true. Two numbers in two services with nothing
 * holding them together is how a bot starts telling people things that were
 * true last month -- the same shape as a message naming a command nobody
 * registered. promisesMatchTheCode.test.ts now reads both ends.
 *
 * The neighbouring windows (warm 14..60, winback 30) carry no promise to
 * anybody yet, so they stay as they are rather than being renamed for tidiness.
 */
export const LATER_RETURNS_AFTER_DAYS = 14

/**
 * How long our own message may go unanswered before it is somebody's turn.
 *
 * Named for the same reason: `crm_waiting` explains itself to the model with
 * "we wrote, no answer for 3 days", and the 3 was typed separately in the
 * summary tool, in the waiting tool and in that sentence. Three copies of one
 * number, and the sentence is what the model believes.
 */
export const NO_ANSWER_AFTER_DAYS = 3

/** Caps from the environment: SELLER_SEGMENT_CAPS 'hot=10,waiting=20', SELLER_DAILY_CAP '30'. */
export function segmentCaps(
  env: NodeJS.ProcessEnv = process.env
): Record<ActiveSegment, number> & { day: number } {
  const caps = { ...SEGMENT_CAPS_DEFAULT, day: DAILY_CAP_DEFAULT }
  for (const part of String(env.SELLER_SEGMENT_CAPS ?? '').split(',')) {
    const [k, v] = part.split('=').map(s => s.trim())
    const n = Number(v)
    if (k && k in SEGMENT_CAPS_DEFAULT && Number.isFinite(n) && n >= 0)
      caps[k as ActiveSegment] = Math.floor(n)
  }
  const day = Number(env.SELLER_DAILY_CAP)
  if (Number.isFinite(day) && day >= 0) caps.day = Math.floor(day)
  return caps
}

export interface SegmentInput {
  unanswered: boolean
  next: string
  signals: string[]
  /** Days since their last word; null when they never wrote. */
  daysSinceInbound: number | null
  /** Days since our last word; null when we never wrote. */
  daysSinceOut: number | null
  lastTouch: { kind: string; at: string } | null
  paid: boolean
  now?: number
}

const ageDays = (iso: string, now: number): number =>
  Math.floor((now - new Date(iso).getTime()) / 86400_000)

export function segmentOf(c: SegmentInput): Segment {
  const now = c.now ?? Date.now()
  const days = c.daysSinceInbound
  const asked = c.signals.includes('price') || c.signals.includes('buy')
  const touch = c.lastTouch
  const touchAge = touch ? ageDays(touch.at, now) : null
  const refusedLately =
    touch?.kind === 'refused' &&
    touchAge !== null &&
    touchAge <= REFUSAL_HOLDS_DAYS

  if (c.next === 'offer' || c.next === 'deliver') return 'hot'
  if (asked && days !== null && days <= 7) return 'hot'
  if (
    c.signals.includes('objection') &&
    days !== null &&
    days <= 7 &&
    c.next !== 'wait'
  )
    return 'objection'
  if (c.unanswered || c.next === 'reply') return 'waiting'
  if (c.next === 'talk') return 'talk'
  if (
    touch?.kind === 'later' &&
    touchAge !== null &&
    touchAge >= LATER_RETURNS_AFTER_DAYS &&
    !c.paid &&
    !refusedLately
  )
    return 'due'
  if (
    touch?.kind === 'replied' &&
    !c.paid &&
    (c.daysSinceOut === null ||
      (touchAge !== null && c.daysSinceOut >= touchAge))
  )
    return 'ours'
  if (
    !c.paid &&
    days !== null &&
    days >= 14 &&
    days <= 60 &&
    !refusedLately &&
    touch?.kind !== 'later' &&
    (c.daysSinceOut === null || c.daysSinceOut >= 7)
  )
    return 'warm'
  if (c.paid && days !== null && days >= 30 && touch?.kind !== 'refused')
    return 'winback'
  return 'quiet'
}

export function countSegments(
  list: Array<{ segment: Segment }>
): Record<Segment, number> {
  const out = Object.fromEntries(SEGMENTS.map(s => [s, 0])) as Record<
    Segment,
    number
  >
  for (const c of list) out[c.segment] = (out[c.segment] ?? 0) + 1
  return out
}
