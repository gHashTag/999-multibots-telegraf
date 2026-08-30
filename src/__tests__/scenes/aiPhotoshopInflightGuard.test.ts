/**
 * aiPhotoshopScene must not double-charge on a concurrent re-submission (#1362,
 * cluster #1358). The paid work funnels through processAiPhotoshopRequest, a
 * choke point reached from on('photo')/on('text') and several confirm/generate
 * button actions. Without a guard, a second photo/text OR a double-tap during the
 * ~generation re-enters and double-charges. Same class as #1343/#1355/#1357/#1360
 * (proven behaviorally in neuroPhotoDoubleCharge.test.ts).
 *
 * Structural, mutation-checked: the reject-before-set guard must precede the
 * choke-point try (which runs the charge/generation), and the flag must be
 * released. Set-true/false presence is also enforced by paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/scenes/aiPhotoshopScene/index.ts', 'utf8')

describe('aiPhotoshopScene in-flight guard (#1362)', () => {
  it('rejects-before-set BEFORE the choke-point generation try', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.aiPhotoshopInProgress)')
    const setIdx = SRC.indexOf('ctx.session.aiPhotoshopInProgress = true')
    const tryIdx = SRC.indexOf('  try {\n    // Build prompt')
    expect(checkIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
    expect(tryIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(setIdx)
    expect(setIdx).toBeLessThan(tryIdx)
  })
  it('releases the flag (set false) in a finally', () => {
    expect(SRC).toContain('ctx.session.aiPhotoshopInProgress = false')
    expect(SRC).toMatch(
      /\} finally \{[\s\S]{0,80}aiPhotoshopInProgress = false/
    )
  })
})
