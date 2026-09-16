/**
 * A REFUSED SELFIE IS NOT AN OUTAGE — AND IT WAS TWO PUSHES, NOT ONE.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so every
 * `logger.error` in this process is a push notification to the owner. Kie.ai
 * reports "the customer's own upload broke our rules" as successFlag 3, and the
 * webhook announced it twice: once as '[KIE.AI WEBHOOK] Content policy
 * violation' and again, through notifyJobCompletion, as '[KIE.AI WEBHOOK]
 * Generation failed'. The throttle in utils/alertThrottle.ts fingerprints on
 * the message TEXT, so those two titles can never collapse into one: every
 * stranger who sent a photo of a face woke the owner twice, with a verdict he
 * cannot appeal on a picture he has never seen.
 *
 * Three things must still shout, and each has a case below:
 *   - successFlag 2, which is the generation itself failing;
 *   - a flag-3 message that is actually OUR account with the provider
 *     ('Insufficient credits', 'Rate limit exceeded' -- both are in the
 *     translation map at the top of the route file, so both can arrive here);
 *   - the shared notifyJobCompletion sink for every other failure code.
 *
 * The second subject is what the surviving alerts CARRY. `payload` is not one
 * of the CONTENT_META_KEYS redacted in utils/logger.ts, and both callback
 * routes are mounted with no auth (api_server/index.ts), so an anonymous POST
 * could write text of its own choosing into the owner's Telegram group. The
 * missing-taskId alerts still page -- there is no signature on a Kie.ai
 * callback, so nothing can tell a scanner from a real provider whose format
 * changed -- but they now carry the shape and not the body.
 *
 * This drives the real handlers off the real router. Nothing is asserted about
 * the source text.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/video-task-store', () => ({
  videoTaskStore: {
    getTask: vi.fn(() => null),
    deleteTask: vi.fn(),
    addTask: vi.fn(),
    setTask: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => 'ru'),
  supabase: { from: vi.fn() },
}))

vi.mock('@/helpers/pulse', () => ({
  sendMediaToPulse: vi.fn(async () => true),
}))

vi.mock('@/core/lipsync/async-lipsync-manager', () => ({
  asyncLipSyncManager: { completeJobByTaskId: vi.fn(async () => false) },
}))

vi.mock('@/utils/callbackToken', () => ({
  verifyCallbackToken: vi.fn(() => false),
  buildCallbackToken: vi.fn(() => null),
}))

import { logger } from '@/utils/logger'
import { videoTaskStore } from '@/services/video-task-store'
import router, {
  setBotInstance,
} from '@/api_server/routes/kie-ai-webhook.routes'

/** The real handler express would call for a POST on this path. */
function handlerFor(path: string): (req: any, res: any) => Promise<void> {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.post
  )
  if (!layer) throw new Error(`POST ${path} is not mounted`)
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

const okRes = () => ({ status: () => ({ json: () => undefined }) })

/** The first argument of every call: the sentence the owner would read. */
const messages = (spy: unknown) =>
  (spy as Mock).mock.calls.map(c => String(c[0]))

/** Everything a level was handed, flattened, so a leaked value is findable. */
const everythingLogged = (spy: unknown) =>
  JSON.stringify((spy as Mock).mock.calls)

/** The webhook answers 202 and processes in the background; let it finish. */
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

const sendMessage = vi.fn(async () => ({ message_id: 1 }))
const editMessageText = vi.fn(async () => true)

/** A value no diagnosis needs and an attacker would love the owner to read. */
const PLANTED = 'ACCOUNT-LOCKED-CALL-555-0199'

/** A unique task id per case: the delivery claimers are process-wide. */
let seq = 0
const nextTaskId = () => `task-refusal-${Date.now()}-${seq++}`

const postKie = async (body: unknown) =>
  handlerFor('/kie-ai/callback')({ body, headers: {}, query: {} }, okRes())

const postSora = async (body: unknown) =>
  handlerFor('/kie-ai/sora-callback')({ body, headers: {}, query: {} }, okRes())

