/**
 * The Sora image-to-video webhook path must not arm ctx.session.videoJobId.
 *
 * generateImageToVideo's Sora branch hands billing to the Kie webhook (via
 * videoTaskStore.saveTask). It also set ctx.session.videoJobId=taskId "so the
 * Update status button works" — but that button charges through a SEPARATE
 * idempotency Set (handleTextToVideoDirect's per-caller claimVideoJobDelivery) that
 * the webhook never populates, so a tap after webhook delivery debited
 * MONEY_OUTCOME a second time and re-sent the video. The iter230 poll-path fix
 * (clear videoJobId) only covered the poll branch; this webhook-only branch leaked
 * the button armed, and its test only asserted clears >= 1 file-wide.
 *
 * Fix: the Sora branch clears videoJobId (does not arm it), so the button defers to
 * the safe "webhook will deliver" branch. The webhook stays the single charger.
 *
 * Integration-only module -> structural assertions + mutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const src = fs.readFileSync(
  'src/modules/videoGenerator/generateImageToVideo.ts',
  'utf8'
)

describe('Sora i2v webhook path does not double-charge via the status button', () => {
  it('arms videoJobId only on the poll path (the webhook path defers)', () => {
    // Before the fix there were TWO arms (poll + Sora webhook); the Sora webhook
    // arm is the double-charge vector. Only the poll-path arm may remain.
    const arms = src.match(/ctx\.session\.videoJobId = taskId/g) || []
    expect(arms.length, 'the Sora webhook path must not arm videoJobId').toBe(1)
  })

  it('the Sora webhook branch clears videoJobId so the button defers', () => {
    const i = src.indexOf('webhook will charge + deliver')
    expect(i, 'Sora webhook marker missing').toBeGreaterThan(-1)
    const window = src.slice(Math.max(0, i - 500), i)
    expect(
      window,
      'Sora branch must clear videoJobId before returning'
    ).toMatch(/delete ctx\.session\.videoJobId/)
  })
})
