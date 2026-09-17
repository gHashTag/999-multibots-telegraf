/**
 * A CLIENT WITH NO PHOTO COULD NOT MAKE A LIPSYNC AT ALL.
 *
 * Hedra renders from a still image and the event schema REQUIRES
 * `avatar_settings.avatar_photo_url`, so a person who never uploaded a picture
 * met a validation refusal -- which reads as the feature being broken rather
 * than a step being missing. Their avatar was on the user row the whole time.
 *
 * The order is the whole rule, so the order is what is pinned here.
 */
import { describe, it, expect } from 'vitest'
import { pickAvatarPhoto } from '@/helpers/resolveAvatarPhoto'

describe('which photo a lipsync render uses', () => {
  const CHOSEN = 'https://example.test/chosen.jpg'
  const AVATAR = 'https://example.test/avatar.jpg'

  /*
   * THE POINT OF THE ORDER. A default that outranks a deliberate choice is
   * worse than no default: the person watches their own picture be ignored and
   * has no way to say "no, that one".
   */
  it('uses what the person chose, even when an avatar exists', () => {
    expect(pickAvatarPhoto(CHOSEN, AVATAR)).toBe(CHOSEN)
  })

  it('falls back to the stored avatar when nothing was chosen', () => {
    expect(pickAvatarPhoto('', AVATAR)).toBe(AVATAR)
    expect(pickAvatarPhoto(null, AVATAR)).toBe(AVATAR)
    expect(pickAvatarPhoto(undefined, AVATAR)).toBe(AVATAR)
  })

  /*
   * The wizards pass `ctx.session.…imageUrl || ''`, and a stored value can be
   * whitespace. Either would sail through a plain truthiness check and reach
   * the provider as a broken URL, which costs a failed render instead of a
   * refusal.
   */
  it('treats blank and whitespace as absent on both sides', () => {
    expect(pickAvatarPhoto('   ', AVATAR)).toBe(AVATAR)
    expect(pickAvatarPhoto('\n\t ', AVATAR)).toBe(AVATAR)
    expect(pickAvatarPhoto('', '   ')).toBeNull()
    expect(pickAvatarPhoto('', '')).toBeNull()
  })

  it('trims what it returns, so a stray newline never reaches a provider', () => {
    expect(pickAvatarPhoto(` ${CHOSEN} `, AVATAR)).toBe(CHOSEN)
    expect(pickAvatarPhoto('', `${AVATAR}\n`)).toBe(AVATAR)
  })

  /*
   * Null, not '' -- the caller has to decide what an absent photo means, and for
   * Hedra it means the event must still be refused rather than sent with an
   * empty string the schema would accept as present.
   */
  it('says null when there is no photo anywhere', () => {
    expect(pickAvatarPhoto(null, null)).toBeNull()
    expect(pickAvatarPhoto(undefined, undefined)).toBeNull()
  })
})
