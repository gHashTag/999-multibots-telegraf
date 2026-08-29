/**
 * The served model-training function is the execution choke point for
 * model/training.start. The training wizards now refuse a zero-cost (steps=0)
 * training at the cost gate, but this handler must also refuse an invalid steps
 * count — otherwise any emitter of the event with steps<=0 (or NaN) would run a
 * training the user paid nothing for, at the owner's provider cost.
 *
 * The guard sits at the very top of the handler, before any step.run / fs work,
 * so this test drives only that guard. The step stub throws if reached, which
 * keeps the mutation clean: removing the guard makes the handler proceed past it
 * and reject with a different error, failing the message assertion — without
 * touching the fs-heavy path that the sibling suite has to skip.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'
import { generateModelTrainingFunction } from '@/inngest_app/functions/existing/generateModelTrainingFunction'

const handler = getHandler(generateModelTrainingFunction)

function eventWith(steps: unknown) {
  return {
    event: {
      data: {
        telegram_id: '123',
        bot_name: 'test_bot',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipUrl: 'https://supabase.co/storage/v1/object/public/uploads/z.zip',
        steps,
        is_ru: true,
        gender: 'male',
      },
    },
    step: {
      run: async () => {
        throw new Error('STEP_REACHED')
      },
    },
  }
}

describe('served training handler refuses an invalid steps count', () => {
  beforeEach(() => {
    process.env.REPLICATE_API_TOKEN = 'test-token'
    process.env.REPLICATE_USERNAME = 'testuser'
  })

  it('rejects steps=0 (a free training) before doing any work', async () => {
    await expect(handler(eventWith(0))).rejects.toThrow(
      'Invalid training steps'
    )
  })

  it('rejects a negative step count', async () => {
    await expect(handler(eventWith(-5))).rejects.toThrow(
      'Invalid training steps'
    )
  })

  it('rejects a non-integer / NaN step count', async () => {
    await expect(handler(eventWith(Number.NaN))).rejects.toThrow(
      'Invalid training steps'
    )
  })

  it('lets a valid positive step count past the guard (reaches the first step)', async () => {
    // With a valid count the guard passes and the first step.run executes,
    // which our stub throws from — proving the guard did NOT short-circuit here.
    await expect(handler(eventWith(1000))).rejects.toThrow('STEP_REACHED')
  })
})
