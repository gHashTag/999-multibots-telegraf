/**
 * `tri disk-floor` (and the disk line of `tri doctor`): it warns while there is
 * still room to clean up, and points at the one worktree judge.
 *
 * 2026-10-03: 8.7 GiB free, 46 finished worktrees holding ~25.6 GB, and no
 * check said a word -- the only floor was free-disk.sh's 2 GiB, one build.
 * The free space is injected, so the test never depends on this Mac's disk.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const FLOOR = path.join(__dirname, '..', 'bin', 'helpers', 'disk-floor.sh')
const GIB = 1048576 // KiB

function floor(env: Record<string, string>) {
  const r = spawnSync('bash', [FLOOR], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('tri disk-floor', () => {
  it('below 15 GiB is rc 1 and names the worktree judge and its --apply', () => {
    const r = floor({ TRI_DISK_FREE_KIB: String(9 * GIB) })
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/LOW -- 9 GiB free, floor 15 GiB/)
    expect(r.out).toMatch(/tri worktrees\s/)
    expect(r.out).toMatch(/tri worktrees --apply/)
    // A doctor reads; the bare remover the old verdict printed is not offered.
    expect(r.out).not.toMatch(/git worktree remove/)
  })

  it('exactly the floor is room enough, one KiB less is not', () => {
    expect(floor({ TRI_DISK_FREE_KIB: String(15 * GIB) }).rc).toBe(0)
    expect(floor({ TRI_DISK_FREE_KIB: String(15 * GIB - 1) }).rc).toBe(1)
  })

  it('room enough is rc 0 and says how much', () => {
    const r = floor({ TRI_DISK_FREE_KIB: String(40 * GIB) })
    expect(r.rc).toBe(0)
    expect(r.out).toMatch(/40 GiB free \(floor 15 GiB\)/)
  })

  it('the floor can be moved, and a nonsense floor falls back to 15', () => {
    expect(
      floor({ TRI_DISK_FREE_KIB: String(9 * GIB), TRI_DISK_FLOOR_GIB: '5' }).rc
    ).toBe(0)
    expect(
      floor({ TRI_DISK_FREE_KIB: String(9 * GIB), TRI_DISK_FLOOR_GIB: 'x' }).rc
    ).toBe(1)
  })

  it('octal-looking and oversized numbers never read as "fine"', () => {
    // Bash arithmetic reads "08" as bad octal and wraps past 2^63; each of
    // these once ended rc 0 on a check that had failed.
    expect(floor({ TRI_DISK_FREE_KIB: '0999' }).rc).toBe(1)
    // Valid octal too, and the verdicts differ: 16 GiB decimal, ~3.75 octal.
    const lead = floor({ TRI_DISK_FREE_KIB: '0016777216' })
    expect(lead.rc).toBe(0)
    expect(lead.out).toMatch(/16 GiB free/)
    expect(floor({ TRI_DISK_FREE_KIB: '0', TRI_DISK_FLOOR_GIB: '08' }).rc).toBe(
      1
    )
    expect(
      floor({ TRI_DISK_FREE_KIB: '0', TRI_DISK_FLOOR_GIB: '99999999999999' }).rc
    ).toBe(1)
    const r = floor({ TRI_DISK_FREE_KIB: '99999999999999999999' })
    expect(r.rc).toBe(2)
    expect(r.out).toMatch(/unknown is not fine/)
  })

  it('bin/tri worktrees hands the word to the one judge', () => {
    // The old list here ignored --apply and advised a bare remove.
    const src = readFileSync(path.join(__dirname, '..', 'bin', 'tri'), 'utf8')
    const arm = src.slice(
      src.indexOf('\n  worktrees)'),
      src.indexOf('\n  guards)')
    )
    expect(arm).toMatch(/exec "\$ROOT\/tri" worktrees "\$@"/)
    expect(arm).not.toMatch(/git worktree remove/)
  })

  it('an unreadable volume is rc 2, never a silent "fine"', () => {
    const r = floor({ TRI_DISK_FREE_KIB: 'n/a' })
    expect(r.rc).toBe(2)
    expect(r.out).toMatch(/unknown is not fine/)
  })
})
