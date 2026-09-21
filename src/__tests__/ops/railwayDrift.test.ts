/**
 * The evening of 2026-09-21/22, replayed as data: each way "merged" failed to
 * become "shipped", and the states that must NOT raise an alarm.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error -- a plain .mjs script, no types
import { anomalyOf, STALL_MS } from '../../../scripts/railway-drift.mjs'

const NOW = Date.parse('2026-09-21T18:30:00Z')
const HEAD = 'daf4216fa0000000000000000000000000000000'
const d = (status: string, createdAt: string, commit: string | null) => ({
  status,
  createdAt,
  commit,
})

describe('railway drift', () => {
  it('FAILING: the newest build failed its healthcheck, prod stuck on the old one (#2741)', () => {
    const a = anomalyOf({
      name: '999-multibots-telegraf',
      deploys: [
        d('FAILED', '2026-09-21T17:01:26Z', 'bd936370d'),
        d('SUCCESS', '2026-09-21T16:06:01Z', 'd03886501'),
      ],
      mainHead: 'bd936370d',
      mainHeadAtMs: NOW - 5 * 60_000,
      nowMs: NOW,
    })
    expect(a).toMatch(/FAILING.*bd936370d.*FAILED.*still on d03886501/)
  })

  it('STALLED: main moved on and Railway never named it', () => {
    const a = anomalyOf({
      name: 'vibee-render',
      deploys: [
        d('SKIPPED', '2026-09-21T16:06:02Z', 'd03886501'),
        d('SUCCESS', '2026-09-21T15:46:28Z', '425833a6d'),
      ],
      mainHead: HEAD,
      mainHeadAtMs: NOW - STALL_MS - 60_000,
      nowMs: NOW,
    })
    expect(a).toMatch(/STALLED.*daf4216fa.*21 min old/)
  })

  it('a fresh merge is not a stall yet', () => {
    expect(
      anomalyOf({
        name: 'vibee-render',
        deploys: [d('SUCCESS', '2026-09-21T16:00:00Z', 'd03886501')],
        mainHead: HEAD,
        mainHeadAtMs: NOW - 5 * 60_000,
        nowMs: NOW,
      })
    ).toBeNull()
  })

  it('a build in progress is not a stall', () => {
    expect(
      anomalyOf({
        name: 'vibee-render',
        deploys: [
          d('BUILDING', '2026-09-21T18:29:00Z', null),
          d('SUCCESS', '2026-09-21T16:00:00Z', 'd03886501'),
        ],
        mainHead: HEAD,
        mainHeadAtMs: NOW - STALL_MS - 60_000,
        nowMs: NOW,
      })
    ).toBeNull()
  })

  it('SKIPPED on main head is healthy: Railway saw it and nothing it watches changed', () => {
    expect(
      anomalyOf({
        name: 'vibee-editor',
        deploys: [
          d('SKIPPED', '2026-09-21T18:10:16Z', HEAD),
          d('SUCCESS', '2026-09-21T16:06:01Z', 'd03886501'),
        ],
        mainHead: HEAD,
        mainHeadAtMs: NOW - 60 * 60_000,
        nowMs: NOW,
      })
    ).toBeNull()
  })

  it('a failed build that a later success replaced is history, not an alarm', () => {
    expect(
      anomalyOf({
        name: 'vibee-render',
        deploys: [
          d('SUCCESS', '2026-09-21T16:53:11Z', null),
          d('FAILED', '2026-09-21T16:52:25Z', null),
        ],
        mainHead: HEAD,
        mainHeadAtMs: NOW - 5 * 60_000,
        nowMs: NOW,
      })
    ).toBeNull()
  })
})
