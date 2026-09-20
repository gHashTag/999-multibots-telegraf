/**
 * WHEN THE SCREEN SHOULD JUMP TO THE BROWSER BY ITSELF.
 *
 * The point of the tab is watching an agent work. An agent can start a
 * browser at any moment -- from the bot, from a seller thread, from a
 * developer's console -- and all of them go through the same broker, so the
 * one honest signal available to this app is the session turning `live`.
 *
 * A SCREEN THAT YANKS SOMEBODY AROUND IS HOSTILE, so the rule is narrow:
 *
 *   - it follows a session ONCE. After that the person may walk away and
 *     stay away; the app will not drag them back every ten seconds.
 *   - it never interrupts somebody already looking at the browser.
 *   - a new session is a new event, because that is a new piece of work
 *     worth seeing.
 *
 * All of that is here, as a function, rather than inside an effect -- this
 * app deliberately has no React render library in its tests
 * (`src/test/setup.ts`), and a rule buried in a component would be tested by
 * grepping its source, which cannot see behaviour.
 */
import type { BrowserState } from './remoteBrowser'

export interface FollowInput {
  state: BrowserState
  sessionId?: string
  /** Where the person is right now. */
  currentPath: string
  /** The last session this app already jumped to, if any. */
  followedSessionId: string | null
}

export const BROWSER_ROUTE = '/browser'

export function shouldFollow(i: FollowInput): boolean {
  if (i.state !== 'live') return false
  if (!i.sessionId) return false
  /* Already watching: nothing to jump to. */
  if (i.currentPath.startsWith(BROWSER_ROUTE)) return false
  /* Followed once already -- their choice to be elsewhere stands. */
  if (i.followedSessionId === i.sessionId) return false
  return true
}

/**
 * How often to ask. Ten seconds is slow enough to be invisible on a phone
 * bill and fast enough that "the agent started" feels immediate.
 */
export const WATCH_INTERVAL_MS = 10_000

export interface PollConditions {
  /**
   * This deployment cannot run pods at all -- Railway answers 503 by design
   * (no Docker, no machine API, no UDP range). Polling on regardless would
   * be one request per person every ten seconds forever, for a feature that
   * cannot work there. Found before shipping, not after.
   */
  unavailable: boolean
  /** The app is in the background; nobody is watching this screen. */
  hidden: boolean
  /**
   * The app is inside the game's TRI frame on t27.ai, where it NEVER holds a
   * session (lib/framedSession.ts). Caught by `embed-guest-panel.test.tsx`
   * the first time this watcher shipped without the check: it would have
   * fired an authenticated request that answers 401 every ten seconds, for
   * every guest who ever opens the game, forever.
   */
  embedded: boolean
  /**
   * Nobody is signed in, so there is no browser to watch and never will be
   * until somebody signs in. The route answers 401, which this app shows as
   * "open it from the bot" -- a perfectly good screen, and a perfectly
   * pointless thing to ask for every ten seconds forever.
   */
  signedOut: boolean
}

export function shouldPoll(c: PollConditions): boolean {
  return !c.hidden && !c.embedded && !c.unavailable && !c.signedOut
}

/**
 * WHY THE BROWSER IS SUDDENLY GONE.
 *
 * Idle pods are stopped after ten minutes, so a person who steps away and
 * comes back finds nothing where their browser was. Without a word, that
 * reads as "it logged me out" -- and they would be wrong, because the
 * profile is exactly where they left it.
 *
 * So: if this screen SAW a live session and now sees none, it says so. Not
 * shown to somebody who never had one; there is nothing to explain to them.
 */
export function wentOut(
  previous: BrowserState | null,
  next: BrowserState
): boolean {
  return previous === 'live' && next === 'none'
}

/**
 * WHO IS DRIVING, IN WORDS THE SCREEN CAN SHOW.
 *
 * Three states, and the difference matters to the person: an agent is
 * working, THEY are working, or the browser is simply open. Touching the
 * picture takes the wheel; handing it back is a deliberate press, because a
 * browser that silently returns to an agent mid-sentence is a browser nobody
 * trusts.
 */
export type Wheel = 'agent' | 'person' | 'idle'

export function wheelAfterTouch(): Wheel {
  return 'person'
}

export function wheelAfterHandBack(): Wheel {
  return 'agent'
}
