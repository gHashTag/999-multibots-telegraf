import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
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
/*
 * A COPY WITH THE SAME BYTES IS THE SAME BARREL. The cloud check-runner
 * installs with --install-links and keeps node_modules on its cache volume,
 * so @vibee/atoms there is a copy, never this path -- and the guard failed
 * every run that reached it (2026-10-03). The copy cannot be stale: the
 * runner keys that cache on a hash of packages/vibee-atoms. So the test asks
 * what the trap was about, the CONTENT: a foreign barrel from another branch
 * differs and still fails here, an identical copy does not.
 *
 * "Identical" as npm copies it: --install-links installs a PACKED copy, and
 * npm never packs .gitignore or package-lock.json (`npm pack --dry-run` on
 * this package lists every tracked file but those two). Neither is the
 * barrel, so neither is hashed.
 */
const NEVER_PACKED = new Set(['.gitignore', 'package-lock.json'])

/*
 * NOR WHAT GIT IGNORES. 2026-10-03 the push gate fell back to a local run,
 * where a worktree resolves @vibee/atoms to the main checkout's package --
 * same tracked bytes, plus a gitignored .mimosa/ hook-state directory a
 * tool left there. That is not the barrel either, and npm never ships it.
 * Asked of the tree under test; outside a repository nothing is ignored.
 */
function gitIgnored(repoDir: string, rels: string[]): Set<string> {
  if (!rels.length) return new Set()
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))
  )
  const r = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
    cwd: repoDir,
    env,
    input: rels.map(x => x.replace(/^\//, '')).join('\0') + '\0',
    encoding: 'utf8',
  })
  return new Set(
    (r.stdout || '')
      .split('\0')
      .filter(Boolean)
      .map(x => '/' + x)
  )
}

/* Relative path -> sha256 of the bytes, for every file npm would install. */
function fileHashes(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (e.name === 'node_modules' || NEVER_PACKED.has(e.name)) continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile())
        out.set(
          p.slice(dir.length),
          createHash('sha256').update(readFileSync(p)).digest('hex')
        )
    }
  }
  walk(dir)
  return out
}

/* Every file of the barrel, minus what git ignores in the tree under test. */
function barrelFiles(dir: string): Map<string, string> {
  const all = fileHashes(dir)
  const own = realpathSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../packages/vibee-atoms')
  )
  for (const p of gitIgnored(own, [...all.keys()])) all.delete(p)
  return all
}

function contentHash(dir: string): string {
  const h = createHash('sha256')
  for (const [p, f] of barrelFiles(dir)) h.update(p).update(f)
  return h.digest('hex')
}

/*
 * Which files differ, so a red run names them instead of two hashes: the
 * gate prints this message and nothing else about the failure.
 */
function differing(a: string, b: string): string[] {
  const ha = barrelFiles(a)
  const hb = barrelFiles(b)
  return [...new Set([...ha.keys(), ...hb.keys()])]
    .filter(n => ha.get(n) !== hb.get(n))
    .sort()
}

describe('@vibee/atoms resolves inside the tree under test', () => {
  it("the barrel the render tests import is this tree's barrel", () => {
    const renderRoot = dirname(fileURLToPath(import.meta.url))
    const ownAtoms = realpathSync(
      resolve(renderRoot, '../packages/vibee-atoms')
    )

    const resolvedEntry = createRequire(import.meta.url).resolve('@vibee/atoms')
    // "." exports to src/index.ts; one dirname is the package root.
    const resolvedAtoms = realpathSync(dirname(dirname(resolvedEntry)))

    if (
      resolvedAtoms !== ownAtoms &&
      contentHash(resolvedAtoms) !== contentHash(ownAtoms)
    ) {
      throw new Error(
        `@vibee/atoms resolved OUTSIDE the tree under test: tests see ` +
          `${resolvedAtoms}, but this tree's barrel is ${ownAtoms}. ` +
          `render/node_modules/@vibee/atoms is a symlink leaking across ` +
          `checkouts -- a worktree borrowed a foreign node_modules, or the ` +
          `main checkout is on a different branch. Cure: give THIS tree its ` +
          `own install (npm ci in apps/vibee-editor/render); never share or ` +
          `bun-install node_modules across trees. Differing files: ` +
          differing(resolvedAtoms, ownAtoms).slice(0, 10).join(', ')
      )
    }
    expect(contentHash(resolvedAtoms)).toBe(contentHash(ownAtoms))
  })

  it('a packed copy passes, ignored junk too, and a copy one byte off does not', () => {
    const renderRoot = dirname(fileURLToPath(import.meta.url))
    const own = realpathSync(resolve(renderRoot, '../packages/vibee-atoms'))
    const copy = mkdtempSync(join(tmpdir(), 'atoms-copy-'))
    try {
      cpSync(own, copy, {
        recursive: true,
        filter: src => !src.includes('node_modules'),
      })
      /* What npm leaves out of the copy it installs. */
      for (const f of NEVER_PACKED) rmSync(join(copy, f), { force: true })
      expect(contentHash(copy)).toBe(contentHash(own))
      /* What a tool leaves behind, gitignored: not the barrel either. */
      mkdirSync(join(copy, '.mimosa', 'hook-state'), { recursive: true })
      writeFileSync(join(copy, '.mimosa', 'hook-state', 'x'), 'state')
      expect(contentHash(copy)).toBe(contentHash(own))
      const entry = join(copy, 'src', 'index.ts')
      writeFileSync(entry, readFileSync(entry, 'utf8') + ' ')
      expect(contentHash(copy)).not.toBe(contentHash(own))
    } finally {
      rmSync(copy, { recursive: true, force: true })
    }
  })
})
