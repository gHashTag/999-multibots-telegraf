/**
 * Binding test of spec automation/seal-stands-in: every `test` of the spec,
 * run against the host -- scripts/check-t27-specs.mjs reading a seal and
 * hashing the file, then asking the spec's compiled logic.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as SPEC from './seal-stands-in.gen'
import * as LOGIC from './seal-stands-in.logic'
// @ts-expect-error -- an .mjs script without types
import { sealAnswers, sealsOf } from '../check-t27-specs.mjs'

const bytes = Buffer.from('module automation::x {}\n')
const hash = SPEC.HASH_PREFIX + createHash('sha256').update(bytes).digest('hex')
const seal = (over: Record<string, unknown> = {}) => ({
  spec_path: 'specs/automation/x.t27',
  spec_hash: hash,
  tests: { total: 6, failed: 0, forced: false },
  ...over,
})
const answers = (s: unknown, b = bytes) => sealAnswers(s, b, LOGIC.standsIn)

describe('spec automation/seal-stands-in', () => {
  it('a seal stands in only for its exact bytes with tests that ran and passed', () => {
    expect(answers(seal())).toBe(true)
    expect(answers(seal(), Buffer.from('changed\n'))).toBe(false)
    expect(answers(seal({ tests: { total: 0, failed: 0 } }))).toBe(false)
    expect(answers(seal({ tests: { total: 6, failed: 1 } }))).toBe(false)
    expect(
      answers(seal({ tests: { total: 6, failed: 0, forced: true } }))
    ).toBe(false)
    expect(answers(undefined)).toBe(false)
    expect(answers(seal({ tests: undefined }))).toBe(false)
  })

  it('no-seal always compiles; otherwise only what no seal answers for', () => {
    expect(LOGIC.compiles(true, true)).toBe(true)
    expect(LOGIC.compiles(true, false)).toBe(true)
    expect(LOGIC.compiles(false, false)).toBe(true)
    expect(LOGIC.compiles(false, true)).toBe(false)
  })

  it('the host reads seals from the t27 checkout by spec_path', () => {
    const t27 = mkdtempSync(join(tmpdir(), 'seals-'))
    const dir = join(t27, SPEC.SEAL_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.json'), JSON.stringify(seal()))
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    const seals = sealsOf(t27)
    expect(seals.size).toBe(1)
    expect(answers(seals.get('specs/automation/x.t27'))).toBe(true)
    expect(sealsOf(join(t27, 'nowhere')).size).toBe(0)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
