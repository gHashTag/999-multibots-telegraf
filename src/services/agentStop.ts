/**
 * HOW A TURN SAYS "THE PERSON STOPPED ME" -- ITS OWN LEAF MODULE.
 *
 * Issue #2721: the turn ends by aborting, and the word "abort" sits in every
 * transient pattern in this repository, so a stop read as a blip is REPLAYED.
 * A person presses Stop and the work starts again.
 *
 * WHY A FILE OF ITS OWN, and not an export of `trinityAgent`: several tests
 * replace that module with a partial mock, so anything imported FROM it at
 * module scope breaks them the day it is added -- measured, twenty-two red
 * tests across nine files. A leaf with no imports of its own is safe to
 * depend on from both the bot's service layer and the agent client.
 *
 * A word rather than an error class, because the marker crosses a module
 * boundary into `classifyAgentFault`, where every other fault is recognised
 * by its text too.
 */
export const STOPPED_BY_OWNER = 'STOPPED_BY_OWNER'

/**
 * Did this failure come from the person's own Stop?
 *
 * A function rather than a bare `includes` at each call site, because the
 * answer decides whether a turn is replayed, and a reader that forgets the
 * marker turns a stop back into a retry.
 */
export function wasStoppedByOwner(message: unknown): boolean {
  return String(message ?? '').includes(STOPPED_BY_OWNER)
}
