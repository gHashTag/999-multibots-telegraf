/**
 * `tri holders [branch]`: who already holds a branch, before an author is
 * dispatched to it.
 *
 * 2026-10-06 three agents wrote to PR #3730's branch at once, each from its
 * own worktree under $TMPDIR, and one tree had the whole repo staged as
 * deleted. Every case builds its own throwaway repo; nothing here touches the
 * real checkout. hook-free-env (vitest.config.ts) keeps a hook's GIT_DIR out.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HOLDERS = path.join(__dirname, '..', 'bin', 'helpers', 'holders.sh')

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

/* A repo on branch `work` with `files` committed files, in its own temp dir. */
function repo(files = 3) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'holders-')))
  const main = path.join(dir, 'main')
  spawnSync('git', ['init', '-q', '-b', 'work', main])
  git(main, 'config', 'user.email', 't@example.invalid')
  git(main, 'config', 'user.name', 't')
  git(main, 'config', 'commit.gpgsign', 'false')
  for (let i = 0; i < files; i++)
    writeFileSync(path.join(main, `f${i}.txt`), `${i}\n`)
  git(main, 'add', '.')
  git(main, 'commit', '-q', '--no-verify', '-m', 'init')
  return { dir, main }
}

/* Rows only: the header line names the ALARM column itself. */
const rows = (out: string) => out.split('\n').slice(1).join('\n')

function run(cwd: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.TRI_HOLDERS_ALARM
  delete env.TRI_HOLDERS_REPO
  const r = spawnSync('bash', [HOLDERS, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  })
  return { rc: r.status, out: r.stdout + r.stderr }
}

describe('tri holders', () => {
  it('two worktrees on one branch = rc 1; after one is removed, rc 0', () => {
    const { dir, main } = repo()
    const second = path.join(dir, 'second')
    // --force is how a second tree gets the same branch; git refuses otherwise.
    git(main, 'worktree', 'add', '-q', '--force', second, 'work')

    const two = run(main, 'work')
    expect(two.rc).toBe(1)
    expect(two.out).toContain('holders of work: 2')
    expect(two.out).toContain(second)

    git(main, 'worktree', 'remove', '--force', second)
    const one = run(main, 'work')
    expect(one.rc).toBe(0)
    expect(one.out).toContain('holders of work: 1')
  })

  it('a detached worktree at the branch tip counts as a holder', () => {
    const { dir, main } = repo()
    const det = path.join(dir, 'det')
    git(main, 'worktree', 'add', '-q', '--detach', det, 'work')
    const r = run(main, 'work')
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/detached @[0-9a-f]{9}/)
  })

  it('a detached worktree elsewhere is not a holder of the branch', () => {
    const { dir, main } = repo()
    git(main, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'next')
    const det = path.join(dir, 'det')
    git(main, 'worktree', 'add', '-q', '--detach', det, 'HEAD~1')
    const r = run(main, 'work')
    expect(r.rc).toBe(0)
    expect(r.out).not.toContain(det)
  })

  it('more than 200 files staged as deleted is an ALARM, rc 1 even alone', () => {
    const { main } = repo(205)
    git(main, 'rm', '-q', '--cached', '-r', '.')
    const r = run(main, 'work')
    expect(rows(r.out)).toMatch(/ ALARM /)
    expect(r.out).toContain('holders of work: 1')
    expect(r.rc).toBe(1)
  })

  it('a few staged deletions are not an ALARM', () => {
    const { main } = repo(5)
    git(main, 'rm', '-q', '--cached', 'f0.txt', 'f1.txt')
    const r = run(main, 'work')
    expect(rows(r.out)).not.toMatch(/ALARM/)
    expect(r.rc).toBe(0)
  })

  it('without a branch, a branch held twice is rc 1', () => {
    const { dir, main } = repo()
    git(main, 'worktree', 'add', '-q', '--force', path.join(dir, 'b'), 'work')
    const r = run(main)
    expect(r.rc).toBe(1)
    expect(r.out).toContain('branches held twice: work')
  })

  it('outside a repo is a git error, rc 2', () => {
    const outside = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'holders-no-'))
    )
    const r = spawnSync('bash', [HOLDERS], {
      cwd: outside,
      encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(outside) },
    })
    expect(r.status).toBe(2)
  })

  it('--help prints the usage, rc 0', () => {
    const r = run(tmpdir(), '--help')
    expect(r.rc).toBe(0)
    expect(r.out).toContain('usage: tri holders [branch]')
  })
})
