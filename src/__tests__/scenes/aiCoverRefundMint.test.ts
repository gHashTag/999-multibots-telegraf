/**
 * Regression test: the AI Cover confirm handler must not MINT stars.
 *
 * The charge (updateUserBalance MONEY_OUTCOME) can return false without writing a
 * debit — a concurrent spend wins the balance recheck, or a transient insert
 * fails. The old code discarded that boolean, generated anyway, and on any
 * generation error the catch credited a PaymentType.REFUND UNCONDITIONALLY —
 * +cost stars that were never debited, money from nothing. The fix captures the
 * charge result, bails when it is false, and refunds only a charge that happened
 * (the sibling voiceTrainingWizard already does this).
 *
 * Drives the REAL confirm_cover action through the scene middleware; only the
 * money/provider edges are mocked. Reverting the guard makes case 1 write a
 * REFUND and fails the test.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(async () => {}),
  handleHelpCancel: vi.fn(async () => false),
}))
vi.mock('@/services/rvc', () => ({
  generateAICover: vi.fn(),
  validateSongDuration: vi.fn(async () => ({ valid: true })),
  validateAudioFormat: vi.fn(() => ({ valid: true })),
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(async () => 1000),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/core/supabase/voiceModels', () => ({
  getVoiceModel: vi.fn(async () => ({ model_url: 'm' })),
  hasReadyVoiceModel: vi.fn(async () => true),
}))
vi.mock('@/price/helpers/modelsCost', () => ({
  getAICoverCost: vi.fn(() => 50),
  AI_COVER_CONFIG: {},
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { aiCoverWizard } from '@/scenes/aiCoverWizard'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { generateAICover } from '@/services/rvc'
import { PaymentType } from '@/interfaces/payments.interface'

const charge = updateUserBalance as unknown as Mock
const generate = generateAICover as unknown as Mock

const refundCalls = () =>
  charge.mock.calls.filter(c => c[2] === PaymentType.REFUND)
const outcomeCalls = () =>
  charge.mock.calls.filter(c => c[2] === PaymentType.MONEY_OUTCOME)

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data: 'confirm_cover',
    },
  }
  const telegram: any = {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    sendAudio: async () => ({ message_id: 3 }),
    deleteMessage: async () => true,
    getFileLink: async () => ({ href: 'https://example/song.mp3' }),
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    current: { id: 'aiCoverWizard' },
    state: {},
    session: { cursor: 0 },
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (aiCoverWizard as any).middleware()(ctx, async () => {})

const readySession = () => ({
  wizardData: { songFileId: 'f', voiceModelUrl: 'v' },
})

describe('AI Cover confirm: never mint a refund without a charge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes no REFUND (and skips generation) when the charge did not happen', async () => {
    charge.mockResolvedValue(false) // charge returns false: no debit written
    generate.mockRejectedValue(new Error('replicate down'))

    await run(makeCtx(readySession())).catch(() => {})

    expect(outcomeCalls().length).toBe(1) // it tried to charge
    expect(refundCalls().length).toBe(0) // but minted nothing back
    expect(generate).not.toHaveBeenCalled() // and did no paid work
  })

  it('still refunds a real charge when generation fails', async () => {
    charge.mockResolvedValue(true) // charge succeeded
    generate.mockRejectedValue(new Error('replicate down'))

    await run(makeCtx(readySession())).catch(() => {})

    expect(refundCalls().length).toBe(1) // the actual charge is refunded
  })
})
