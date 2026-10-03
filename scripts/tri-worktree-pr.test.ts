/**
 * `tri worktree --pr N` (bin/helpers/prtree.sh): back onto an open PR's own
 * branch, so a reviewer's notes are fixed in the same PR. A throwaway origin
 * and clone stand in for GitHub; gh is a stub on PATH that prints what
 * `gh pr view --json ... --jq ...` would.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRTREE = path.join(ROOT, 'bin/helpers/prtree.sh')

let dir: string
let down: string
let bin: string

const git = (cwd: string, ...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  }).stdout.trim()

/** gh prints `info` (exit 0), or fails when `info` is null. */
function prBranch(pr: string, info: string | null) {
  fs.writeFileSync(
    path.join(bin, 'gh'),
    info === null
      ? `#!/bin/sh\necho called > '${bin}/called'\nexit 1\n`
      : `#!/bin/sh\necho called > '${bin}/called'\necho '${info}'\n`,
    { mode: 0o755 }
  )
  const r = spawnSync(
    'bash',
    ['-c', `. "${PRTREE}"; pr_branch "${down}" "$1"`, 'x', pr],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
      timeout: 20000,
    }
  )
  return {
    rc: r.status,
    out: r.stdout.trim(),
    err: r.stderr,
    ghCalled: fs.existsSync(path.join(bin, 'called')),
  }
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prtree-')))
  const up = path.join(dir, 'up')
  down = path.join(dir, 'down')
  bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  spawnSync('git', ['init', '-q', '-b', 'main', up])
  git(up, 'commit', '-q', '--allow-empty', '-m', 'base')
  git(up, 'checkout', '-q', '-b', 'docs/x')
  git(up, 'commit', '-q', '--allow-empty', '-m', 'pr work')
  git(up, 'checkout', '-q', 'main')
  spawnSync('git', ['clone', '-q', up, down])
})

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('pr_branch', () => {
  it("an open PR gives its own branch, at origin's commit, tracking it", () => {
    const r = prBranch('51', 'docs/x OPEN false')
    expect(r.rc, r.err).toBe(0)
    expect(r.out).toBe('docs/x')
    expect(git(down, 'rev-parse', 'docs/x')).toBe(
      git(down, 'rev-parse', 'origin/docs/x')
    )
    expect(git(down, 'rev-parse', '--abbrev-ref', 'docs/x@{upstream}')).toBe(
      'origin/docs/x'
    )
  })

  it('a local branch behind origin is moved up to it', () => {
    git(down, 'branch', 'docs/x', 'main')
    const r = prBranch('51', 'docs/x OPEN false')
    expect(r.rc, r.err).toBe(0)
    expect(git(down, 'rev-parse', 'docs/x')).toBe(
      git(down, 'rev-parse', 'origin/docs/x')
    )
  })

  it('a local branch with commits origin lacks is refused and left alone', () => {
    git(down, 'checkout', '-q', '-b', 'docs/x', 'main')
    git(down, 'commit', '-q', '--allow-empty', '-m', 'unpushed')
    const before = git(down, 'rev-parse', 'docs/x')
    git(down, 'checkout', '-q', 'main')
    const r = prBranch('51', 'docs/x OPEN false')
    expect(r.rc).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toMatch(/commits origin\/docs\/x does not/)
    expect(git(down, 'rev-parse', 'docs/x')).toBe(before)
  })

  it('gh that does not answer is "unknown", not "no such PR"', () => {
    const r = prBranch('51', null)
    expect(r.rc).toBe(1)
    expect(r.err).toMatch(/gh did not answer for PR 51 -- unknown/)
    expect(git(down, 'branch', '--list', 'docs/x')).toBe('')
  })

  it('a closed PR and a fork PR are refused, nothing created', () => {
    const closed = prBranch('51', 'docs/x MERGED false')
    expect(closed.rc).toBe(1)
    expect(closed.err).toMatch(/is MERGED, not open/)
    const fork = prBranch('51', 'docs/x OPEN true')
    expect(fork.rc).toBe(1)
    expect(fork.err).toMatch(/from a fork/)
    expect(git(down, 'branch', '--list', 'docs/x')).toBe('')
  })

  it('a branch missing on origin fails at the fetch', () => {
    const r = prBranch('51', 'docs/gone OPEN false')
    expect(r.rc).toBe(1)
    expect(r.err).toMatch(/git fetch of docs\/gone failed/)
  })

  it('a non-number is 2 and never asks gh', () => {
    for (const pr of ['', 'abc', '3451x']) {
      const r = prBranch(pr, 'docs/x OPEN false')
      expect(r.rc, pr).toBe(2)
      expect(r.ghCalled, pr).toBe(false)
    }
  })
})

describe('tri worktree wiring', () => {
  it('cmd_worktree sources prtree for --pr and adds the existing branch', () => {
    const tri = fs.readFileSync(path.join(ROOT, 'tri'), 'utf8')
    const fn = tri.slice(
      tri.indexOf('cmd_worktree() {'),
      tri.indexOf('cmd_price() {')
    )
    expect(fn).toContain('. "$ROOT/bin/helpers/prtree.sh"')
    expect(fn).toContain('branch=$(pr_branch "$ROOT" "$pr") || return $?')
    expect(fn).toContain('[ -n "$pr" ] && add=("$branch")')
    expect(tri).toMatch(/^ {2}tri worktree --pr N$/m)
  })
})
