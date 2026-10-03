/**
 * `tri pr-billing N`: the last word before a reviewer bee merges.
 *
 * Two duties. Every red check must be the Actions billing stop, and no
 * reviewer may have refused the current head: on 2026-10-03 PR 3451 was
 * merged 70 s after a bee posted "not merged", 23 s after a push that
 * touched none of the notes. gh is stubbed through TRI_GH; the stub answers from JSON fixtures
 * and applies the REAL `--jq` filter with jq, so the filter tri ships is the
 * one under test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TRI = path.join(__dirname, '..', 'tri')
const HEAD = 'abc1234567890'
const BILLING =
  'The job was not started because recent account payments have failed.'

let bin: string

interface Fixture {
  comments?: { createdAt: string; body: string; login?: string }[]
  headDate?: string
  failing?: { id: number; name: string; annotation: string }[]
  /** Makes the comments call fail like a dropped connection. */
  commentsDown?: boolean
}

function billing(fx: Fixture) {
  const pr = {
    headRefOid: HEAD,
    commits: [
      { committedDate: '2026-10-03T00:00:00Z' },
      { committedDate: fx.headDate ?? '2026-10-03T01:00:00Z' },
    ],
    comments: (fx.comments ?? []).map(c => ({
      createdAt: c.createdAt,
      body: c.body,
      author: { login: c.login ?? 'gHashTag' },
    })),
  }
  fs.writeFileSync(path.join(bin, 'pr.json'), JSON.stringify(pr))
  fs.writeFileSync(
    path.join(bin, 'runs.json'),
    JSON.stringify({
      check_runs: (fx.failing ?? []).map(f => ({
        id: f.id,
        name: f.name,
        conclusion: 'failure',
      })),
    })
  )
  for (const f of fx.failing ?? [])
    fs.writeFileSync(
      path.join(bin, `ann-${f.id}.json`),
      JSON.stringify([{ message: f.annotation }])
    )
  if (fx.commentsDown) fs.writeFileSync(path.join(bin, 'comments-down'), '')
  const r = spawnSync('bash', [TRI, 'pr-billing', '3451'], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', TRI_GH: path.join(bin, 'gh') },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

beforeEach(() => {
  bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bill-')))
  // Picks the fixture by what is asked, then runs the caller's --jq on it.
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/bin/bash
q="" all="$*"
while [ $# -gt 0 ]; do [ "$1" = --jq ] && { q="$2"; shift; }; shift; done
case "$all" in
  *commits,comments*) [ -e '${bin}/comments-down' ] && exit 1; f='${bin}/pr.json' ;;
  *headRefOid*) f='${bin}/pr.json' ;;
  *check-runs/*/annotations*) id=\${all#*check-runs/}; f="${bin}/ann-\${id%%/*}.json" ;;
  *check-runs*) f='${bin}/runs.json' ;;
  *) echo "stub gh: unexpected $all" >&2; exit 9 ;;
esac
exec jq -r "$q" "$f"
`,
    { mode: 0o755 }
  )
})

afterEach(() => fs.rmSync(bin, { recursive: true, force: true }))

describe('tri pr-billing: a refusal of this head', () => {
  it('refuses when a bee said "not merged" after the head commit', () => {
    const r = billing({
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Reviewer bee: not merged. Two sentences are wrong.',
          login: 'bee-one',
        },
      ],
    })
    expect(r.rc).toBe(1)
    expect(r.out).toContain('a reviewer refused this head')
    expect(r.out).toContain('2026-10-03T01:10:00Z bee-one')
  })

  it('a bold refusal counts too', () => {
    const r = billing({
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: '**Reviewer bee: not merged.**\n\n1. ...',
        },
      ],
    })
    expect(r.rc).toBe(1)
  })

  it('a push after the refusal unblocks, but the refusal is still shown', () => {
    // PR 3451: the push that came 47 s after the refusal touched no note, so
    // "a push answers it" alone let the wrong sentences reach main.
    const r = billing({
      headDate: '2026-10-03T02:00:00Z',
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Reviewer bee: not merged. The doctor quote is wrong.\n\n1. ...',
        },
      ],
    })
    expect(r.rc).toBe(0)
    expect(r.out).toContain('refused before the last push')
    expect(r.out).toContain('The doctor quote is wrong.')
    expect(r.out).not.toContain('1. ...')
    expect(r.out).toContain('no failing checks')
  })

  it('a comment that merely mentions "not merged" is not a refusal', () => {
    const r = billing({
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Approved. The other PR is not merged yet, no conflict.',
        },
      ],
    })
    expect(r.rc).toBe(0)
  })

  it('unreadable comments are rc 2, never a pass', () => {
    const r = billing({ commentsDown: true })
    expect(r.rc).toBe(2)
    expect(r.out).toContain('could not read the comments')
  })
})

describe('tri pr-billing: the red checks', () => {
  it('every failure is the billing stop: rc 0', () => {
    const r = billing({
      failing: [
        { id: 11, name: 'lint', annotation: BILLING },
        { id: 12, name: 'test', annotation: BILLING },
      ],
    })
    expect(r.rc).toBe(0)
    expect(r.out).toContain('2 billing, 0 other, 0 unknown')
  })

  it('one real failure: rc 1, named', () => {
    const r = billing({
      failing: [
        { id: 11, name: 'lint', annotation: BILLING },
        {
          id: 12,
          name: 'test',
          annotation: 'Process completed with exit code 1.',
        },
      ],
    })
    expect(r.rc).toBe(1)
    expect(r.out).toContain('test (12): Process completed with exit code 1.')
  })
})
