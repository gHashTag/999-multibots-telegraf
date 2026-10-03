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
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
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
let dry: string
let sleeper: ChildProcess | undefined
let locked: string | undefined
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
      '.env\n*.log\nnode_modules\ntemp/\nbuild/\nlogs/\n.claude/worktrees/\n'
    )
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'init')
    git(repo, 'push', '-q', 'origin', 'main')
    git(repo, 'checkout', '-q', '--detach')

    // merged: HEAD is the merged PR's head; node_modules may go
    const merged = tree('merged', '-q', '-b', 'feat/merged', '@', 'origin/main')
    const mergedOid = commit(merged, 'a.txt')
    // node_modules as a LINK into a shared folder, as in a real worktree
    fs.mkdirSync(path.join(tmp, 'shared_nm'))
    fs.writeFileSync(path.join(tmp, 'shared_nm', 'keep.js'), '1')
    fs.symlinkSync(
      path.join(tmp, 'shared_nm'),
      path.join(merged, 'node_modules')
    )
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
    const detached = tree('detached', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(detached, 'temp')) // empty ignored folder: harmless
    // logsenv: a folder whose files are all ignored, one of them a .env --
    // plain `status --ignored` shows only `logs/`, and logs is rebuildable
    const logsenv = tree('logsenv', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(logsenv, 'logs'))
    fs.writeFileSync(path.join(logsenv, 'logs', 'run.log'), 'x')
    fs.writeFileSync(path.join(logsenv, 'logs', '.env'), 'LOCAL=1\n')
    // spaced: a .env under a folder name with a space (porcelain quotes it)
    const spaced = tree('spaced', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(spaced, 'my logs'))
    fs.writeFileSync(path.join(spaced, 'my logs', '.env'), 'LOCAL=1\n')
    // nested: a clone inside build/ holding a commit never pushed anywhere
    const nested = tree('nested', '-q', '--detach', '@', 'origin/main')
    const sub = path.join(nested, 'build', 'sub')
    fs.mkdirSync(sub, { recursive: true })
    git(sub, 'init', '-q')
    git(sub, 'config', 'user.email', 't@t')
    git(sub, 'config', 'user.name', 't')
    commit(sub, 'only-here.txt')
    // creds: secret names from this repo's .gitignore, in rebuildable folders
    const creds = tree('creds', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(creds, 'logs'))
    fs.writeFileSync(path.join(creds, 'logs', 'credentials.json'), '{}')
    const secrets = tree('secrets', '-q', '--detach', '@', 'origin/main')
    fs.mkdirSync(path.join(secrets, 'build', 'secrets'), { recursive: true })
    fs.writeFileSync(path.join(secrets, 'build', 'secrets', 'token.txt'), 'x')
    // unreadable: a folder the walk cannot look into
    const unreadable = tree('unreadable', '-q', '--detach', '@', 'origin/main')
    locked = path.join(unreadable, 'build', 'closed')
    fs.mkdirSync(locked, { recursive: true })
    fs.writeFileSync(path.join(locked, 'x.txt'), 'x')
    fs.chmodSync(locked, 0o000)
    // unmerged: detached with a commit nobody merged
    const unmerged = tree('unmerged', '-q', '--detach', '@', 'origin/main')
    commit(unmerged, 'u.txt')
    // busy: finished, but a process has its working directory inside
    const busy = tree('busy', '-q', '--detach', '@', 'origin/main')
    sleeper = spawn('sleep', ['120'], { cwd: busy, stdio: 'ignore' })
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

    const probe = (args: string[], env: Record<string, string>) => {
      const r = spawnSync(
        'node',
        [path.join(repo, 'scripts', 'probe-worktrees.cjs'), ...args],
        {
          cwd: repo,
          encoding: 'utf8',
          env: { ...process.env, TRI_GH: gh, ...env },
        }
      )
      expect(r.status, r.stdout + r.stderr).toBe(0)
      return r.stdout + r.stderr
    }
    // default window: every tree was touched seconds ago, nothing may go
    dry = probe(['--apply'], { TRI_WT_RECENT_MIN: '' })
    out = probe(['--apply'], { TRI_WT_RECENT_MIN: '0' })
  })

  afterAll(() => {
    sleeper?.kill()
    if (locked && fs.existsSync(locked)) fs.chmodSync(locked, 0o755)
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

  it('keeps every tree touched within the hour', () => {
    expect(dry).toMatch(/трогали \d+ мин назад/) // cyrillic-ok
    expect(dry).toMatch(/убрано деревьев: 0/) // cyrillic-ok
  })

  it('does not follow a symlinked node_modules out of the tree', () => {
    expect(fs.existsSync(path.join(tmp, 'shared_nm', 'keep.js'))).toBe(true)
  })

  it('treats an empty ignored folder as harmless', () => {
    expect(exists('detached'), out).toBe(false)
  })

  it('keeps a .env inside a rebuildable folder', () => {
    expect(exists('logsenv/logs/.env'), out).toBe(true)
  })

  it('keeps a .env under a folder name with a space', () => {
    expect(exists('spaced/my logs/.env'), out).toBe(true)
  })

  it('keeps a nested repository, whose commits may exist nowhere else', () => {
    expect(exists('nested/build/sub/only-here.txt'), out).toBe(true)
  })

  it('keeps secret names from the repo .gitignore inside rebuildable folders', () => {
    expect(exists('creds/logs/credentials.json'), out).toBe(true)
    expect(exists('secrets/build/secrets/token.txt'), out).toBe(true)
  })

  it('keeps a tree with a folder it cannot read, and says so', () => {
    expect(exists('unreadable'), out).toBe(true)
    expect(out).toContain('(unreadable)')
  })

  it('keeps a detached tree with a commit not in main', () => {
    expect(exists('unmerged/u.txt'), out).toBe(true)
  })

  it('keeps a tree with a live process inside', () => {
    expect(exists('busy'), out).toBe(true)
  })

  it('leaves every branch in place', () => {
    const branches = git(repo, 'branch', '--format=%(refname:short)')
    expect(branches).toContain('feat/merged')
  })
})
