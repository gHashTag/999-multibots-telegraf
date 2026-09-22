/**
 * WHAT A FAILED TURN ALREADY DID, CARRIED ON THE ERROR.
 *
 * `trinityAgent.retryAllowed` protects the retry INSIDE the agent client, but
 * the callers retry too -- `businessBotService.answerClient` replays a turn it
 * judges transient. Until now the thrown error said only what went wrong,
 * never what the turn had already spent.
 *
 * The bill for that gap, 20.09.2026: a turn spent 170 seconds rendering a
 * picture, the bot's flat deadline fired, the error read "This operation was
 * aborted" -- which the transient classifier accepts -- and the whole turn was
 * replayed. The second run rendered and charged for the same picture. The
 * client was charged twice and received neither image.
 *
 * Its own module, and not a pair of exports from `trinityAgent`, because every
 * caller that retries also mocks `trinityAgent` wholesale in its tests; a rule
 * about spending must not vanish with the mock that replaces the client.
 */

/**
 * A tool whose call already spent money or already reached a human. Replaying
 * a turn that fired one of these bills twice or sends twice.
 */
export const SIDE_EFFECT_TOOL =
  /^(image_generate|image_edit|audio_generate|video_generate|reel_render|invoice|tg_send)/

/**
 * A symbol, so the annotation cannot collide with a field the error already
 * has and cannot change the message any classifier reads.
 */
const TOOLS_ON_ERROR = Symbol.for('vibee.agent.toolsUsed')

/** Attach the tool list to a failure on its way out. Returns the same error. */
export function markTurnTools(e: unknown, toolsUsed: string[]): unknown {
  if (e && typeof e === 'object') {
    try {
      ;(e as Record<symbol, unknown>)[TOOLS_ON_ERROR] = [...toolsUsed]
    } catch {
      // A frozen error keeps its failure; losing the annotation is not worth
      // replacing the cause the caller needs in order to classify it.
    }
  }
  return e
}

/** The tools the failed turn called, or an empty list if it said nothing. */
export function toolsUsedOf(e: unknown): string[] {
  const v =
    e && typeof e === 'object'
      ? (e as Record<symbol, unknown>)[TOOLS_ON_ERROR]
      : undefined
  return Array.isArray(v) ? (v as string[]) : []
}

/** True when replaying this failed turn would bill twice or send twice. */
export function turnAlreadySpent(e: unknown): boolean {
  return toolsUsedOf(e).some(name => SIDE_EFFECT_TOOL.test(name))
}

/*
 * TWO MORE FACTS A FAILED TURN CARRIES OUT, FOR THE BOT'S FALLBACK.
 *
 * Measured 2026-09-22: a turn the agent could not finish reached a model with
 * no tools and no history, which answered a Russian message in English and
 * invented a service. The bot's fallback has to tell two failures apart, and
 * the error is the only thing that crosses from the agent client to it:
 *
 *  - REPORTED: the render was reached, ran the turn with its tools and the
 *    shared history, and said in its own stream that it failed. Handing the
 *    same message to a toolless model cannot do better than the agent did --
 *    it can only do worse, with nobody to check it.
 *  - HISTORY: the conversation the turn was read with. It is already in hand
 *    when the call fails, so the fallback gets context without a second read
 *    on a path that is failing anyway.
 *
 * Symbols, for the same reason as the tool list above: no collision with the
 * error's own fields, and no change to the message any classifier reads.
 */
const REPORTED_BY_AGENT = Symbol.for('vibee.agent.reportedByAgent')
const HISTORY_ON_ERROR = Symbol.for('vibee.agent.history')

/*
 * NOT ENUMERABLE, because the history is a person's conversation: an error
 * handed whole to a logger goes through util.inspect, which prints enumerable
 * symbol keys -- the transcript would land in the log next to the stack.
 */
function annotate(e: unknown, key: symbol, value: unknown): unknown {
  if (e && typeof e === 'object') {
    try {
      Object.defineProperty(e, key, {
        value,
        enumerable: false,
        configurable: true,
        writable: true,
      })
    } catch {
      // A frozen error keeps its failure; the annotation is the lesser loss.
    }
  }
  return e
}

/** Mark a failure the agent itself announced in its stream. Same error back. */
export function markReportedByAgent(e: unknown): unknown {
  return annotate(e, REPORTED_BY_AGENT, true)
}

/** True when the render ran the turn and reported that it failed. */
export function reportedByAgent(e: unknown): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    (e as Record<symbol, unknown>)[REPORTED_BY_AGENT] === true
  )
}

export interface PastTurn {
  role: string
  content: string
}

/** Attach the conversation the failed turn was read with. Same error back. */
export function markTurnHistory(e: unknown, history: PastTurn[]): unknown {
  return annotate(e, HISTORY_ON_ERROR, [...history])
}

/** The conversation the failed turn was read with, or [] when none travelled. */
export function historyOf(e: unknown): PastTurn[] {
  const v =
    e && typeof e === 'object'
      ? (e as Record<symbol, unknown>)[HISTORY_ON_ERROR]
      : undefined
  return Array.isArray(v) ? (v as PastTurn[]) : []
}
