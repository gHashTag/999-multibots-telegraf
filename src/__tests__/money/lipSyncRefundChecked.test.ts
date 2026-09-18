/**
 * A REFUND THAT DID NOT HAPPEN MUST NOT BE ANNOUNCED AS ONE.
 *
 * The lip-sync wizard charges BEFORE it checks that it still has both a video
 * and an audio, and the check can genuinely fail: the video arrives in an
 * earlier step and lives in the session, so a restarted process, an evicted
 * session or a re-entered scene leaves the audio in hand and the video gone.
 * The person is charged and there is nothing to generate from.
 *
 * What that path used to do was credit the stars back with a raw
 * `updateUserBalance(..., MONEY_INCOME)` whose result was thrown away, and say
 * nothing at all. `updateUserBalance` returns `false` -- it never throws -- on
 * a schema failure, a refused insert, or a payer with no `users` row (44 of
 * them, docs/audit/ghost-payers.md). So the money stayed taken and the person
 * was not told.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read the wizard as TEXT: find the
 * string 'LipSync refund - missing URLs', look 300 characters back for
 * `refundAndTell(`, and assert no raw MONEY_INCOME mentions that description.
 * That pins a call site, not an outcome -- `refundAndTell` could be called with
 * the wrong amount, or its result ignored by a future edit, and the guard would
 * still be green.
 *
 * Now the step is RUN with the video missing, and what is asserted is what the
 * person and the ledger got: the same amount credited back, and, when that
 * credit fails, a message that says the automatic refund did NOT work instead
 * of "funds refunded".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

const updateUserBalance = vi.fn()
const getUserBalance = vi.fn()
const error = vi.fn()

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: (...a: unknown[]) => getUserBalance(...a),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: (...a: unknown[]) => error(...a),
  },
}))

const TELEGRAM_ID = 900000091

/**
 * The third step, where the audio arrives and the money moves. `videoUrl` is
 * what an earlier step left in the session, so leaving it out is the real
 * failure: the session lost it between two messages.
 */
function context(videoUrl?: string) {
  return {
    from: { id: TELEGRAM_ID, language_code: 'en' },
    chat: { id: TELEGRAM_ID, type: 'private' },
    botInfo: { username: 'test_bot' },
    session: {
      videoUrl,
      startTime: Date.now(),
      mode: 'lip_sync',
    },
    message: { text: 'https://example.test/voice.mp3' },
    telegram: {
      token: 'test-token',
      getFile: async () => ({ file_path: 'x' }),
    },
    reply: vi.fn(async () => undefined),
    scene: { leave: vi.fn(async () => undefined) },
    wizard: { next: vi.fn(), selectStep: vi.fn() },
  }
}

async function run(videoUrl?: string) {
  const ctx = context(videoUrl)
  const { lipSyncWizard } = await import('@/scenes/lipSyncWizard')
  const step = (
    lipSyncWizard as unknown as { steps: Array<(c: unknown) => unknown> }
  ).steps[2]
  await step(ctx)
  return ctx
}

/** Everything the person was shown, joined. */
const said = (ctx: { reply: { mock: { calls: unknown[][] } } }) =>
  ctx.reply.mock.calls.map(c => String(c[0])).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  getUserBalance.mockResolvedValue(10_000)
  updateUserBalance.mockResolvedValue(true)
})

describe('a lip-sync charge with nothing to generate from comes back', () => {
  it('credits back exactly what it charged', async () => {
    await run(undefined)

    const charge = updateUserBalance.mock.calls.find(
      c => c[2] === PaymentType.MONEY_OUTCOME
    )
    const refund = updateUserBalance.mock.calls.find(
      c => c[2] === PaymentType.MONEY_INCOME
    )
    expect(
      charge,
      'nothing was charged, so this test proves nothing'
    ).toBeTruthy()
    expect(
      refund,
      'the person was charged and never credited back'
    ).toBeTruthy()
    expect(refund?.[1], 'the refund is not the amount that was taken').toBe(
      charge?.[1]
    )
  })

  it('tells the person the money came back', async () => {
    const ctx = await run(undefined)
    expect(said(ctx)).toMatch(/refunded/i)
  })

  /*
   * THE FAILURE THIS GUARD EXISTS FOR. The credit answers `false` -- it does
   * not throw -- so a caller that ignores the result announces a refund that
   * never happened, and the money is gone with nobody looking for it.
   */
  it('does not claim a refund that the ledger refused', async () => {
    updateUserBalance.mockImplementation(async (...a: unknown[]) =>
      a[2] === PaymentType.MONEY_INCOME ? false : true
    )

    const ctx = await run(undefined)

    const shown = said(ctx)
    expect(shown, 'a refund that failed was announced as done').not.toMatch(
      /funds refunded/i
    )
    expect(shown, 'the person was not told to go anywhere').toMatch(
      /contact support/i
    )
  })

  it('leaves a searchable line when the refund fails', async () => {
    updateUserBalance.mockImplementation(async (...a: unknown[]) =>
      a[2] === PaymentType.MONEY_INCOME ? false : true
    )

    await run(undefined)

    const logged = error.mock.calls.map(c => String(c[0])).join('\n')
    expect(logged, 'a failed refund left no line of its own').toMatch(/REFUND/i)
  })

  /*
   * THE OTHER DIRECTION. With both halves in hand this branch must not fire --
   * a test that only watches the refund passes just as well against a wizard
   * that gives everything back.
   *
   * It is judged by the DESCRIPTION, not by the absence of a refund: with a
   * video in hand the step goes on to the generation, which cannot succeed
   * here, and refunds for its own reason. Asserting "no refund at all" would
   * have been asserting that the provider works in a unit test.
   */
  it('does not use this refund when it has what it needs', async () => {
    await run('https://example.test/clip.mp4')

    const missingUrls = updateUserBalance.mock.calls.find(
      c =>
        c[2] === PaymentType.MONEY_INCOME && /missing URLs/.test(String(c[3]))
    )
    expect(
      missingUrls,
      'a job with both halves was refunded as if empty'
    ).toBeFalsy()

    // ...and the money did come back under the reason that actually applied.
    const anyRefund = updateUserBalance.mock.calls.find(
      c => c[2] === PaymentType.MONEY_INCOME
    )
    expect(anyRefund?.[3]).toMatch(/generation error/)
  })
})
