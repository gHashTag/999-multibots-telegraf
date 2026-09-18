/**
 * THE POINT OF `tri ship` IS THE STEP THAT DID NOT HAPPEN, SO THAT IS WHAT IS
 * TESTED -- against real repositories with a real refusing hook.
 *
 * The incident it comes from, 2026-09-18: a commit was refused by a gate, the
 * refusal was buried in hook output I had filtered down to the passing lines,
 * the following push quietly sent nothing, and only `gh pr create` complained
 * ("No commits between main and ..."). Three commands, two of them no-ops, no
 * error anywhere.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(__dirname, 'ship.cjs')

const roots: string[] = []
let work: string

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** Run ship in `work`; returns its exit code and everything it printed. */
function ship(...args: string[]) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: work,
      encoding: 'utf8',
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return {
      code: err.status ?? -1,
      out: (err.stdout ?? '') + (err.stderr ?? ''),
    }
  }
}

/** A fresh repository with a bare origin, on a branch that is not main. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'))
  roots.push(dir)
  const origin = path.join(dir, 'origin.git')
  work = path.join(dir, 'work')
  git(dir, 'init', '--bare', '-b', 'main', origin)
  git(dir, 'init', '-b', 'main', work)
  git(work, 'config', 'user.email', 'test@example.com')
  git(work, 'config', 'user.name', 'test')
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n')
  git(work, 'add', '-A')
  git(work, 'commit', '-m', 'first')
  git(work, 'remote', 'add', 'origin', origin)
  git(work, 'push', '-u', 'origin', 'main')
  git(work, 'checkout', '-q', '-b', 'feature/x')
}

/** A hook that refuses every commit, the way a gate does. */
function refusingHook() {
  const hook = path.join(work, '.git', 'hooks', 'pre-commit')
  fs.writeFileSync(
    hook,
    '#!/bin/sh\necho "gate: no\\necho lots of passing lines first" >&2\nexit 1\n'
  )
  fs.chmodSync(hook, 0o755)
}

beforeEach(() => repo())

afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

describe('tri ship', () => {
  it('commits and pushes, and says where the branch landed', () => {
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')

    const r = ship('-m', 'feat: b', '--all')

    expect(r.code).toBe(0)
    const head = git(work, 'rev-parse', 'HEAD')
    expect(git(work, 'rev-parse', 'origin/feature/x')).toBe(head)
    expect(r.out).toContain(head.slice(0, 9))
  })

  /*
   * THE INCIDENT. The hook refuses, so HEAD must not move -- and this must be
   * an ERROR, loudly, instead of a push that sends nothing.
   */
  it('stops at the commit when a gate refuses it', () => {
    refusingHook()
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')
    const before = git(work, 'rev-parse', 'HEAD')

    const r = ship('-m', 'feat: b', '--all')

    expect(r.code).toBe(1)
    expect(r.out).toContain('did not happen')
    expect(r.out).toContain('commit')
    expect(git(work, 'rev-parse', 'HEAD')).toBe(before)
    // And nothing was pushed in the name of a commit that does not exist.
    expect(() => git(work, 'rev-parse', 'origin/feature/x')).toThrow()
  })

  /*
   * A commit of nothing succeeds at the git level with --allow-empty and is
   * simply confusing without it. Either way it is not what anybody meant.
   */
  it('refuses when nothing is staged', () => {
    const r = ship('-m', 'feat: nothing')
    expect(r.code).toBe(2)
    expect(r.out).toContain('nothing staged')
  })

  /*
   * Everything here lands through a pull request, so a commit made on main is
   * one no gate and no reader ever saw.
   */
  it('refuses to commit on main', () => {
    git(work, 'checkout', '-q', 'main')
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')

    const r = ship('-m', 'feat: b', '--all')

    expect(r.code).toBe(2)
    expect(r.out).toContain('main')
  })

  it('makes the branch when asked, instead of refusing', () => {
    git(work, 'checkout', '-q', 'main')
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')

    const r = ship('-m', 'feat: b', '--all', '--branch', 'feature/made')

    expect(r.code).toBe(0)
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature/made')
    expect(git(work, 'rev-parse', 'origin/feature/made')).toBe(
      git(work, 'rev-parse', 'HEAD')
    )
  })

  /*
   * IT MUST NOT LAND ANYTHING. Merging is a decision this tool is deliberately
   * unable to make, and the reminder it prints must not read as "done".
   */
  it('leaves main where it was and says the merge is not its call', () => {
    const mainBefore = git(work, 'rev-parse', 'origin/main')
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')

    const r = ship('-m', 'feat: b', '--all')

    expect(git(work, 'rev-parse', 'origin/main')).toBe(mainBefore)
    expect(r.out).toContain('not merged')
  })
})
