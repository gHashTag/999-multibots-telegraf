/**
 * Spec agent-media-kie.t27 (gHashTag/t27#8069), every test block run against
 * the spec's compiled logic as the host calls it, then the behaviour: the
 * Director's video_generate orders on Kie and is charged by the same price
 * the app uses, the picture chain runs Kie first, image_generate covers Kie,
 * and a prompt with no named style asks for real footage (issue #3920).
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './agent-media-kie.gen'
import {
  addsRealism,
  clipSeconds,
  imagePriceCovers,
  mayOrderVideo,
} from './agent-media-kie.logic'
import { REALISM_WORDS, realPrompt, videoOrder } from '../agent/agent-media'
import {
  costCeilingUsd,
  kieVideoSaleOf,
  priceForModel,
  TOKEN_PRICES,
} from '../agent/billing-shared'
import {
  imageChainLegs,
  imageLegCost,
  KIE_IMAGE_LEG,
  POLLINATIONS_IMAGE_LEG,
} from '../image-chain'

describe('spec agent-media-kie.t27', () => {
  it('the agent orders video on Kie, and only a model whose bill is named first', () => {
    expect(mayOrderVideo(true, true)).toBe(true)
    expect(mayOrderVideo(false, true)).toBe(false)
    expect(mayOrderVideo(true, false)).toBe(false)
  })

  it('a clip is six or ten seconds', () => {
    expect(SPEC.CLIP_SHORT_SECONDS).toBe(6)
    expect(SPEC.CLIP_LONG_SECONDS).toBe(10)
    expect(clipSeconds(1)).toBe(6)
    expect(clipSeconds(6)).toBe(6)
    expect(clipSeconds(7)).toBe(10)
    expect(clipSeconds(60)).toBe(10)
  })

  it('a prompt that names no style asks for real footage', () => {
    expect(SPEC.ASKS_REALISM).toBe(true)
    expect(addsRealism(false)).toBe(true)
    expect(addsRealism(true)).toBe(false)
  })

  it('image_generate covers Kie, so Kie draws first', () => {
    expect(SPEC.IMAGE_GENERATE_COST_MICRO_USD).toBe(20000)
    expect(imagePriceCovers(20000)).toBe(true)
    expect(imagePriceCovers(0)).toBe(true)
    expect(imagePriceCovers(20001)).toBe(false)
    expect(imagePriceCovers(150000)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe('the Director makes the clip on Kie (#3920)', () => {
  it("the default model is the spec's, sold before the press, and priced like the app", () => {
    const order = videoOrder(undefined, undefined)
    expect(order).toMatchObject({ model: SPEC.AGENT_VIDEO_MODEL, seconds: 6 })
    expect(kieVideoSaleOf(SPEC.AGENT_VIDEO_MODEL).sold).toBe(true)
    expect(
      priceForModel('video_generate', SPEC.AGENT_VIDEO_MODEL)
    ).toBeGreaterThan(0)
  })

  it('an old Replicate name is the default clip, not a refusal', () => {
    expect(videoOrder('kling-v1-6 std', 10)).toMatchObject({
      model: SPEC.AGENT_VIDEO_MODEL,
      seconds: 10,
    })
  })

  it('a per-second Kie model is charged for the seconds it is asked for', () => {
    const order = videoOrder('kie/minimax-h3/text-to-video', 10)
    expect(order).toEqual({
      model: 'kie/minimax-h3/text-to-video',
      seconds: 10,
      units: 10,
    })
    const clip = videoOrder('kie/kling/v2-1-pro', 10)
    expect(clip).toMatchObject({ units: 1 })
  })

  it('a Kie model whose bill the provider picks is refused before anything is spent', () => {
    const r = videoOrder('kie/bytedance/seedance-2-fast', 6)
    expect('refused' in r && r.refused).toMatch(/не продаётся/) // cyrillic-ok: the refusal under test
    expect('refused' in r && r.refused).toMatch(/Ничего не списано/) // cyrillic-ok: the refusal under test
  })

  it('a model that works on a sent file is refused, not thrown', () => {
    const r = videoOrder('kie/topaz/video-upscale', 6)
    expect('refused' in r && r.refused).toMatch(/присланный ролик/) // cyrillic-ok: the refusal under test
  })

  it('a cow is a real cow unless a style is named', () => {
    expect(realPrompt('a cow in a meadow', undefined)).toBe(
      `a cow in a meadow\n${REALISM_WORDS}`
    )
    expect(realPrompt('a cow', '  ')).toContain(REALISM_WORDS)
    const cartoon = realPrompt('a cow', 'cartoon')
    expect(cartoon).not.toContain(REALISM_WORDS)
    expect(cartoon).toBe('a cow Style: cartoon.')
  })
})

describe('pictures: Kie first, priced to cover it (#3920)', () => {
  const run = {
    fal: async () => 'f',
    replicate: async () => 'r',
    pollinations: async () => 'p',
    kie: async () => 'k',
  }

  it('the chain is Kie, then the free rescue -- nothing else', () => {
    const legs = imageChainLegs('fal-ai/nano-banana-pro', run)
    expect(legs.map(l => l.name)).toEqual([
      KIE_IMAGE_LEG,
      POLLINATIONS_IMAGE_LEG,
    ])
  })

  it("image_generate's ceiling covers the Kie leg, and its price is 8 tokens", () => {
    const kie = imageLegCost(KIE_IMAGE_LEG)!
    expect(kie).toBe(0.02)
    expect(costCeilingUsd('image_generate')).toBeGreaterThanOrEqual(kie)
    expect(imagePriceCovers(Math.round(kie * 1_000_000))).toBe(true)
    expect(TOKEN_PRICES.image_generate).toBe(8)
  })
})
