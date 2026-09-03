/**
 * Every charge-after-delivery in generateImageToVideo must check its result.
 *
 * deductBalanceAfterSuccess returns Promise<boolean> (true = charged). The video is
 * delivered BEFORE the charge on each path, so a DISCARDED false result is a free
 * generation (house loss) that goes unlogged. Of the four call sites, PLAN A (523)
 * and the poll branch (1116) captured + checked the result, but the PLAN B
 * webhook-return path and the standard-Replicate path discarded it. Both now capture
 * and log on failure (mirrors PLAN A) — the unchecked-money-result discipline
 * (#1131). Found by the it.65 scout (which named only one of the two sites).
 *
 * Integration-only module -> structural assertion + mutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const src = fs.readFileSync(
  'src/modules/videoGenerator/generateImageToVideo.ts',
  'utf8'
)

describe('generateImageToVideo checks every deductBalanceAfterSuccess result', () => {
  it('no deductBalanceAfterSuccess call discards its boolean result', () => {
    // A statement-start `await deductBalanceAfterSuccess(` (not assigned to a var)
    // drops the charge-success boolean -> a failed charge after delivery is silent.
    const discarded = src.match(/\n\s*await deductBalanceAfterSuccess\(/g) || []
    expect(
      discarded,
      'a deductBalanceAfterSuccess result is discarded (silent free generation)'
    ).toEqual([])
  })

  it('still calls deductBalanceAfterSuccess on the charge paths', () => {
    expect(
      (src.match(/deductBalanceAfterSuccess\(/g) || []).length
    ).toBeGreaterThanOrEqual(3)
  })
})
