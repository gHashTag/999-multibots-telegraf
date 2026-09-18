/**
 * BOTH OF THIS TOOL'S FIRST-RUN MISTAKES ARE PINNED HERE, AS INVENTED SOURCE.
 *
 * Run one: `refundUser` was on the list of movers, and the tool reported 27
 * "defects" -- every call site of a function that RETURNS NOTHING. There was no
 * answer to discard; the tool was inventing faults, which is exactly the failure
 * these guards exist to catch, pointed at me.
 *
 * Run two: the `eslint-disable-next-line no-unreachable` marker was treated as
 * covering the next line only. The code after that statement is just as dead --
 * the `return` above it killed the whole block -- so a refund three statements
 * later was reported as live, the opposite of the truth.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const { scan, MOVERS, RETURNS_NOTHING } = createRequire(__filename)(
  path.join(__dirname, 'money-results.cjs')
) as {
  scan: (
    text: string,
    mover: string
  ) => Array<{ line: number; mover: string; unreachable: boolean }>
  MOVERS: string[]
  RETURNS_NOTHING: string[]
}

describe('which money calls throw their answer away', () => {
  it('finds a statement that binds nothing', () => {
    const src = ['async function f() {', '  await updateUserBalance(a, b)', '}']
    const hits = scan(src.join('\n'), 'updateUserBalance')
    expect(hits.length).toBe(1)
    expect(hits[0].line).toBe(2)
    expect(hits[0].unreachable).toBe(false)
  })

  /*
   * Every one of these keeps the answer, and a tool that flagged them would be
   * unusable within a day.
   */
  it('leaves alone every form that keeps the answer', () => {
    const kept = [
      '  const ok = await updateUserBalance(a)',
      '  return await updateUserBalance(a)',
      '  if (await updateUserBalance(a)) doThing()',
      '  const [x] = await Promise.all([updateUserBalance(a)])',
      '  void (await updateUserBalance(a))',
    ]
    for (const line of kept) {
      expect(scan(line, 'updateUserBalance'), line).toEqual([])
    }
  })

  /*
   * MISTAKE TWO. The marker kills the rest of the block, not one line.
   */
  it('counts the whole dead block as dead, not just the marked statement', () => {
    const src = [
      'async function f() {',
      '  if (x) {',
      '    return leave()',
      '    // eslint-disable-next-line no-unreachable',
      '    await updateUserBalance(a)',
      '    const v = await getVoice()',
      '    if (!v) {',
      '      await updateUserBalance(b)',
      '    }',
      '  }',
      '  await updateUserBalance(c)',
      '}',
    ].join('\n')

    const hits = scan(src, 'updateUserBalance')
    expect(hits.map(h => [h.line, h.unreachable])).toEqual([
      [5, true],
      [8, true],
      [11, false],
    ])
  })

  /*
   * MISTAKE ONE. A function with no answer cannot discard one.
   */
  it('does not treat a function that returns nothing as a mover', () => {
    expect(MOVERS).not.toContain('refundUser')
    expect(RETURNS_NOTHING).toContain('refundUser')
  })

  it('knows the movers whose answer is the caller to read', () => {
    expect(MOVERS).toContain('updateUserBalance')
    expect(MOVERS).toContain('directPaymentProcessor')
  })
})
