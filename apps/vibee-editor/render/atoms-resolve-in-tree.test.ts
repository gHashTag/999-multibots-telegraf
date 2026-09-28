import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * THE BARREL THE TESTS IMPORT MUST BE THIS TREE'S BARREL.
 *
 * @vibee/atoms is a source-only file: dependency: render/node_modules carries
 * a RELATIVE symlink (../../../packages/vibee-atoms) so that, in a healthy
 * install, it points at the packages/vibee-atoms of the same checkout the
 * tests run from. The symlink being relative is what makes worktrees safe --
 * and what makes a symlinked node_modules fatal: a tree that borrows another
 * checkout's render/node_modules resolves @vibee/atoms to THAT tree's barrel,
 * which reflects that tree's branch, not the code under test.
 *
 * This is not hypothetical. 2026-09-28: spec-quality.test.ts went 10/10 red
 * with "judge is not a function" in a worktree whose render/node_modules was
 * symlinked to the main checkout sitting on a branch whose barrel predates
 * the spec-quality export block. Same tree, one symlink swapped -- 10/10
 * green (A/B in the tick-h log). The failure read like a build quirk and was
 * initially misdiagnosed as vite dep-prebundle dropping re-export blocks;
 * there is no prebundle here at all (the .vite/vitest cache holds only
 * results.json, the optimizer never touches this package).
 *
 * Without this guard the trap speaks in "X is not a function" and costs an
 * hour of archaeology. With it, the run names the cause and the cure.
 */
describe('@vibee/atoms resolves inside the tree under test', () => {
  it("the barrel the render tests import is this tree's barrel", () => {
    const renderRoot = dirname(fileURLToPath(import.meta.url))
    const ownAtoms = realpathSync(
      resolve(renderRoot, '../packages/vibee-atoms')
    )

    const resolvedEntry = createRequire(import.meta.url).resolve('@vibee/atoms')
    // "." exports to src/index.ts; one dirname is the package root.
    const resolvedAtoms = realpathSync(dirname(dirname(resolvedEntry)))

    if (resolvedAtoms !== ownAtoms) {
      throw new Error(
        `@vibee/atoms resolved OUTSIDE the tree under test: tests see ` +
          `${resolvedAtoms}, but this tree's barrel is ${ownAtoms}. ` +
          `render/node_modules/@vibee/atoms is a symlink leaking across ` +
          `checkouts -- a worktree borrowed a foreign node_modules, or the ` +
          `main checkout is on a different branch. Cure: give THIS tree its ` +
          `own install (npm ci in apps/vibee-editor/render); never share or ` +
          `bun-install node_modules across trees.`
      )
    }
    expect(resolvedAtoms).toBe(ownAtoms)
  })
})
