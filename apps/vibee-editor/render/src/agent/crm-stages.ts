/**
 * A STAGE IS DERIVED FROM FACTS, NEVER SET BY HAND.
 *
 * Every CRM grows a dropdown where somebody picks "warm", "in progress",
 * "almost". Three months later half the records say "in progress" because
 * nobody went back to change them, and the funnel built on that dropdown is a
 * picture of how diligent people were, not of how the business is doing.
 *
 * So there is no stage column here. A stage is computed, every time, from
 * things that either happened or did not: money in `payments_v2`, and touches
 * recorded in `crm_touches`. If the facts change, the stage changes with them,
 * and nobody has to remember anything.
 *
 * ── THE ORDER MATTERS, AND IT IS NOT ALPHABETICAL ──────────────────────────
 *
 * `refused` outranks everything except money. Somebody who said no and is then
 * written to again because an older "written" touch sorted higher is the exact
 * rudeness this whole module exists to prevent.
 */

import type { TouchKind } from './crm-touches'

export type Stage =
  /** Paid. Nothing to sell; there is something to serve. */
  | 'client'
  /** Said no. Do not resurface, whatever else is in the history. */
  | 'refused'
  /** Asked to be approached later. */
  | 'later'
  /** Answered us and the ball is on our side. */
  | 'talking'
  /** We wrote and nobody has answered yet. */
  | 'written'
  /** Paid once, then went quiet. */
  | 'winback'
  /** Came in, never paid, never touched. */
  | 'new'

export interface StageInput {
  /** Has this person ever completed a payment? */
  paid: boolean
  /** Touch kinds for this person, NEWEST FIRST. */
  touches: Array<{ kind: TouchKind; at: string }>
  /** Days since their last visit, if known. */
  quietDays: number | null
  /**
   * When the person last said something, and when we last did, from
   * `crm_messages`, if they are known.
   *
   * MEASURED IN PRODUCTION 2026-09-16. The stage model, reading touches
   * alone, reported the funnel like this:
   *
   *   talking   0        while 316 people were waiting for a reply
   *   new     753        of 881 people who have actually corresponded
   *
   * Nobody is ever "talking" because nothing writes a `replied` touch: the
   * model is asked to and forgets. So a funnel that says "nobody is in
   * conversation, 753 have never been touched" is not a picture of the
   * business -- it is a picture of an empty log.
   *
   * Optional, as on waitingOn: an owner with no connected Telegram account
   * has no messages, and for them the touch-only answer is the best there is.
   */
  lastInboundAt?: string | null
  lastOutboundAt?: string | null
}

/**
 * The stage, and the fact it rests on.
 *
 * The reason travels with the answer on purpose: a stage nobody can explain is
 * a stage nobody trusts, and the first question anybody asks a CRM is "why is
 * he in that column".
 */
