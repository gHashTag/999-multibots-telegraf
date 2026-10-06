/**
 * Runs in every root vitest run, and is also the probe that
 * vitest-config-drops-hook-git-env.test.ts launches with a poisoned env.
 *
 * A worker must never see the repository a git hook exported: a throwaway repo
 * made here has to be the repo git answers for, not GIT_DIR's.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('a vitest worker and the hook repository', () => {
  it('sees no GIT_DIR, GIT_INDEX_FILE or GIT_WORK_TREE', () => {
    expect(process.env.GIT_DIR).toBeUndefined()
    expect(process.env.GIT_INDEX_FILE).toBeUndefined()
    expect(process.env.GIT_WORK_TREE).toBeUndefined()
  })

  it('runs git in a throwaway repo against that repo', () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'env-probe-')))
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' })
      const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim()
      expect(gitDir).toBe(path.join(dir, '.git'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
