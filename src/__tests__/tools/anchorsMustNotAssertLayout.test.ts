import { describe, it, expect } from 'vitest'

/*
 * AN ANCHOR THAT DEMANDS TWO LINES TOUCH IS ASSERTING LAYOUT.
 *
 * `/try \{\s*pool = getPool\(\)/` holds until somebody adds a log line at the
 * top of the block, and then reports the try missing when it is right there.
 * That cost four days on the autopilot contract (#2228), and a census found the
 * same shape in fourteen more files.
 *
 * The replacement establishes containment the way the language does: walk up
 * until a line is less indented. The half that keeps it honest is the last test
 * here -- it must NOT answer "the nearest try anywhere above", or removing the
 * try would still pass.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  enclosingStatements,
  enclosedBy,
} = require('../../../scripts/lib/enclosing-statement.cjs')

const SRC = [
  'function poll() {',
  '  let checkInFlight = false',
  '',
  '  try {',
  '',
  '    // a comment nobody should have to think about',
  '    const pool = getPool()',
  '  } finally {',
  '    checkInFlight = false',
  '  }',
  '}',
].join('\n')

describe('anchors must not assert layout', () => {
  it('names the statement a line lives in', () => {
    expect(enclosingStatements(SRC, 'const pool = getPool()')).toEqual([
      'try {',
    ])
  })

  it('is unmoved by a comment and a blank line at the top of the block', () => {
    // The defect itself. A pattern demanding adjacency answers "not found"
    // here; this must answer "try".
    expect(enclosedBy(SRC, 'const pool = getPool()', /^try \{/)).toBe(true)
  })

  it('reports nothing for a line at the top level', () => {
    expect(enclosingStatements('const x = 1', 'const x')).toEqual([null])
  })

  it('answers for EVERY occurrence, and enclosedBy asks whether ANY qualifies', () => {
    // `checkInFlight = false` is both the declaration and the reset, and only
    // the second is inside the finally. Requiring all of them would fail.
    expect(enclosingStatements(SRC, 'checkInFlight = false')).toEqual([
      'function poll() {',
      '} finally {',
    ])
    expect(enclosedBy(SRC, 'checkInFlight = false', /finally \{$/)).toBe(true)
  })

  it('does NOT reach past the block that really encloses the line', () => {
    // The anti-weakening half: a try that closed above must not be offered as
    // this line's enclosure, or the check passes with the try deleted.
    const src = [
      'function boot() {',
      '  try {',
      '    risky()',
      '  } catch {}',
      '  const pool = getPool()',
      '}',
    ].join('\n')
    expect(enclosedBy(src, 'const pool = getPool()', /^try \{/)).toBe(false)
    expect(enclosingStatements(src, 'const pool = getPool()')).toEqual([
      'function boot() {',
    ])
  })
})