export function stageOf(input: StageInput): { stage: Stage; because: string } {
  const { paid, touches } = input
  const latest = touches[0]

  /*
   * Money first. Somebody who paid is a client even if the last touch says
   * "refused" -- they refused one offer, not the relationship, and putting them
   * back in a selling list is how a paying customer is lost.
   */
  if (paid) {
    const quiet = input.quietDays
    if (quiet !== null && quiet > 60) {
      return { stage: 'winback', because: `платил, молчит ${quiet} дней` }
    }
    return { stage: 'client', because: 'есть завершённый платёж' }
  }

  /*
   * A refusal outranks every other touch, including newer ones of a weaker
   * kind. Only money overrides it -- see above -- because money is the person
   * changing their own mind.
   */
  if (touches.some(t => t.kind === 'refused')) {
    return { stage: 'refused', because: 'сказал нет' }
  }

  if (latest?.kind === 'later') {
    return { stage: 'later', because: 'просил вернуться позже' }
  }
  if (latest?.kind === 'replied') {
    return { stage: 'talking', because: 'ответил, ход за нами' }
  }

  /*
   * AN ANSWER NOBODY WROTE DOWN PUTS THEM IN CONVERSATION ALL THE SAME.
   *
   * Only this one stage is derived from messages, and deliberately so. If
   * their last word is newer than ours, we are in a conversation with the
   * ball on our side -- that is not an inference, it is what the two
   * timestamps say. The other stages are left alone: `written` from an
   * outbound message would label every finished picture and every receipt as
   * a sales approach nobody answered, and that is a different claim.
   */
  const inb = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN
  if (!Number.isNaN(inb)) {
    const outb = input.lastOutboundAt ? Date.parse(input.lastOutboundAt) : NaN
    const newerThanTouch = !latest || inb > Date.parse(latest.at)
    if ((Number.isNaN(outb) || inb > outb) && newerThanTouch) {
      return { stage: 'talking', because: 'написал последним, ход за нами' }
    }
  }
  if (latest?.kind === 'written' || latest?.kind === 'bought') {
    // `bought` without a payment row means somebody recorded a sale that the
    // ledger has not seen. Treated as written, not as a client: the ledger is
    // the source of truth about money, and a note is not a receipt.
    return {
      stage: 'written',
      because:
        latest.kind === 'bought'
          ? 'отмечен как купивший, но платежа в леджере нет'
          : 'написали, ответа пока нет',
    }
  }

  return { stage: 'new', because: 'ни разу не касались' }
}

/**
 * Who is waiting on whom.
 *
 * The question a list of leads cannot answer and the one that actually runs a
 * day: not "who could I write to" but "who is waiting for me right now".
 *
 * Computed from touches alone -- no Telegram session needed, so it works for
 * every bot owner and not only for somebody who has connected their account.
 */
export type Waiting =
  /** They answered; we have not. The most expensive kind of silence. */
  | 'ours'
  /** We wrote; no answer yet, and long enough to matter. */
  | 'theirs'
  /** They asked for later, and later has arrived. */
  | 'due'

export interface WaitingInput extends StageInput {
  /** Days after a written touch before "no answer yet" is worth surfacing. */
  noAnswerAfterDays: number
  /** Days after a "later" before it comes back. */
  laterAfterDays: number
  /*
   * The message facts live on StageInput now, which WaitingInput extends:
   * both questions -- what stage is this, and whose turn is it -- were being
   * answered from the same empty log.
   */
  /**
   * How many unanswered reminders before we stop chasing. Default 2, which is
   * what the playbook has promised in words since it was written: "two days,
   * then five; more than two reminders without an answer -- stop".
   */
  maxNudges?: number
  now?: number
}

/** Touch kinds that are the PERSON acting, not us. */
const THEIR_KINDS: TouchKind[] = ['replied', 'later', 'refused', 'bought']

/**
 * How many times we have written since the person last said anything.
 *
 * The number the playbook's cascade needs and that nothing could compute: a
 * `written` touch does not say whether it was a first message or a fourth
 * reminder, so "more than two reminders -- stop" was a sentence with no
 * arithmetic under it.
 *
 * It is counted, not stored: no new touch kind, no column, no migration, and
 * it stays right for rows written before this existed.
 */
export function nudgesSince(input: {
  /** Touch kinds for this person, NEWEST FIRST. */
  touches: Array<{ kind: TouchKind; at: string }>
  lastInboundAt?: string | null
}): number {
  const lastWord = theirLastWordAt(input)
  let n = 0
  for (const t of input.touches) {
    if (t.kind !== 'written') {
      // A touch of theirs ends the run; ours that are not sends do not.
      if (THEIR_KINDS.includes(t.kind)) break
      continue
    }
    const at = Date.parse(t.at)
    if (Number.isNaN(at)) continue
    if (lastWord !== null && at <= lastWord) break
    n += 1
  }
  return n
}

/** The moment of their last word: a touch of theirs, or an inbound message. */
function theirLastWordAt(input: {
  touches: Array<{ kind: TouchKind; at: string }>
  lastInboundAt?: string | null
}): number | null {
  let best: number | null = null
  for (const t of input.touches) {
    if (!THEIR_KINDS.includes(t.kind)) continue
    const at = Date.parse(t.at)
    if (!Number.isNaN(at) && (best === null || at > best)) best = at
    break
  }
  const inbound = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN
  if (!Number.isNaN(inbound) && (best === null || inbound > best))
    best = inbound
  return best
}

