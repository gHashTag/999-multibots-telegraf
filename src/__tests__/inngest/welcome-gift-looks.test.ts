/**
 * A GIFT MADE FROM AN AVATAR HAS TO LOOK LIKE THE AVATAR.
 *
 * Owner, 2026-09-22, quoted as he said it: "подарки в боте не делаются из // cyrillic-ok: his own words
 * аватарки юзера... смысла нет картинку делать без аватарки юзера" -- the gift // cyrillic-ok: his own words
 * is pointless if it is not made from the person's avatar.
 *
 * The function DID pass the avatar as the reference image all along -- what it did not do was ask the model to keep
 * the face, and what it did instead was name trademarked characters, which the
 * provider refused outright. His own registration that morning came back
 * "Content review failed" and no gift was sent at all.
 *
 * Neither half can be measured in a unit test -- whether a face survives, and
 * whether a filter says yes, are facts about a live provider, and both were
 * measured against kie.ai on 2026-09-22 (see welcomeGiftLooks.ts). What CAN be
 * pinned here is that the two properties those measurements depend on are still
 * in the prompt the next person writes: the order to keep the face, and no
 * character to imitate instead of the customer.
 */
import { describe, it, expect } from 'vitest'
import {
  GIFT_LOOKS,
  PLAIN_LOOK,
  giftLookById,
  giftPrompt,
  pickGiftLook,
} from '@/inngest_app/functions/welcomeGiftLooks'

const ALL = [...GIFT_LOOKS, PLAIN_LOOK]

describe('every look the welcome gift can be made in', () => {
  it('orders the model to keep the face from the reference photo', () => {
    for (const look of ALL) {
      const prompt = giftPrompt(look)
      expect(prompt).toContain('Keep the face from the reference photo')
      expect(prompt).toContain('recognisable as the same person')
    }
  })

  it('allows only the clothing, the pose and the background to change', () => {
    for (const look of ALL) {
      expect(giftPrompt(look)).toContain(
        'Change only the clothing, the pose and the background'
      )
    }
  })

  it('is shot in the frame the platform shows, 9:16', () => {
    for (const look of ALL) {
      expect(giftPrompt(look)).toContain('Aspect ratio 9:16')
    }
  })

  /*
   * The named characters are what the provider refused: measured 2026-09-22,
   * seven of the ten prompts we shipped came back refused as text-to-image and
   * the filter is stricter still with a real face in the frame. A character is
   * also a face -- the one thing this gift must not substitute for the
   * customer's own.
   */
  it('names no character for the model to imitate instead of the customer', () => {
    const CHARACTERS =
      /spider|iron man|captain america|thor\b|batman|wonder woman|black widow|supergirl|superman|gamora|captain marvel|kryptonian|asgard|gotham|avenger|marvel|dc comics/i
    for (const look of ALL) {
      expect(giftPrompt(look)).not.toMatch(CHARACTERS)
    }
  })

  it('gives each look an id and a Russian name for the caption', () => {
    for (const look of ALL) {
      expect(look.id).toMatch(/^[a-zA-Z]+$/)
      expect(look.ru.trim().length).toBeGreaterThan(0)
    }
    expect(new Set(ALL.map(l => l.id)).size).toBe(ALL.length)
  })
})

describe('picking a look', () => {
  it('stays inside the list for every roll of the dice', () => {
    for (const roll of [0, 0.5, 0.999999, 1]) {
      expect(GIFT_LOOKS).toContain(pickGiftLook(() => roll))
    }
  })

  it('is read back by the id a step logged', () => {
    for (const look of ALL) {
      expect(giftLookById(look.id)).toBe(look)
    }
  })

  it('falls back to a real look rather than throwing on an unknown id', () => {
    expect(GIFT_LOOKS).toContain(giftLookById('a-look-that-was-deleted'))
  })

  /*
   * The retry when a costume is refused. It must be plain: a filter verdict is
   * about the whole request, so a second costume would be a second gamble with
   * the owner's money and the newcomer's only gift.
   */
  it('keeps a plain portrait to retry with, with no costume in it', () => {
    expect(GIFT_LOOKS).not.toContain(PLAIN_LOOK)
    expect(giftPrompt(PLAIN_LOOK)).toContain('Keep the face')
    expect(giftPrompt(PLAIN_LOOK)).not.toMatch(
      /armour|spacesuit|diving suit|cloak|robes/i
    )
  })
})
