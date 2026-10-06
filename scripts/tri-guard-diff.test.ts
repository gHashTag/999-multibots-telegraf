/**
 * `tri guard-diff`: an honesty guard at base vs head over a rows file (#3772).
 *
 * No test here makes a worktree or runs a guard. The pure parts are called
 * directly, and the command is spawned with TRI_GUARD_DIFF_STUB standing in
 * for the evaluator, so the exit code is the real one the reviewer reads.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  exitCode,
  format,
  judge,
  markOf,
  parseRows,
} from '../bin/helpers/guard-diff.mjs'

const ROOT = path.join(__dirname, '..')
const CLI = path.join(ROOT, 'bin', 'helpers', 'guard-diff.mjs')

const jsonl = (...rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n')

describe('the rows parser', () => {
  it('reads claims rows, skipping blank and # lines, keeping line numbers', () => {
    const text = [
      '# a comment',
      JSON.stringify({ text: 'Here is the video.', expect: 'flag' }),
      '',
      JSON.stringify({ text: "Here's the cover letter.", expect: 'silent' }),
    ].join('\n')
    const { rows, errors } = parseRows(text, 'claims')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { line: 2, expect: 'flag', text: 'Here is the video.' },
      { line: 4, expect: 'silent', text: "Here's the cover letter." },
    ])
  })

  it('reads prices rows with both fields', () => {
    const { rows, errors } = parseRows(
      jsonl({ heard: '$5', printed: '$5, 10k', expect: 'ask' }),
      'prices'
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { line: 1, expect: 'ask', heard: '$5', printed: '$5, 10k' },
    ])
  })

  it('names every broken line instead of skipping it', () => {
    const text = [
      'not json',
      '[1, 2]',
      JSON.stringify({ heard: '$5', expect: 'ask' }),
      JSON.stringify({ heard: '$5', printed: '$5', expect: 'flag' }),
      JSON.stringify({ heard: ' ', printed: '$5', expect: 'ask' }),
    ].join('\n')
    const { rows, errors } = parseRows(text, 'prices')
    expect(rows).toEqual([])
    expect(errors).toEqual([
      'line 1: not JSON',
      'line 2: not a JSON object',
      'line 3: "printed" must be a non-empty string',
      'line 4: "expect" must be "ask" or "confirm"',
      'line 5: "heard" must be a non-empty string',
    ])
  })

  it('a claims verdict word is not a prices verdict word', () => {
    const { errors } = parseRows(
      jsonl({ text: 'Here is the video.', expect: 'ask' }),
      'claims'
    )
    expect(errors).toEqual(['line 1: "expect" must be "flag" or "silent"'])
  })

  it('a file with no rows is an error, not a pass', () => {
    expect(parseRows('# only a comment\n\n', 'claims').errors).toEqual([
      'no rows',
    ])
    expect(parseRows('x', 'nope').errors).toEqual(['unknown guard "nope"'])
  })

  it('the committed corpus parses for both guards', () => {
    for (const guard of ['claims', 'prices'] as const) {
      const text = fs.readFileSync(
        path.join(ROOT, 'scripts', 'guard-corpus', `${guard}.jsonl`),
        'utf8'
      )
      const { rows, errors } = parseRows(text, guard)
      expect(errors, guard).toEqual([])
      expect(rows.length, guard).toBeGreaterThan(50)
    }
  })
})

describe('the regression rule', () => {
  it('a lost claim is a REGRESSION; a newly caught one is fixed', () => {
    expect(markOf('claims', 'flag', 'flag', 'silent')).toBe('REGRESSION')
    expect(markOf('claims', 'flag', 'silent', 'flag')).toBe('fixed')
  })

  it('a wrong confirm is a REGRESSION; a newly asked one is fixed', () => {
    expect(markOf('prices', 'ask', 'ask', 'confirm')).toBe('REGRESSION')
    expect(markOf('prices', 'ask', 'confirm', 'ask')).toBe('fixed')
  })

  it('an honest row is never a regression, only needless or cleared', () => {
    expect(markOf('claims', 'silent', 'silent', 'flag')).toBe('needless')
    expect(markOf('claims', 'silent', 'flag', 'silent')).toBe('cleared')
    expect(markOf('prices', 'confirm', 'confirm', 'ask')).toBe('needless')
    expect(markOf('prices', 'confirm', 'ask', 'confirm')).toBe('cleared')
  })

  it('an unchanged verdict is no change, even when it is wrong', () => {
    expect(markOf('claims', 'flag', 'silent', 'silent')).toBeNull()
    expect(markOf('prices', 'ask', 'confirm', 'confirm')).toBeNull()
  })

  it('counts each side and lists only the changed rows', () => {
    const { rows } = parseRows(
      jsonl(
        { text: 'a', expect: 'flag' },
        { text: 'b', expect: 'flag' },
        { text: 'c', expect: 'flag' },
        { text: 'd', expect: 'silent' },
        { text: 'e', expect: 'silent' }
      ),
      'claims'
    )
    const report = judge(
      'claims',
      rows,
      ['flag', 'flag', 'silent', 'flag', 'silent'],
      ['flag', 'silent', 'flag', 'silent', 'flag']
    )
    expect(report.safeTotal).toBe(3)
    expect(report.honestTotal).toBe(2)
    expect(report.base).toEqual({ caught: 2, lost: 1, noted: 1 })
    expect(report.head).toEqual({ caught: 2, lost: 1, noted: 1 })
    expect(report.changes.map(c => [c.row.text, c.mark])).toEqual([
      ['b', 'REGRESSION'],
      ['c', 'fixed'],
      ['d', 'cleared'],
      ['e', 'needless'],
    ])
    // Equal totals do not hide the lost row: the rule is per row.
    expect(exitCode(report)).toBe(1)
    const text = format('claims', report, { base: 'B', head: 'H' })
    expect(text).toMatch(/^ {2}REGRESSION line 2 /m)
    expect(text).toMatch(/rc 1$/)
  })

  it('refuses verdicts that do not line up with the rows', () => {
    const { rows } = parseRows(jsonl({ text: 'a', expect: 'flag' }), 'claims')
    expect(() => judge('claims', rows, [], ['flag'])).toThrow(/mismatch/)
  })
})

describe('the exit code', () => {
  function run(rows: string, stub: object | null, ...args: string[]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-diff-test-'))
    const file = path.join(dir, 'rows.jsonl')
    fs.writeFileSync(file, rows)
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.TRI_GUARD_DIFF_STUB
    if (stub) {
      env.TRI_GUARD_DIFF_STUB = path.join(dir, 'stub.json')
      fs.writeFileSync(env.TRI_GUARD_DIFF_STUB, JSON.stringify(stub))
    }
    const r = spawnSync('node', [CLI, ...args, file], {
      encoding: 'utf8',
      env,
    })
    fs.rmSync(dir, { recursive: true, force: true })
    return { rc: r.status, out: r.stdout + r.stderr }
  }
  const prices = jsonl(
    { heard: '$5', printed: '$5, 10k', expect: 'ask' },
    { heard: '$5', printed: '$5', expect: 'confirm' }
  )

  it('rc 0 when nothing changed', () => {
    const r = run(
      prices,
      { base: ['ask', 'confirm'], head: ['ask', 'confirm'] },
      'prices'
    )
    expect(r.out).toMatch(/changed rows: 0/)
    expect(r.rc).toBe(0)
  })

  it('rc 0 when head only fixes or adds a needless ask', () => {
    const r = run(
      prices,
      { base: ['confirm', 'confirm'], head: ['ask', 'ask'] },
      'prices'
    )
    expect(r.out).toMatch(/fixed/)
    expect(r.out).toMatch(/needless/)
    expect(r.rc).toBe(0)
  })

  it('rc 1 on a wrong confirm head introduces', () => {
    const r = run(
      prices,
      { base: ['ask', 'confirm'], head: ['confirm', 'confirm'] },
      'prices'
    )
    expect(r.out).toMatch(/REGRESSION.*"\$5" -> "\$5, 10k"/)
    expect(r.rc).toBe(1)
  })

  it('rc 2 when a row is broken: nothing is measured', () => {
    const r = run('{"heard": "$5"}', { base: [], head: [] }, 'prices')
    expect(r.out).toMatch(/line 1: "printed" must be a non-empty string/)
    expect(r.rc).toBe(2)
  })

  it('rc 2 on a guard it does not know, and on verdicts that do not line up', () => {
    expect(run(prices, null, 'nope').rc).toBe(2)
    const r = run(prices, { base: ['ask'], head: ['ask'] }, 'prices')
    expect(r.out).toMatch(/not measured: verdict count mismatch/)
    expect(r.rc).toBe(2)
  })
})

describe('the command', () => {
  it('bin/tri dispatches guard-diff and lists it in usage', () => {
    const tri = fs.readFileSync(path.join(ROOT, 'bin/tri'), 'utf8')
    expect(tri).toMatch(
      /^\s+exec node "\$ROOT\/bin\/helpers\/guard-diff\.mjs"/m
    )
    expect(tri).toMatch(/^\s+guard-diff\)$/m)
    expect(tri).toMatch(/^\s+tri guard-diff <claims\|prices>/m)
  })
})
