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
// The stub applies tri's --jq with real jq; the cloud check-runner image has
// none, and there every call would fail as "PR not found" -- a red that says
// nothing about tri.
const hasJq = spawnSync('jq', ['--version']).status === 0
const HEAD = 'abc1234567890'
const BILLING =
  'The job was not started because recent account payments have failed.'

let bin: string

interface Fixture {
  comments?: { createdAt: string; body: string; login?: string }[]
  reviews?: { submittedAt: string; body: string; state?: string }[]
  headDate?: string
  /** Where the head sits in the commit list; 'missing' leaves it out. */
  headAt?: 'last' | 'first' | 'missing'
  failing?: { id: number; name: string; annotation: string }[]
  /** Makes the comments call fail like a dropped connection. */
  commentsDown?: boolean
}

function billing(fx: Fixture) {
  const head = {
    oid: HEAD,
    committedDate: fx.headDate ?? '2026-10-03T01:00:00Z',
  }
  // A commit dated far in the future: if tri dated the head by position
  // instead of by oid, every refusal would look old.
  const other = { oid: 'fff000', committedDate: '2026-12-31T00:00:00Z' }
  const at = fx.headAt ?? 'last'
  const pr = {
    headRefOid: HEAD,
    commits:
      at === 'last'
        ? [{ oid: 'eee000', committedDate: '2026-10-03T00:00:00Z' }, head]
        : at === 'first'
          ? [head, other]
          : [other],
    reviews: (fx.reviews ?? []).map(r => ({
      submittedAt: r.submittedAt,
      body: r.body,
      state: r.state ?? 'COMMENTED',
      author: { login: 'gHashTag' },
    })),
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
  *commits,comments,reviews*) [ -e '${bin}/comments-down' ] && exit 1; f='${bin}/pr.json' ;;
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

describe.skipIf(!hasJq)('tri pr-billing: a refusal of this head', () => {
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
    // The line itself, so an author note that only quotes the trigger words
    // (the one wrong catch in 200 PRs, on #3468) is told apart at a glance.
    expect(r.out).toContain(
      'Reviewer bee: not merged. Two sentences are wrong.'
    )
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

  // Every first line below was written by a bee that refused, on a real PR.
  it.each([
    ['3415', 'Reviewer bee: **not merging.** The check path holds.'],
    ['3395', 'Reviewer bee: **not merging yet.** One project rule is broken.'],
    ['3448', '**Bee review: changes requested, blocking. Not merged.**'],
    ['3334', '**Reviewer bee: changes requested. Not merged.**'],
    ['3327', 'Reviewer bee Z: **not merged -- one blocking finding (SSRF).**'],
    // A list of openers missed these three (the bee on #3468 found them).
    ['3462', '## Reviewer bee: not merging -- four wrong-verdict blockers'],
    ['3327', '## Bee review: changes requested, not merged'],
    ['3366', 'Reviewed by bee (not the author). **I am not merging this.**'],
    // Every real "changes requested" also said "not merg"; this one doesn't.
    ['none yet', 'Reviewer bee: changes requested -- two notes below.'],
  ])('PR %s wording is a refusal', (_n, body) => {
    const r = billing({
      comments: [{ createdAt: '2026-10-03T01:10:00Z', body }],
    })
    expect(r.rc).toBe(1)
  })

  it.each([
    'Bee review (not the author) -- sound, merging.',
    'Bee review (non-blocking notes; merged):',
    'Independent reviewer bee: approve and merge. I wrote none of these.',
    '## Post-merge review (reviewer bee)',
    'For the reviewer bee: the red checks here are GitHub Actions billing.',
  ])('an approval is not a refusal: %s', body => {
    const r = billing({
      comments: [{ createdAt: '2026-10-03T01:10:00Z', body }],
    })
    expect(r.rc).toBe(0)
  })

  it('"not merged" below the first line is a note, not a refusal', () => {
    const r = billing({
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Reviewer bee: sound, merging.\n\nPR 3448 is not merged yet.',
        },
      ],
    })
    expect(r.rc).toBe(0)
  })

  it('a refusal in a review body counts (PR 3406, 3396, 3360)', () => {
    const r = billing({
      reviews: [
        {
          submittedAt: '2026-10-03T01:10:00Z',
          body: 'bee review: changes requested. Not merging.',
        },
      ],
    })
    expect(r.rc).toBe(1)
    expect(r.out).toContain('a reviewer refused this head')
  })

  it('a CHANGES_REQUESTED review refuses whatever its text', () => {
    const r = billing({
      reviews: [
        {
          submittedAt: '2026-10-03T01:10:00Z',
          body: 'See the inline notes.',
          state: 'CHANGES_REQUESTED',
        },
      ],
    })
    expect(r.rc).toBe(1)
  })

  it('the head is dated by its oid, not by its place in the list', () => {
    const r = billing({
      headAt: 'first',
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Reviewer bee: not merged. One defect.',
        },
      ],
    })
    expect(r.rc).toBe(1)
  })

  it('a head missing from the commit list makes every refusal new', () => {
    const r = billing({
      headAt: 'missing',
      comments: [
        {
          createdAt: '2026-10-03T01:10:00Z',
          body: 'Reviewer bee: not merged. One defect.',
        },
      ],
    })
    expect(r.rc).toBe(1)
  })

  it('unreadable comments are rc 2, never a pass', () => {
    const r = billing({ commentsDown: true })
    expect(r.rc).toBe(2)
    expect(r.out).toContain('could not read the comments')
  })
})

describe.skipIf(!hasJq)('tri pr-billing: the red checks', () => {
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
