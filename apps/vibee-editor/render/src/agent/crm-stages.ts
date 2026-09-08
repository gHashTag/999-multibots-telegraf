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
  now?: number
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
  if (!latest) return null

  const { stage } = stageOf(input)
  // Nothing is owed to somebody who said no, and a client is served rather
  // than chased.
  if (stage === 'refused' || stage === 'client') return null

  const age = daysBetween(latest.at, now)
  if (age === null) return null

  if (latest.kind === 'replied') {
    /*
     * No delay on this one. They answered and we have not: every day of that
     * is a day the person is deciding we are not interested, and it is the one
     * kind of silence that costs a deal already in motion.
     */
    return { waiting: 'ours', days: age, because: 'ответил, а мы молчим' }
  }
  if (latest.kind === 'later' && age >= input.laterAfterDays) {
    return { waiting: 'due', days: age, because: 'просил позже — позже настало' }
  }
  if (latest.kind === 'written' && age >= input.noAnswerAfterDays) {
    return { waiting: 'theirs', days: age, because: 'написали, ответа нет' }
  }
  return null
}
