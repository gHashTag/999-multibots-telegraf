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

const head = (cwd: string) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd }).toString().trim()

let fakeBin = ''

function deps(...args: string[]) {
  // tri puts homebrew first on PATH, so the stand-ins go in by name.
  const fake = fakeBin
    ? { TRI_BUN: `${fakeBin}/bun`, TRI_NPM: `${fakeBin}/npm` }
    : {}
  const r = spawnSync('bash', [TRI, 'deps', ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...fake },
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
  fakeBin = ''
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

  it('--own copies what a linked-to-link means, not the second link', () => {
    // The main checkout's install may itself be a link into a store; `cp -R`
    // copies such a link AS a link, and the tree would still share it.
    const store = path.join(dir, 'store')
    fs.renameSync(path.join(main, 'node_modules'), store)
    fs.symlinkSync(store, path.join(main, 'node_modules'))
    fs.symlinkSync(
      path.join(main, 'node_modules'),
      path.join(wt, 'node_modules')
    )
    const r = deps('--own', wt)
    expect(r.rc, r.out).toBe(0)
    const own = path.join(wt, 'node_modules')
    expect(fs.lstatSync(own).isSymbolicLink()).toBe(false)
    expect(fs.existsSync(path.join(own, 'pkg/package.json'))).toBe(true)
    fs.rmSync(own, { recursive: true })
    expect(fs.existsSync(path.join(store, 'pkg/package.json'))).toBe(true)
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

  describe('--heal', () => {
    const player = 'apps/vibee-editor/player'
    let log: string

    // bun and npm stand-ins: record where and how they ran, install the
    // missing `qr`, and dirty the lock the way a real install does.
    function fakeTools() {
      fakeBin = path.join(dir, 'bin')
      log = path.join(dir, 'installs.log')
      fs.mkdirSync(fakeBin)
      for (const tool of ['bun', 'npm']) {
        fs.writeFileSync(
          path.join(fakeBin, tool),
          `#!/bin/sh
echo "${tool} $* @ $(pwd -P)" >> "${log}"
mkdir -p node_modules/qr && echo '{}' > node_modules/qr/package.json
for l in package-lock.json bun.lock; do [ -f "$l" ] && echo drift >> "$l"; done
exit 0
`,
          { mode: 0o755 }
        )
      }
    }

    // The main checkout's player declares `qr` and its install lacks it; the
    // worktree is on the same commit, so the link is incomplete, not stale.
    function declareQr(originMain: 'with-qr' | 'before-qr') {
      const before = head(main)
      fs.writeFileSync(
        path.join(main, player, 'package.json'),
        JSON.stringify({ dependencies: { qr: '1' } })
      )
      fs.writeFileSync(path.join(main, player, 'package-lock.json'), '{}\n')
      git(main, 'add', '.')
      git(
        main,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-qm',
        'qr'
      )
      git(wt, 'checkout', '-q', '--detach', head(main))
      const ref = originMain === 'with-qr' ? 'HEAD' : before
      git(main, 'update-ref', 'refs/remotes/origin/main', ref)
      fakeTools()
    }

    it('names an incomplete main install and points at --heal, not --own', () => {
      declareQr('with-qr')
      const r = deps(wt)
      expect(r.rc).toBe(1)
      expect(r.out).toContain(
        `${player} declares packages its node_modules lacks: qr`
      )
      expect(r.out).toContain('fix: tri deps --heal')
      expect(fs.existsSync(log)).toBe(false)
    })

    it('installs the app in the MAIN checkout with npm install and restores its lock', () => {
      declareQr('with-qr')
      const r = deps('--heal', wt)
      expect(r.out).toContain(`reinstalled ${player} in the main checkout`)
      const ran = fs.readFileSync(log, 'utf8').trim().split('\n')
      expect(ran).toEqual([
        `npm install --no-audit --no-fund @ ${path.join(main, player)}`,
      ])
      expect(
        fs.readFileSync(path.join(main, player, 'package-lock.json'), 'utf8')
      ).toBe('{}\n')
      expect(deps(wt).rc).toBe(0)
    })

    it('refuses when the main checkout package.json is not origin/main', () => {
      declareQr('before-qr')
      const r = deps('--heal', wt)
      expect(r.rc).toBe(1)
      expect(r.out).toContain(`not healing ${player}`)
      expect(fs.existsSync(log)).toBe(false)
    })

    it('reinstalls an emptied root with bun, once', () => {
      git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
      fakeTools()
      fs.rmSync(path.join(main, 'node_modules'), { recursive: true })
      fs.mkdirSync(path.join(main, 'node_modules'))
      const r = deps('--heal', wt)
      expect(r.out).toContain('reinstalled . in the main checkout')
      expect(fs.readFileSync(log, 'utf8').trim().split('\n')).toEqual([
        `bun install --no-summary @ ${main}`,
      ])
    })
  })
})
