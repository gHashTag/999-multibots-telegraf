/**
 * plan-reel.t27 in the player: the picture of a reel and the cabinet's count,
 * from the spec's numbers, and the spec's generated module the SAME bytes as
 * the render's (the host of record, render/src/spec/plan-reel.test.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/plan-reel.gen'
import {
  PREVIEW_CARD_PX,
  isTrial,
  previewHeight,
  previewShown,
  previewSrc,
  previewsShown,
} from './planReel'

describe('plan-reel.t27, in the player', () => {
  it("is the render's generated module, byte for byte", () => {
    const here = readFileSync(
      join(__dirname, '../spec/plan-reel.gen.ts'),
      'utf8'
    )
    const render = readFileSync(
      join(__dirname, '../../../render/src/spec/plan-reel.gen.ts'),
      'utf8'
    )
    expect(here).toBe(render)
  })

  it('the cabinet shows at most three reels, as 9:16 pictures', () => {
    expect(previewsShown(0)).toBe(0)
    expect(previewsShown(2)).toBe(2)
    expect(previewsShown(3)).toBe(3)
    expect(previewsShown(12)).toBe(SPEC.PREVIEWS_MAX)
    expect(previewHeight(PREVIEW_CARD_PX)).toBe(128)
    expect(previewHeight(90)).toBe(160)
  })

  it('a reel that came out stands on its card; nothing else does', () => {
    expect(previewShown('https://bucket.example/reel.mp4')).toBe(true)
    expect(previewShown(null)).toBe(false)
    expect(previewShown(undefined)).toBe(false)
    expect(previewShown('reel.mp4')).toBe(false)
  })

  it('the picture is the frame past the first, never the first', () => {
    expect(previewSrc('https://bucket.example/reel.mp4')).toBe(
      `https://bucket.example/reel.mp4#t=${SPEC.PREVIEW_SEEK_MS / 1000}`
    )
    expect(previewSrc('https://bucket.example/reel.mp4#t=9')).toBe(
      `https://bucket.example/reel.mp4#t=${SPEC.PREVIEW_SEEK_MS / 1000}`
    )
  })

  it("the trial is the plan's first reel", () => {
    expect(isTrial(SPEC.TRIAL_SCENES)).toBe(true)
    expect(isTrial(SPEC.FULL_SCENES)).toBe(false)
  })
})
