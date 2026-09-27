/**
 * THE TEST GATE JUDGES WHAT THIS BRANCH ADDS, NOT WHAT MAIN BROUGHT IN.
 *
 * Measured 27.09.2026: after a branch merged main, its push of one line of a
 * .md journal was refused -- `upstream..HEAD` carried eight code files, all
 * main's, and a test main itself had turned red (provider.test.ts, #3143) was
 * reported as "your edit broke it". ownOnly keeps what the branch changed on
 * top of main; a file changed while resolving a conflict differs from main
 * and stays.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const { ownOnly } = require_('../../../scripts/lib/pushed-files.cjs')

describe('the files a push is judged by', () => {
  it('drops what arrived only through a merge of main', () => {
    const pushed = [
      'apps/vibee-editor/render/src/browser/agent-tools.ts',
      'apps/vibee-editor/render/src/agent/crm-segments.ts',
      '.claude/loop-state/story-loop.md',
    ]
    expect(ownOnly(pushed, ['.claude/loop-state/story-loop.md'])).toEqual([
      '.claude/loop-state/story-loop.md',
    ])
  })

  it("keeps the branch's own files, a conflict resolution included", () => {
    const pushed = ['src/a.ts', 'src/main-only.ts', 'src/resolved.ts']
    expect(ownOnly(pushed, ['src/a.ts', 'src/resolved.ts'])).toEqual([
      'src/a.ts',
      'src/resolved.ts',
    ])
  })

  it('never widens the push: a file of the branch not in this push stays out', () => {
    expect(ownOnly(['src/a.ts'], ['src/a.ts', 'src/pushed-before.ts'])).toEqual(
      ['src/a.ts']
    )
  })

  it('keeps the whole push when git did not answer', () => {
    expect(ownOnly(['src/a.ts', 'src/b.ts'], null)).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('is what the gate uses for a branch with an upstream', () => {
    const guard = readFileSync(
      resolve(__dirname, '../../../scripts/test-guard.cjs'),
      'utf8'
    )
    const range = guard.slice(
      guard.indexOf('function filesBeingPushed'),
      guard.indexOf('function narrowToBranch')
    )
    expect(range).toContain("git('diff', '--name-only', 'origin/main...HEAD')")
    expect(range).toMatch(/return ownOnly\(/)
  })
})
