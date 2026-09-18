/**
 * THE CHECK IS RUN AGAINST REAL REPOSITORIES, NOT AGAINST ITS OWN IDEA OF ONE.
 *
 * The defect it exists for -- `main` configured to merge a branch that was
 * deleted weeks ago -- is a property of git configuration, so the only honest
 * test builds that configuration and looks at what the check says. Its first
 * version silently printed an empty table because the shell ate the parentheses
 * in `--format=%(refname:short)`: a checker that reports nothing wrong because
 * it looked at nothing. Hence the last test here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(__dirname, 'upstream-check.cjs')

let dir: string
let clone: string

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** Run the check inside `clone`; returns its output and exit code. */
function check(...args: string[]) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: clone,
      encoding: 'utf8',
    })
    return { code: 0, out: stdout }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return {
      code: err.status ?? -1,
      out: (err.stdout ?? '') + (err.stderr ?? ''),
    }
  }
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-check-'))
  const origin = path.join(dir, 'origin.git')
  const work = path.join(dir, 'work')
  clone = path.join(dir, 'clone')

  git(dir, 'init', '--bare', '-b', 'main', origin)
  git(dir, 'init', '-b', 'main', work)
  git(work, 'config', 'user.email', 'test@example.com')
  git(work, 'config', 'user.name', 'test')
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n')
  git(work, 'add', '-A')
  git(work, 'commit', '-m', 'first')
  git(work, 'branch', 'feature/live')
  git(work, 'remote', 'add', 'origin', origin)
  git(work, 'push', 'origin', 'main', 'feature/live')

  git(dir, 'clone', origin, clone)
  git(clone, 'config', 'user.email', 'test@example.com')
  git(clone, 'config', 'user.name', 'test')
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('where each branch pulls from', () => {
  it('says nothing is wrong when main tracks origin/main', () => {
    const r = check()
    expect(r.out).toContain('main')
    expect(r.out).not.toContain('BAD')
    expect(r.code).toBe(0)
  })

  /*
   * THE DEFECT ITSELF, 2026-09-18: main pointed at a deleted branch. `git pull`
   * refused and `git status` compared against a ref nobody had.
   */
  it('fails when main is pointed at a branch that no longer exists', () => {
    git(clone, 'config', 'branch.main.merge', 'refs/heads/docs/form-111')
    const r = check()
    expect(r.out).toContain('BAD')
    expect(r.out).toContain('gone')
    expect(r.code).toBe(1)
    git(clone, 'config', 'branch.main.merge', 'refs/heads/main')
  })

  /*
   * The quiet one. The upstream resolves, so git says nothing at all, and the
   * next pull merges a different branch into this one.
   */
  it('fails when main is pointed at a different branch that does exist', () => {
    git(clone, 'config', 'branch.main.merge', 'refs/heads/feature/live')
    const r = check()
    expect(r.out).toContain('BAD')
    expect(r.out).toMatch(/NOT origin\/main/)
    expect(r.code).toBe(1)
    git(clone, 'config', 'branch.main.merge', 'refs/heads/main')
  })

  /*
   * AND IT MUST NOT CRY WOLF. A feature branch tracking origin/main is what
   * `git checkout -b` sets up under branch.autoSetupMerge, and pulling main
   * into your branch is the point. A check that flags 295 leftover branches
   * gets skipped, and then it is not a check.
   */
  it('accepts a feature branch that tracks origin/main', () => {
    git(clone, 'checkout', '-q', '-b', 'feature/mine')
    git(clone, 'config', 'branch.feature/mine.remote', 'origin')
    git(clone, 'config', 'branch.feature/mine.merge', 'refs/heads/main')
    const r = check()
    expect(r.out).not.toContain('BAD')
    expect(r.code).toBe(0)
    git(clone, 'checkout', '-q', 'main')
  })

  it('accepts a local branch with no upstream at all', () => {
    git(clone, 'checkout', '-q', '-b', 'scratch')
    const r = check()
    expect(r.out).toContain('local only')
    expect(r.code).toBe(0)
    git(clone, 'checkout', '-q', 'main')
  })

  /*
   * THE FAILURE A CHECKER MUST NOT HAVE. Outside a repository there is nothing
   * to judge, and the answer must be "I could not look", never a clean table.
   */
  it('refuses to answer where there is no repository', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'))
    try {
      let code = 0
      let out = ''
      try {
        out = execFileSync(process.execPath, [SCRIPT], {
          cwd: outside,
          encoding: 'utf8',
          env: { ...process.env, GIT_CEILING_DIRECTORIES: os.tmpdir() },
        })
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string }
        code = err.status ?? -1
        out = (err.stdout ?? '') + (err.stderr ?? '')
      }
      expect(code).toBe(2)
      expect(out).not.toContain('ok')
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})