describe('Kie.ai webhooks: a content refusal (real handlers)', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear()
    vi.mocked(logger.warn).mockClear()
    vi.mocked(logger.info).mockClear()
    vi.mocked(videoTaskStore.getTask).mockReturnValue(null as any)
    sendMessage.mockClear()
    editMessageText.mockClear()
    setBotInstance({ telegram: { sendMessage, editMessageText } } as any)
  })

  it('does not page the owner when the provider refuses the customer content', async () => {
    await postKie({
      taskId: nextTaskId(),
      successFlag: 3,
      errorMessage: 'This image contains photorealistic people.',
    })
    await settle()

    expect(
      messages(logger.error),
      'a content refusal reached the owner alert group'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '🚫 [KIE.AI WEBHOOK] Content policy violation'
    )
  })

  it('does not let notifyJobCompletion re-announce the same refusal', async () => {
    const taskId = nextTaskId()
    vi.mocked(videoTaskStore.getTask).mockReturnValue({
      telegramId: '424242',
      chatId: 424242,
      messageId: 7,
      botName: undefined,
      prompt: 'a cat',
      modelId: 'veed-fabric',
    } as any)

    await postKie({
      taskId,
      successFlag: 3,
      errorMessage: 'Image contains faces.',
    })
    await settle()

    // The second title is the one the throttle could never merge with the first.
    expect(
      messages(logger.error),
      'the shared failure sink paged a second time for the same refusal'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [KIE.AI WEBHOOK] Generation failed'
    )
    // The customer is still told, in their own language.
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('STILL pages when the flag-3 message is OUR account with the provider', async () => {
    for (const errorMessage of [
      'Insufficient credits',
      'Rate limit exceeded',
      'Daily quota reached',
    ]) {
      vi.mocked(logger.error).mockClear()

      await postKie({ taskId: nextTaskId(), successFlag: 3, errorMessage })
      await settle()

      expect(
        messages(logger.error),
        `"${errorMessage}" stopped waking the owner`
      ).toContain('🚫 [KIE.AI WEBHOOK] Content policy violation')
    }
  })

  it('STILL pages when the generation itself failed (successFlag 2)', async () => {
    await postKie({
      taskId: nextTaskId(),
      successFlag: 2,
      errorMessage: 'Generation timeout',
    })
    await settle()

    expect(messages(logger.error)).toContain(
      '❌ [KIE.AI WEBHOOK] Video generation failed'
    )
  })

  it('STILL pages through the shared sink for any other failure code', async () => {
    vi.mocked(videoTaskStore.getTask).mockReturnValue({
      telegramId: '424242',
      chatId: 424242,
      messageId: 7,
      botName: undefined,
    } as any)

    await postKie({
      taskId: nextTaskId(),
      successFlag: 2,
      errorMessage: 'Model not found',
    })
    await settle()

    expect(
      messages(logger.error),
      'the discriminator at the sink swallowed a real failure'
    ).toContain('❌ [KIE.AI WEBHOOK] Generation failed')
  })

  it('does not page on a Sora content refusal either', async () => {
    await postSora({
      taskId: nextTaskId(),
      successFlag: 3,
      errorMessage:
        'We currently do not support uploads of images containing photorealistic people.',
    })
    await settle()

    expect(messages(logger.error)).toEqual([])
    expect(messages(logger.warn)).toContain(
      '🚫 [SORA WEBHOOK] Sora content policy violation'
    )
  })

  it('STILL pages on a Sora flag-3 that is our account', async () => {
    await postSora({
      taskId: nextTaskId(),
      successFlag: 3,
      errorMessage: 'Rate limit exceeded',
    })
    await settle()

    expect(messages(logger.error)).toContain(
      '🚫 [SORA WEBHOOK] Sora content policy violation'
    )
  })
})

describe('Kie.ai webhooks: an unparsable body (real handlers)', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear()
    vi.mocked(logger.warn).mockClear()
  })

  it('still pages on a missing taskId, because nothing here can tell a scanner from the provider', async () => {
    await postKie({ note: PLANTED })
    await settle()

    expect(messages(logger.error)).toContain(
      '❌ [KIE.AI WEBHOOK] Missing taskId'
    )
  })

  it('but never echoes the body into the alert', async () => {
    await postKie({ note: PLANTED })
    await settle()

    expect(
      everythingLogged(logger.error),
      'an anonymous POST chose the text in the owner Telegram group'
    ).not.toContain(PLANTED)
    // The shape is what an operator actually needs.
    expect(everythingLogged(logger.error)).toContain('note')
  })

  it('and the Sora twin behaves the same way', async () => {
    await postSora({ note: PLANTED })
    await settle()

    expect(messages(logger.error)).toContain('❌ [SORA WEBHOOK] Missing taskId')
    expect(everythingLogged(logger.error)).not.toContain(PLANTED)
    expect(everythingLogged(logger.error)).toContain('note')
  })
})