const daysBetween = (iso: string, now: number): number | null => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((now - t) / 86400000)
}

/**
 * Null when nobody is waiting -- which is most people, most of the time.
 *
 * A "waiting" list that includes everybody is a list nobody opens twice.
 */
export function waitingOn(input: WaitingInput): {
  waiting: Waiting
  days: number
  because: string
} | null {
  const now = input.now ?? Date.now()
  const latest = input.touches[0]

  const { stage } = stageOf(input)
  // Nothing is owed to somebody who said no, and a client is served rather
  // than chased.
  if (stage === 'refused' || stage === 'client') return null

  if (!latest) {
    /*
     * NOBODY EVER RECORDED A TOUCH, AND THE CONVERSATION HAPPENED ANYWAY.
     *
     * This is the ordinary case, not the exotic one: in production on
     * 2026-09-16 there were five touches for 2394 people and 25 302 inbound
     * messages. A tool that starts from touches alone therefore answers "two
     * people are waiting" while the same service's summary says 316.
     *
     * Only ONE of the three kinds is offered from messages alone: `ours` --
     * they said something and nothing went back. `theirs` is withheld on
     * purpose, because an outbound message is not evidence that anybody was
     * chasing anyone; it is usually the bot delivering what was asked for.
     */
    const inb = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN
    if (Number.isNaN(inb)) return null
    const outb = input.lastOutboundAt ? Date.parse(input.lastOutboundAt) : NaN
    if (!Number.isNaN(outb) && outb >= inb) return null
    const d = daysBetween(input.lastInboundAt as string, now)
    if (d === null) return null
    return { waiting: 'ours', days: d, because: 'написал, а ответа не было' }
  }

  const age = daysBetween(latest.at, now)
  if (age === null) return null

  /*
   * AN ANSWER NOBODY WROTE DOWN IS STILL AN ANSWER.
   *
   * If their last inbound message is newer than our last touch, they spoke
   * last and the ball is ours -- whatever the touch log says. Without this,
   * the one case this module calls "the most expensive kind of silence" is
   * reported backwards: we owe them a reply, and the tool says they owe us.
   */
  const inbound = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN
  if (!Number.isNaN(inbound) && inbound > Date.parse(latest.at)) {
    const d = daysBetween(input.lastInboundAt as string, now)
    if (d !== null) {
      return { waiting: 'ours', days: d, because: 'ответил, а мы молчим' }
    }
  }

  if (latest.kind === 'replied') {
    /*
     * No delay on this one. They answered and we have not: every day of that
     * is a day the person is deciding we are not interested, and it is the one
     * kind of silence that costs a deal already in motion.
     */
    return { waiting: 'ours', days: age, because: 'ответил, а мы молчим' }
  }
  if (latest.kind === 'later' && age >= input.laterAfterDays) {
    return {
      waiting: 'due',
      days: age,
      because: 'просил позже — позже настало',
    }
  }
  if (latest.kind === 'written' && age >= input.noAnswerAfterDays) {
    /*
     * THE CASCADE STOPS HERE, WHERE IT WAS ONLY EVER PROMISED.
     *
     * Point 6 of the playbook says: a reminder after two days, then after
     * five, and more than two reminders without an answer -- stop. Nothing
     * enforced it, because nothing could count reminders. Now something can.
     *
     * Dropping out of "waiting" is the whole point: a person who did not
     * answer three times is not waiting for us, and a queue that keeps
     * offering them is a queue that teaches its owner to skip rows.
     */
    const cap = Number.isFinite(input.maxNudges as number)
      ? Number(input.maxNudges)
      : 2
    if (nudgesSince(input) > cap) return null
    return { waiting: 'theirs', days: age, because: 'написали, ответа нет' }
  }
  return null
}
