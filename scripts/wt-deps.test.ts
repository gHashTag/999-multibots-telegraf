/**
 * `tri wt-deps`: a linked worktree's node_modules, ready for the gates.
 *
 * 2026-10-06: three pushes in one night failed related-tests on "Cannot find
 * package 'undici'" because the worktree had no render node_modules (#3674).
 * The test builds a throwaway repo with a fake undici and atoms package, so
 * it never touches the real checkout or the network.
 */
import { describe, expect, it } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const WT_DEPS = path.join(__dirname, '..', 'bin', 'helpers', 'wt-deps.sh')
const R = 'apps/vibee-editor/render'

/* A hook's GIT_DIR / GIT_INDEX_FILE would aim git at the real repo. */
const env = (extra: Record<string, string> = {}) => {
  const e: Record<string, string | undefined> = { ...process.env, ...extra }
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k]
  return e as NodeJS.ProcessEnv
}

function pkg(dir: string, name: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, main: 'index.js' })
  )
  writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1\n')
}

/** A main checkout with installed render deps, and a bare linked tree. */
function repo() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'wt-deps-')))
  const main = path.join(root, 'main')
  const sh = (cmd: string, cwd = main) =>
    execSync(cmd, {
      cwd,
      stdio: 'pipe',
      env: env(),
    })
  mkdirSync(path.join(main, R), { recursive: true })
  writeFileSync(path.join(main, R, 'package-lock.json'), '{"lock":1}\n')
  pkg(path.join(main, 'apps/vibee-editor/packages/vibee-atoms'), '@vibee/atoms')
  writeFileSync(path.join(main, '.gitignore'), 'node_modules\n')
  sh(
    'git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init'
  )
  mkdirSync(path.join(main, 'node_modules'))
  pkg(path.join(main, R, 'node_modules/undici'), 'undici')
  mkdirSync(path.join(main, R, 'node_modules/@vibee'), { recursive: true })
  symlinkSync(
    '../../../packages/vibee-atoms',
    path.join(main, R, 'node_modules/@vibee/atoms')
  )
  const tree = path.join(root, 'tree')
  sh(`git worktree add -q ${tree}`)
  return { main, tree }
}

const run = (tree: string, main: string) => {
  const r = spawnSync('bash', [WT_DEPS, tree], {
    encoding: 'utf8',
    env: env({ TRI_WT_MAIN: main }),
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('tri wt-deps', () => {
  it('links root, clones render, and atoms resolves into the tree', () => {
    const { main, tree } = repo()
    const r = run(tree, main)
    expect(r.out).toMatch(/root {4}linked/)
    expect(r.out).toMatch(/render {2}cloned/)
    expect(r.rc).toBe(0)
    expect(lstatSync(path.join(tree, 'node_modules')).isSymbolicLink()).toBe(
      true
    )
    expect(lstatSync(path.join(tree, R, 'node_modules')).isDirectory()).toBe(
      true
    )
    expect(realpathSync(path.join(tree, R, 'node_modules/@vibee/atoms'))).toBe(
      path.join(tree, 'apps/vibee-editor/packages/vibee-atoms')
    )
  })

  it('replaces a render symlink into the main checkout', () => {
    const { main, tree } = repo()
    symlinkSync(
      path.join(main, R, 'node_modules'),
      path.join(tree, R, 'node_modules')
    )
    const r = run(tree, main)
    expect(r.out).toMatch(/was a symlink/)
    expect(r.rc).toBe(0)
    expect(lstatSync(path.join(tree, R, 'node_modules')).isSymbolicLink()).toBe(
      false
    )
  })

  it('is idempotent on a ready tree', () => {
    const { main, tree } = repo()
    run(tree, main)
    const r = run(tree, main)
    expect(r.out).toMatch(/render {2}present/)
    expect(r.rc).toBe(0)
  })

  it('refuses the main checkout itself', () => {
    const { main } = repo()
    const r = run(main, main)
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/main checkout/)
    expect(existsSync(path.join(main, R, 'node_modules/undici'))).toBe(true)
  })
  /* PR #3675 review: "root present" with nothing to link was rc 0. */
  it('fails when the main checkout has no root node_modules', () => {
    const { main, tree } = repo()
    rmSync(path.join(main, 'node_modules'), { recursive: true })
    const r = run(tree, main)
    expect(r.out).toMatch(/FAIL {4}root/)
    expect(r.out).not.toMatch(/root {4}present/)
    expect(r.rc).toBe(1)
  })

  it('relinks a dangling root symlink', () => {
    const { main, tree } = repo()
    symlinkSync(path.join(main, 'gone'), path.join(tree, 'node_modules'))
    const r = run(tree, main)
    expect(r.out).toMatch(/root {4}linked/)
    expect(r.rc).toBe(0)
    expect(existsSync(path.join(tree, 'node_modules'))).toBe(true)
  })
})
