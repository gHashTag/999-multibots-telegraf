/**
 * The music-generation duration comes from callback data, which is untrusted.
 * A forged `duration_0` used to price the track at calculateSunoMusicCost(0) = 0,
 * and the generation step's `balance < cost` gate then degenerates to
 * `balance < 0` (always false) — a full paid Suno track delivered for 0 stars at
 * the owner's expense. The action handler must bind the duration to the
 * server-side SUNO_DURATION_OPTIONS allowlist before pricing.
 *
 * Drives the REAL wizard action through the scene middleware with a real
 * Telegraf Context (same pattern as faceSwapDoubleCharge.test.ts). The valid
 * case proves the handler actually fires (cost becomes positive); the forged
 * case proves it refuses to price at zero. Reverting the allowlist makes the
 * forged case set cost 0 and fail.
 */
import { describe, it, expect } from 'vitest'
import { Context } from 'telegraf'
import { musicGenerationWizard } from '@/scenes/musicGenerationWizard'
import { calculateSunoMusicCost } from '@/price/helpers/modelsCost'

function makeCtx(data: string) {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: 'cbq1',
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 1, type: 'private' },
      },
      data,
      chat_instance: 'ci',
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    answerCbQuery: async () => true,
    editMessageText: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    reenter: async () => {},
    current: { id: 'musicGenerationWizard' },
    state: {},
    session: { cursor: 1 },
  }
  ctx.session = { wizardData: { instrumental: false } }
  return ctx
}

const run = (ctx: any) =>
  (musicGenerationWizard as any).middleware()(ctx, async () => {})

describe('music generation: duration must come from the server-side allowlist', () => {
  it('prices a valid duration (60s) to a positive cost — proves the handler fires', async () => {
    const ctx = makeCtx('duration_60')
    // showPromptInput runs after pricing; tolerate any of its side effects.
    await run(ctx).catch(() => {})
    expect(ctx.session.wizardData.cost).toBe(calculateSunoMusicCost(60))
    expect(ctx.session.wizardData.cost).toBeGreaterThan(0)
  })

  it('refuses a forged duration_0 — never prices the track at zero', async () => {
    const ctx = makeCtx('duration_0')
    await run(ctx).catch(() => {})
    // With the allowlist the handler returns before pricing, so cost is unset.
    // Without it, cost would be calculateSunoMusicCost(0) === 0.
    expect(ctx.session.wizardData.cost).not.toBe(0)
  })

  it('refuses an out-of-range forged duration (999999)', async () => {
    const ctx = makeCtx('duration_999999')
    await run(ctx).catch(() => {})
    expect(ctx.session.wizardData.duration).not.toBe(999999)
  })
})
