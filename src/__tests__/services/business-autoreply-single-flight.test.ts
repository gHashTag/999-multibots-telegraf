/**
 * ONE PAID TURN PER CHAT AT A TIME -- AND A BURST IS ANSWERED, NOT DROPPED.
 *
 * This file used to hold a structural test of `businessReplyInFlight`, a Set
 * keyed by the chat id: while a reply was being generated, every further
 * message from that chat was DROPPED. It kept one sender from spawning many
 * concurrent paid predictions by throwing their messages away -- measured in
 * production, 9 drops per 47 replies, each one a message that arrived in the
 * same getUpdates batch as its sibling (an album, or a burst that piled up
 * while the polling loop sat inside the previous turn).
 *
 * The invariant moved into the agent lanes and is now tested by BEHAVIOUR,
 * through the real `createBusinessMiddleware`, with Telegraf's own way of
 * handling one batch (every update of it at once):
 *
 *   - the middleware ACCEPTS: each call resolves with the clock standing still
 *     (no timer, no agent answer awaited) while the agent is still thinking;
 *   - three messages in one batch are ONE agent call with all three texts, in
 *     order, and all three reach the memory mirror;
 *   - never two agent calls in flight for one chat: a message that arrives
 *     during the turn waits and becomes the next turn;
 *   - the key carries the connection: two sellers with the same client do not
 *     hold each other up.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'

interface Ask {
  chatId: string
  text: string
  answer: (text: string) => void
}
const asks: Ask[] = []
let inFlight = 0
let maxInFlight = 0

vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: (chatId: string, text: string) =>
    new Promise(resolve => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      let answered = false
      asks.push({
        chatId,
        text,
        answer: t => {
          if (answered) return
          answered = true
          inFlight -= 1
          resolve({ текст: t }) // cyrillic-ok: pre-existing field
        },
      })
    }),
  recordTurns: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
  markSurface: (content: string) => content,
}))
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'fallback, never expected here'),
}))
const mirrored: Array<{
  lead: string
  messages: Array<{ msg_id: number; out: boolean; text: string }>
}> = []
vi.mock('@/services/modelSwitch', () => ({
  mirrorDm: vi.fn(
    async (_owner: string, lead: string, _name: string, messages: any[]) => {
      mirrored.push({ lead, messages })
      return { ok: true }
    }
  ),
  ingestChats: vi.fn(async () => ({})),
}))

const OWNER = 900000001
const CLIENT = 900000011

const connection = (id: string, owner = OWNER) => ({
  id,
  user: { id: owner, first_name: 'Owner' },
  user_chat_id: owner,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})

let nextMessageId = 100
const dm = (connId: string, text: string, chatId = CLIENT) => ({
  message_id: ++nextMessageId,
  date: Math.floor(Date.now() / 1000),
  chat: { id: chatId, first_name: 'Client', type: 'private' },
  from: { id: chatId, first_name: 'Client' },
  text,
  business_connection_id: connId,
})

/*
 * THE CLOCK IS VIRTUAL.
 *
 * The lanes hold a burst for a 1500 ms quiet window before the agent is asked.
 * On real timers this file used to (a) assert that each middleware call took
 * under 100 ms of wall time, (b) sleep 2 s of real time to prove the next turn
 * does not start early, and (c) leave a failed test's burst queued in its lane
 * with a live 1500 ms timer, which then fired into the NEXT test and added a
 * second ask there. Under the pre-push gate's parallel load all three broke:
 * "expected 293 to be less than 100", then "expected length 1 but got 2".
 *
 * Now setTimeout and Date are faked right after the fresh import, every wait
 * is an explicit advance of the fake clock, and afterEach answers whatever the
 * test left open and drains the lanes of THAT module instance.
 */
let current: (typeof import('@/services/agentLanes'))['agentLanes'] | null =
  null

async function service() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  const { agentLanes } = await import('@/services/agentLanes')
  current = agentLanes
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
    ],
  })
  return { svc, agentLanes }
}

/** Drain the lanes, letting up to `ms` of virtual time pass for it. */
async function drain(
  lanes: (typeof import('@/services/agentLanes'))['agentLanes'],
  ms = 5000
) {
  const done = lanes.drain(ms)
  await vi.advanceTimersByTimeAsync(ms)
  return done
}

/** A bot that records what it sends, with the business middleware captured. */
function fakeBot(svc: typeof import('@/services/businessBotService')) {
  let middleware: (
    ctx: any,
    next: () => Promise<void>
  ) => Promise<void> = async () => {}
  let sent = 0
  const sendMessage = vi.fn(async () => ({ message_id: 5000 + ++sent }))
  const sendChatAction = vi.fn(async () => true)
  const callApi = vi.fn(async (method: string) => {
    throw new Error(`unexpected api call ${method}`)
  })
  const bot = {
    botInfo: { username: 'probe_bot' },
    telegram: { sendMessage, sendChatAction, callApi },
    use: (fn: typeof middleware) => {
      middleware = fn
    },
  }
  svc.createBusinessMiddleware(bot as any)
  /** One getUpdates batch, handled the way Telegraf's polling loop does it. */
  const batch = (...messages: unknown[]) =>
    Promise.all(
      messages.map(async m => {
        const t0 = Date.now()
        await middleware({ update: { business_message: m } }, async () => {})
        return Date.now() - t0
      })
    )
  const toClient = () =>
    sendMessage.mock.calls.filter(
      (c: any[]) => c[2] && c[2].business_connection_id
    )
  return { bot, batch, toClient, sendMessage }
}

