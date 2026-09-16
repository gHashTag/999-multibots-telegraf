/**
 * 'rate' IS INSIDE 'generated'.
 *
 * The SeeDream generators sort a failure into one word and print it in the
 * line the owner reads: `[SeeDream4.5] RATE_LIMIT - <retry via fallback>`. The
 * rate branch tested the bare substring 'rate', and every wrapper this service
 * throws around a delivery failure begins:
 *
 *     Failed to process generated image: ...
 *
 * So a CDN that would not answer, a file too big to send, a disk with no space
 * left -- all of them were announced as a provider throttling us, with the
 * reassurance that a retry was already under way. DOWNLOAD_ERROR, the branch
 * written for exactly that, was unreachable for anything wearing that wrapper.
 *
 * Removing the bare 'rate' is only half of it: the sibling bare 'limit' caught
 * `File size (N bytes) exceeds Telegram limit of M bytes` for the same reason.
 * Both halves are pinned below with the exact colliding strings, and the real
 * rate limits are pinned alongside them so the fix cannot be "delete the
 * branch".
 */
import { describe, it, expect } from 'vitest'
import { classifyGenerationFailure } from '@/helpers/classifyGenerationFailure'

/** The wrapper generateSeeDream45.ts puts on every post-generation failure. */
const wrapped = (inner: string) => `Failed to process generated image: ${inner}`

describe("the word 'generated' is not a rate limit", () => {
  it('calls a failed download a download error', () => {
    const { errorType } = classifyGenerationFailure(
      wrapped(
        'Failed to download file: File size (68000000 bytes) exceeds Telegram limit of 50000000 bytes'
      )
    )
    expect(
      errorType,
      "the 'limit' in 'Telegram limit of' was read as a rate limit"
    ).toBe('DOWNLOAD_ERROR')
  })

  it('calls a provider 500 an API error', () => {
    expect(
      classifyGenerationFailure(wrapped('Request failed with status code 500'))
        .errorType
    ).toBe('API_ERROR')
  })

  it('admits it does not know, rather than inventing a throttle', () => {
    const { errorType, isRetriable } = classifyGenerationFailure(
      wrapped('ENOSPC: no space left on device')
    )
    expect(errorType).toBe('UNKNOWN')
    // UNKNOWN is where the caller appends the real message, so an honest
    // "UNKNOWN | ENOSPC..." beats a confident wrong noun. It is also the one
    // label that must not promise a retry.
    expect(isRetriable).toBe(false)
  })

  it('does not find a rate limit anywhere in the wrapper itself', () => {
    for (const inner of [
      'connection reset by peer',
      'no space left on device',
      'permission denied',
    ]) {
      expect(
        classifyGenerationFailure(wrapped(inner)).errorType,
        `"${inner}" was classified as a rate limit`
      ).not.toBe('RATE_LIMIT')
    }
  })
})

describe('a real rate limit is still a rate limit', () => {
  const REAL = [
    'Rate limit exceeded, try again in 30s',
    'rate_limit_error',
    'Request failed with status code 429',
    '429 Too Many Requests',
    'Provider throttled this account',
    'Daily limit reached for this model',
  ]

  for (const message of REAL) {
    it(`recognises "${message}"`, () => {
      const { errorType, isRetriable } = classifyGenerationFailure(message)
      expect(errorType).toBe('RATE_LIMIT')
      expect(isRetriable).toBe(true)
    })
  }
})

describe('the branches around it still answer', () => {
  it('puts a content refusal first, ahead of everything else', () => {
    expect(
      classifyGenerationFailure('E005: image flagged as sensitive').errorType
    ).toBe('NSFW_DETECTED')
  })

  it('still knows a timeout, an empty wallet and a cancellation', () => {
    expect(classifyGenerationFailure('ETIMEDOUT').errorType).toBe('TIMEOUT')
    expect(
      classifyGenerationFailure('Insufficient balance: 0 < 4').errorType
    ).toBe('INSUFFICIENT_BALANCE')
    expect(
      classifyGenerationFailure('Request cancelled by user').errorType
    ).toBe('CANCELLED')
  })

  it('survives an empty message without throwing', () => {
    expect(classifyGenerationFailure('').errorType).toBe('UNKNOWN')
  })
})

/**
 * The label is not inert any more: generateSeeDream45.ts prints it AND routes
 * the level by isContentRefusal / isBalanceRefusal. Two branches here were
 * still sorting by bare substrings, so they could name a customer for a failure
 * the router had correctly decided was ours -- and the owner was paged with a
 * headline blaming a stranger's photo, or a wallet, for our own outage.
 */
describe('the label cannot contradict the level it is routed at', () => {
  const NOT_THE_CUSTOMERS_PICTURE = [
    // The bare 'safety' used to make all three of these a refused photo.
    'safety checker service unavailable',
    'Failed to process generated image: safety checker service unavailable',
    'NSFW classifier unavailable',
  ]

  for (const message of NOT_THE_CUSTOMERS_PICTURE) {
    it(`does not call "${message}" a refused photo`, () => {
      expect(classifyGenerationFailure(message).errorType).not.toBe(
        'NSFW_DETECTED'
      )
    })
  }

  it('does not promise a retry for a broken safety hop', () => {
    // NSFW_DETECTED carried isRetriable, so the alert ended "automatic retry
    // via fallback" -- for an outage where nothing was retrying anything.
    const { errorType, isRetriable } = classifyGenerationFailure(
      'Failed to process generated image: safety checker service unavailable'
    )
    expect(errorType).toBe('UNKNOWN')
    expect(isRetriable).toBe(false)
  })

  it('lets a broken filter fall through to the branch that fits it', () => {
    // The point of the narrowing: what the predicate refuses is not lost, it
    // carries on down the chain and is sorted by what actually happened.
    expect(classifyGenerationFailure('nsfw filter timeout').errorType).toBe(
      'TIMEOUT'
    )
    // ...and when nothing below fits either, UNKNOWN is the honest answer: it
    // is the one label whose caller appends the real message.
    expect(classifyGenerationFailure('nsfw filter timed out').errorType).toBe(
      'UNKNOWN'
    )
  })

  const NOT_THE_CUSTOMERS_WALLET = [
    // The bare 'balance' / 'insufficient' / 'not enough' did the same for money.
    'Failed to fetch user balance',
    'balance check timed out',
    'insufficient permissions to read the model',
    'not enough memory',
  ]

  for (const message of NOT_THE_CUSTOMERS_WALLET) {
    it(`does not call "${message}" an empty wallet`, () => {
      expect(classifyGenerationFailure(message).errorType).not.toBe(
        'INSUFFICIENT_BALANCE'
      )
    })
  }

  it('still recognises the refusals themselves', () => {
    // The narrowing is only correct if the real verdicts survive it: the
    // content word next to a word of verdict, the money word next to the thing
    // there is not enough of.
    expect(
      classifyGenerationFailure('Image rejected: NSFW content detected')
        .errorType
    ).toBe('NSFW_DETECTED')
    expect(
      classifyGenerationFailure('Content flagged as sensitive').errorType
    ).toBe('NSFW_DETECTED')
    expect(classifyGenerationFailure('Not enough stars').errorType).toBe(
      'INSUFFICIENT_BALANCE'
    )
    expect(
      classifyGenerationFailure('Insufficient funds: 0 < 24').errorType
    ).toBe('INSUFFICIENT_BALANCE')
  })
})
