import type { Stage } from './crm-stages'

/**
 * WHAT TO DO NEXT WITH ONE PERSON, AND WHY — THE SAME ANSWER EVERY TIME.
 *
 * Owner, 2026-09-23: "set up a sales department for Gaia over her clients...
 * and a sales algorithm script for every case".
 *
 * The CRM already derives the STAGE from facts and never stores it
 * (crm-stages.ts). What it has never had is the next line: given the stage,
 * what does a person actually do this morning, and what must they NOT do.
 * That was left to the model, which is exactly where the two failures of this
 * week came from:
 *
 *   - Лена (@Ryabinika_Perm), 2026-09-20: the agent announced a content plan
 *     and then greeted her with "hello, I am your personal assistant" on a
 *     conversation that had been running since March 2025, and went silent
 *     for three days.
 *   - Анна (@annakutishcheva), today 07:29: "да вернем" — a promise to return
 *     a balance, with nothing anywhere that will remember it tomorrow.
 *
 * So the order of moves is written down here, as code, with the reason
 * attached to each answer. A person reading a queue built from this can tell
 * whether it is right; nobody can tell whether an improvisation was.
 *
 * ── THE TWO RULES THAT OUTRANK SELLING ────────────────────────────────────
 *
 * 1. A PROMISE OUTRANKS AN OFFER. If we owe somebody something, the next move
 *    is to keep it -- never to offer anything else. Лена's own words, in her
 *    SOUL: "do not offer me anything while the money question is open; it
 *    reads as mockery". This is not politeness, it is the difference between
 *    a supplier and a nuisance.
 *
 * 2. A REFUSAL IS FINAL UNTIL THEY COME BACK. `refused` is never written to
 *    again by this algorithm, whatever else the history says.
 *
 * Everything else is ordinary: answer the person who is waiting, follow up
 * the silence you created, serve the one who paid, and leave alone the one
 * who asked for time until the time comes.
 */

export type Move =
  /** They wrote last and are waiting. Nothing else happens before this. */
  | 'answer_now'
  /** We owe them something we said out loud. Keep it, with a number. */
  | 'keep_promise'
  /** We wrote, they went quiet: one honest nudge, not a second pitch. */
  | 'follow_up'
  /** The conversation is warm, they know what it is, and no offer was made. */
  | 'offer'
  /** They paid. There is nothing to sell and something to deliver. */
  | 'serve'
  /** They asked for later, and later has not arrived. */
  | 'wait_until'
  /** They said no. */
  | 'leave_alone'
  /** Nobody has ever spoken to them. */
  | 'first_touch'
  /** Paid once, then went quiet. Ask what changed, do not pitch. */
  | 'winback_ask'

export type Urgency = 'overdue' | 'now' | 'today' | 'this_week' | 'hold'

export interface Promise_ {
  /** In the person's own words where possible: "вернуть баланс". */
  what: string
  /** ISO. Missing means "said, with no date" -- which is due today. */
  dueAt?: string | null
  /** When it was said. */
  saidAt?: string | null
}

export interface SalesInput {
  stage: Stage
  /** Who spoke last. `null` when nothing was ever said. */
  lastFrom: 'them' | 'us' | null
  /** Hours since that last message, if known. */
  hoursSinceLast: number | null
  /** Anything we said we would do and have not done. */
  owed?: Promise_ | null
  /** For `later`: the date they named. */
  laterUntil?: string | null
  /** Have they ever seen what this is -- a demo, a result, a trial? */
  sawValue?: boolean
  now: Date
}

export interface NextStep {
  move: Move
  urgency: Urgency
  /** Why this move, in one line a person can check against the facts. */
  why: string
  /** What the message is FOR. Not a script to paste: an intent. */
  intent?: string
}

/** A promise with no date is due the moment it is made. */
function promiseIsOverdue(owed: Promise_, now: Date): boolean {
  const due = owed.dueAt ? Date.parse(owed.dueAt) : Date.parse(owed.saidAt ?? '')
  if (!Number.isFinite(due)) return true
  return due <= now.getTime()
}

/**
 * The next move for one person. Pure, so the queue that shows it can be read
 * and argued with.
 */
