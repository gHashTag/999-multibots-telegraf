import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * Ratchet: the Node builtin `stream` must be imported as `node:stream`.
 *
 * This is the cause of the worktree degradation that cost eight refuted
 * hypotheses across several iterations, and it is one character wide.
 *
 * THE SYMPTOM. In a git worktree whose node_modules is a symlink to the main
 * checkout, some test files failed to collect at all:
 *
 *   Cannot find module '<worktree>/stream'
 *   imported from '<main-checkout>/node_modules/vite-node/dist/client.mjs'
 *
 * It looked like an environment fault -- the message names vite-node and two
 * different roots and no source file of ours -- and it was per-file, which made
 * it look random. `tri trust` passed on trees where it was live, because the
 * probe files it runs read sources as TEXT and import nothing.
 *
 * THE CAUSE. `stream` written WITHOUT the `node:` prefix. Vite resolves the bare
 * specifier against the project root, and in a worktree the root that
 * node_modules really lives under is a different directory, so it looks for
 * <worktree>/stream and finds nothing. Only files whose import graph reaches one
 * of these ever hit it: staffListResolution imports @/navigation, whose barrel
 * reaches services/videoTranscription. The text-reading ratchets import only fs
 * and path, so they never did -- that is the whole of the "randomness".
 *
 * PROVEN BY REPRODUCTION, both directions: with node:stream the file collects
 * and its 3 tests pass; reverting videoTranscription alone brings the error
 * back; reverting both keeps it; re-applying clears it again.
 *
 * WHY ONLY `stream`. 495 bare builtin imports live in this tree, 431 of them fs
 * and path, and those demonstrably do not break -- the suite is green with them.
 * So this forbids the one module measured to break, not the whole class. Widen
 * it when another module is shown to break, not before: a 271-file rewrite to
 * prevent a fault that has never occurred is a bigger risk than the fault.
 */

const ROOT = path.resolve(__dirname, '../../..')

/** Bare `stream`, not `node:stream`, and not a longer name ending in it. */
// The dynamic form is listed BEFORE bare `import`: after a bare `import` this
// pattern expects whitespace and then a quote, so a dynamic import of the bare
// module never matched. (The forbidden spelling is not written out here -- this
// file is inside the population it scans, and a comment would flag itself, the
// same trap the assembled sample below exists for.)
//
// That gap was live: aiReelsWizard.test.ts mocked 'fs' with a factory doing a
// dynamic import of the bare module, and the resulting tree-dependent resolution
// failure made "should merge two videos successfully" pass in one worktree and
// fail in another built from the same commit. This ratchet was green throughout.
const BARE_STREAM = /(?:from|import\(|import|require\()\s*['"]stream['"]/
const BARE_STREAM_G = new RegExp(BARE_STREAM.source, 'g')

const sources = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.(ts|mts|cts|js|mjs|cjs)$/.test(f))

/**
 * The module name, ASSEMBLED rather than written.
 *
 * Spelled as a literal, the positive samples below would themselves be bare
 * imports as far as the whole-tree check is concerned, and this file would fail
 * on its own fixture. That is not a hypothetical: it happened on the first run
 * here, and it is the SAME trap noEmbeddedDbCredentials fell into -- recorded
 * one iteration earlier as "fix the class, not the instance you tripped on",
 * and then walked into again while writing this. A guard that scans the whole
 * tree is inside its own population; that is a property of the guard, not an
 * accident of one file.
 */
const M = ['str', 'eam'].join('')

describe('the stream builtin is imported as node:stream', () => {
  it('the matcher sees the bare form and spares the prefixed one', () => {
    // Both directions. Without the negative, a matcher broadened until it also
    // matched node:stream would report the tree dirty forever and get deleted.
    expect(BARE_STREAM.test(`import { pipeline } from '${M}'`)).toBe(true)
    expect(BARE_STREAM.test(`const { Readable } = require('${M}')`)).toBe(true)
    expect(BARE_STREAM.test(`import { pipeline } from 'node:${M}'`)).toBe(false)
    expect(BARE_STREAM.test(`const { Readable } = await import('${M}')`)).toBe(
      true
    )
    expect(BARE_STREAM.test(`await import('node:${M}')`)).toBe(false)
    expect(BARE_STREAM.test(`import x from '${M}-json'`)).toBe(false)
    expect(BARE_STREAM.test(`responseType: '${M}'`)).toBe(false)
  })

  it('prose that quotes the forbidden spelling is not an import', () => {
    // Third occurrence of this trap. Twice it was cured by rewording the
    // comment; that fixes the instance and leaves the class. A guard that
    // scans whole files is inside its own population, and so is every file
    // documenting the rule -- the reader must therefore skip prose, not the
    // authors remember to.
    const inComment = `// const { Readable } = require('${M}')\nconst a = 1`
    const inBlock = `/**\n * await import('${M}')\n */\nconst b = 2`
    const inString = `const msg = "use require('${M}') here"`
    const real = `const { Readable } = require('${M}')`
    expect(matchCode(inComment, BARE_STREAM_G).length).toBe(0)
    expect(matchCode(inBlock, BARE_STREAM_G).length).toBe(0)
    expect(matchCode(inString, BARE_STREAM_G).length).toBe(0)
    // ...and the real thing is still caught, or the rule above is vacuous.
    expect(matchCode(real, BARE_STREAM_G).length).toBe(1)
  })

  it('no file imports it bare', () => {
    const files = sources()
    expect(files.length, 'the file list must not be empty').toBeGreaterThan(300)
    const offenders = files.filter(f => {
      const p = path.join(ROOT, f)
      if (!fs.existsSync(p)) return false
      // matchCode drops any hit that BEGINS inside a comment or a string body.
      // The specifier itself survives because the match starts at `from` /
      // `import(` / `require(`, which is code. Prose that quotes the forbidden
      // spelling -- documentation of this very rule -- no longer counts.
      return matchCode(fs.readFileSync(p, 'utf8'), BARE_STREAM_G).length > 0
    })
    expect(
      offenders,
      `Import it as node:stream. Bare 'stream' resolves against the project ` +
        `root, and in a git worktree that root is not where node_modules lives, ` +
        `so any test whose import graph reaches this file fails to collect with ` +
        `"Cannot find module <worktree>/stream".`
    ).toEqual([])
  })
})
