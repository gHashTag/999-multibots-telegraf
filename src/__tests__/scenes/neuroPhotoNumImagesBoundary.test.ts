/**
 * neuroPhotoWizard parses the image count from free-typed text
 * (`numImages = parseInt(text, 10)`) when the input is not one of the 1-4 button
 * keycaps. It had NO boundary validation and a comment falsely claiming
 * "validated above" -- a typed 0 / negative / non-numeric (NaN) / huge value was
 * passed straight to generate(). The money impact is contained downstream
 * (generateNeuroPhotoHybrid rejects <= 0, handleTrainingCost-style), but the
 * wizard should not forward a bad count, and its sibling neuroCoderScene already
 * validates at the boundary (isNaN || !allowedValues.includes).
 *
 * Fix: validate numImages against the button range [1,2,3,4] right after the
 * parse (mirrors neuroCoderScene). Source seam: the parse is followed by an
 * isNaN + allowlist guard before generate(). Mutation (removing it) fails.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const code = () =>
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'scenes', 'neuroPhotoWizard', 'index.ts'),
    'utf8'
  )

describe('neuroPhotoWizard validates the typed image count at the boundary', () => {
  it('guards numImages with isNaN + an allowlist before generate()', () => {
    const s = code()
    const parse = s.indexOf('numImages = parseInt(text')
    expect(parse, 'numImages parse not found').toBeGreaterThan(-1)
    const generate = s.indexOf('generate(numImages)')
    expect(generate, 'generate(numImages) call not found').toBeGreaterThan(
      parse
    )
    const between = s.slice(parse, generate)
    expect(
      /isNaN\(numImages\)/.test(between) &&
        /includes\(numImages\)/.test(between),
      'no isNaN + allowlist guard between the parse and generate() -- a typed 0/negative/NaN count is forwarded'
    ).toBe(true)
  })
})
