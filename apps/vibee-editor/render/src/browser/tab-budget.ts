/**
 * THE AGENT CLEANS UP AFTER ITSELF.
 *
 * `browser_open` opens a tab and nothing ever closed it. `browser_close_tab`
 * exists and the agent, having got what it came for, moves on instead of
 * calling it. Counted on the owner's own pod: 13 tabs on 2026-09-24, 19 on
 * 2026-09-26, and 40 targets by the afternoon -- among them the same subreddit
 * six times over, each with a recaptcha iframe of its own. Every one holds a
 * renderer process, and the pod was the thing that had stopped being a browser
 * (specs/automation/browser-pod-restart.t27): a tab leak is not cosmetic here,
 * it is the most likely way this pod dies again.
 *
 * WHY A BUDGET AND NOT A REMINDER IN THE PROMPT. The reminder was tried: the
 * tool is described, in the compact kit, right next to browser_open. An agent
 * that finishes a task does not go back to tidy, and a model with a 16k window
 * has forgotten the tab it opened four steps ago. So the budget is enforced
 * where the tab is made, by the server, and needs nothing of the agent.
 *
 * WHAT IS NEVER CLOSED. Only tabs THIS server opened for that person, in the
 * order it opened them, and only while they are still alive. A tab the person
 * opened themselves in front of the camera is not ours to close -- they are
 * watching this browser, and a page vanishing under them is worse than a tab
 * too many. The newest `TAB_BUDGET` of ours survive, which is what the agent
 * can plausibly still be working in.
 */

/** Enough for a sign-in, its email tab, and a couple of pages of context. */
export const TAB_BUDGET = 6

export interface Prune {
  /** Ours, oldest first, that should go now. */
  close: string[]
  /** Ours that remain, in the order they were opened. */
  keep: string[]
}

/**
 * Which of the tabs we opened are over budget, given the ones still alive.
 * Pure: the caller does the listing and the closing.
 *
 * Ids that are no longer alive are forgotten rather than closed -- a tab the
 * person shut themselves must not count against the budget, and must not be
 * asked to close twice.
 */
export function overBudget(
  opened: readonly string[],
  alive: ReadonlySet<string>,
  budget: number = TAB_BUDGET
): Prune {
  const ours = opened.filter(id => alive.has(id))
  const room = Math.max(0, budget)
  if (ours.length <= room) return { close: [], keep: ours }
  return { close: ours.slice(0, ours.length - room), keep: ours.slice(-room) }
}
