/**
 * Money-integrity: the voice avatar wizard must gate on balance BEFORE the paid
 * ElevenLabs clone and charge exactly once AFTER a voice is actually created.
 *
 * Step 2 called createVoiceAvatar (which POSTs voices/add — a persistent Instant
 * Voice Clone that burns owner ElevenLabs credits + a finite voice slot) with NO
 * balance check and NO star deduction: the 4 billing imports were dead, the menu
 * gate's deduction is commented out, and the lipsync entries enter 'voice'
 * directly. So any subscriber, zero balance included, minted unlimited free
 * clones. The protected sibling textToSpeechWizard (same Voice family, same tier)
 * gates with checkUserBalance and charges with updateUserBalance; this did
 * neither. Cost is 0.9 stars (ModeEnum.Voice).
 *
 * This drives the REAL wizard step through the scene middleware with a real
 * Telegraf Context (cursor at step 2); the gate, provider and money edges are
 * mocked. A subtlety the fix must honour: createVoiceAvatar resolves with
 * undefined on the ElevenLabs voice-limit path (it messages the user and does
 * NOT throw), so an unconditional post-call charge would bill for nothing.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(async () => {}),
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({})),
}))
vi.mock('@/services/plan_b/createVoiceAvatar', () => ({
  createVoiceAvatar: vi.fn(),
}))
vi.mock('@/helpers/checkUserBalance', () => ({
  checkUserBalance: vi.fn(async () => true),
}))
vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(async () => 1000),
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/price/helpers/modelsCost', () => ({
  calculateModeCost: vi.fn(() => ({ stars: 0.9 })),
}))
vi.mock('@/price/helpers', () => ({
  sendInsufficientStarsMessage: vi.fn(async () => {}),
  sendBalanceMessage: vi.fn(async () => {}),
  voiceConversationCost: 0,
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { voiceAvatarWizard } from '@/scenes/voiceAvatarWizard'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'
import { checkUserBalance } from '@/helpers/checkUserBalance'
import { updateUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'

const create = createVoiceAvatar as unknown as Mock
const gate = checkUserBalance as unknown as Mock
const charge = updateUserBalance as unknown as Mock

const TID = 223757230

function makeCtx() {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: TID, is_bot: false, first_name: 'U', username: 'u' },
      voice: { file_id: 'vf', duration: 3 },
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    getFile: async () => ({ file_path: 'voice/file.ogg' }),
    sendMessage: async () => ({ message_id: 2 }),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: vi.fn(async () => {}),
    enter: vi.fn(async () => {}),
    current: { id: 'voice' },
    state: {},
    session: { cursor: 1 }, // run step 2 (the voice handler)
  }
  ctx.session = {}
  ctx.reply = vi.fn(async () => {})
  return ctx
}

const run = (ctx: any) =>
  (voiceAvatarWizard as any).middleware()(ctx, async () => {})

describe('voice avatar billing: gate before the clone, charge once after', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gate.mockResolvedValue(true)
    create.mockResolvedValue({ voiceId: 'v1' })
    charge.mockResolvedValue(true)
  })

  it('A: insufficient balance blocks the paid call and never charges', async () => {
    gate.mockResolvedValue(false)
    const ctx = makeCtx()
    await run(ctx)
    expect(create).not.toHaveBeenCalled()
    expect(charge).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('B: on success it charges exactly once, after the clone, 0.9 MONEY_OUTCOME', async () => {
    const ctx = makeCtx()
    await run(ctx)
    expect(create).toHaveBeenCalledTimes(1)
    expect(charge).toHaveBeenCalledTimes(1)
    const args = charge.mock.calls[0]
    expect(args[0]).toBe(String(TID))
    expect(args[1]).toBe(0.9)
    expect(args[2]).toBe(PaymentType.MONEY_OUTCOME)
    // charge must come AFTER the clone, never before it
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      charge.mock.invocationCallOrder[0]
    )
  })

  it('C: voice-limit (createVoiceAvatar resolves undefined) does NOT charge', async () => {
    create.mockResolvedValue(undefined)
    const ctx = makeCtx()
    await run(ctx)
    expect(create).toHaveBeenCalledTimes(1)
    expect(charge).not.toHaveBeenCalled()
  })

  it('D: a clone that throws does NOT charge and releases the in-flight guard', async () => {
    create.mockRejectedValue(new Error('elevenlabs down'))
    const ctx = makeCtx()
    await run(ctx)
    expect(charge).not.toHaveBeenCalled()
    expect(ctx.session.voiceAvatarInProgress).toBe(false)
  })
})
