import { describe, expect, it } from 'vitest'
import * as SPEC from './owner-studio.gen'
import { STUDIOS, studioPrompt, studioTask } from '../owner-studio'

/**
 * gHashTag/t27 specs/automation/owner-studio.t27, vendored beside its
 * `t27c gen-ts` output; its `test` blocks run here against owner-studio.ts.
 */
describe('owner-studio.t27 against the host', () => {
  it('three ready studios, the bars cropped first and no text drawn', () => {
    expect(STUDIOS).toHaveLength(SPEC.STUDIO_COUNT)
    expect(SPEC.STUDIO_COUNT).toBe(3)
    expect(SPEC.CROP_LETTERBOX).toBe(true)
    expect(SPEC.TEXT_IN_IMAGE).toBe(false)
    expect(SPEC.ONE_FACE).toBe(true)
  })

  it("the identity and any studio together fit the model's prompt", () => {
    for (const s of STUDIOS) {
      const p = studioPrompt(s.id)
      expect(p.startsWith(SPEC.IDENTITY)).toBe(true)
      expect(p.length).toBeLessThanOrEqual(20000)
    }
    expect(studioPrompt('nope')).toBe('')
  })

  it('the Kie task uses input_urls, 9:16 and the primary model', () => {
    const t = studioTask('noir', 'https://x/src.jpg')!
    expect(t.model).toBe(SPEC.MODEL)
    expect(t.input.input_urls).toEqual(['https://x/src.jpg'])
    expect(t.input.aspect_ratio).toBe('9:16')
  })
})
