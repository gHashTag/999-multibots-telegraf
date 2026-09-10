export type ProfileScreen = 'skeleton' | 'welcome' | 'profile'

/**
 * WHICH SCREEN THE PROFILE ROUTE SHOWS.
 *
 * Owner, 2026-09-09: "the profile must not show until the person has signed in
 * by phone; you cannot enter the user until you authorised through the phone —
 * a mandatory step, otherwise the agent does not work." The connect flow used
 * to live on the seventh tab of the profile; a person who never scrolled there
 * never connected, and the agent stayed inert without anyone knowing why.
 *
 * Later the same day: "on the profile screen we need a welcome onboarding that
 * step by step opens the value of the product and leads to payment; after
 * payment we help enter the Telegram password; then a slide for SOUL.md".
 * The bare connect gate became one step of that road (welcomeSteps.ts), so
 * this function now answers 'welcome' where it used to answer 'connect'.
 *
 * Rules, in order:
 *  - the profile is still loading → skeleton (nothing to decide yet);
 *  - somebody else's profile → profile (there is no phone of theirs to ask for);
 *  - own profile, connect status not asked yet → skeleton (a gate that flashes
 *    for a connected person and then vanishes is a lie for half a second);
 *  - own profile, not connected → welcome (the road is mandatory here: the
 *    profile does not work without the phone login);
 *  - connected, club status not asked yet → skeleton, same reason as above;
 *  - connected, but no club or no SOUL yet → welcome. There is no "later"
 *    (owner, 2026-09-09, evening: "until paid, the profile does not open;
 *    every step is mandatory; we do not move on until the step is done");
 *  - the road is already on screen (`onRoad`) → it stays until the person
 *    finishes it, so paying mid-road does not drop them into the profile;
 *  - everything in place → profile.
 *
 * `soul === null` (not loaded yet) does not hold the page: the SOUL check is
 * an agent tool call, slower than the two HTTP statuses, and a half-second
 * skeleton on every visit for it would cost more than a rare late nudge.
 *
 * `devBypass` is the existing developer flag (the Cyrillic "own" query key,
 * see useIsOwnProfile): it fakes ownership
 * without a Telegram signature, so the status request would always be 401 and
 * the gate would hide the very tabs the flag exists to inspect. Vite strips the
 * branch from production builds.
 */
export function profileScreen(input: {
  loading: boolean
  own: boolean
  connected: boolean | null
  devBypass?: boolean
  /** Club membership active; null = not asked yet. Omitted = not known to caller. */
  club?: boolean | null
  /** A SOUL.md exists; null = not asked yet. */
  soul?: boolean | null
  /**
   * The road is already on screen. It keeps the screen until the person
   * finishes it: joining the club mid-road must not flip the page to the
   * profile before the Telegram and SOUL steps.
   */
  onRoad?: boolean
}): ProfileScreen {
  if (input.loading) return 'skeleton'
  if (!input.own || input.devBypass) return 'profile'
  if (input.connected === null) return 'skeleton'
  if (!input.connected) return 'welcome'
  if (input.club === undefined) return 'profile'
  if (input.club === null) return 'skeleton'
  if (input.onRoad) return 'welcome'
  if (!input.club || input.soul === false) return 'welcome'
  return 'profile'
}

/**
 * WHEN TO ASK THE SERVER FOR THE CLUB PRICE.
 *
 * Measured on a stranger's phone, 2026-09-10 12:31: the paywall step showed
 * "Asking the server for the price..." and a dead "Join for 0 Stars" button
 * forever. The road goes value -> how -> CLUB -> connect -> soul, but the
 * request for the price was gated on `connected === true` -- a fact that is
 * only established two steps LATER. Nobody who had not yet signed in by
 * phone could ever see a price, i.e. nobody new could pay.
 *
 * The price does not depend on the phone: /api/club/status answers any
 * Mini App visitor by their Telegram signature. So the only conditions are:
 * own profile, not asked yet, and no failed attempt sitting on screen (a
 * failure is shown with a retry button, not retried in a loop).
 */
export function shouldAskClubPrice(input: {
  own: boolean
  club: unknown | null
  clubError: string | null
}): boolean {
  return input.own && input.club === null && !input.clubError
}
