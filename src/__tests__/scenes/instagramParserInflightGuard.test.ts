/**
 * instagramParserWizard must not double-charge on a concurrent Confirm (#1368,
 * cluster #1358). The confirm path awaits generateInstagramScraping then charges
 * (updateUserBalance MONEY_OUTCOME) inside a try, before scene.leave(), so a
 * second Confirm during the ~parse re-enters and double-charges. Same class as
 * #1343/#1355/#1357/#1360/#1362/#1364/#1366 (proven in neuroPhotoDoubleCharge).
 *
 * Structural, mutation-checked: reject-before-set must precede the parse try; the
 * flag must be released in a finally. Set-true/false presence is also enforced by
 * paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/scenes/instagramParserWizard/index.ts', 'utf8')

describe('instagramParserWizard in-flight guard (#1368)', () => {
  it('rejects-before-set BEFORE the parse/charge', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.instagramParserInProgress)')
    const setIdx = SRC.indexOf('ctx.session.instagramParserInProgress = true')
    const genIdx = SRC.indexOf('await generateInstagramScraping(')
    expect(checkIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
    expect(genIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(setIdx)
    expect(setIdx).toBeLessThan(genIdx)
  })
  it('releases the flag (set false) in a finally', () => {
    expect(SRC).toContain('ctx.session.instagramParserInProgress = false')
    expect(SRC).toMatch(
      /\} finally \{[\s\S]{0,80}instagramParserInProgress = false/
    )
  })
})
