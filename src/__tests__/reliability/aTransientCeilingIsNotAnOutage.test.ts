/**
 * A TRANSIENT PROVIDER CEILING IS NOT AN OUTAGE -- AND A SUSTAINED ONE IS.
 *
 * Production, 2026-09-16 09:30:26. A real person wrote to a business account
 * and the whole provider chain refused, the single reason being NVIDIA's
 *   ResourceExhausted: Worker local total request limit reached (16/16)
 * -- a CONCURRENCY ceiling that clears when any in-flight request of theirs
 * finishes. Nothing on the customer's path retried, so the turn was silently
 * downgraded from the agent (invoicing, image generation, CRM memory, balance)
 * to chatWithAI, which has no tools at all: a person asking to be invoiced got
 * a fluent, confident, useless answer and the CRM never saw the turn. It was
 * logged at `warn`, so nobody was told -- and `warn` was the ONLY level this
 * path could ever produce, which meant an agent down for an hour looked exactly
 * like one blip.
 *
 * This file drives the REAL `answerClient` and the REAL winston logger through
 * the REAL TelegramLogTransport, and asserts on what the owner's group would
 * actually have received. Nothing here reads source text.
 *
 * THE DEMOTION AND THE CONTROL THAT PAYS FOR IT. Exactly one thing gets
 * quieter: a first transient limit that the retry rescues drops from warn to
 * info, because the customer got the real agent and nothing happened. The
 * control is `a sustained outage pages exactly once at the threshold` below --
 * the same code path, two turns longer, must still ring the owner's phone. If
 * that test and the quiet-path test ever go green together with the threshold
 * branch deleted, this harness is lying.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** The line from the live deploy, verbatim, truncation and all. */
const NVIDIA_16 =
  'Ни один провайдер модели не ответил.\n' +
  '  • nemotron: Error: nemotron прислал ошибку в потоке: ' +
  '{"message":"ResourceExhausted: Worker local total request limit reached ' +
  '(16/16)","type":"internal_s'

/** Nothing a retry can conjure: the chain has no key at all. */
const NO_KEY =
  'Ключ модели не задан. Нужен GLM_API_KEY, NVIDIA_API_KEY или OLLAMA_BASE_URL.'

const logError = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    isReady: () => true,
    logError,
    initializeOnce: vi.fn(),
    log: vi.fn(),
  },
}))

/** Each test decides what the agent does on attempt 1, 2, ... */
let agentPlan: Array<() => Promise<{ текст?: string }>> = [] // cyrillic-ok: pre-existing field of the agent answer
let agentCalls = 0
const recorded: Array<{ id: string; surface?: string }> = []
vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async (
    // cyrillic-ok: pre-existing identifier
    _id: string,
    _text: string,
    _opts?: { surface?: string }
  ) => {
    const step = agentPlan[Math.min(agentCalls, agentPlan.length - 1)]
    agentCalls += 1
    return step()
  },
  recordTurns: async (id: string, _turns: unknown[], surface?: string) => {
    recorded.push({ id, surface })
    return 'recorded'
  },
}))

const chatWithAI = vi.fn(async () => 'the tool-less fallback answered')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))

const ingestChats = vi.fn(async () => ({
  people: 3,
  messages_new: 12,
  zep_mirrored: 12,
}))
const mirrorDm = vi.fn(async () => ({ ok: true, fresh: 0, zep: 0 }))
vi.mock('@/services/modelSwitch', () => ({
  ingestChats: (...a: unknown[]) => ingestChats(...(a as [])),
  mirrorDm: (...a: unknown[]) => mirrorDm(...(a as [])),
}))

/**
 * The retry's three-second pause is a production decision, not a thing to sit
 * through 2700 times in CI. The sleep is the only part of the path faked here;
 * the classifier, the attempt count, winston, the transport and the throttle
 * are all the real ones.
 */
vi.mock('@/helpers/delay', () => ({ delay: async () => undefined }))

/** Winston hands work to a transport through setImmediate; let it land. */
const settle = () => new Promise(r => setTimeout(r, 15))

