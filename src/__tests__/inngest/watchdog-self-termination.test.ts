/**
 * The stuck-training watchdog (checkStuckTrainings, enabled in #1057) is safe
 * only because it self-terminates: its subscriber handleModelTrainingCompleted
 * flips the row to a terminal status, so the next 30-minute run no longer
 * selects it. The adversarial review that gated #1057 found one path where the
 * flip did not happen (a version-less success threw before the update) and asked
 * to re-confirm the invariant for the other terminal statuses.
 *
 * This locks the invariant from both ends:
 *  - behaviourally: a failed / canceled event writes a status the cron will not
 *    re-select;
 *  - structurally: the statuses the handler writes are disjoint from the set the
 *    cron treats as stuck, so a regression in EITHER file (a new stuck status, or
 *    a handler output that overlaps it) fails the build.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'

const STUCK = ['PENDING', 'starting', 'processing'] // checkStuckTrainings.ts query

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
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: () => ({
    bot: { telegram: { sendMessage: async () => ({}) } },
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
  createFunction: (_c: any, _t: any, h: any) => {
    captured.handler = h
    return { id: _c.id }
  },
}
const step = { run: async (_n: string, fn: any) => fn() }

describe('stuck-training watchdog self-terminates', () => {
  it.each(['failed', 'canceled'])(
    'a %s event writes a status the cron will not re-select',
    async status => {
      createHandleModelTrainingCompletedFunction(fakeInngest as any)
      updateCalls.length = 0
      const event = { data: { training_id: 'abc', status, error: 'boom' } }
      await expect(captured.handler!({ event, step })).resolves.toBeTruthy()
      const written = updateCalls[0]?.status
      expect(written).toBeTruthy()
      expect(STUCK).not.toContain(written)
    }
  )

  it('every status the handler writes is disjoint from the cron stuck set', () => {
    const handlerSrc = fs.readFileSync(
      'src/inngest_app/functions/existing/handleModelTrainingCompleted.ts',
      'utf8'
    )
    const cronSrc = fs.readFileSync(
      'src/inngest_app/functions/training/checkStuckTrainings.ts',
      'utf8'
    )
    const outputs = [
      ...handlerSrc.matchAll(/(?:succeeded|failed|canceled):\s*'([^']+)'/g),
    ].map(m => m[1])
    const stuck = (cronSrc.match(/\.in\('status',\s*\[([^\]]+)\]/)?.[1] || '')
      .match(/'([^']+)'/g)
      ?.map(s => s.replace(/'/g, '')) as string[]

    expect(outputs.length).toBeGreaterThan(0)
    expect(stuck.length).toBeGreaterThan(0)
    expect(stuck).toEqual(STUCK) // the test's own copy stays in sync with the cron
    expect(outputs.filter(o => stuck.includes(o))).toEqual([])
  })
})