export function nextStep(input: SalesInput): NextStep {
  const { stage, lastFrom, hoursSinceLast, now } = input
  const owed = input.owed ?? null

  // 1. A refusal ends the conversation until they restart it.
  if (stage === 'refused') {
    return {
      move: 'leave_alone',
      urgency: 'hold',
      why: 'человек отказался — пишем только если напишет сам',
    }
  }

  // 2. A promise outranks everything we might want to say.
  if (owed) {
    const late = promiseIsOverdue(owed, now)
    return {
      move: 'keep_promise',
      urgency: late ? 'overdue' : 'today',
      why: late
        ? `обещано и срок прошёл: ${owed.what}`
        : `обещано, срок сегодня: ${owed.what}`,
      intent: 'сделать обещанное и сказать числом, что сделано',
    }
  }

  // 3. Somebody who wrote to us is waiting. This is always before selling.
  if (lastFrom === 'them') {
    const hours = hoursSinceLast ?? 0
    return {
      move: 'answer_now',
      urgency: hours >= 24 ? 'overdue' : 'now',
      why:
        hours >= 24
          ? `ждёт ответа ${Math.floor(hours / 24)} дн.`
          : 'написал последним, ответа нет',
      intent: 'ответить по существу вопроса, без приветствия незнакомцу',
    }
  }

  // 4. They asked for time. Time is not up.
  if (stage === 'later') {
    const until = input.laterUntil ? Date.parse(input.laterUntil) : NaN
    if (Number.isFinite(until) && until > now.getTime()) {
      return {
        move: 'wait_until',
        urgency: 'hold',
        why: `просил вернуться позже: ${String(input.laterUntil).slice(0, 10)}`,
      }
    }
    return {
      move: 'follow_up',
      urgency: 'today',
      why: 'срок «позже» наступил',
      intent: 'вернуться ровно к тому, о чём договорились, без нового предложения',
    }
  }

  // 5. Paid. Serving, not selling.
  if (stage === 'client') {
    return {
      move: 'serve',
      urgency: 'this_week',
      why: 'оплатил — есть что доставить, нечего продавать',
      intent: 'спросить, что дальше по делу, и сделать это',
    }
  }

  // 6. Paid once and gone.
  if (stage === 'winback') {
    return {
      move: 'winback_ask',
      urgency: 'this_week',
      why: 'платил раньше и замолчал',
      intent: 'спросить, что изменилось; не предлагать, пока не ответит',
    }
  }

  // 7. Nobody ever spoke to them.
  if (stage === 'new') {
    return {
      move: 'first_touch',
      urgency: 'this_week',
      why: 'разговора ещё не было',
      intent: 'одно короткое сообщение о том, чем можем быть полезны',
    }
  }

  // 8. We spoke last. Either the offer has not been made, or silence grew.
  const hours = hoursSinceLast ?? 0
  const days = hours / 24
  if (stage === 'talking' && input.sawValue && days < 2) {
    return {
      move: 'offer',
      urgency: 'today',
      why: 'разговор тёплый, человек видел результат, предложения не было',
      intent: 'назвать цену и следующий шаг одним сообщением',
    }
  }
  if (days >= 14) {
    return {
      move: 'winback_ask',
      urgency: 'this_week',
      why: `молчание ${Math.floor(days)} дн. после нашего сообщения`,
      intent: 'один вопрос: нужно ли ещё. Дальше не писать',
    }
  }
  if (days >= 2) {
    return {
      move: 'follow_up',
      urgency: days >= 5 ? 'today' : 'this_week',
      why: `мы написали ${Math.floor(days)} дн. назад, ответа нет`,
      intent: 'напомнить о себе одним предложением, без второго питча',
    }
  }
  return {
    move: 'wait_until',
    urgency: 'hold',
    why: 'мы ответили только что — очередь за человеком',
  }
}

/** The order a queue is read in: what is late first, what can wait last. */
export const URGENCY_ORDER: Record<Urgency, number> = {
  overdue: 0,
  now: 1,
  today: 2,
  this_week: 3,
  hold: 4,
}

export function byUrgency<T extends { step: NextStep }>(a: T, b: T): number {
  return URGENCY_ORDER[a.step.urgency] - URGENCY_ORDER[b.step.urgency]
}
