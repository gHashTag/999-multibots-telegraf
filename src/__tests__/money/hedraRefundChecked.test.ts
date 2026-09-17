/**
 * A REFUND THAT FAILED MUST NOT PASS FOR ONE THAT HAPPENED.
 *
 * `hedra-render-wizard` charges, then discovers the person has no avatar voice,
 * and refunds. `updateUserBalance` returns false on a schema or insert failure,
 * or for a ghost payer with no users row -- it never throws. Discarding that
 * result left somebody charged for a render that was never started, with
 * nothing anywhere to say so.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read the wizard as TEXT and match
 * `const refunded = await updateUserBalance(` and `if (!refunded)` against the
 * source. That passes when the code merely LOOKS right, fails on a rename that
 * changes nothing, and -- as one of these guards proved on 2026-09-16 -- can sit
 * broken for days when code moves, because a test that reads a file is invisible
 * to `vitest related`.
 *
 * Now the step is RUN. The charge succeeds, the voice is missing, the refund
 * fails, and what this asserts is the only trace the design leaves: the line
 * written for reconciliation. The reply deliberately makes no refund claim, so
 * there is nothing user-facing to check -- and inventing one to make the test
 * prettier would be inventing behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateUserBalance = vi.fn()
const getUserBalance = vi.fn()
const getVoiceId = vi.fn()
const errors: Array<[string, unknown]> = []

/*
 * The wizard imports these from their own files, not from the barrel. Mocking
 * the barrel would leave the real ones in place and the test would run against
 * a live database -- passing or failing for reasons that have nothing to do
 * with refunds.
 */
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: (...a: unknown[]) => getUserBalance(...a),
}))

vi.mock('@/core/supabase/getVoiceId', () => ({
  getVoiceId: (...a: unknown[]) => getVoiceId(...a),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: (msg: string, meta?: unknown) => {
      errors.push([msg, meta])
    },
  },
}))

const TELEGRAM_ID = 900000042

/** Just enough context for the step that charges, looks for a voice, refunds. */
function ctxWith(text = 'второй текст') {
  return {
    from: { id: TELEGRAM_ID, language_code: 'ru' },
    botInfo: { username: 'test_bot' },
    message: { text },
    session: {
      aiReelsRender: { text: 'сценарий', step: 'intro2' },
    },
    telegram: { sendMessage: vi.fn() },
    reply: vi.fn(async () => undefined),
    scene: { leave: vi.fn(async () => 'left') },
    wizard: { next: vi.fn(), selectStep: vi.fn() },
  } as never
}

/** The step that holds the charge -> no voice -> refund path. */
async function runTheRefundStep(ctx: never) {
  const { hedraRenderWizard } = await import(
    '@/scenes/lipSyncWizard/hedra-render-wizard'
  )
  const steps = (
    hedraRenderWizard as unknown as { steps: Array<(c: never) => unknown> }
  ).steps
  // The step is found by running the one that reaches the refund, not by index:
  // an index is a spelling, and inserting a step above would silently move it.
  for (const step of steps) {
    errors.length = 0
    updateUserBalance.mockClear()
    try {
      await step(ctx)
    } catch {
      /* a step that needs state we did not build simply does not reach the seam */
    }
    if (updateUserBalance.mock.calls.length >= 2) return true
  }
  return false
}

beforeEach(() => {
  vi.clearAllMocks()
  errors.length = 0
  getUserBalance.mockResolvedValue(100_000)
  getVoiceId.mockResolvedValue(null) // nobody has an avatar voice here
})

describe('a failed refund on the no-voice path leaves a trace', () => {
  it('says the person was NOT refunded when the refund did not go through', async () => {
    // charge succeeds, refund fails -- the case that used to be silent
    updateUserBalance.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const reached = await runTheRefundStep(ctxWith())
    expect(reached, 'the refund seam was never reached').toBe(true)

    const complaint = errors.find(([m]) => /refund failed/i.test(m))
    expect(complaint, 'a failed refund was swallowed').toBeTruthy()
    expect(String(complaint?.[0])).toMatch(/NOT refunded/i)
  })

  /*
   * The other half, and the half that makes the first one mean something: when
   * the refund DOES go through, nothing is filed. A test that only checks the
   * unhappy path passes just as well against code that complains always.
   */
  it('says nothing when the refund went through', async () => {
    updateUserBalance.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const reached = await runTheRefundStep(ctxWith())
    expect(reached).toBe(true)

    expect(errors.find(([m]) => /refund failed/i.test(m))).toBeUndefined()
  })

  /*
   * And the money itself: the refund is asked for in the same amount that was
   * charged. A refund of the wrong size is worse than none -- it looks settled.
   */
  it('refunds exactly what it charged', async () => {
    updateUserBalance.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    await runTheRefundStep(ctxWith())

    const [charge, refund] = updateUserBalance.mock.calls
    expect(charge?.[1]).toBeGreaterThan(0)
    expect(refund?.[1]).toBe(charge?.[1])
  })
})
