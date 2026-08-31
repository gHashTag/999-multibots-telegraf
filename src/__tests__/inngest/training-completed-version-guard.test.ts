/**
 * handleModelTrainingCompleted must flip model_trainings to a terminal status on
 * EVERY processed event, even a 'succeeded' whose Replicate output carries no
 * usable version. It used to call versionHash.substring on null and THROW inside
 * step.run BEFORE the .update(), leaving the row PENDING — which the newly
 * enabled checkStuckTrainings cron then re-selected every 30 minutes forever.
 * This is the blocker the adversarial safety review flagged before enabling the
 * watchdog. The real buildModelUrl is used (not mocked) so the version-less path
 * is exercised for real.
 */
import { describe, it, expect, vi } from 'vitest'

const updateCalls: any[] = []
const record = {
  id: 1,
  telegram_id: '123',
  bot_name: 'AI_STARS_bot',
  model_name: 'My Model',
  trigger_word: 'TOK',
  is_ru: true,
  status: 'PENDING',
}

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: record, error: null }) }),
      }),
      update: (data: any) => {
        updateCalls.push(data)
        return {
          eq: () => ({
            select: async () => ({ data: [{ id: 1 }], error: null }),
          }),
        }
      },
    }),
  },
}))
vi.mock('@/inngest_app/client', () => ({
  createInngestFailureHandler: () => async () => {},
}))
const sentMessages: string[] = []
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: () => ({
    bot: {
      telegram: {
        sendMessage: async (_chatId: any, text: string) => {
          sentMessages.push(text)
          return {}
        },
      },
    },
    error: null,
  }),
}))
vi.mock('@/core/supabase/getUserLanguage', () => ({
  getUserLanguageFromDB: async () => 'ru',
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createHandleModelTrainingCompletedFunction } from '@/inngest_app/functions/existing/handleModelTrainingCompleted'

const captured: { handler?: (arg: any) => Promise<any> } = {}
const fakeInngest = {
  createFunction: (_cfg: any, _trigger: any, handler: any) => {
    captured.handler = handler
    return { id: _cfg.id }
  },
}
const step = { run: async (_name: string, fn: any) => fn() }

describe('handleModelTrainingCompleted flips status even on version-less success', () => {
  it('writes a terminal SUCCESS status and does not throw when output has no version', async () => {
    createHandleModelTrainingCompletedFunction(fakeInngest as any)
    updateCalls.length = 0
    sentMessages.length = 0
    const event = {
      data: {
        training_id: 'abc',
        status: 'succeeded',
        output: { weights: 'w' },
      },
    }
    await expect(captured.handler!({ event, step })).resolves.toBeTruthy()
    // the row was flipped out of the stuck set
    expect(updateCalls.length).toBeGreaterThan(0)
    expect(updateCalls[0].status).toBe('SUCCESS')
    // a broken owner/slug: url must NOT be written
    expect(updateCalls[0].model_url).toBeUndefined()
    // #1349: a succeeded-but-no-model_url row must NOT be announced as ready
    const msg = sentMessages.join('\n')
    expect(msg).toContain('финализируем')
    expect(msg).not.toContain('использовать эту модель')
  })

  it('still writes model_url when the version IS present (happy path unchanged)', async () => {
    createHandleModelTrainingCompletedFunction(fakeInngest as any)
    updateCalls.length = 0
    sentMessages.length = 0
    const event = {
      data: {
        training_id: 'abc',
        status: 'succeeded',
        output: { version: 'ghashtag/my-model:deadbeef', weights: 'w' },
      },
    }
    await expect(captured.handler!({ event, step })).resolves.toBeTruthy()
    expect(updateCalls[0].status).toBe('SUCCESS')
    expect(updateCalls[0].model_url).toBe('ghashtag/my-model:deadbeef')
    // #1349: a real model_url still gets the definitive ready message
    const msg = sentMessages.join('\n')
    expect(msg).toContain('использовать эту модель')
    expect(msg).not.toContain('финализируем')
  })
})
