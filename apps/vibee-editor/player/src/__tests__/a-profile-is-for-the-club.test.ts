import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadProfileAtom,
  profileErrorAtom,
  viewedProfileAtom,
} from '@/atoms/profile'

/**
 * "NOT FOR YOU" IS NOT "NOT FOUND".
 *
 * Owner, 2026-09-23: profiles are visible only to club members, by payment.
 * The server answers 403 `club_only` (render/src/club/profile-visibility.ts).
 *
 * The failure this pins is the quiet one: a 403 falling into the generic
 * branch would print "User not found", and the person would go looking for a
 * typo in a name that is perfectly correct while the club never hears from
 * them. The membership itself is decided ONLY on the server -- there is
 * nothing here to keep in step with it, and that is the point.
 */

const answer = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

describe('a profile that is not for you', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says club_only on 403 whatever the body says, and drops the profile', async () => {
    /*
     * Both halves matter, and each one alone passes without the fix:
     *  - the WORD comes from the status, not from the body, so a 403 that
     *    says "Forbidden" still reads as the club and not as a breakage;
     *  - the profile already on screen is DROPPED. Without that a person who
     *    walks from a profile they may see to one they may not keeps looking
     *    at the first one, under the second one's address.
     */
    const store = createStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        answer(200, {
          id: '1',
          telegram_id: '27',
          username: 'mine',
          display_name: 'Mine',
          is_own_profile: false,
        })
      )
    )
    await store.set(loadProfileAtom, 'mine')
    expect(store.get(viewedProfileAtom)).not.toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(403, { error: 'Forbidden' }))
    )
    const result = await store.set(loadProfileAtom, 'Ryabinika_Perm')
    expect(result).toBeNull()
    expect(store.get(profileErrorAtom)).toBe('club_only')
    expect(store.get(viewedProfileAtom)).toBeNull()
  })

  it('still says not found on 404, because the two are different answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(404, { error: 'Not found' }))
    )
    const store = createStore()
    await store.set(loadProfileAtom, 'nobody-at-all')
    expect(store.get(profileErrorAtom)).toBe('User not found')
  })

  it('the screen offers the club instead of an error', () => {
    // jsdom draws nothing, and this branch is three lines of JSX; what is
    // worth pinning is that it exists, is reached by the club_only error
    // alone, and leads somewhere a person can act.
    const page = readFileSync(
      join(__dirname, '..', 'pages', 'Profile.tsx'),
      'utf8'
    )
    expect(page).toContain("if (error === 'club_only')")
    expect(page).toContain("t('profile.club_only')")
    expect(page).toContain("t('profile.club_only_cta')")
    // And it comes BEFORE the generic error screen, or it would never run.
    expect(page.indexOf("if (error === 'club_only')")).toBeLessThan(
      page.indexOf('if (error || !profile)')
    )
  })

  it('both languages say it, because the bar says both', () => {
    const dictionary = readFileSync(
      join(__dirname, '..', 'atoms', 'language.ts'),
      'utf8'
    )
    for (const key of [
      'profile.club_only',
      'profile.club_only_desc',
      'profile.club_only_cta',
    ]) {
      // Twice: once in the English dictionary, once in the Russian one.
      expect(
        dictionary.match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g')) ??
          [],
        key
      ).toHaveLength(2)
    }
  })
})
