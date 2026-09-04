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

const { blank } = require('../../../scripts/lib/blank-code.cjs')
const { callArgs, braceBody } = require('../../../scripts/lib/call-args.cjs')

// Comments already stripped (length-preserving), then string CONTENTS blanked:
// a `return` or a `jobId` written inside a message cannot satisfy a rule.
const masked = () => blank(code())

describe('video delivery is idempotent per job (no double charge)', () => {
  it('handleVideoReady accepts an optional jobId claim token', () => {
    // The parameter list is a balanced paren group, not a 260-char window: a
    // window either clips a longer signature or runs past it into the body.
    const decl = callArgs(masked(), 'function handleVideoReady')
    expect(decl.length, 'no handleVideoReady declaration').toBe(1)
    expect(
      /jobId\?: string/.test(decl[0]),
      'handleVideoReady has no jobId param'
    ).toBe(true)
  })

  it('claims delivery by immutable jobId (returns on duplicate) BEFORE the charge', () => {
    const s = code()
    const guard = s.search(
      /if \(jobId !== undefined && !claimVideoJobDelivery\(jobId\)\)/
    )
    expect(guard, 'no jobId idempotency guard').toBeGreaterThan(-1)

    // The return must be INSIDE the guard's own block. A 400-char slice also
    // covers whatever follows the guard, so a `return` that belongs to the
    // next statement would have satisfied it just as well.
    const body = braceBody(
      masked(),
      'if \\(jobId !== undefined && !claimVideoJobDelivery\\(jobId\\)\\)'
    )
    expect(body, 'no jobId idempotency guard block').not.toBe('')
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
      /const claimVideoJobDelivery = createVideoDeliveryClaimer\(\)/.test(s),
      'does not instantiate the shared delivery claimer'
    ).toBe(true)

    // the claim must run before the money charge and before the delivery
    const charge = s.indexOf('updateUserBalance(')
    const deliver = s.indexOf('replyWithVideo(')
    expect(charge, 'no updateUserBalance charge').toBeGreaterThan(-1)
    expect(deliver, 'no replyWithVideo delivery').toBeGreaterThan(-1)
    expect(guard, 'claim runs after the charge').toBeLessThan(charge)
    expect(guard, 'claim runs after the delivery').toBeLessThan(deliver)
  })

  it('sources the bounded claimer from the shared util (bound tested there)', () => {
    const s = code()
    expect(
      /from '@\/helpers\/videoDeliveryIdempotency'/.test(s),
      'does not import the shared delivery-idempotency util'
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
    // Each call's argument list is read by balancing parens, so a long call
    // cannot fall out of the population by exceeding a width.
    const calls = callArgs(masked(), 'await handleVideoReady')
    const withJob = calls.filter(c => /,\s*jobId\s*$/.test(c))
    expect(calls.length, 'expected three handleVideoReady call sites').toBe(3)
    expect(
      withJob.length,
      'expected exactly the two async callers to pass jobId'
    ).toBe(2)
  })
})
