/**
 * tfetch (bin/helpers/fetch.sh): a failed `git fetch` says so instead of
 * letting a helper judge a stale origin/main in silence.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HELPERS = path.join(ROOT, 'bin/helpers')
const FETCH = path.join(HELPERS, 'fetch.sh')

function tfetch(args: string, cwd: string) {
  return spawnSync('bash', ['-c', `. "${FETCH}"; tfetch ${args}`], {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
  })
}

describe('tfetch', () => {
  it('a failed fetch warns on stderr, names tri online, keeps its code', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfetch-'))
    spawnSync('git', ['init', '-q'], { cwd: dir })
    // A remote that is a missing directory: fails at once, no network asked.
    spawnSync('git', ['remote', 'add', 'origin', path.join(dir, 'nowhere')], {
      cwd: dir,
    })
    const r = tfetch('origin main', dir)
    expect(r.status).not.toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/git fetch origin main failed/)
    expect(r.stderr).toMatch(/last good fetch \(unknown\)/)
    expect(r.stderr).toMatch(/`tri online` says whether it is the network/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('a good fetch is silent and 0', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfetch-'))
    const up = path.join(dir, 'up')
    const down = path.join(dir, 'down')
    spawnSync('git', ['init', '-q', '-b', 'main', up])
    spawnSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      ],
      { cwd: up }
    )
    spawnSync('git', ['init', '-q', down])
    spawnSync('git', ['remote', 'add', 'origin', up], { cwd: down })
    const r = tfetch('origin main', down)
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('a clone whose remote is gone tells the age from the reflog', () => {
    // A failed fetch rewrites FETCH_HEAD too, so its mtime would read
    // "0 min ago" however stale origin is: the age comes from the ref.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfetch-'))
    const up = path.join(dir, 'up')
    const down = path.join(dir, 'down')
    spawnSync('git', ['init', '-q', '-b', 'main', up])
    spawnSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      ],
      { cwd: up }
    )
    spawnSync('git', ['init', '-q', down])
    spawnSync('git', ['remote', 'add', 'origin', up], { cwd: down })
    spawnSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: down })
    fs.rmSync(up, { recursive: true, force: true })
    const r = tfetch('origin main', down)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(
      /\(origin\/main last changed \d+ min ago or later\)/
    )
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('digits in the branch name do not leak into the age', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfetch-'))
    const up = path.join(dir, 'up')
    const down = path.join(dir, 'down')
    spawnSync('git', ['init', '-q', '-b', 'fix/abc-123', up])
    spawnSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      ],
      { cwd: up }
    )
    spawnSync('git', ['init', '-q', down])
    spawnSync('git', ['remote', 'add', 'origin', up], { cwd: down })
    spawnSync(
      'git',
      ['fetch', '-q', 'origin', 'fix/abc-123:refs/remotes/origin/fix/abc-123'],
      { cwd: down }
    )
    fs.rmSync(up, { recursive: true, force: true })
    const r = tfetch('origin fix/abc-123', down)
    const m = r.stderr.match(
      /origin\/fix\/abc-123 last changed (-?\d+) min ago/
    )
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(0)
    expect(Number(m![1])).toBeLessThan(5)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('no helper fetches around it', () => {
    const offenders = fs
      .readdirSync(HELPERS)
      .filter(f => f.endsWith('.sh') && f !== 'fetch.sh')
      .flatMap(f =>
        fs
          .readFileSync(path.join(HELPERS, f), 'utf8')
          .split('\n')
          .map((l, i) => ({ f, i: i + 1, l }))
          .filter(({ l }) => /\bgit fetch\b/.test(l) && !/^\s*#/.test(l))
          .map(({ f, i }) => `${f}:${i}`)
      )
    expect(offenders).toEqual([])
  })
  it('every helper that calls tfetch sources fetch.sh', () => {
    const missing = fs
      .readdirSync(HELPERS)
      .filter(f => f.endsWith('.sh') && f !== 'fetch.sh')
      .filter(f => {
        const s = fs.readFileSync(path.join(HELPERS, f), 'utf8')
        return /\btfetch\b/.test(s) && !s.includes('/fetch.sh"')
      })
    expect(missing).toEqual([])
  })
})
