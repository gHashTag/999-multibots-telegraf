/**
 * A KILLED MUTANT BATCH MUST NOT LEAVE ITS MUTANT BEHIND.
 *
 * Measured 27.09.2026 (story loop, turn 14): the container restarted in the
 * middle of `tri mutants`, `finally` never ran, and story-reel-tool.ts stayed
 * with `hueChecked` returning `true` -- one careless `git add -A` away from
 * shipping. Each mutation is now journalled in .git before it is applied, and
 * `tri mutants --heal` (run at the start of every batch and by `tri loop`)
 * puts back a file that still holds exactly that mutant. A file that has
 * moved on since is left alone and named: healing must never overwrite work.
 *
 * The kill itself was reproduced by hand (kill -9 mid-mutation, then heal);
 * here the journal is written directly, so the test is exact and fast.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MUTANTS = resolve(__dirname, '../../../bin/helpers/mutants.py')
let dir: string

const heal = () =>
  spawnSync('python3', [MUTANTS, '--heal'], { cwd: dir, encoding: 'utf8' })
const journal = () => join(dir, '.git', 'tri-mutants.pending.json')
const leave = (original: string, mutated: string) =>
  writeFileSync(
    journal(),
    JSON.stringify({
      file: join(dir, 'x.ts'),
      name: 'flip',
      original,
      mutated,
    })
  )

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mutants-heal-'))
  spawnSync('git', ['init', '-q', dir])
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('tri mutants --heal', () => {
  it('puts back a file a killed batch left mutated, and says so', () => {
    writeFileSync(join(dir, 'x.ts'), 'return a > b\n')
    leave('return a < b\n', 'return a > b\n')
    const r = heal()
    expect(r.status).toBe(0)
    expect(readFileSync(join(dir, 'x.ts'), 'utf8')).toBe('return a < b\n')
    expect(r.stdout).toContain('HEALED')
    expect(existsSync(journal())).toBe(false)
  })

  it('never overwrites a file that has moved on since', () => {
    writeFileSync(join(dir, 'x.ts'), 'someone kept working here\n')
    leave('return a < b\n', 'return a > b\n')
    const r = heal()
    expect(r.status).toBe(1)
    expect(readFileSync(join(dir, 'x.ts'), 'utf8')).toBe(
      'someone kept working here\n'
    )
    expect(r.stdout).toContain('NOT HEALED')
  })

  it('drops a stale journal when the file is already the original', () => {
    writeFileSync(join(dir, 'x.ts'), 'return a < b\n')
    leave('return a < b\n', 'return a > b\n')
    expect(heal().status).toBe(0)
    expect(existsSync(journal())).toBe(false)
  })

  it('does nothing when no batch was killed', () => {
    const r = heal()
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})
