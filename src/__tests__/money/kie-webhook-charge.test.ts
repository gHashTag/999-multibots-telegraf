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
    const soraStart = SRC.indexOf('async function handleSoraSuccess')
    expect(soraStart).toBeGreaterThan(-1)
    const sora = SRC.slice(soraStart, soraStart + 6000)
    expect(sora).toContain('chargeForDeliveredVideo')
    expect(sora).toContain('taskContext.modelId')
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
    expect(I2V).toContain('videoTaskStore.saveTask')
    const saveIdx = I2V.indexOf('videoTaskStore.saveTask')
    expect(I2V.slice(saveIdx, saveIdx + 400)).toContain('modelId')
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
