/**
 * THE PREDICATE THAT DECIDES WHETHER A REFUSED PHOTO RINGS A PHONE.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error' (:231), so
 * the level a line is written at is a routing decision. A provider declining
 * somebody's selfie on its own safety filter is not an incident -- there is no
 * key to rotate and no service to restart -- and several sites now ask this
 * predicate which level to use.
 *
 * That makes the FALSE POSITIVES the expensive direction, and the negatives
 * below are the point of this file: "NSFW classifier unavailable" and "safety
 * checker service unavailable" are OUR machinery breaking while wearing the
 * vocabulary of a refusal. A predicate that matched the bare words would take
 * an outage off the owner's phone. Anything unrecognised is machinery.
 */
import { describe, it, expect } from 'vitest'
import {
  isContentRefusal,
  ContentRefusalError,
} from '@/helpers/isContentRefusal'

describe('a provider refusing the customer content', () => {
  const REFUSALS = [
    'E005: content flagged as sensitive',
    'Kling returned E005',
    'Content rejected by Google policy. Please try different prompt or image.',
    'Your request was rejected as a result of our safety system',
    'NSFW content detected in the uploaded image',
    'The image was blocked by the moderation service',
    'Prompt violates our content policy',
    'sensitive content detected, generation refused',
  ]

  for (const message of REFUSALS) {
    it(`recognises "${message}"`, () => {
      expect(isContentRefusal(new Error(message))).toBe(true)
    })
  }

  it('reads the same verdict out of a bare string and a plain object', () => {
    expect(isContentRefusal('E005')).toBe(true)
    expect(
      isContentRefusal({ errorMessage: 'content flagged as sensitive' })
    ).toBe(true)
    expect(isContentRefusal({ message: 'NSFW detected' })).toBe(true)
  })

  it('believes the classification we made ourselves', () => {
    // The morphing refusal carries product copy in Russian and English and
    // names no error code, so the outer catch cannot read a refusal out of the
    // message. The type carries what the wording cannot.
    const typed = new ContentRefusalError('a long bilingual apology')
    expect(isContentRefusal(typed)).toBe(true)
    expect(typed).toBeInstanceOf(Error)
    expect(isContentRefusal({ contentRefusal: true })).toBe(true)
  })
})

describe('our own machinery keeps paging', () => {
  const OURS = [
    // The dangerous ones: refusal vocabulary, but nobody refused anything.
    'NSFW classifier unavailable',
    'nsfw filter timed out',
    'safety checker service unavailable',
    'Content-Length mismatch',
    // ...and the ordinary outages that share a catch block with a refusal.
    'Generation timeout',
    'Model not found',
    'Insufficient credits',
    'Video generation failed',
    'fetch failed',
    'Request failed with status code 503',
    'replicate.run timed out after 900000ms',
  ]

  for (const message of OURS) {
    it(`does NOT silence "${message}"`, () => {
      expect(isContentRefusal(new Error(message))).toBe(false)
    })
  }

  it('says no to nothing at all', () => {
    expect(isContentRefusal(undefined)).toBe(false)
    expect(isContentRefusal(null)).toBe(false)
    expect(isContentRefusal('')).toBe(false)
    expect(isContentRefusal({})).toBe(false)
    expect(isContentRefusal(new Error(''))).toBe(false)
  })
})
