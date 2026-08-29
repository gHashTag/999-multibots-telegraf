/**
 * handleVideoReady (src/handlers/handleTextToVideoDirect.ts) delivers a
 * generated video and then charges updateUserBalance(MONEY_OUTCOME). It is
 * reached by three callers: the synchronous immediate-result path (no jobId),
 * the async poller monitorVideoGeneration, and the persistent
 * "update_video_status" button handleVideoStatusUpdate. The two async callers
 * shared ctx.session.videoJobId as their only dedup key and cleared it ONLY
 * AFTER the multi-second delivery await — so a button tap racing the poller
 * re-entered handleVideoReady for a job already delivered and charged it a
 * SECOND time (real over-charge of the user, distinct from the owner-blocked
 * TOCTOU #999).
 *
 * The fix makes delivery idempotent: handleVideoReady takes an optional jobId
 * and, when present, claims it in a bounded module-scope delivered-set
 * (claimVideoJobDelivery) before any await, returning early if the job was
 * already delivered. It keys on the IMMUTABLE jobId, not the single-slot
 * ctx.session.videoJobId — an overlapping second generation overwrites that
 * slot, and keying on it would skip the older job's real delivery. The sync
 * path passes no jobId and always proceeds.
 *
 * Source-level seam test (delivery/charge are behind live Telegram + billing
 * I/O). Mutation — dropping the guard, its return, or moving it after the
 * charge — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'handlers',
  'handleTextToVideoDirect.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('video delivery is idempotent per job (no double charge)', () => {
  it('handleVideoReady accepts an optional jobId claim token', () => {
    const s = code()
    const sig = s.match(
      /async function handleVideoReady\([\s\S]{0,260}?\): Promise<void>/
    )
    expect(sig, 'no handleVideoReady signature').not.toBeNull()
    expect(
      /jobId\?: string/.test(sig![0]),
      'handleVideoReady has no jobId param'
    ).toBe(true)
  })

  it('claims delivery by immutable jobId (returns on duplicate) BEFORE the charge', () => {
    const s = code()
    const guard = s.search(
      /if \(jobId !== undefined && !claimVideoJobDelivery\(jobId\)\)/
    )
    expect(guard, 'no jobId idempotency guard').toBeGreaterThan(-1)

    // guard body returns on a duplicate
    const body = s.slice(guard, guard + 400)
    expect(
      /\breturn\b/.test(body),
      'guard does not return on a duplicate'
    ).toBe(true)

    // the claim keys on the immutable jobId via a delivered-set, NOT the mutable
    // single-slot session key (keying on it would skip an overlapping job's
    // real delivery — the regression the adversarial verify caught).
    expect(
      /ctx\.session\.videoJobId !== jobId/.test(s),
      'guard must not key idempotency on the mutable ctx.session.videoJobId'
    ).toBe(false)
    expect(
      /function claimVideoJobDelivery/.test(s),
      'no claimVideoJobDelivery helper'
    ).toBe(true)
    expect(
      /deliveredVideoJobs\.has\(jobId\)/.test(s),
      'helper does not check the delivered-set'
    ).toBe(true)
    expect(
      /deliveredVideoJobs\.add\(jobId\)/.test(s),
      'helper does not record the delivered job'
    ).toBe(true)

    // the claim must run before the money charge and before the delivery
    const charge = s.indexOf('updateUserBalance(')
    const deliver = s.indexOf('replyWithVideo(')
    expect(charge, 'no updateUserBalance charge').toBeGreaterThan(-1)
    expect(deliver, 'no replyWithVideo delivery').toBeGreaterThan(-1)
    expect(guard, 'claim runs after the charge').toBeLessThan(charge)
    expect(guard, 'claim runs after the delivery').toBeLessThan(deliver)
  })

  it('bounds the delivered-set so it cannot grow without limit', () => {
    const s = code()
    const m = s.match(/const DELIVERED_VIDEO_JOBS_MAX = (\d+)/)
    expect(m, 'delivered-set is not bounded').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0)
    expect(
      /deliveredVideoJobs\.size > DELIVERED_VIDEO_JOBS_MAX[\s\S]{0,160}deliveredVideoJobs\.delete/.test(
        s
      ),
      'no FIFO eviction when the delivered-set exceeds its cap'
    ).toBe(true)
  })

  it('the two async callers pass jobId; the sync path does not; button captures it', () => {
    const s = code()
    // the button reads the key into a local (used as the claim token)
    expect(
      s.includes('const jobId = ctx.session.videoJobId'),
      'button does not capture jobId'
    ).toBe(true)
    // of the three handleVideoReady CALL sites, exactly the two async ones
    // (poller, button) pass a trailing jobId argument; the sync path passes none
    const calls =
      s.match(/await handleVideoReady\(\s*\n\s*ctx,[\s\S]{0,300}?\n\s*\)/g) ||
      []
    const withJob = calls.filter(c => /,\s*\n\s*jobId\n\s*\)$/.test(c))
    expect(calls.length, 'expected three handleVideoReady call sites').toBe(3)
    expect(
      withJob.length,
      'expected exactly the two async callers to pass jobId'
    ).toBe(2)
  })
})
