import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'

const {
  bareBuiltinsInMockFactories,
  selfCheck,
} = require('../../../scripts/lib/mock-factory-imports.cjs')
const { repoFiles } = require('../../../scripts/lib/repo-sources.cjs')

/**
 * A bare builtin dynamic import inside a mock factory is not a style
 * question -- it makes the verdict depend on the worktree.
 *
 * Iterations 155-173: aiReelsWizard.test.ts failed in one tree and passed in
 * another, from the same commit, byte-identical, each verdict stable on
 * repeat. Five hypotheses were measured and eliminated (test order, a scene
 * flag, the vite cache, a duplicate mock, timing). The cause was one bare
 * specifier inside the test's OWN `vi.mock('fs')` factory, where vitest
 * intercepts resolution. `node:stream` resolves identically everywhere.
 *
 * This guard exists because that failure is invisible in a diff: nothing in
 * any file differs between a tree that passes and one that does not.
 */
describe('no bare builtin dynamic import inside a mock factory', () => {
  it('the reader can tell the hazardous shape from the four lookalikes', () => {
    // Without this, a broken reader reports zero -- indistinguishable from a
    // healthy repository. It must fail loudly instead.
    expect(() => selfCheck()).not.toThrow()
  })

  it('no test file has one', () => {
    // Tracked AND present-but-unstaged: a factory is hazardous the moment
    // it is on disk, not when it reaches the index.
    const files = repoFiles(process.cwd())
      .filter(f => /\.(ts|mts|cts|js|mjs|cjs)$/.test(f))
      .filter(f => /__tests__|\.test\./.test(f))

    const offenders: string[] = []
    for (const f of files) {
      if (!existsSync(f)) continue
      for (const hit of bareBuiltinsInMockFactories(
        readFileSync(f, 'utf8'),
        f
      )) {
        offenders.push(
          `${f}:${hit.line} imports '${hit.module}' (use 'node:${hit.module}')`
        )
      }
    }

    expect(offenders).toEqual([])
  })

  it('the population it scans is real, not an empty list', () => {
    // A guard whose subject has disappeared prints "pass" forever. If the
    // factory count ever collapses, the zero above stops meaning anything.
    const files = repoFiles(process.cwd()).filter(
      f => /__tests__|\.test\./.test(f) && /\.(ts|js)$/.test(f)
    )

    let factories = 0
    for (const f of files) {
      if (!existsSync(f)) continue
      const src = readFileSync(f, 'utf8')
      factories += (src.match(/\bvi\.mock\s*\(/g) || []).length
    }
    expect(factories).toBeGreaterThan(400)
  })
})
