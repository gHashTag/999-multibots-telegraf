/**
 * A SECOND TAP MUST NOT BUY A SECOND VIDEO ON ONE BALANCE.
 *
 * Step 3 of the video wizards checks the balance and then calls the direct
 * handler, which is what actually charges. Between the check and the charge
 * there is an await, and Telegram will happily deliver a second message into
 * that window -- a double tap, a re-sent update, an impatient person. Both
 * passed the gate, both generated, one balance paid for two videos.
 *
 * The guard is the sibling's: reject-before-set, set synchronously, release in
 * a `finally`. Each of those three words is load-bearing, and the test below
 * fails if any one of them is dropped.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read both wizards as TEXT and check
 * four spellings per file: `ctx.session.<flag> = true` appearing BEFORE the
 * handler's name in the source, an `if (ctx.session.<flag>)` somewhere, and a
 * `finally` within eighty characters of the release. Source ORDER is not
 * execution order -- a flag set in a branch that never runs passes that check --
 * and any rename or reshuffle fails it while the race stays closed.
 *
 * Now the step is RUN TWICE CONCURRENTLY, with the charging handler held open
 * in between, and what is asserted is what happened: one generation, one
 * refusal, and a flag that is free again afterwards -- including when the first
 * attempt throws.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const handleTextToVideoDirect = vi.fn()

vi.mock('@/handlers/handleTextToVideoDirect', () => ({
  handleTextToVideoDirect: (...a: unknown[]) => handleTextToVideoDirect(...a),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

const TELEGRAM_ID = 900000131

/**
 * One person, one session -- which is the point: the two taps below share it,
 * exactly as two updates from the same chat do in production.
 */
function person() {
  return {
    from: { id: TELEGRAM_ID, language_code: 'en' },
    chat: { id: TELEGRAM_ID, type: 'private' },
    botInfo: { username: 'test_bot' },
    session: {
      selectedVideoModel: 'veo3_fast',
      selectedAspectRatio: '16:9',
      selectedVideoCost: 25,
      selectedDuration: 5,
    },
    message: { text: 'a lighthouse in a storm, cinematic' },
    reply: vi.fn(async () => undefined),
    scene: { leave: vi.fn(async () => undefined) },
    wizard: { next: vi.fn(), selectStep: vi.fn() },
  }
}

/*
 * THE WIZARD IS LOADED BEFORE THE RACE, NOT INSIDE IT.
 *
 * Importing it inside `step` put a two-and-a-half second module load in front
 * of the first tap, so the second tap reached the guard first and the whole
 * measurement was of vitest's loader rather than of the code. The call even
 * landed during the NEXT test and made that one count three generations.
 */
let steps: Array<(c: unknown) => unknown>

beforeAll(async () => {
  const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
  steps = (
    textToVideoWizard as unknown as { steps: Array<(c: unknown) => unknown> }
  ).steps
})

/** Step 3: the one that charges. */
function step(ctx: unknown) {
  return steps[2](ctx)
}

const said = (ctx: { reply: { mock: { calls: unknown[][] } } }) =>
  ctx.reply.mock.calls.map(c => String(c[0])).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  handleTextToVideoDirect.mockResolvedValue(undefined)
})

describe('a second tap does not buy a second video', () => {
  it('generates once when two taps arrive together', async () => {
    /*
     * The handler is HELD OPEN, which is the whole race: in production it is
     * open for the length of a video generation, and the second update lands
     * inside that window. A test that awaited the first call before sending the
     * second would prove nothing -- there would be no race left to lose.
     */
    const holds: Array<() => void> = []
    handleTextToVideoDirect.mockImplementation(
      () => new Promise<void>(resolve => holds.push(() => resolve()))
    )

    const ctx = person()
    const first = step(ctx)
    await Promise.resolve()
    const second = step(ctx)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(
      handleTextToVideoDirect,
      'both taps reached the charging handler -- one balance, two videos'
    ).toHaveBeenCalledTimes(1)
    expect(said(ctx), 'the second tap was ignored in silence').toMatch(
      /already generating|wait/i
    )

    /*
     * Everything held is released before the test ends, including whatever a
     * BROKEN guard let through. Holding one resolver in a single variable made
     * the planted defect fail as a thirty-second timeout instead of as the
     * assertion above -- a proof nobody can read.
     */
    for (const hold of holds) hold()
    await Promise.all([first, second])
  })

  /*
   * AND THE DOOR OPENS AGAIN. A guard that never releases turns one tap into a
   * permanently broken wizard -- the failure this repository has already had
   * with a stuck in-flight key (marketplace, #purchasesInFlight).
   */
  it('lets the next generation through once the first is done', async () => {
    const ctx = person()
    await step(ctx)
    await step(ctx)

    expect(handleTextToVideoDirect).toHaveBeenCalledTimes(2)
  })

  /*
   * INCLUDING WHEN IT FAILS. Without the `finally`, a generation that throws
   * leaves the flag set, and the person can never start another one.
   */
  it('releases the flag when the generation throws', async () => {
    handleTextToVideoDirect.mockRejectedValueOnce(new Error('provider is down'))

    const ctx = person()
    await step(ctx)
    expect(
      (ctx.session as Record<string, unknown>).textToVideoInProgress,
      'the wizard is stuck: the flag survived a failure'
    ).toBeFalsy()

    handleTextToVideoDirect.mockResolvedValue(undefined)
    await step(ctx)
    expect(handleTextToVideoDirect).toHaveBeenCalledTimes(2)
  })

  /*
   * THE FLAG BELONGS TO THE PERSON, NOT TO THE PROCESS. Two different people
   * generating at the same time is ordinary use, and a guard that confused them
   * would look exactly like this one while denying half the customers.
   */
  it('does not block a different person', async () => {
    /*
     * One resolver PER CALL, not one variable. A single `release` holds only
     * the last promise created, so the first person's generation never
     * finished and the test hung for thirty seconds -- a failure of the
     * fixture that reads exactly like a deadlock in the code.
     */
    const holds: Array<() => void> = []
    handleTextToVideoDirect.mockImplementation(
      () => new Promise<void>(resolve => holds.push(() => resolve()))
    )

    const mine = person()
    const theirs = person()
    theirs.from.id = TELEGRAM_ID + 1

    const first = step(mine)
    const second = step(theirs)
    // Both steps have several awaits before the charging handler (the replies
    // they send first), so the assertion waits for the event loop rather than
    // for a fixed number of microtasks -- counting ticks is how a test like
    // this ends up asserting "nothing has happened yet".
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(
      handleTextToVideoDirect,
      'a second person was refused because somebody else was generating'
    ).toHaveBeenCalledTimes(2)

    for (const hold of holds) hold()
    await Promise.all([first, second])
  })
})
