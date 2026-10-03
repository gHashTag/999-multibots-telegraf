/**
 * `tri worktrees --apply`: removes only worktrees that are provably done.
 *
 * A real git repository with real worktrees, and gh stubbed through TRI_GH
 * with the merged-PR list. Each tree stands for one way a sweep could lose
 * work; the test asserts which directories survive the sweep, because that
 * is the property that matters -- not what the report says.
 *
 * 03.10.2026: before this, "finished" meant "branch NAME has a merged PR",
 * detached trees were never judged, and the printed command was
 * `git worktree remove --force` even for a tree holding an ignored .env and
 * a nested worktree.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROBE = path.join(__dirname, 'probe-worktrees.cjs')
const hasTools =
  spawnSync('git', ['--version']).status === 0 &&
  spawnSync('lsof', ['-v']).error === undefined

let tmp: string
let repo: string
let out: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

function tree(name: string, ...addArgs: string[]) {
  const dir = path.join(tmp, name)
  git(
    repo,
    'worktree',
    'add',
    ...addArgs.flatMap(a => (a === '@' ? [dir] : [a]))
  )
  return dir
}

function commit(dir: string, file: string) {
  fs.writeFileSync(path.join(dir, file), file + '\n')
  git(dir, 'add', file)
  git(dir, 'commit', '-q', '-m', 'add ' + file)
  return git(dir, 'rev-parse', 'HEAD')
}

describe.skipIf(!hasTools)('tri worktrees --apply', () => {
  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-wt-')))
    const origin = path.join(tmp, 'origin.git')
    repo = path.join(tmp, 'repo')
    git(tmp, 'init', '-q', '--bare', '-b', 'main', origin)
    git(tmp, 'clone', '-q', origin, repo)
    git(repo, 'config', 'user.email', 't@t')
    git(repo, 'config', 'user.name', 't')
    fs.mkdirSync(path.join(repo, 'scripts'))
    fs.copyFileSync(PROBE, path.join(repo, 'scripts', 'probe-worktrees.cjs'))
    fs.writeFileSync(
      path.join(repo, '.gitignore'),
      '.env\nnode_modules\n.claude/worktrees/\n'
    )
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'init')
    git(repo, 'push', '-q', 'origin', 'main')
    git(repo, 'checkout', '-q', '--detach')

    // merged: HEAD is the merged PR's head; node_modules may go
    const merged = tree('merged', '-q', '-b', 'feat/merged', '@', 'origin/main')
    const mergedOid = commit(merged, 'a.txt')
    fs.mkdirSync(path.join(merged, 'node_modules'))
    // dirty: merged PR, but an unsaved file
    const dirty = tree('dirty', '-q', '-b', 'feat/dirty', '@', 'origin/main')
    const dirtyOid = commit(dirty, 'b.txt')
    fs.writeFileSync(path.join(dirty, 'unsaved.txt'), 'x')
    // renamed: same branch NAME as a merged PR, but a different tip
    const reused = tree('reused', '-q', '-b', 'feat/reused', '@', 'origin/main')
    commit(reused, 'c.txt')
    // envfile: already in main, but holds an ignored .env
    const envfile = tree('envfile', '-q', '--detach', '@', 'origin/main')
    fs.writeFileSync(path.join(envfile, '.env'), 'LOCAL=1\n')
    // detached: already in main, nothing else -- the bee's review copy
    tree('detached', '-q', '--detach', '@', 'origin/main')
    // parent with a nested tree inside
    const parent = tree('parent', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(parent, '.claude', 'worktrees'), { recursive: true })
    git(
      repo,
      'worktree',
      'add',
      '-q',
      '--detach',
      path.join(parent, '.claude', 'worktrees', 'child'),
      'origin/main'
    )
    // locked: already in main, but locked by its owner
    tree('locked', '-q', '--detach', '@', 'origin/main')
    git(repo, 'worktree', 'lock', path.join(tmp, 'locked'))

    const prs = [
      { number: 1, headRefName: 'feat/merged', headRefOid: mergedOid },
      { number: 2, headRefName: 'feat/dirty', headRefOid: dirtyOid },
      { number: 3, headRefName: 'feat/reused', headRefOid: 'f'.repeat(40) },
    ]
    const gh = path.join(tmp, 'gh')
    fs.writeFileSync(path.join(tmp, 'prs.json'), JSON.stringify(prs))
    fs.writeFileSync(gh, `#!/bin/sh\ncat '${path.join(tmp, 'prs.json')}'\n`)
    fs.chmodSync(gh, 0o755)

    const run = spawnSync(
      'node',
      [path.join(repo, 'scripts', 'probe-worktrees.cjs'), '--apply'],
      {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, TRI_GH: gh, TRI_WT_RECENT_MIN: '0' },
      }
    )
    out = run.stdout + run.stderr
    expect(run.status, out).toBe(0)
  })

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  const exists = (name: string) => fs.existsSync(path.join(tmp, name))

  it('removes a tree whose HEAD is a merged PR head', () => {
    expect(exists('merged'), out).toBe(false)
  })

  it('removes a clean detached tree already in main', () => {
    expect(exists('detached'), out).toBe(false)
  })

  it('removes a nested tree before its parent, and keeps the parent', () => {
    expect(exists('parent/.claude/worktrees/child'), out).toBe(false)
    expect(exists('parent'), out).toBe(true)
  })

  it('keeps a merged tree with unsaved work', () => {
    expect(exists('dirty/unsaved.txt'), out).toBe(true)
  })

  it('keeps a tree whose branch name matches a merged PR but not its commit', () => {
    expect(exists('reused/c.txt'), out).toBe(true)
    expect(out).toMatch(/feat\/reused.*PR #3/)
  })

  it('keeps an ignored file it cannot rebuild, and says which', () => {
    expect(exists('envfile/.env'), out).toBe(true)
    expect(out).toContain('.env')
  })

  it('keeps a locked tree', () => {
    expect(exists('locked'), out).toBe(true)
  })

  it('leaves every branch in place', () => {
    const branches = git(repo, 'branch', '--format=%(refname:short)')
    expect(branches).toContain('feat/merged')
  })
})
