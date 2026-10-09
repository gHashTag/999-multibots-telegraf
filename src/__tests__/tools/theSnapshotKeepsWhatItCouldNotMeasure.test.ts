import { describe, it, expect } from 'vitest'

/*
 * A NAME THE RUN COULD NOT MEASURE IS NOT A NAME SOMEBODY DELETED.
 *
 * The snapshot held only the passing set, so `--save` on a machine missing one
 * package silently DELETED that file's names from it -- and in review the
 * deletion is indistinguishable from eighteen tests legitimately removed. It
 * was one command away: provider-registry.test.ts contributes 18 names to the
 * snapshot and cannot be loaded here at all.
 *
 * The same silence pointed the other way in the verdict: those 18 names were
 * suspects, survived the re-check (a file that cannot load cannot pass), and
 * kept the gate non-zero on a clean tree -- which is how a gate stops being
 * read.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  unloadableFiles,
  splitUnmeasured,
  skippedSet,
  nextBaseline,
} = require('../../../scripts/test-gate.cjs')

const report = (
  entries: Array<{ name: string; message?: string; assertions?: number }>
) => ({
  testResults: entries.map(e => ({
    name: `${process.cwd()}/${e.name}`,
    message: e.message || '',
    assertionResults: Array.from({ length: e.assertions || 0 }, (_, i) => ({
      status: 'passed',
      fullName: `t${i}`,
    })),
  })),
})

describe('the snapshot keeps what it could not measure', () => {
  it('names the package a file could not load, per file', () => {
    const out = unloadableFiles(
      report([
        {
          name: 'a.test.ts',
          message: "Error: Cannot find module 'fp-ts/lib/Either'",
        },
        {
          name: 'b.test.ts',
          message: "Cannot find package 'undici' imported from x",
        },
      ])
    )
    expect(out.get('a.test.ts')).toBe('fp-ts/lib/Either')
    expect(out.get('b.test.ts')).toBe('undici')
  })

  it('refuses a relative specifier: that is our own code, and it must stay red', () => {
    // The dangerous mutation. Drop this condition and a change that deletes a
    // local module produces the same message, is excused as "the environment",
    // and the gate goes GREEN on a genuinely broken tree.
    const out = unloadableFiles(
      report([{ name: 'a.test.ts', message: "Cannot find module './helpers'" }])
    )
    expect(out.size).toBe(0)
    expect(
      unloadableFiles(
        report([{ name: 'a.test.ts', message: "Cannot find module '/abs/x'" }])
      ).size
    ).toBe(0)
  })

  it('refuses a failure that names no module at all', () => {
    const out = unloadableFiles(
      report([{ name: 'a.test.ts', message: 'SyntaxError: unexpected token' }])
    )
    expect(out.size).toBe(0)
  })

  it('refuses a file that produced assertions: partial is not unloadable', () => {
    // A file that ran some tests loaded fine, whatever its message says.
    const out = unloadableFiles(
      report([
        {
          name: 'a.test.ts',
          message: "Cannot find module 'fp-ts'",
          assertions: 3,
        },
      ])
    )
    expect(out.size).toBe(0)
  })

  it('routes only the unloadable file names out of the verdict', () => {
    const unloadable = new Map([['a.test.ts', 'fp-ts']])
    const { unmeasured, measured } = splitUnmeasured(
      ['a.test.ts :: one', 'b.test.ts :: two'],
      unloadable
    )
    expect(unmeasured).toEqual(['a.test.ts :: one'])
    expect(measured).toEqual(['b.test.ts :: two'])
  })

  it('carries an unmeasured name forward instead of dropping it', () => {
    const { lines, carried } = nextBaseline(
      ['a.test.ts :: gone from the run', 'b.test.ts :: still green'],
      new Set(['b.test.ts :: still green']),
      new Map([['a.test.ts', 'fp-ts']])
    )
    expect(carried).toEqual(['a.test.ts :: gone from the run'])
    expect(lines).toContain('a.test.ts :: gone from the run')
    expect(lines).toContain('b.test.ts :: still green')
  })

  it('still drops a name whose file loaded fine and stopped passing', () => {
    // The other half. Carrying everything forward would make the snapshot a
    // ratchet nobody can lower, and a rename would stay in it for ever.
    const { lines, carried } = nextBaseline(
      ['c.test.ts :: renamed away'],
      new Set(['c.test.ts :: the new name']),
      new Map()
    )
    expect(carried).toEqual([])
    expect(lines).toEqual(['c.test.ts :: the new name'])
  })

  // A skipIf(!has('ffmpeg')) test on a machine without ffmpeg is a question
  // unasked, like a file that cannot load. On 2026-10-09 a save in a container
  // without ffmpeg/pdftotext/bsdtar/deno would have dropped 16 such names.
  it('reads the skipped names of a run, and only those', () => {
    const set = skippedSet({
      testResults: [
        {
          name: `${process.cwd()}/a.test.ts`,
          assertionResults: [
            { status: 'skipped', fullName: 'needs ffmpeg' },
            { status: 'pending', fullName: 'needs deno' },
            { status: 'passed', fullName: 'plain' },
            { status: 'failed', fullName: 'broken' },
          ],
        },
      ],
    })
    expect([...set].sort()).toEqual([
      'a.test.ts :: needs deno',
      'a.test.ts :: needs ffmpeg',
    ])
  })

  it('carries a skipped name forward instead of dropping it', () => {
    const { lines, carried } = nextBaseline(
      ['a.test.ts :: needs ffmpeg', 'a.test.ts :: renamed away'],
      new Set(['a.test.ts :: the new name']),
      new Map(),
      new Set(['a.test.ts :: needs ffmpeg'])
    )
    // Only the skipped one: a name of the same file that simply vanished is
    // still dropped, so a skip in one test cannot shield its neighbours.
    expect(carried).toEqual(['a.test.ts :: needs ffmpeg'])
    expect(lines).toEqual([
      'a.test.ts :: needs ffmpeg',
      'a.test.ts :: the new name',
    ])
  })

  it('routes a skipped name out of the verdict, and nothing else of its file', () => {
    const { unmeasured, measured } = splitUnmeasured(
      ['a.test.ts :: needs ffmpeg', 'a.test.ts :: broke'],
      new Map(),
      new Set(['a.test.ts :: needs ffmpeg'])
    )
    expect(unmeasured).toEqual(['a.test.ts :: needs ffmpeg'])
    expect(measured).toEqual(['a.test.ts :: broke'])
  })
})
