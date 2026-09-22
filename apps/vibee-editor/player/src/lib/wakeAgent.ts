/**
 * HANDING THE WHEEL BACK WAKES THE AGENT, AND IT KNOWS WHY.
 *
 * Owner, 2026-09-22: "when control is handed to the agent, it should wake up
 * aware that the person needs help". Before, "Let the agent continue" only
 * moved the wheel: an agent whose turn had already ended stayed asleep, and
 * the person looked at a still screen wondering what they had pressed.
 *
 * So the press also sends the agent a message, in the person's name -- it IS
 * their act -- saying that they tried themselves and now need help, with the
 * last steps from the journal so the agent starts from where things stand,
 * not from nothing (the app's copy of the conversation may be empty when the
 * person came straight to the browser).
 *
 * Not when the agent is already on it: a turn still waiting for the person
 * (a question, a field to type into) goes on by itself once answered, and a
 * second turn beside it would be two drivers for one browser.
 */
import type { JournalStep } from './browserJournal'

/* A step this recent means a turn is still running. */
export const AGENT_ACTIVE_MS = 20_000
/* How many of the latest steps go into the message. */
export const WAKE_STEPS = 4

/** Pure. */
export function shouldWakeAgent(input: {
  /** The agent is waiting for the person: an open question or a field. */
  agentWaiting: boolean
  /** A reply is already streaming in this app. */
  replying: boolean
  /** The newest journal step, if any. */
  lastStepAt: string | null
  now: number
}): boolean {
  if (input.agentWaiting || input.replying) return false
  const last = input.lastStepAt ? Date.parse(input.lastStepAt) : NaN
  return !(Number.isFinite(last) && input.now - last < AGENT_ACTIVE_MS)
}

/**
 * The message: the request for help, then the latest steps, oldest first.
 * `line` renders one step in the person's language. Pure.
 */
export function wakeMessage(
  ask: string,
  stepsHeader: string,
  steps: JournalStep[],
  line: (s: JournalStep) => string
): string {
  const latest = steps.slice(0, WAKE_STEPS).reverse().map(line)
  return latest.length
    ? `${ask}\n\n${stepsHeader}\n${latest.map(l => `• ${l}`).join('\n')}`
    : ask
}
