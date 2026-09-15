/**
 * GPT-Image-2.5, pinned to what the API actually accepts.
 *
 * Measured against kie.ai on 2026-09-15 with the production key:
 *
 *   - `gpt-image-2-5-flare-text-to-image`, `gpt-image-2-5-flare-image-to-image`
 *     and `gpt-image-2-5-sunburst-text-to-image` answer 200;
 *   - `gpt-image-2-5-flare-edit-image` answers 422 "model not found", so
 *     image-to-image is a separate model ID, not a flag on the text model;
 *   - a 9:16 request returned 940 x 1672 (ratio 0.5622), i.e. the ratio is
 *     honoured;
 *   - the job cost 6 credits at 1K and finished in ~50 s.
 *
 * Two of those matter enough to hold still. The default ratio is 9:16 because
 * this bot's images are looked at on a phone, and FLUX's schema in this same
 * repository shipped for months with a three-value ratio enum whose missing
 * portrait entries were silently remapped to "match the input image" -- which,
 * for a square Telegram avatar, meant everyone who asked for 9:16 got 1:1.
 * And the model id has to follow the input: handed `image_urls`, the
 * text-to-image id does not error, it just ignores them, which would hand a
 * person a stranger who merely matches the prompt.
 */
import { describe, it, expect } from 'vitest'
import {
  GptImage25InputSchema,
  GptImage25ModelSchema,
  GptImage25AspectRatioSchema,
  getGptImage25Dimensions,
  pickGptImage25Model,
  GPT_IMAGE_25_AVATAR_CONFIG,
} from '@/schemas/gptImage25.schema'

describe('GPT-Image-2.5 schema', () => {
  it('defaults to portrait 9:16', () => {
    const parsed = GptImage25InputSchema.parse({ prompt: 'a portrait' })
    expect(parsed.aspect_ratio).toBe('9:16')
    expect(GPT_IMAGE_25_AVATAR_CONFIG.aspect_ratio).toBe('9:16')
  })

  it('accepts every ratio the API accepts', () => {
    for (const ratio of [
      'auto',
      '1:1',
      '3:2',
      '2:3',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '21:9',
      '27:16',
      '16:27',
      '9:8',
      '8:9',
    ]) {
      expect(GptImage25AspectRatioSchema.safeParse(ratio).success).toBe(true)
    }
    expect(GptImage25AspectRatioSchema.safeParse('9:21').success).toBe(false)
  })

  it('holds only the model ids that answered 200', () => {
    expect(
      GptImage25ModelSchema.safeParse('gpt-image-2-5-flare-text-to-image')
        .success
    ).toBe(true)
    expect(
      GptImage25ModelSchema.safeParse('gpt-image-2-5-flare-image-to-image')
        .success
    ).toBe(true)
    // 422 "model not found" when sent to the live API.
    expect(
      GptImage25ModelSchema.safeParse('gpt-image-2-5-flare-edit-image').success
    ).toBe(false)
  })

  it('picks image-to-image only when there is an image', () => {
    expect(pickGptImage25Model(true)).toBe('gpt-image-2-5-flare-image-to-image')
    expect(pickGptImage25Model(false)).toBe('gpt-image-2-5-flare-text-to-image')
  })

  it('refuses an empty prompt', () => {
    expect(GptImage25InputSchema.safeParse({ prompt: '' }).success).toBe(false)
  })

  it('reports a portrait shape for a portrait ratio', () => {
    const dims = getGptImage25Dimensions('9:16')
    expect(dims).not.toBeNull()
    expect(dims!.height).toBeGreaterThan(dims!.width)
    // Measured 940 x 1672 -> 0.5622. The derived figure must agree on shape.
    expect(dims!.width / dims!.height).toBeCloseTo(9 / 16, 2)

    // The FLUX bug in miniature: a square must not come back for a wide ratio.
    const wide = getGptImage25Dimensions('16:9')
    expect(wide!.width).toBeGreaterThan(wide!.height)

    expect(getGptImage25Dimensions('auto')).toBeNull()
  })
})
