import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkRepo,
  checkSpec,
  readTestReport,
  type Problem,
} from '../../../../../scripts/check-t27-specs.mjs'

/**
 * EVERY VENDORED SPEC OBEYS THE LAWS (scripts/check-t27-specs.mjs).
 *
 * Owner, 2026-09-27: "make the specs the standard by default, with scripts
 * where .t27 is checked strictly". The same check runs in pre-commit and in
 * `bun run verify`; here it runs with the render's tests, so a spec whose
 * generated module drifted, whose tests are not run against the host, or
 * whose numbers a host file restates, reddens the suite.
 *
 * A gate that cannot fail protects nothing, so every law is shown failing on
 * a fixture made from a real spec: one change, one named law.
 */
const HERE = __dirname
const DIR = 'apps/vibee-editor/render/src/spec'
const real = {
  file: `${DIR}/crm-lead-magnet.t27`,
  spec: readFileSync(join(HERE, 'crm-lead-magnet.t27'), 'utf8'),
  gen: readFileSync(join(HERE, 'crm-lead-magnet.gen.ts'), 'utf8'),
  test: readFileSync(join(HERE, 'crm-lead-magnet.test.ts'), 'utf8'),
  hostFiles: [
    {
      path: 'apps/vibee-editor/render/src/agent/crm-deliver-tool.ts',
      text: "import * as LM from '../spec/crm-lead-magnet.gen'\n",
    },
  ],
  ignore: `${DIR}/*.gen.ts\n`,
}
const laws = (p: Problem[]) => [...new Set(p.map(x => x.law))]

describe('the specs of record in this repository', () => {
  it('every vendored spec obeys every law, and every cited spec is bound or known', () => {
    const bad = checkRepo()
    expect(
      bad,
      bad.map(b => `${b.spec}: [${b.law}] ${b.what}`).join('\n')
    ).toEqual([])
  })

  it('the real spec passes on the fixture harness (the controls below start from green)', () => {
    expect(checkSpec(real)).toEqual([])
  })
})

describe('each law fails when it should', () => {
  const swap = (text: string, from: string, to: string) => {
    expect(text.includes(from), `fixture anchor: ${from}`).toBe(true)
    return text.replace(from, to)
  }

  it('gen-values: the generated module says another number', () => {
    const gen = swap(real.gen, 'OP_TOKENS = 12', 'OP_TOKENS = 13')
    expect(laws(checkSpec({ ...real, gen }))).toEqual(['gen-values'])
  })

  it('gen-extra: the generated module declares something the spec does not', () => {
    const gen = swap(real.gen, '"KIND", "ID"', '"KIND", "EXTRA", "ID"')
    expect(laws(checkSpec({ ...real, gen }))).toEqual(['gen-extra'])
  })

  it('gen-header and binding-test: a missing module, a missing test', () => {
    expect(laws(checkSpec({ ...real, gen: null }))).toContain('gen-header')
    expect(laws(checkSpec({ ...real, test: null }))).toEqual(['binding-test'])
  })

  it('gen-ignored: prettier would reformat the compiler bytes', () => {
    expect(laws(checkSpec({ ...real, ignore: '' }))).toEqual(['gen-ignored'])
  })

  it('ascii: one non-ASCII letter in the spec', () => {
    const spec = swap(
      real.spec,
      '// the caption carries',
      '// the caption carriés'
    )
    expect(laws(checkSpec({ ...real, spec }))).toContain('ascii')
  })

  it('footer: the TRINITY line is gone from the end', () => {
    const spec = real.spec.trimEnd().replace(/\/\/ phi\^2[^\n]*$/, '')
    expect(laws(checkSpec({ ...real, spec }))).toContain('footer')
  })

  it('braced-tests: a test that opens no brace, and one that asserts nothing', () => {
    const open = swap(
      real.spec,
      'test "a row of three is split; a row of two stands" {',
      'test "a row of three is split; a row of two stands"'
    )
    expect(laws(checkSpec({ ...real, spec: open }))).toContain('braced-tests')
    const empty = swap(
      real.spec,
      'assert(PREP_LABEL_NAMES_ASPECT);',
      'const x = 1;'
    )
      .replace('assert(rows_for(3) == 2);', '')
      .replace('assert(rows_for(2) == 1);', '')
      .replace('assert(rows_for(1) == 1);', '')
      .replace('assert(rows_for(4) == 2);', '')
    expect(laws(checkSpec({ ...real, spec: empty }))).toContain('braced-tests')
  })

  it('binding-titles: a spec test that nobody runs against the host', () => {
    const test = swap(
      real.test,
      'a row of three is split; a row of two stands',
      'a row of three is cut'
    )
    const bad = checkSpec({ ...real, test })
    expect(laws(bad)).toEqual(['binding-titles'])
    expect(bad[0].what).toMatch('a row of three is split')
  })

  it('host-imports: vendored and never imported', () => {
    expect(laws(checkSpec({ ...real, hostFiles: [] }))).toEqual([
      'host-imports',
    ])
  })

  it('restated: a file of the vertical types a spec value instead of importing it', () => {
    const hostFiles = [
      ...real.hostFiles,
      {
        path: 'apps/vibee-editor/render/src/kie-image.ts',
        text:
          "import * as LM from './spec/crm-lead-magnet.gen'\n" +
          "export const LEAD_MAGNET_RESOLUTION = '1K'\n",
      },
    ]
    const bad = checkSpec({ ...real, hostFiles })
    expect(laws(bad)).toEqual(['restated'])
    expect(bad[0].what).toMatch('LEAD_MAGNET_RESOLUTION')
    // A file outside the vertical may say '1K' for its own reasons.
    const unrelated = [
      ...real.hostFiles,
      { path: 'x.ts', text: "export const VIDEO_RESOLUTION = '1K'\n" },
    ]
    expect(checkSpec({ ...real, hostFiles: unrelated })).toEqual([])
  })

  it('frame and module: the spec names another repository', () => {
    const spec = swap(
      real.spec,
      'pub const REPO : str = "999-multibots-telegraf";',
      'pub const REPO : str = "trinity";'
    )
    expect(laws(checkSpec({ ...real, spec }))).toContain('frame')
  })
})

describe('t27c test-report is read by its table, not its exit code', () => {
  it('a table with failures is failures, whatever the exit code said', () => {
    // Measured 2026-09-27: `t27c test-report` exits 0 with "FAIL 2" below.
    const out = [
      '--- test report: specs/automation/x.t27 ---',
      '  pass  one',
      '  FAIL  two',
      '',
      '  tests       2',
      '  pass        1',
      '  FAIL        1',
      '  rate    50.0%',
    ].join('\n')
    expect(readTestReport(out)).toEqual({ tests: 2, fail: 1, failed: ['two'] })
    expect(readTestReport('nothing ran')).toEqual({
      tests: null,
      fail: null,
      failed: [],
    })
  })
})