// The business service drags in a large module graph. Importing it once here
// pays its cold transform under an explicit budget (the per-test vi.resetModules
// re-evaluates but reuses the transform), so no single test carries that cost
// against the 30s per-test limit when the machine is loaded.
beforeAll(async () => {
  await import('@/services/businessBotService')
}, 180_000)

afterEach(async () => {
  // Whatever a test left open (it failed half-way) is closed in the module
  // instance it belongs to, so it cannot fire into the next test.
  for (const a of asks) a.answer('cleanup')
  if (current) await drain(current)
  current = null
  vi.useRealTimers()
})

beforeEach(() => {
  asks.length = 0
  mirrored.length = 0
  inFlight = 0
  maxInFlight = 0
})

describe('a burst in one batch is one turn', () => {
  it('three messages: the middleware returns at once, the agent is asked ONCE with all three in order, all three are mirrored', async () => {
    const { svc, agentLanes } = await service()
    svc.handleBusinessConnection(connection('conn-a') as any)
    const { batch, toClient } = fakeBot(svc)

    const burst = [
      dm('conn-a', 'Здравствуйте'),
      dm('conn-a', 'хочу рилс'),
      dm('conn-a', 'сколько стоит?'),
    ]
    const took = await batch(...burst)
    // Accepted, not answered: nothing waits for the agent. The fake clock does
    // not move unless the test moves it, so a middleware that awaited the quiet
    // window or the agent would never resolve here; zero virtual ms elapsed.
    expect(took).toEqual([0, 0, 0])
    expect(asks).toHaveLength(0)

    // Just short of the quiet window: still nobody asked.
    await vi.advanceTimersByTimeAsync(1499)
    expect(asks).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 5000 })
    expect(asks[0].chatId).toBe(String(CLIENT))
    expect(asks[0].text).toBe('Здравствуйте\nхочу рилс\nсколько стоит?')

    asks[0].answer('Рилс — 2 токена. Сделать?')
    expect((await drain(agentLanes)).unfinished).toEqual([])

    expect(toClient()).toHaveLength(1)
    expect(toClient()[0][1]).toBe('Рилс — 2 токена. Сделать?')
    await vi.waitFor(() => expect(mirrored).toHaveLength(1))
    const inbound = mirrored[0].messages.filter(m => !m.out)
    expect(inbound.map(m => m.msg_id)).toEqual(burst.map(m => m.message_id))
    expect(mirrored[0].messages.filter(m => m.out)).toHaveLength(1)
    expect(svc.getBusinessStats()).toMatchObject({
      todayMessages: 1,
      todayMerged: 2,
    })
  })

  it('a message during the turn waits for it, then is its own turn: never two agent calls for one chat', async () => {
    const { svc, agentLanes } = await service()
    svc.handleBusinessConnection(connection('conn-a') as any)
    const { batch, toClient } = fakeBot(svc)

    await batch(dm('conn-a', 'first'))
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 5000 })

    const took = await batch(dm('conn-a', 'second'), dm('conn-a', 'third'))
    expect(took).toEqual([0, 0])
    // Well past the quiet window: the second turn must still not start.
    await vi.advanceTimersByTimeAsync(2000)
    expect(asks).toHaveLength(1)

    asks[0].answer('answer one')
    await vi.waitFor(() => expect(asks).toHaveLength(2), { timeout: 5000 })
    expect(asks[1].text).toBe('second\nthird')
    asks[1].answer('answer two')
    expect((await drain(agentLanes)).unfinished).toEqual([])

    expect(maxInFlight).toBe(1)
    expect(toClient().map((c: any[]) => c[1])).toEqual([
      'answer one',
      'answer two',
    ])
  })

  it('the key carries the connection: two sellers with one client are answered side by side', async () => {
    const { svc, agentLanes } = await service()
    svc.handleBusinessConnection(connection('conn-a', OWNER) as any)
    svc.handleBusinessConnection(connection('conn-b', 900000002) as any)
    const { batch, toClient } = fakeBot(svc)

    await batch(dm('conn-a', 'to seller A'), dm('conn-b', 'to seller B'))
    // Both turns are in flight at once: neither chat waits for the other.
    await vi.waitFor(() => expect(asks).toHaveLength(2), { timeout: 5000 })
    expect(asks.map(a => a.text).sort()).toEqual(['to seller A', 'to seller B'])
    for (const a of asks) a.answer(`re: ${a.text}`)
    expect((await drain(agentLanes)).unfinished).toEqual([])
    expect(toClient()).toHaveLength(2)
  })
})

describe('the merged text', () => {
  it('is the messages in order, one per line, and says so when it is cut', async () => {
    const { svc } = await service()
    expect(svc.mergeBurstTexts(['a', 'b', 'c'])).toBe('a\nb\nc')
    const long = svc.mergeBurstTexts(['x'.repeat(4000), 'y'.repeat(4000)])
    expect(long.startsWith('x'.repeat(4000) + '\n' + 'y'.repeat(1999))).toBe(
      true
    )
    expect(long.length).toBeLessThan(svc.BURST_TEXT_CAP + 200)
    expect(long).toContain('[cut: the client sent 8001 characters')
  })
})
