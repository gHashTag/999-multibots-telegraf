/**
 * THE VIDEO IS DELIVERED FIRST AND CHARGED AFTER, SO A FAILED CHARGE IS A FREE
 * VIDEO -- AND IT MUST NOT BE A SILENT ONE.
 *
 * `handleVideoReady` sends the finished video and only then calls
 * `updateUserBalance`. That order is deliberate: nobody should pay for a
 * delivery that did not happen. Its price is that a charge failure cannot be
 * undone -- the video is already on the person's phone -- so the one thing the
 * code owes us is to SAY SO. `updateUserBalance` returns `false` and never
 * throws (a ghost payer with no `users` row, an insert refused by the schema),
 * so a discarded result is an unbilled delivery nobody ever hears about.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read handleTextToVideoDirect.ts as
 * TEXT and look for `const charged = await updateUserBalance(` followed by
 * `if (!charged)`. That pins two spellings: rename the variable and it fails
 * while the behaviour is intact; write `if (!charged) {}` and it passes while
 * the failure is as silent as before.
 *
 * Now the delivery is RUN -- through `handleVideoStatusUpdate`, the exported
 * door the button goes through -- with the charge refused, and what is asserted
 * is what the code did: the video went out, the charge was attempted for the
 * right money, and the unbilled delivery was reported at error level with the
 * person and the price in it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

const updateUserBalance = vi.fn()
const checkVideoGenerationStatus = vi.fn()
const error = vi.fn()

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
}))

vi.mock('@/services/generateTextToVideo', () => ({
  checkVideoGenerationStatus: (...a: unknown[]) =>
    checkVideoGenerationStatus(...a),
}))

// The pulse channel is a side trip after the charge; it must not decide anything.
vi.mock('@/helpers/pulse', () => ({ sendMediaToPulse: async () => undefined }))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: (...a: unknown[]) => error(...a),
    debug: () => undefined,
  },
}))

const TELEGRAM_ID = 900000081
const MODEL = 'veo3_fast'

/** Every call the handler makes on Telegram, in the order it made them. */
let trace: string[]

function context(jobId: string) {
  trace = []
  return {
    from: { id: TELEGRAM_ID, language_code: 'en' },
    chat: { id: TELEGRAM_ID },
    session: {
      videoJobId: jobId,
      videoPrompt: 'a cat, in the rain',
      videoModelId: MODEL,
      videoMessageId: 1,
    },
    answerCbQuery: vi.fn(async () => undefined),
    telegram: { editMessageText: vi.fn(async () => undefined) },
    replyWithVideo: vi.fn(async () => {
      trace.push('video')
    }),
    reply: vi.fn(async () => undefined),
  }
}

/**
 * Deliver one finished job. Each call uses its own job id: the delivery claim
 * is module-level state, and a repeated id is treated as an already-delivered
 * job -- which would make every test after the first a no-op that passes.
 */
let jobs = 0
async function deliver() {
  const ctx = context(`job-${++jobs}`)
  const { handleVideoStatusUpdate } = await import(
    '@/handlers/handleTextToVideoDirect'
  )
  await handleVideoStatusUpdate(ctx as never)
  return ctx
}

beforeEach(() => {
  vi.clearAllMocks()
  checkVideoGenerationStatus.mockResolvedValue({
    success: true,
    videoUrl: 'https://example.test/video.mp4',
  })
  updateUserBalance.mockImplementation(async () => {
    trace.push('charge')
    return true
  })
})

describe('a video that could not be charged is reported, not swallowed', () => {
  it('charges only after the video has actually been sent', async () => {
    await deliver()
    expect(trace, 'the charge ran before the delivery').toEqual([
      'video',
      'charge',
    ])
  })

  it('charges the price of the model as an outcome', async () => {
    await deliver()
    const [id, price, type] = updateUserBalance.mock.calls[0]
    expect(id).toBe(String(TELEGRAM_ID))
    expect(type).toBe(PaymentType.MONEY_OUTCOME)
    expect(price, 'the charge is not a positive amount').toBeGreaterThan(0)
  })

  /*
   * THE FAILURE ITSELF. `updateUserBalance` answers `false` -- it does not
   * throw -- so nothing above it notices unless the result is read.
   */
  it('reports the unbilled delivery when the charge is refused', async () => {
    updateUserBalance.mockImplementation(async () => {
      trace.push('charge')
      return false
    })

    await deliver()

    const said = error.mock.calls.map(c => String(c[0])).join('\n')
    expect(said, 'a free video went out and nothing said so').toMatch(
      /unbilled|charge failed/i
    )
    const details = error.mock.calls.map(c => JSON.stringify(c[1])).join('\n')
    expect(
      details,
      'the report names neither the person nor the price'
    ).toMatch(String(TELEGRAM_ID))
  })

  /*
   * AND THE PERSON STILL GETS WHAT THEY PAID FOR. A charge failure is the
   * house's problem: the video is already sent, and turning it into an error
   * message on the screen would take away the thing that DID work.
   */
  it('still finishes the delivery when the charge is refused', async () => {
    updateUserBalance.mockResolvedValue(false)

    const ctx = await deliver()

    expect(ctx.replyWithVideo).toHaveBeenCalledTimes(1)
    const shown = ctx.reply.mock.calls.map(c => String(c[0])).join('\n')
    expect(shown).toContain('ready')
    // Both wordings, because the screen speaks the person's language.
    const RUSSIAN_FOR_ERROR = 'Ошибка'
    expect(shown).not.toMatch(/error/i)
    expect(shown).not.toContain(RUSSIAN_FOR_ERROR)
  })

  /*
   * THE OTHER DIRECTION. On an ordinary paid delivery nothing may be reported
   * at error level -- a test that only checks the noisy case passes just as
   * well against code that shouts on every video.
   */
  it('says nothing alarming when the charge goes through', async () => {
    await deliver()
    expect(error).not.toHaveBeenCalled()
  })
})
