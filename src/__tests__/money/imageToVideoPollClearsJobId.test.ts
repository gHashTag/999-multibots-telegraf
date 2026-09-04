/**
 * Ratchet: generateImageToVideo's Plan B poll clears ctx.session.videoJobId after
 * it delivers+charges inline, so the persistent "Update status" button cannot
 * charge the same task a SECOND time.
 *
 * The poll arms the button by setting ctx.session.videoJobId = taskId up front,
 * then on success delivers (sendVideo) and charges (deductBalanceAfterSuccess).
 * The button (update_video_status -> handleVideoStatusUpdate -> handleVideoReady)
 * charges via a DIFFERENT path guarded by claimVideoJobDelivery(taskId) -- an
 * idempotency Set the poll never populates. So without clearing videoJobId, a
 * post-delivery tap re-claims and re-charges (MONEY_OUTCOME) the same taskId.
 * handleTextToVideoDirect already deletes videoJobId on its terminal paths; the
 * image-to-video poll had ZERO deletes (found by the iter230 fresh-lens wave,
 * poller lens, adversarially + hand verified).
 *
 * This pins the invariant: the file that ARMS the button (sets videoJobId) must
 * also DISARM it (delete videoJobId). Text-based (comments stripped) with a floor
 * + self-check + real-source mutation.
 *
 * loop-fable iter230.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../modules/videoGenerator/generateImageToVideo.ts'
)

/** Strip block and line comments so a commented-out example never counts. */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * One spelling of "disarm", used BOTH to detect it and to mutate it away.
 *
 * These were two separate literals, and they drifted: the detector matched
 * `delete\s+ctx.session.videoJobId` while the mutation removed
 * `delete ctx.session.videoJobId\n` -- and, without /g, only the FIRST one. The
 * file has since grown a SECOND disarm (another terminal path was hardened), so
 * the mutation took clears from 2 to 1, expected 0, and this ratchet had been
 * RED on a clean tree. Nothing reported it: a test that was already failing when
 * the gate snapshot was taken is ABSENT from the snapshot, not flagged by it.
 */
const CLEAR = /delete\s+ctx\.session\.videoJobId/g
const ARM = /ctx\.session\.videoJobId\s*=\s*taskId/g

function analyze(source: string): { arms: number; clears: number } {
  const s = strip(source)
  return {
    arms: (s.match(ARM) || []).length,
    clears: (s.match(CLEAR) || []).length,
  }
}

describe('generateImageToVideo poll disarms the update-status button after inline delivery', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the file still ARMS the button (sets videoJobId = taskId)', () => {
    // If it stopped arming, the button model changed and this ratchet is stale.
    expect(a.arms).toBeGreaterThanOrEqual(1)
  })

  it('the file also DISARMS it (deletes videoJobId) so the button cannot re-charge', () => {
    expect(
      a.clears,
      `generateImageToVideo arms the persistent update_video_status button ` +
        `(ctx.session.videoJobId = taskId) but never clears it. After the poll ` +
        `delivers+charges inline, a button re-tap re-charges the same taskId via ` +
        `claimVideoJobDelivery (a guard this poll never populates). Delete ` +
        `ctx.session.videoJobId after inline delivery, as handleTextToVideoDirect does.`
    ).toBeGreaterThanOrEqual(1)
  })

  it('self-check: detector distinguishes arm-only from arm+clear', () => {
    const armOnly = `if (ctx?.session) { ctx.session.videoJobId = taskId }`
    const armClear = `
      if (ctx?.session) { ctx.session.videoJobId = taskId }
      if (ctx?.session) { delete ctx.session.videoJobId }`
    expect(analyze(armOnly)).toEqual({ arms: 1, clears: 0 })
    expect(analyze(armClear)).toEqual({ arms: 1, clears: 1 })
  })

  it('mutation: removing EVERY real delete turns the check RED', () => {
    // Removing one of several disarms proves nothing: the invariant is that the
    // file disarms at all, so the mutation has to take the count to zero.
    const mutated = source.replace(CLEAR, '')
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).clears).toBe(0)
    expect(analyze(mutated).arms).toBe(a.arms)
  })
})
