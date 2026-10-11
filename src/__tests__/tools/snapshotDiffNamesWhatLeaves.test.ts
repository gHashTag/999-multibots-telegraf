import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/*
 * `tri snapshot-diff` names what a `test-gate --save` is about to forget.
 *
 * On 2026-10-09 the per-file table, done by hand, caught 15 names that were
 * skipped on a machine without ffmpeg, not renamed. A rename keeps a file's
 * count; a deletion does not -- that difference is the whole signal (LOSS).
 */
const SCRIPT = path.resolve(__dirname, '../../../bin/helpers/snapshot-diff.mjs')

function repoWith(before: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `snapdiff-${process.pid}-`))
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '/dev/null')
  fs.writeFileSync(
    path.join(dir, '.test-baseline.txt'),
    '# header\n' + before.join('\n') + '\n'
  )
  git('add', '.')
  git('commit', '-q', '-m', 'snapshot')
  return dir
}

const run = (dir: string, now: string[]) => {
  fs.writeFileSync(
    path.join(dir, '.test-baseline.txt'),
    '# header\n' + now.join('\n') + '\n'
  )
  return spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' })
}

describe('tri snapshot-diff', () => {
  it('says nothing leaves when nothing does', () => {
    const dir = repoWith(['a.test.ts :: one'])
    const out = run(dir, ['a.test.ts :: one', 'b.test.ts :: new'])
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('0 leave, 1 come in')
  })

  it('a rename leaves a name but is not a LOSS', () => {
    const dir = repoWith(['a.test.ts :: old name', 'a.test.ts :: kept'])
    const out = run(dir, ['a.test.ts :: new name', 'a.test.ts :: kept'])
    expect(out.status).toBe(1)
    expect(out.stdout).toContain('a.test.ts: -1 +1')
    expect(out.stdout).toContain('  - old name')
    expect(out.stdout).not.toContain('LOSS')
  })

  it('a deletion is a LOSS, named by file', () => {
    const dir = repoWith(['a.test.ts :: one', 'a.test.ts :: two'])
    const out = run(dir, ['a.test.ts :: one'])
    expect(out.status).toBe(1)
    expect(out.stdout).toContain('a.test.ts: -1 +0  LOSS')
  })

  it('cannot compare against a ref that has no snapshot: exit 2, not 0', () => {
    const dir = repoWith(['a.test.ts :: one'])
    const out = spawnSync('node', [SCRIPT, dir, 'no-such-ref'], {
      encoding: 'utf8',
    })
    expect(out.status).toBe(2)
  })
})
