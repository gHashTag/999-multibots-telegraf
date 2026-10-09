/**
 * A PERSON'S AGENT TURNS RUN ONE AT A TIME.
 *
 * Spec of record: bot-agent-team.t27 v2 (gHashTag/t27#7861). Measured on
 * production 2026-10-08: the owner asked every channel of his team the same
 * question within a minute, five turns reached the render at once, the free
 * model refused them as over its limit (z.ai code 1302) and two channels
 * stayed silent. The chat lanes (agentLanes.ts) keep one lane per TAB on
 * purpose, so the gate is here, around the model call itself: a person's
 * turns, from whichever tab, wait for each other and run in the order sent.
 * At most TURNS_WAITING_MAX wait; one more is refused with `PersonQueueFull`,
 * which the caller turns into an honest "wait a moment", never silence.
 *
 * The retry law (retry_pause_ms, may_retry) lives here too, beside the
 * queue it serves; trinityAgent.ts reads it.
 *
 * src/spec/bot-agent-team.test.ts runs the spec's tests against this file.
 */
import * as TEAM from '@/spec/bot-agent-team.gen'

/** spec may_start: one turn at a time per person. */
export const mayStart = (running: number): boolean =>
  running < TEAM.TURNS_AT_ONCE_PER_PERSON

/** spec may_wait: at most TURNS_WAITING_MAX wait behind it. */
export const mayWait = (waiting: number): boolean =>
  waiting < TEAM.TURNS_WAITING_MAX

/** spec retry_pause_ms: 4 s, then double. */
export function retryPauseMs(retriesDone: number): number {
  let pause = TEAM.LIMIT_PAUSE_MS
  for (let n = 0; n < retriesDone; n++) pause *= 2
  return pause
}

/** spec may_retry. */
export const mayRetry = (retriesDone: number): boolean =>
  retriesDone < TEAM.LIMIT_RETRIES

/** The queue is full: the caller says "wait", it does not drop the message. */
export class PersonQueueFull extends Error {
  constructor() {
    super('person turn queue full')
    this.name = 'PersonQueueFull'
  }
}

interface Lane {
  running: number
  waiting: Array<() => void>
}

const lanes = new Map<string, Lane>()

/** For tests and the health view: how many of this person's turns wait. */
export function waitingTurns(person: string): number {
  return lanes.get(person)?.waiting.length ?? 0
}

/**
 * Run `turn` when this person has no other turn running. The slot passes
 * straight to the next waiter, so a newcomer can never slip in between.
 */
export async function inPersonQueue<T>(
  person: string,
  turn: () => Promise<T>
): Promise<T> {
  let lane = lanes.get(person)
  if (!lane) {
    lane = { running: 0, waiting: [] }
    lanes.set(person, lane)
  }
  if (mayStart(lane.running)) {
    lane.running++
  } else {
    if (!mayWait(lane.waiting.length)) throw new PersonQueueFull()
    // The releasing turn hands its slot over: `running` stays as it is.
    await new Promise<void>(resolve => lane!.waiting.push(resolve))
  }
  try {
    return await turn()
  } finally {
    const next = lane.waiting.shift()
    if (next) next()
    else {
      lane.running--
      if (lane.running <= 0) lanes.delete(person)
    }
  }
}