/**
 * A fresh module graph per test: `answerClient`'s consecutive-failure streak and
 * the ingest guard are module state, and a test that inherited them from the
 * previous one would prove nothing.
 *
 * The transport's reference to the delivery service is primed by hand, exactly
 * as reliability/theLevelIsTheRoutingDecision.test.ts does it: in production the
 * constructor's lazy import() fills it, and under vitest that import never
 * settles, so records would park in `pendingLogs` and nothing observable would
 * happen.
 */
async function freshWorld() {
  vi.resetModules()
  logError.mockClear()
  chatWithAI.mockClear()
  ingestChats.mockClear()
  recorded.length = 0
  agentCalls = 0
  const { logger } = await import('@/utils/logger')
  const transport = (
    logger as unknown as { transports: any[] }
  ).transports.find(t => t.constructor.name === 'TelegramLogTransport')
  expect(
    transport,
    'TelegramLogTransport is no longer on the logger'
  ).toBeTruthy()
  transport.telegramLogService = { isReady: () => true, logError }
  transport.isInitialized = true
  const svc = await import('@/services/businessBotService')
  return { svc, transport }
}

/** Every alert text the owner's group would have received, in order. */
const pages = () => logError.mock.calls.map(c => String(c[0]?.error ?? ''))

beforeEach(() => {
  agentPlan = [async () => ({ текст: 'ok' })] // cyrillic-ok: pre-existing field
})

describe('the classifier', () => {
  it('reads the live 16/16 line as transient and a missing key as standing', async () => {
    const { svc } = await freshWorld()
    // If these two ever agree, the classifier is not classifying -- and the
    // most likely regression in this whole change is a pattern generous enough
    // to swallow a dead key into the "transient, just retry it" branch.
    expect(svc.classifyAgentFault(NVIDIA_16)).toBe('transient')
    expect(svc.classifyAgentFault(NO_KEY)).toBe('standing')
  })

  it('a failure nobody labelled is standing, never quietly debounced', async () => {
    const { svc } = await freshWorld()
    expect(svc.classifyAgentFault('x is not a function')).toBe('standing')
  })
})

describe('a transient ceiling costs the customer nothing', () => {
  it('retries once and the customer gets the AGENT, not the tool-less fallback', async () => {
    const { svc } = await freshWorld()
    agentPlan = [
      async () => {
        throw new Error(NVIDIA_16)
      },
      async () => ({ текст: 'Счёт: https://t.me/$inv-abc' }), // cyrillic-ok: pre-existing field
    ]
    const said = await svc.answerClient('435572800', 'выстави счёт', () =>
      chatWithAI()
    )

    expect(said).toContain('t.me/$inv-abc')
    expect(agentCalls, 'the turn must be attempted twice').toBe(2)
    expect(
      chatWithAI,
      'a model that cannot invoice must not answer a request to be invoiced'
    ).not.toHaveBeenCalled()
    await settle()
    expect(recorded[0]?.surface, 'the CRM must see the turn').toBe('business')
    expect(pages(), 'a rescued blip must not ring anybody').toEqual([])
  })

  it('a first unrescued limit is a warning, not a page', async () => {
    const { svc } = await freshWorld()
    agentPlan = [
      async () => {
        throw new Error(NVIDIA_16)
      },
    ]
    expect(
      await svc.answerClient('435572800', 'привет', () => chatWithAI())
    ).toBe('the tool-less fallback answered')
    await settle()
    expect(pages()).toEqual([])
  })
})

