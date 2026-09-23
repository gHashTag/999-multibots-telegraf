/**
 * THE TEST GATE'S REPORT BELONGS TO ONE WORKING TREE.
 *
 * Measured 2026-09-23: a push from one worktree was refused with "failing
 * tests that were not in the baseline", and the 23 files it named were all
 * under a DIFFERENT worktree -- a sibling session's failures, written into
 * the same report file, blocking a branch that did not contain the code that
 * broke them. The cause was a path that looks per-worktree and is not: every
 * worktree here symlinks `node_modules` to the main checkout's, so
 * `<root>/node_modules/.cache/test-guard.json` is one file for all of them.
 *
 * The property pinned here is the one that was missing: two different trees,
 * two different files. The rest guards the alarm that should have fired.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { basename, resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const { worktreeKey, reportPaths, foreignResults } = require_(
  '../../../scripts/lib/test-guard-report.cjs'
)

const MAIN = '/Users/somebody/project'
const LINKED = '/tmp/worktrees/a-branch'

describe('the report path', () => {
  it('differs for two working trees -- by NAME, not by directory', () => {
    const a = reportPaths(MAIN, `${MAIN}/.git`)
    const b = reportPaths(LINKED, `${MAIN}/.git/worktrees/a-branch`)
    expect(a.out).not.toBe(b.out)
    expect(a.confirm).not.toBe(b.confirm)
    /*
     * The directory is not enough, and asserting on the whole path would
     * miss the bug entirely: the old paths differed in text too
     * (`<root>/node_modules/.cache/test-guard.json` under two roots) and
     * still named ONE file, because `node_modules` is a symlink to the main
     * checkout's. What has to differ is the file NAME.
     */
    expect(basename(a.out)).not.toBe(basename(b.out))
    expect(basename(a.confirm)).not.toBe(basename(b.confirm))
  })

  it('differs even when the roots share a node_modules by symlink', () => {
    /*
     * The real shape of the incident: `root` was already per-worktree and the
     * paths still collided, because the directory the path goes through is
     * shared. A key derived from the root (and the git dir) is what separates
     * them -- not the directory the file sits in.
     */
    const a = reportPaths(LINKED, `${MAIN}/.git/worktrees/a-branch`)
    const b = reportPaths(
      '/tmp/worktrees/other',
      `${MAIN}/.git/worktrees/other`
    )
    expect(a.key).not.toBe(b.key)
  })

  it('is stable for the same tree: the confirm pass must find the first pass', () => {
    expect(reportPaths(MAIN, `${MAIN}/.git`).out).toBe(
      reportPaths(MAIN, `${MAIN}/.git`).out
    )
    // A relative git dir is the same tree as its resolved form: `git
    // rev-parse --git-dir` answers ".git" in the main checkout.
    expect(worktreeKey(MAIN, '.git')).toBe(worktreeKey(MAIN, `${MAIN}/.git`))
  })

  it('separates the two passes, and puts both where git already ignores them', () => {
    const { out, confirm } = reportPaths(MAIN, `${MAIN}/.git`)
    expect(out).not.toBe(confirm)
    for (const p of [out, confirm]) {
      expect(p.startsWith(resolve(MAIN, 'node_modules', '.cache'))).toBe(true)
      // A worktree name may hold anything a directory name may; the key is a
      // hash, so nothing from it reaches the filesystem.
      expect(p).toMatch(/test-guard\.[0-9a-f]{12}(\.confirm)?\.json$/)
    }
  })

  it('still separates trees when git cannot be asked at all', () => {
    expect(reportPaths(MAIN, '').out).not.toBe(reportPaths(LINKED, '').out)
  })

  it('a worktree name with spaces or a slash cannot escape the cache', () => {
    const odd = reportPaths(MAIN, `${MAIN}/.git/worktrees/../../../etc/x y`)
    expect(odd.out.startsWith(resolve(MAIN, 'node_modules', '.cache'))).toBe(
      true
    )
  })
})

describe('a report about another tree', () => {
  const results = [
    { name: `${MAIN}/src/a.test.ts`, status: 'failed' },
    { name: `${LINKED}/src/b.test.ts`, status: 'failed' },
  ]

  it('is named, not believed: the foreign files are handed back', () => {
    expect(foreignResults(MAIN, results)).toEqual([`${LINKED}/src/b.test.ts`])
  })

  it('says nothing when every file belongs to this tree', () => {
    expect(foreignResults(MAIN, [results[0]])).toEqual([])
  })

  it('is not fooled by a root that is a prefix of another root', () => {
    // `/p/project` must not accept a file under `/p/project-two`.
    expect(
      foreignResults('/p/project', [
        { name: '/p/project-two/src/a.test.ts', status: 'failed' },
      ])
    ).toEqual(['/p/project-two/src/a.test.ts'])
  })

  it('survives a report with no results at all', () => {
    expect(foreignResults(MAIN, [])).toEqual([])
    expect(foreignResults(MAIN, undefined as never)).toEqual([])
  })
})
