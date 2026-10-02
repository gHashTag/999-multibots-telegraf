/**
 * `tri deps` GUARDS THE ONE node_modules EVERY WORKTREE SHARES.
 *
 * A worktree's node_modules are links to the main checkout's. On 2026-10-02 an
 * agent ran a root `npm ci` in such a tree; npm emptied node_modules THROUGH
 * the link, and the main checkout and every tree linked to it lost their
 * packages at once. `tri deps` links what a foreign tree lacks, names an
 * emptied main checkout in every shape the emptying leaves (exit 1), and
 * `--own` turns the links into the tree's own copies before an install.
 *
 * Each case builds a throwaway main repo + worktree, so nothing real is read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TRI = path.join(__dirname, '..', 'tri')
const BINS = [
  'node_modules/.bin/esbuild',
  'node_modules/.bin/vitest',
  'apps/vibee-editor/render/node_modules/.bin/tsc',
  'apps/vibee-editor/player/node_modules/.bin/vitest',
]

let dir: string
let main: string
let wt: string

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function deps(...args: string[]) {
  const r = spawnSync('bash', [TRI, 'deps', ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-deps-')))
  main = path.join(dir, 'main')
  wt = path.join(dir, 'wt')
  for (const app of ['render', 'player']) {
    const at = path.join(main, 'apps/vibee-editor', app)
    fs.mkdirSync(at, { recursive: true })
    fs.writeFileSync(path.join(at, 'package.json'), '{}\n')
  }
  fs.writeFileSync(path.join(main, '.gitignore'), 'node_modules\n')
  git(main, 'init', '-q')
  git(main, 'add', '.')
  git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x')
  for (const bin of BINS) {
    const at = path.join(main, bin)
    fs.mkdirSync(path.dirname(at), { recursive: true })
    fs.writeFileSync(at, '#!/bin/sh\n', { mode: 0o755 })
  }
  fs.mkdirSync(path.join(main, 'node_modules/pkg'))
  fs.writeFileSync(path.join(main, 'node_modules/pkg/package.json'), '{}')
  git(main, 'worktree', 'add', '-q', '--detach', wt)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('tri deps', () => {
  it('links the root and per-app node_modules a foreign tree lacks', () => {
    const r = deps(wt)
    expect(r.rc).toBe(0)
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(
      true
    )
    expect(
      fs
        .lstatSync(path.join(wt, 'apps/vibee-editor/render/node_modules'))
        .isSymbolicLink()
    ).toBe(true)
    expect(r.out).toContain('no root npm ci')
  })

  it('accepts its flags after the path, not only first', () => {
    const r = deps(wt, '--own')
    expect(r.rc).toBe(0)
    expect(r.out).toContain('3 node_modules now belong to this tree')
  })

  it('--own makes every link a real copy and leaves main untouched', () => {
    deps(wt)
    const r = deps('--own', wt)
    expect(r.rc).toBe(0)
    for (const rel of [
      'node_modules',
      'apps/vibee-editor/render/node_modules',
      'apps/vibee-editor/player/node_modules',
    ]) {
      const st = fs.lstatSync(path.join(wt, rel))
      expect(st.isSymbolicLink(), rel).toBe(false)
      expect(st.isDirectory(), rel).toBe(true)
    }
    // An install in the tree now empties only its copy.
    fs.rmSync(path.join(wt, 'node_modules'), { recursive: true })
    expect(
      fs.existsSync(path.join(main, 'node_modules/pkg/package.json'))
    ).toBe(true)
    expect(r.out).not.toContain('no root npm ci')
  })

  it('--own leaves a link that does not point into the main checkout', () => {
    const elsewhere = path.join(dir, 'elsewhere')
    fs.mkdirSync(elsewhere)
    fs.symlinkSync(elsewhere, path.join(wt, 'node_modules'))
    const r = deps('--own', wt)
    expect(r.out).toContain('skip node_modules')
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(
      true
    )
  })

  const emptied: Array<[string, () => void]> = [
    [
      'EMPTY',
      () => {
        fs.rmSync(path.join(main, 'node_modules'), { recursive: true })
        fs.mkdirSync(path.join(main, 'node_modules'))
      },
    ],
    [
      'DOTFILES-ONLY',
      () => {
        fs.rmSync(path.join(main, 'node_modules'), { recursive: true })
        fs.mkdirSync(path.join(main, 'node_modules/.bin'), { recursive: true })
        fs.writeFileSync(
          path.join(main, 'node_modules/.package-lock.json'),
          '{}'
        )
      },
    ],
    [
      'DANGLING',
      () => {
        fs.rmSync(path.join(main, 'node_modules'), { recursive: true })
        fs.symlinkSync(path.join(dir, 'gone'), path.join(main, 'node_modules'))
      },
    ],
    [
      'ABSENT',
      () => fs.rmSync(path.join(main, 'node_modules'), { recursive: true }),
    ],
  ]

  for (const [word, empty] of emptied) {
    it(`names a main checkout left ${word} and exits 1`, () => {
      empty()
      const r = deps(wt)
      expect(r.rc).toBe(1)
      expect(r.out).toContain(`node_modules is ${word}`)
      expect(r.out).toContain('tri deps --heal')
    })
  }

  it('names a package this tree declares that the linked install lacks', () => {
    // The link carries the main checkout's install, made for ITS branch.
    fs.writeFileSync(
      path.join(wt, 'package.json'),
      JSON.stringify({ dependencies: { pkg: '1', redis: '6' } })
    )
    const r = deps(wt)
    expect(r.rc).toBe(1)
    expect(r.out).toContain(
      'root declares packages its node_modules lacks: redis'
    )
    expect(r.out).not.toMatch(/lacks: .*\bpkg\b/)
    expect(r.out).toContain('tri deps --own, then install in this tree')
  })

  it('refuses a flag it does not know instead of reading it as a path', () => {
    const r = deps('--hea1', wt)
    expect(r.rc).toBe(1)
    expect(r.out).toContain('unknown flag: --hea1')
  })
})
