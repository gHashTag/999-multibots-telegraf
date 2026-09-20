/**
 * THE TWO DECISIONS ON THE BROWSER SCREEN THAT MUST NOT BE GUESSED.
 *
 * They live here, outside the component, for a reason that was measured
 * rather than assumed: this app deliberately has no React render library in
 * its dependencies (`src/test/setup.ts` says so), so a test of the screen can
 * only read its source. A source-grep test is blind to behaviour -- both of
 * these survived one:
 *
 *   - the close button rewired to wipe the profile: both function names are
 *     still in the file, so the grep is happy and the person's logins are
 *     gone every time they close the browser;
 *   - the confirmation step removed: the word `confirmForget` is still in the
 *     file, so the grep is happy and one tap wipes everything.
 *
 * Pulled out here, both are ordinary functions with ordinary tests, and a
 * mutation in either is caught.
 */
import {
  closeBrowserSession,
  forgetBrowserProfile,
  type BrowserSessionView,
} from './remoteBrowser'

/**
 * Which request each button makes. Two buttons, two different doors: closing
 * keeps the logins, forgetting destroys them.
 */
export const BROWSER_BUTTONS: Record<
  'close' | 'forget',
  () => Promise<BrowserSessionView>
> = {
  close: closeBrowserSession,
  forget: forgetBrowserProfile,
}

export type WipeStep = { confirming: boolean; wipeNow: boolean }

/**
 * The wipe takes two taps, and the FIRST ONE NEVER WIPES.
 *
 * It cannot be undone: the profile is every account the person signed into.
 * A single tap next to an ordinary "close" button is a mis-tap away from
 * losing all of them.
 */
export function tapWipe(confirming: boolean): WipeStep {
  return confirming
    ? { confirming: false, wipeNow: true }
    : { confirming: true, wipeNow: false }
}
