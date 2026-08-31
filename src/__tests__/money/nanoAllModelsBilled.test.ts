/**
 * In aiPhotoshop all_models mode, processAiPhotoshopRequest loops every model and
 * calls processSingleAiPhotoshopModel per model. Only the branch for
 * ['flux_kontext_pro','flux_kontext_max','seededit_3','qwen_image_edit'] charges
 * (the single processBalanceOperation in the scene). The nano_banana branch called
 * generateNanoBanana with skipBalanceCheck: true and a false 'already charged'
 * comment -- but nothing charges it, so nano generated FREE (unbilled-paid, #1274).
 *
 * Fix: the nano all_models branch must NOT skip the balance check, so the service
 * charges its own declared price (5 * imageCount). This asserts the branch does not
 * carry skipBalanceCheck: true. Mutation (re-adding it) fails the test.
 *
 * Bounded to the all_models nano branch via its unique debug marker, so the
 * separate single-mode nano calls (which correctly charge, no skip) are excluded.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const scene = () =>
  stripComments(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'scenes',
        'aiPhotoshopScene',
        'index.ts'
      ),
      'utf8'
    )
  )

describe('aiPhotoshop all_models charges nano_banana (no unbilled-paid)', () => {
  it('the all_models nano branch does not skip the balance check', () => {
    const s = scene()
    const marker = 'NANO_BANANA CONDITION MATCHED'
    const start = s.indexOf(marker)
    expect(start, 'no all_models nano branch marker').toBeGreaterThan(-1)
    const end = s.indexOf('} else if', start)
    const branch = s.slice(start, end > start ? end : start + 1500)
    expect(/generateNanoBanana\(/.test(branch), 'marker/branch mismatch').toBe(
      true
    )
    expect(
      /skipBalanceCheck:\s*true/.test(branch),
      'nano all_models branch skips billing but nothing charges it -- unbilled free generation'
    ).toBe(false)
  })
})
