import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * WHAT IS LEFT, SHOWN WHERE THE VALUE LANDS -- AND NEVER AT THE PRICE OF IT.
 *
 * Three of the four result screens said what the generation COST and nothing
 * about what remained. Measured against production, organic arrivals only:
 * 18.2% of them ever generate anything and 3.2% ever reach a price. Running out
 * is the moment this market converts on.
 *
 * The dangerous half is the second one. A person who paid for a generation is
 * owed the generation, and a balance read is a nicety on top of it. If reading
 * the balance could throw, this change would trade a conversion prompt for lost
 * deliveries -- a worse product than the silence it replaces. So the helper
 * swallows everything and the caller sends a shorter caption.
 *
 * Every failure shape gets its own case, because "it returns a string" is not
 * the property: the property is that NOTHING gets out of it.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

const supabase = vi.hoisted(() => ({ getUserBalance: vi.fn() }))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: supabase.getUserBalance,
}))

import { remainingBalanceLine } from '@/price/helpers/remainingBalanceLine'

/** Blank comments, so a prose mention cannot pass as a call. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

describe('the remaining balance is shown, and never costs the result', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows what is left when the balance reads cleanly', async () => {
    supabase.getUserBalance.mockResolvedValue(42.5)
    const line = await remainingBalanceLine('1', true)
    expect(line).toContain('42.5')
    expect(
      line.startsWith('\n'),
      'it appends to a caption, so it leads with a break'
    ).toBe(true)

    supabase.getUserBalance.mockResolvedValue(7)
    expect(await remainingBalanceLine('1', false)).toContain('7')
  })

  /*
   * The positive case above is what makes these meaningful: a helper that
   * always returned '' would satisfy every case below and show nobody anything.
   */
  it.each([
    [
      'the read throws',
      () => supabase.getUserBalance.mockRejectedValue(new Error('db down')),
    ],
    ['it returns null', () => supabase.getUserBalance.mockResolvedValue(null)],
    [
      'it returns undefined',
      () => supabase.getUserBalance.mockResolvedValue(undefined),
    ],
    [
      'it returns a string',
      () => supabase.getUserBalance.mockResolvedValue('42'),
    ],
    ['it returns NaN', () => supabase.getUserBalance.mockResolvedValue(NaN)],
    [
      'it returns Infinity',
      () => supabase.getUserBalance.mockResolvedValue(Infinity),
    ],
  ])('says nothing rather than throwing when %s', async (_name, arrange) => {
    arrange()
    await expect(remainingBalanceLine('1', true)).resolves.toBe('')
  })

  it('every result path that shows a cost also shows what is left', () => {
    const PATHS = [
      'src/services/generateNeuroPhotoHybrid.ts',
      'src/services/generateNeuroPhotoMulti.ts',
      'src/services/imageUpscaler.ts',
    ]
    for (const rel of PATHS) {
      const src = code(fs.readFileSync(path.join(REPO, rel), 'utf8'))
      expect(
        src.includes('remainingBalanceLine('),
        `${rel} tells a person what the generation cost and not what is left`
      ).toBe(true)
      // Once, before the send -- not once per photo.
      const calls = (src.match(/await remainingBalanceLine\(/g) || []).length
      expect(calls, `${rel} must read the balance exactly once`).toBe(1)
    }
  })

  it('reads the balance BEFORE the send loop, not once per photo', () => {
    /*
     * Counting the calls does not pin this. Moving the single call inside the
     * loop keeps the count at one and turns a caption into a query per photo --
     * the mutation survived until this assertion existed. Position is the
     * property, so position is what is asserted.
     */
    const LOOPING = [
      'src/services/generateNeuroPhotoHybrid.ts',
      'src/services/generateNeuroPhotoMulti.ts',
    ]
    for (const rel of LOOPING) {
      const src = code(fs.readFileSync(path.join(REPO, rel), 'utf8'))
      const readAt = src.indexOf('await remainingBalanceLine(')
      const loopAt = src.search(/for \((?:const url of|let i = 0)/)
      expect(readAt, `${rel} must read the balance`).toBeGreaterThan(-1)
      expect(loopAt, `${rel} must still send in a loop`).toBeGreaterThan(-1)
      expect(
        readAt < loopAt,
        `${rel} reads the balance inside the send loop: one query per photo`
      ).toBe(true)
    }
  })
})
