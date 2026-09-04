/**
 * Regression test: a video delivered by the Kie webhook must be charged, and a
 * delivery that cannot be charged must be logged loudly.
 *
 * For Kie models the bot skips polling and waits for this webhook
 * (handleTextToVideoDirect.ts:216; monitorVideoGeneration returns early for
 * Sora), and image-to-video billing was moved here too. That makes the webhook
 * the ONLY place the money can be taken.
 *
 * Two holes this pins shut:
 *  - the task-found branch never charged at all, so a video announced with a
 *    price was delivered free;
 *  - the direct-send branch passed the literal 'sora-2-image-to-video', which
 *    is not a key of UNIFIED_VIDEO_MODELS, so the charge failed and was
 *    swallowed silently.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  callArgs,
  argsMention,
  braceBody,
} = require('../../../scripts/lib/call-args.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { blank } = require('../../../scripts/lib/blank-code.cjs')

const SRC = fs.readFileSync(
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'utf8'
)
const I2V = fs.readFileSync(
  'src/modules/videoGenerator/generateImageToVideo.ts',
  'utf8'
)

describe('kie webhook billing', () => {
  it('does not pass the bogus non-price model id any more', () => {
    // 'sora-2-image-to-video' may still appear in comments explaining the bug,
    // but never as a value handed to the charge path.
    const asValue = /modelId:\s*'sora-2-image-to-video'/.test(SRC)
    expect(asValue).toBe(false)
  })

  it('charges in the task-found branch of the Sora handler', () => {
    // This read the 6000 characters after the signature. Measured, that number
    // was carrying the verdict: the assertion passes at 6000 and fails at 3000,
    // so it was a body reader with a guess for a length. The body ends where its
    // brace closes.
    const sora = braceBody(blank(SRC), 'async function handleSoraSuccess')
    expect(sora, 'handleSoraSuccess not found').not.toBe('')
    // toContain('chargeForDeliveredVideo') used to stand here and it did not
    // bite: renaming the helper to chargeForDeliveredVideoXX kept the assertion
    // green, because a substring match cannot tell a name from a prefix of a
    // longer one. Ask for the CALL instead.
    expect(
      callArgs(sora, 'chargeForDeliveredVideo').length,
      'the Sora handler must call chargeForDeliveredVideo'
    ).toBeGreaterThanOrEqual(1)
    expect(argsMention(sora, 'taskContext')).toBe(true)
    expect(sora).toMatch(/taskContext\.modelId(?![\w$])/)
  })

  it('logs every non-charge instead of skipping quietly', () => {
    expect(SRC).toContain('VIDEO DELIVERED BUT NOT CHARGED')
    // The helper must report on all three ways charging can fall through.
    expect(SRC).toContain('no modelId in task context or callback metadata')
    expect(SRC).toContain('balance check failed')
    expect(SRC).toContain('deductBalanceAfterSuccess returned false')
  })

  it('image-to-video saves task context so the webhook can price it', () => {
    // Without this the webhook always fell into direct mode, where the model
    // (and therefore the price) is unknown.
    //
    // This asserted over the 400 characters after indexOf('videoTaskStore.
    // saveTask') and had been RED on a clean tree: a COMMENT 28 lines above the
    // real call mentions saveTask, indexOf takes the FIRST occurrence, and the
    // window then read prose instead of code. The production call was correct
    // the whole time -- only the guard was blind, and nobody saw it because a
    // test that has never passed is absent from the gate's snapshot rather than
    // reported by it.
    //
    // So: read the arguments of the CALL, from a masked source in which a
    // comment cannot be an anchor. No occurrence to pick, no width to tune.
    const calls = callArgs(blank(I2V), 'videoTaskStore\\.saveTask')
    expect(calls.length, 'no videoTaskStore.saveTask call in code').toBe(1)
    expect(argsMention(calls[0], 'modelId')).toBe(true)
  })
})

describe('chargeForDeliveredVideo behaviour', () => {
  // The helper is module-private, so exercise it through the exported webhook
  // surface would require a full express app; the source-level assertions above
  // cover wiring. Here we verify the price table really lacks the old literal,
  // which is what made the silent skip possible.
  let getUnifiedModelPrice: (id: string, opts?: unknown) => number

  beforeEach(async () => {
    const mod = await import('@/config/unified-video-models.config')
    getUnifiedModelPrice = (mod as any).getUnifiedModelPrice
  })

  it("'sora-2-image-to-video' is not a priceable model", () => {
    expect(() => getUnifiedModelPrice('sora-2-image-to-video')).toThrow()
  })

  it('the real Sora keys ARE priceable', () => {
    expect(typeof getUnifiedModelPrice('sora-2')).toBe('number')
    expect(typeof getUnifiedModelPrice('sora-2-pro')).toBe('number')
  })
})
