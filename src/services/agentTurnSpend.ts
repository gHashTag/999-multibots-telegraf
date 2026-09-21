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