describe('what must stay loud', () => {
  it('a sustained outage pages exactly once, at the threshold', async () => {
    const { svc } = await freshWorld()
    agentPlan = [
      async () => {
        throw new Error(NVIDIA_16)
      },
    ]
    const turn = () =>
      svc.answerClient('435572800', 'привет', () => chatWithAI())

    for (let i = 1; i < svc.AGENT_FAILURES_BEFORE_PAGE; i++) {
      await turn()
      await settle()
      expect(
        pages(),
        `turn ${i} of a run is still one blip and must stay quiet`
      ).toEqual([])
    }

    await turn()
    await settle()
    // DO NOT SOFTEN THIS. If a later change raises the threshold or drops the
    // branch, the demotion above stops being paid for and this has to go red.
    expect(pages()).toHaveLength(1)
    expect(pages()[0]).toContain('[Business] agent unreachable')
    expect(svc.getAgentFailStreak()).toBe(svc.AGENT_FAILURES_BEFORE_PAGE)

    // One answered turn ends the incident, and the next failure is quiet again.
    agentPlan = [async () => ({ текст: 'back' })] // cyrillic-ok: pre-existing field
    await turn()
    expect(svc.getAgentFailStreak()).toBe(0)
    agentPlan = [
      async () => {
        throw new Error(NVIDIA_16)
      },
    ]
    await turn()
    await settle()
    expect(
      pages(),
      'a fresh blip after a recovery is not an outage'
    ).toHaveLength(1)
  })

  it('a standing fault pages on turn ONE, with no streak required', async () => {
    const { svc } = await freshWorld()
    agentPlan = [
      async () => {
        throw new Error(NO_KEY)
      },
    ]
    await svc.answerClient('435572800', 'привет', () => chatWithAI())
    await settle()
    expect(pages(), 'no retry conjures a key: tell the owner now').toHaveLength(
      1
    )
    expect(agentCalls, 'a standing fault must not be replayed').toBe(1)
  })

  it('the customer getting ZERO words still pages: "Failed to reply" survives', async () => {
    // The page this change was most likely to delete by accident. It fires when
    // the fallback ALSO fails, which is only possible because answerClient lets
    // the fallback's rejection propagate instead of swallowing it.
    const { svc } = await freshWorld()
    agentPlan = [
      async () => {
        throw new Error(NVIDIA_16)
      },
    ]
    chatWithAI.mockRejectedValueOnce(
      new Error('replicate refused too') as never
    )

    const CONN = 'conn-loud-1'
    svc.handleBusinessConnection({
      id: CONN,
      user: { id: 144022504, first_name: 'Owner' },
      user_chat_id: 999000111,
      date: 1,
      is_enabled: true,
      rights: { can_reply: true },
    } as any)
    const bot = {
      botInfo: { username: 'neuro_blogger_bot' },
      telegram: {
        sendMessage: vi.fn(async () => ({ message_id: 42 })),
        sendChatAction: vi.fn(async () => true),
        callApi: vi.fn(async () => ({})),
      },
    }
    await svc.handleBusinessMessage(
      {
        message_id: 41,
        date: 1757348157,
        chat: { id: 900000001, first_name: 'Pilot', type: 'private' },
        from: { id: 900000001, first_name: 'Pilot' },
        business_connection_id: CONN,
        text: 'привет',
      } as any,
      bot as any,
      'neuro_blogger_bot'
    )
    await settle()
    expect(pages().some(p => p.includes('Failed to reply'))).toBe(true)
  })
})

describe('the correspondence import marks success, not the attempt', () => {
  const connection = (id: string) =>
    ({
      id,
      user: { id: 144022504, first_name: 'Owner' },
      user_chat_id: 999000111,
      date: 1,
      is_enabled: true,
      rights: { can_reply: true },
    }) as any

  it('a failed import is retried on the next connection event, and the owner is told', async () => {
    const { svc } = await freshWorld()
    ingestChats.mockRejectedValueOnce(
      new Error('render did not answer in 170 s') as never
    )

    svc.handleBusinessConnection(connection('conn-ingest-1'))
    await settle()
    // The owner must hear about an import that did not happen: a CRM that
    // silently has no history is worse than one that visibly failed.
    expect(
      pages().some(p => p.includes('ingest on connect failed')),
      'a silent import failure is how an owner ends up with an empty CRM'
    ).toBe(true)

    svc.handleBusinessConnection(connection('conn-ingest-1'))
    await settle()
    expect(
      ingestChats,
      'the guard marked the ATTEMPT, so there was never a second chance'
    ).toHaveBeenCalledTimes(2)
  })

  it('a successful import is still done exactly once', async () => {
    const { svc } = await freshWorld()
    svc.handleBusinessConnection(connection('conn-ingest-2'))
    await settle()
    svc.handleBusinessConnection(connection('conn-ingest-2'))
    await settle()
    expect(ingestChats).toHaveBeenCalledTimes(1)
    expect(pages()).toEqual([])
  })
})
