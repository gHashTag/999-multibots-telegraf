/**
 * THE SERVICE CHARGES FOR ITSELF UNLESS SOMEBODY ELSE ALREADY DID.
 *
 * #1274: in aiPhotoshop's all_models mode the nano branch called this service
 * with `skipBalanceCheck: true` and a comment claiming the charge had already
 * happened. Nothing charged it -- the scene's single charge covers four other
 * models -- so nano generated FREE for every person who used that mode.
 *
 * That defect had two halves. The scene's half (do not claim a charge that did
 * not happen) is guarded by nanoAllModelsBilled, which reads the scene as text
 * and stays that way on purpose -- see the note at the end of this comment.
 * THIS is the other half, and it is the one that can be run: given no such
 * claim, the service must take the money itself, and it must not generate when
 * the money did not move.
 *
 * WHY THE SCENE'S HALF STAYS A TEXT GUARD (form 118). Reaching that branch means
 * driving a 6,600-line scene through photo upload, model selection, the
 * all_models loop and a two-second sleep per model, with the branch itself
 * living inside a `const` the module never exports. The state is real but the
 * road to it is longer than the property is worth; the honest move is to say so
 * rather than to build a fixture that proves mostly itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const processBalanceOperation = vi.fn()
const replicateRun = vi.fn()
const refundUser = vi.fn()

vi.mock('@/price/helpers/processBalanceOperation', () => ({
  processBalanceOperation: (...a: unknown[]) => processBalanceOperation(...a),
}))

vi.mock('@/price/helpers/refundUser', () => ({
  refundUser: (...a: unknown[]) => refundUser(...a),
}))

vi.mock('replicate', () => ({
  default: class {
    run = (...a: unknown[]) => replicateRun(...a)
  },
}))

vi.mock('@/helpers/sendPhotoWithFallback', () => ({
  sendPhotoWithFallback: async () => undefined,
}))

/*
 * The supabase barrel is spread from the REAL module, not invented. A mock
 * listing only what I remembered the service using threw "No getUserBalance
 * export is defined on the mock" from inside a catch, which the service
 * reported as an ordinary generation failure -- so every assertion failed for
 * a reason that had nothing to do with money.
 */
vi.mock('@/core/supabase', async () => {
  const actual =
    await vi.importActual<typeof import('@/core/supabase')>('@/core/supabase')
  return {
    ...actual,
    savePrompt: async () => undefined,
    getUserBalance: async () => 500,
    getUserByTelegramIdString: async () => ({ id: 1 }),
  }
})

const TELEGRAM_ID = '900000121'

function context() {
  return {
    from: { id: Number(TELEGRAM_ID), username: 'a_person' },
    chat: { id: Number(TELEGRAM_ID) },
    botInfo: { username: 'test_bot' },
    session: {},
    reply: vi.fn(async () => ({ message_id: 1 })),
    telegram: {
      deleteMessage: async () => undefined,
      sendPhoto: async () => undefined,
    },
  }
}

async function generate(extra: Record<string, unknown> = {}) {
  const ctx = context()
  const { generateNanoBanana } = await import('@/services/generateNanoBanana')
  const result = await generateNanoBanana({
    promptText: 'a portrait',
    inputImageUrl: 'https://example.test/in.jpg',
    telegram_id: TELEGRAM_ID,
    username: 'a_person',
    is_ru: false,
    ctx: ctx as never,
    promptStyle: 'artistic',
    silent: true,
    ...extra,
  } as never)
  return { ctx, result }
}

beforeEach(() => {
  vi.clearAllMocks()
  processBalanceOperation.mockResolvedValue({
    success: true,
    currentBalance: 500,
    newBalance: 495,
  })
  replicateRun.mockResolvedValue(['https://example.test/out.jpg'])
})

describe('nano banana takes its own money', () => {
  it('charges when nobody claims to have charged already', async () => {
    await generate()

    expect(
      processBalanceOperation,
      'the generation was free: nothing charged it here and nothing claimed to'
    ).toHaveBeenCalledTimes(1)
    const [{ paymentAmount }] = processBalanceOperation.mock.calls[0]
    expect(paymentAmount, 'charged nothing for one image').toBeGreaterThan(0)
  })

  it('charges per image, not per request', async () => {
    await generate({
      inputImageUrl: ['a', 'b', 'c'].map(n => `https://x/${n}`),
    })

    const [{ paymentAmount: three }] = processBalanceOperation.mock.calls[0]
    processBalanceOperation.mockClear()

    await generate()
    const [{ paymentAmount: one }] = processBalanceOperation.mock.calls[0]

    expect(three, 'three images cost the same as one').toBe(one * 3)
  })

  /*
   * THE EXPENSIVE DIRECTION. An empty wallet must stop the work, or the house
   * pays the provider for a person who could not pay the house.
   */
  it('does not generate when the money did not move', async () => {
    processBalanceOperation.mockResolvedValue({
      success: false,
      currentBalance: 0,
    })

    const { result } = await generate()

    expect(result, 'a refused charge still returned an image').toBeNull()
    expect(
      replicateRun,
      'the provider was paid for a generation nobody paid us for'
    ).not.toHaveBeenCalled()
  })

  /*
   * THE CONTRACT THE SCENE LEANS ON. `skipBalanceCheck` means "somebody else
   * already took the money" -- the flag must be believed, and it must be the
   * ONLY thing that silences the charge, because a caller that sets it wrongly
   * is exactly how #1274 happened.
   */
  it('skips the charge only when explicitly told the money is taken', async () => {
    await generate({ skipBalanceCheck: true })

    expect(processBalanceOperation).not.toHaveBeenCalled()
    expect(replicateRun, 'it also refused to work').toHaveBeenCalled()
  })

  /*
   * And a failed generation gives the money back: charged-and-nothing-delivered
   * is the mirror of unbilled-paid, and costs the person instead of the house.
   */
  it('gives the money back when the generation fails', async () => {
    replicateRun.mockRejectedValue(new Error('provider is down'))

    await generate()

    expect(
      refundUser,
      'charged, delivered nothing, refunded nothing'
    ).toHaveBeenCalled()
    const [, amount] = refundUser.mock.calls[0]
    const [{ paymentAmount }] = processBalanceOperation.mock.calls[0]
    expect(amount, 'the refund is not what was charged').toBe(paymentAmount)
  })
})
