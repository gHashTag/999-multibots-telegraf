import { describe, it, expect } from 'vitest'

/*
 * The ratchet inspects what a commit ADDS, and the pre-commit hook runs
 * prettier over every staged file. One file predates the current prettier
 * config, so ANY edit to it rewrites dozens of untouched lines -- twelve of
 * which carry Cyrillic identifiers older than this guard. The file could not
 * be modified at all: those identifiers are used from other files, so renaming
 * is not a local change, and the offending lines are JSX, where a line marker
 * cannot go.
 *
 * A line the formatter rewrote is not a new violation. What must NOT loosen:
 * genuinely new Cyrillic, and a pure insertion, which replaces nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  cyrillicRuns,
  isReflowOfExistingCyrillic,
} = require('../../../scripts/no-cyrillic-guard.cjs')

const ID = 'почемуНельзя' // the identifier that locked the file
const NEW = 'проверка' // a word nothing is replacing

describe('a line the formatter rewrote is not new Cyrillic', () => {
  it('splits a line into the runs a reflow preserves', () => {
    expect(cyrillicRuns(`const ${ID} = 1`)).toEqual([ID])
    expect(cyrillicRuns('const plain = 1')).toEqual([])
  })

  it('exempts a line whose every run the same commit is removing', () => {
    expect(
      isReflowOfExistingCyrillic(
        `  const ${ID} = x =>`,
        `  const ${ID} = (x) => x\n`
      )
    ).toBe(true)
  })

  it('still blocks a run that nothing is replacing', () => {
    // Half the line is the old identifier, half is a word being introduced.
    expect(
      isReflowOfExistingCyrillic(
        `  // ${ID}: ${NEW}`,
        `  const ${ID} = (x) => x\n`
      )
    ).toBe(false)
  })

  it('never exempts a pure insertion, which removes nothing', () => {
    expect(isReflowOfExistingCyrillic(`// ${NEW}`, '')).toBe(false)
    expect(
      isReflowOfExistingCyrillic(`// ${NEW}`, undefined as unknown as string)
    ).toBe(false)
  })

  it('never exempts a line with no Cyrillic (it was never a violation)', () => {
    expect(isReflowOfExistingCyrillic('const x = 1', `const ${ID} = 1`)).toBe(
      false
    )
  })

  it('is per-file: the removed text of another file is not passed in', () => {
    // The caller looks the removed text up by file name, so a run removed in
    // file A cannot excuse the same run added to file B.
    const src = require('fs').readFileSync(
      'scripts/no-cyrillic-guard.cjs',
      'utf8'
    )
    expect(src).toContain('removedByFile.get(file)')
  })
})
