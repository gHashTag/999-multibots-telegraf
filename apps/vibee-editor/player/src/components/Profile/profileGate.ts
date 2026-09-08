export type ProfileScreen = 'skeleton' | 'connect' | 'profile'

/**
 * WHICH SCREEN THE PROFILE ROUTE SHOWS.
 *
 * Owner, 2026-09-09: "the profile must not show until the person has signed in
 * by phone; you cannot enter the user until you authorised through the phone —
 * a mandatory step, otherwise the agent does not work." The connect flow used
 * to live on the seventh tab of the profile; a person who never scrolled there
 * never connected, and the agent stayed inert without anyone knowing why.
 *
 * Rules, in order:
 *  - the profile is still loading → skeleton (nothing to decide yet);
 *  - somebody else's profile → profile (there is no phone of theirs to ask for);
 *  - own profile, status not asked yet → skeleton (a gate that flashes for a
 *    connected person and then vanishes is a lie for half a second);
 *  - own profile, not connected → connect;
 *  - connected → profile.
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
}): ProfileScreen {
  if (input.loading) return 'skeleton'
  if (!input.own || input.devBypass) return 'profile'
  if (input.connected === null) return 'skeleton'
  return input.connected ? 'profile' : 'connect'
}
