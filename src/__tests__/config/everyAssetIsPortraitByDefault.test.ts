/**
 * ONE DEFAULT SHAPE, IN ONE PLACE.
 *
 * Owner's instruction, 2026-09-21: the default size for every asset is 9:16,
 * for Instagram and TikTok. Every asset this platform makes is looked at in a
 * vertical feed; a square or landscape frame arrives there letterboxed.
 *
 * The defaults disagreed with that, and disagreed with each other: eleven
 * separate fallbacks written at different times, images to '1:1' and video to
 * '16:9', while new users were already created with `aspect_ratio: '9:16'`.
 * The global rule for this codebase family is that a rule hand-copied into
 * three files is a rule two of them will eventually not know -- so the value
 * lives in config/aspectRatio.ts and every generator points at it.
 *
 * This test is a scan rather than a behavioural drive on purpose: what broke
 * was not one generator's arithmetic, it was eleven independent literals. The
 * thing worth pinning is that none of them came back.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_VIDEO_ASPECT_RATIO,
} from '@/config/aspectRatio'

// `vitest related` runs from the repo root; resolve against this file instead.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

/**
 * Every site that CHOOSES a shape when nobody chose one. Comparisons
 * (`=== '16:9'`), explicit user selections and nearest-ratio mappers are not
 * here: they read a shape, they do not assume one.
 */
const FALLBACK_SITES: Array<[file: string, staleLiteral: string]> = [
  ['services/generateQwenImageEditPlus.ts', "aspect_ratio || '1:1'"],
  ['services/MidjourneyProvider.ts', "aspectRatio = '1:1'"],
  ['services/generateMidjourneyImage.ts', "request.aspectRatio || '1:1'"],
  ['services/generateTextToImageDirect.ts', "userAspectRatio || '1:1'"],
  ['services/generateNeuroPhotoDirect.ts', "finalAspectRatio = '1:1'"],
  ['services/UniversalProviderManager.ts', "request.style || '1:1'"],
  ['services/video-providers/KieAiProvider.ts', "aspectRatio = '16:9'"],
  ['core/replicate/index.ts', "aspect_ratio || '16:9'"],
]

describe('the default asset shape', () => {
  it('is portrait, the frame Reels and TikTok give it', () => {
    expect(DEFAULT_ASPECT_RATIO).toBe('9:16')
  })

  it('is the same for video -- a reel is the same frame as a story', () => {
    expect(DEFAULT_VIDEO_ASPECT_RATIO).toBe(DEFAULT_ASPECT_RATIO)
  })

  it.each(FALLBACK_SITES)(
    '%s no longer keeps its own copy of the default',
    (file, stale) => {
      const src = read(file)
      expect(src, `${file} still hard-codes ${stale}`).not.toContain(stale)
      expect(src).toContain('ASPECT_RATIO')
      expect(src).toContain("from '@/config/aspectRatio'")
    }
  )

  it('the welcome gift asks for it by name rather than by value', () => {
    const src = read('inngest_app/functions/welcomeAvatarGeneration.ts')
    expect(src).toContain('aspect_ratio: DEFAULT_ASPECT_RATIO')
  })
})
