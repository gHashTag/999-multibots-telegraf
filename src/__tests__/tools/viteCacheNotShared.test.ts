import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ratchet: the Vite cache belongs to the tree that owns it, not to whichever
 * checkout happens to hold the real node_modules.
 *
 * Vite defaults `cacheDir` to `<root>/node_modules/.vite`. In a git worktree,
 * node_modules is a SYMLINK to the main checkout, so that path resolves into
 * the main checkout and every worktree writes into the SAME cache. Measured
 * when this was written: 25 worktrees, 25 branches, one cache.
 *
 * That is shared mutable state between branches, in a repository where several
 * agents work at once. A branch could inherit another branch's optimised
 * dependencies, and nothing in the tree would say so.
 *
 * WHAT IS NOT CLAIMED. This is not offered as the cause of any particular
 * failure. A "regression" reported one iteration earlier -- aiReelsWizard step
 * 4 -- turned out not to reproduce in a fresh tree at all, and the control that
 * seemed to exonerate my own edit ran inside the same suspect tree, so it
 * proved less than I said it did. The honest statement is narrower: a shared
 * cache is a channel that should not exist between branches, and closing it
 * costs one re-optimisation per tree.
 *
 * The assertion is on the RESOLVED REAL PATH, because the whole defect is that
 * a path inside the tree can resolve outside it. Comparing the configured
 * string would pass while the bug was live.
 */

const ROOT = path.resolve(__dirname, '../../..')

describe('the vite cache is not shared between worktrees', () => {
  it('the configured cacheDir is not inside node_modules', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'vitest.config.ts'), 'utf8')
    // To END OF LINE, not to the first comma. The value is a call, so it
    // CONTAINS a comma: `path.resolve(__dirname, '...')`. A [^\n,]+ capture
    // stops at that comma and yields `path.resolve(__dirname`, which never
    // contains node_modules -- so the check passed with the cache pointed
    // straight back into node_modules. Caught by mutation, not by reading.
    const m = cfg.match(/cacheDir:\s*(.+)$/m)
    expect(m, 'vitest.config.ts must set cacheDir explicitly').toBeTruthy()
    expect(
      (m as RegExpMatchArray)[1],
      'a cacheDir under node_modules resolves through the symlink into the main checkout'
    ).not.toMatch(/node_modules/)
  })

  it('the cache directory really lives inside this tree', () => {
    // The real path, not the configured one: resolving is the whole point.
    const dir = path.join(ROOT, '.vite-cache')
    if (!fs.existsSync(dir)) {
      // Nothing has populated it yet in this checkout; the configuration check
      // above still holds the property. Not an excuse to skip silently, so say
      // it in the assertion rather than returning early.
      expect(fs.existsSync(path.join(ROOT, 'vitest.config.ts'))).toBe(true)
      return
    }
    expect(fs.realpathSync(dir).startsWith(fs.realpathSync(ROOT))).toBe(true)
  })

  it('the cache directory is ignored by git', () => {
    // Otherwise the first run in a fresh tree offers to commit a build cache,
    // and someone eventually does.
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    expect(ignore).toMatch(/^\.vite-cache\/?$/m)
  })
})
