/**
 * THE RULES BEHIND THE NOTICE, WITHOUT THE COMPONENT.
 *
 * Split out of `AllRefused.tsx` on 25.09.2026. A module that exports both a
 * component and plain functions breaks Fast Refresh -- React cannot tell what
 * to re-render, so it reloads the page and the state a person was in is gone.
 * The player's own eslint says so (`react-refresh/only-export-components`)
 * and nothing had been running it, which is how three of these ended up in a
 * file I wrote two days ago.
 *
 * NAMED `refusalRules`, not `allRefused`: this filesystem does not tell
 * `AllRefused.ts` from `allRefused.ts`, and TypeScript refused the pair
 * outright ("differs only in casing"). Two files whose names a machine
 * cannot separate are a trap whatever the machine says.
 *
 * The rules are unchanged and still guarded by `AllRefused.test.tsx`.
 */
export interface Refusal {
  reachable: boolean
  error?: string
}

/**
 * The one reason they all failed for, or null.
 *
 * Null when anything loaded, when they disagree, or when there is nothing to
 * judge: "all of an empty list failed" is true and useless, and it would
 * paint the notice over a screen that is merely still loading.
 */
export function oneReasonForAll(states: readonly Refusal[]): string | null {
  if (states.length < 2) return null
  if (states.some(s => s.reachable)) return null
  const reasons = new Set(states.map(s => String(s.error ?? '').trim()))
  if (reasons.size !== 1) return null
  const only = [...reasons][0]!
  return only || null
}

/** Does this reason mean the session was refused rather than the server broke? */
export function isSignInReason(reason: string): boolean {
  return /\b401\b|\b403\b/.test(reason)
}

/** True when this panel's own message would only repeat the notice above. */
export function coveredByNotice(
  state: { reachable: boolean; error?: string },
  noticeReason: string | null
): boolean {
  if (!noticeReason) return false
  return !state.reachable && String(state.error ?? '').trim() === noticeReason
}
