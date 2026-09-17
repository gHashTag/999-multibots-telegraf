/**
 * The run must not execute a FOREIGN snapshot of the repository.
 *
 * WHAT HAPPENED. `git worktree` puts full copies of the project inside the
 * project: `.claude/worktrees/tg-social` and `.claude/worktrees/bot-alerts` --
 * 1745 test files between them, taken a week ago. The root vitest run
 * collected them alongside its own, because there were exactly two exclusions:
 * node_modules and dist.
 *
 * The direct consequence, measured rather than assumed: a request for two files
 *
 *     npx vitest run src/__tests__/money/unchecked-money-result.test.ts \
 *                    src/__tests__/money/referral-on-topup.test.ts
 *
 * collected SIX and reported two failures. The code was not broken. Vitest has
 * one root, so the worktree's copy of a test reads the MAIN repo's `src/` while
 * carrying its own week-old known-debt list -- and "no new files with a
 * discarded result appeared" breaks against files that appeared LEGITIMATELY.
 * The same run with `--exclude '.claude/worktrees/**'`: ten green out of ten.
 *
 * THE SECOND, DELAYED HARM. `npm run test:gate` compares SETS of
 * "path :: name". Tests from a copy carry their own paths and would enter the
 * snapshot; the day the worktree is deleted, hundreds of names vanish at once
 * and the gate calls it a regression -- formally right, substantively empty.
 * Exactly the case where the next cycle breaks the previous one's work without
 * touching a line of code.
 *
 * `.test-baseline.txt` was taken before the copies existed (2406 lines, not one
 * worktree path), so this is closed before it set in.
 *
 * THIS TEST guards the exclusion. The pattern is easy to lose in the next edit
 * of that list -- it is long, and already holds eleven entries.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import picomatch from 'picomatch'
import config from '../../../vitest.config'

const EXCLUDE: string[] = (
  ((config as Record<string, any>).test?.exclude as string[]) ?? []
).filter(p => typeof p === 'string')

/**
 * `dot: true` is a necessary condition, not decoration.
 *
 * By default picomatch does not let `*` cross a leading dot, so
 * `**\/worktrees/**` would NOT catch `.claude/worktrees/...` -- checked
 * separately, the answer was `false`. Vitest applies its own excludes with
 * dots included, and that was verified BY DOING, not by reading docs: after
 * the config change `npx vitest run src/__tests__/money/unchecked-money-result.test.ts`
 * collects ONE file instead of three.
 *
 * picomatch rather than micromatch: the first arrives with vitest itself (via
 * tinyglobby) and matches paths with the very same version; the second landed
 * here incidentally, with jest, and will leave when jest does.
 */
const excluded = (p: string) => picomatch(EXCLUDE, { dot: true })(p)

/**
 * A nested working copy is any directory below the root that has its own
 * `.git`. For a worktree that is a FILE pointing at the shared directory, for
 * a plain clone a directory; either counts.
 *
 * We do not descend into a copy: the fact of it is what matters, not the
 * contents.
 */
function nestedCheckouts(root: string, depth = 4): string[] {
  const found: string[] = []
  ;(function walk(dir: string, left: number) {
    if (left < 0) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (e.name === 'node_modules' || e.name === 'dist') continue
      const p = path.join(dir, e.name)
      if (fs.existsSync(path.join(p, '.git'))) {
        found.push(path.relative(root, p))
        continue // do not descend
      }
      walk(p, left - 1)
    }
  })(root, depth)
  return found
}

const ROOT = path.resolve(__dirname, '../../..')

describe('foreign copies of the repo never enter the run', () => {
  it('the exclusion list was actually read', () => {
    // Safety against myself: if importing the config breaks and EXCLUDE goes
    // empty, every check below passes without looking at anything.
    expect(EXCLUDE.length).toBeGreaterThan(5)
    expect(EXCLUDE).toContain('**/node_modules/**')
  })

  it('the pattern catches a path inside a working copy', () => {
    // Samples, not a disk search: the worktrees may not exist on the machine
    // running this, and then "nothing found" would prove nothing.
    const foreign = [
      '.claude/worktrees/tg-social/src/__tests__/money/x.test.ts',
      '.claude/worktrees/bot-alerts/src/__tests__/a.test.ts',
      'worktrees/whatever/src/b.test.ts',
      '.worktrees/nested/deep/c.test.ts',
    ]
    for (const p of foreign) expect(excluded(p), p).toBe(true)
  })

  it('and does not touch our own tests', () => {
    // The inverse check: an exclusion that eats our own files makes the run
    // green through emptiness, which is worse than a phantom failure.
    const ours = [
      'src/__tests__/money/unchecked-money-result.test.ts',
      'src/__tests__/tools/no-foreign-test-copies.test.ts',
      'scripts/tests/pagination.test.ts',
      'apps/vibee-editor/render/gallery-registration.test.ts',
    ]
    for (const p of ours) expect(excluded(p), p).toBe(false)
  })

  it('every nested copy on this machine is excluded', () => {
    const missed = nestedCheckouts(ROOT).filter(
      dir => !excluded(path.join(dir, 'src/__tests__/any.test.ts'))
    )
    expect(missed).toEqual([])
  })
})
