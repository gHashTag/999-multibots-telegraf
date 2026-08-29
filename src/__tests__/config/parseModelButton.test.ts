/**
 * Regression test: parseModelButton must NOT invent a model.
 *
 * It used to return veo3_fast for ANY unmatched text. So a user who typed their
 * video description (or a typo) at the model-selection step was told
 * "model selected: <their text>", got session.selectedVideoModel = 'veo3_fast',
 * and the next message generated and BILLED a model they never chose. It also
 * made textToVideoWizard's "please pick a model from the buttons" branch
 * unreachable dead code, and imageToVideoWizard had no such branch at all.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import {
  parseModelButton,
  generateModelButton,
  getModelsByInputType,
} from '@/config/unified-video-models.config'

describe('parseModelButton', () => {
  it('returns null for free text that is not a model button', () => {
    expect(parseModelButton('a cat surfing on a rainbow')).toBeNull()
    expect(parseModelButton('привет')).toBeNull()
    expect(parseModelButton('')).toBeNull()
  })

  it('does not silently fall back to veo3_fast', () => {
    const parsed = parseModelButton('definitely not a model name')
    expect(parsed?.modelId).not.toBe('veo3_fast')
    expect(parsed).toBeNull()
  })

  it('round-trips EVERY button the wizards actually offer', () => {
    // The proof that dropping the fallback broke nothing: generate the exact
    // text the wizard puts on the keyboard for every offered model, in both
    // aspect ratios, and parse it back to the same model id.
    //
    // Note the parser only knows models with status 'active' (getActiveModels),
    // which is exactly the set the wizards render (getModelsByInputType also
    // filters on active) -- so the two sets cannot drift apart silently.
    for (const inputType of ['text', 'image'] as const) {
      const offered = getModelsByInputType(inputType)
      expect(offered.length).toBeGreaterThan(0)
      for (const model of offered) {
        for (const aspect of ['16:9', '9:16'] as const) {
          const button = generateModelButton(model.id, aspect, true)
          const parsed = parseModelButton(button)
          expect(parsed, `did not parse: "${button}"`).not.toBeNull()
          expect(parsed?.modelId).toBe(model.id)
          expect(typeof parsed?.cost).toBe('number')
        }
      }
    }
  })
})

describe('both video wizards handle the null', () => {
  const T2V = fs.readFileSync('src/scenes/textToVideoWizard/index.ts', 'utf8')
  const I2V = fs.readFileSync('src/scenes/imageToVideoWizard/index.ts', 'utf8')

  it('textToVideoWizard keeps its guard (now reachable)', () => {
    expect(T2V).toContain('if (parsedModel)')
    expect(T2V).toContain('выберите модель из кнопок')
  })

  it('imageToVideoWizard re-prompts instead of billing a guessed model', () => {
    expect(I2V).toContain('if (!parsedModel)')
    const idx = I2V.indexOf('if (!parsedModel)')
    // The guard must return before the session is populated with a model.
    const after = I2V.slice(idx, idx + 500)
    expect(after).toContain('return')
    expect(after.indexOf('return')).toBeLessThan(
      after.indexOf('selectedVideoModel') === -1
        ? Number.MAX_SAFE_INTEGER
        : after.indexOf('selectedVideoModel')
    )
  })
})
