import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

/**
 * THE TURN THAT CREATES A DRAFT IS THE TURN THAT ACCOUNTS FOR IT.
 *
 * The one-time secret that authorises a send leaves through exactly one door:
 * the answer to the request that caused the proposal. If that answer does not
 * carry it, the draft sits in the queue unconfirmable -- and, worse, unissued,
 * so the NEXT turn would hand out a card for a message prepared during a
 * conversation the person has moved on from.
 *
 * A tool can succeed and the turn still fail afterwards: the model errors, the
 * provider drops the connection. The draft exists either way. So the handover
 * lives outside the try, and these checks are what say so.
 *
 * Driven through the REAL `handleAgentChat` with `runAgent` faked, because the
 * property under test is where the write happens relative to the error -- and
 * that is precisely what a reimplementation in a test would get right by
 * accident.
 */

const OWNER = '144022504'

const yields: unknown[] = []
let throwAt: number | null = null
/** Set when the fake tool should file a draft, as a real tg_send would. */
let filesDraft = false

/*
 * The fake agent files the draft THROUGH ITS OWN ToolContext, the way the real
 * tool does. Calling `remember` from the test body instead would create a
 * draft belonging to no turn -- and the whole point of the change under test
 * is that such a draft is never handed to anybody.
 */
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (
    _history: unknown,
    ctx: { telegramId: string; turn?: string }
  ) {
    if (filesDraft) {
      const { remember } = await import('./src/agent/tg-proposals')
      remember({
        id: 'abc123456789',
        telegramId: ctx.telegramId,
        action: 'send',
        target: '@ivan',
        what: 'привет',
        turn: ctx.turn,
      })
    }
    for (let i = 0; i < yields.length; i++) {
      if (throwAt === i) throw new Error('провайдер упал на витке')
      yield yields[i]
    }
    if (throwAt === yields.length) throw new Error('упал в самом конце')
  },
}))

function request() {
  const s = Readable.from([
    JSON.stringify({ messages: [{ role: 'user', content: 'напиши Ивану' }] }),
  ]) as unknown as {
    headers: Record<string, string>
    method: string
    url: string
  }
  s.headers = { 'content-type': 'application/json' }
  s.method = 'POST'
  s.url = '/api/agent/chat'
  return s
}

function response() {
  const written: string[] = []
  return {
    written,
    writeHead: () => undefined,
    write: (c: string) => {
      written.push(c)
      return true
    },
    end: () => undefined,
  }
}

/** A pool that answers everything with nothing -- history is not under test. */
const pool = { query: async () => ({ rows: [] }) }

function eventsOf(res: { written: string[] }) {
  return res.written
    .join('')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>
      } catch {
        return { unparsed: l }
      }
    })
}

beforeEach(() => {
  vi.resetModules()
  yields.length = 0
  throwAt = null
  filesDraft = true
})

async function run() {
  const { forgetProposals } = await import('./src/agent/tg-proposals')
  forgetProposals()
  const { handleAgentChat } = await import('./src/agent/routes')
  const res = response()
  await handleAgentChat(
    request() as never,
    res as never,
    OWNER,
    async () => pool
  )
  return { res, mod: await import('./src/agent/tg-proposals') }
}

describe('the answer carries the draft and its secret', () => {
  it('on the ordinary path', async () => {
    yields.push({ ['тип']: 'текст', ['текст']: 'Подготовил письмо.' })
    const { res } = await run()
    const draft = eventsOf(res).find(e => e['тип'] === 'proposal')
    expect(draft, 'ответ не отдал черновик').toBeTruthy()
    const p = draft!.proposal as { secret?: string; id?: string }
    expect(p.secret).toMatch(/^[0-9a-f]{32}$/)
    expect(p.id).toBe('abc123456789')
  })

  it('and when the turn FAILS after the tool ran', async () => {
    /*
     * The case this test exists for. `tg_send` files the draft, then the model
     * errors on the next hop. Written inside the try, the handover is skipped:
     * the person sees an error, no card, and a draft that will surface later
     * attached to some unrelated answer.
     */
    yields.push({ ['тип']: 'инструмент', ['имя']: 'tg_send' })
    throwAt = 1
    const { res } = await run()
    const events = eventsOf(res)
    expect(
      events.some(e => e['тип'] === 'ошибка'),
      'ошибка не доехала до человека'
    ).toBe(true)
    const draft = events.find(e => e['тип'] === 'proposal')
    expect(
      draft,
      'упавший ход не отдал черновик — карточка всплывёт позже'
    ).toBeTruthy()
  })

  it('and the draft is marked issued either way, so no later turn repeats it', async () => {
    /*
     * Asserted by running a SECOND turn, not by calling issueFor with a token
     * the test invented. The first version did the latter: it got null because
     * the token did not match, which is true of every draft ever made and says
     * nothing about whether this one was already handed over.
     */
    yields.push({ ['тип']: 'инструмент', ['имя']: 'tg_send' })
    throwAt = 1
    const first = await run()
    expect(
      eventsOf(first.res).some(e => e['тип'] === 'proposal'),
      'упавший ход не отдал черновик'
    ).toBe(true)

    // A later, ordinary turn for the same person. The draft is still in the
    // queue -- it must not surface again under an unrelated answer.
    yields.length = 0
    throwAt = null
    filesDraft = false
    yields.push({ ['тип']: 'текст', ['текст']: 'Спасибо, понял.' })
    const { handleAgentChat } = await import('./src/agent/routes')
    const res = response()
    await handleAgentChat(
      request() as never,
      res as never,
      OWNER,
      async () => pool
    )
    expect(
      eventsOf(res).some(e => e['тип'] === 'proposal'),
      'черновик выдан второй раз — будет вторая карточка'
    ).toBe(false)
  })

  it('no draft, no event -- an ordinary answer stays ordinary', async () => {
    filesDraft = false
    yields.push({ ['тип']: 'текст', ['текст']: 'Ваш баланс 120 звёзд.' })
    const { res } = await run()
    expect(eventsOf(res).some(e => e['тип'] === 'proposal')).toBe(false)
  })

  it('ANOTHER REQUEST CANNOT TAKE IT, even as the same person', async () => {
    /*
     * The attack this whole turn token exists for, reproduced.
     *
     * The shared server key lets any caller act as any telegram_id, so an
     * attacker could poll the queue, watch a draft appear mid-turn, and fire
     * their own chat request into the window. Before the token, `issueFor`
     * only asked "is anything pending for this person?" and answered yes: the
     * attacker got the secret, the owner's own turn got null, no card was ever
     * shown, and the message went out.
     */
    yields.push({ ['тип']: 'текст', ['текст']: 'Подготовил письмо.' })
    const { forgetProposals, remember, issueFor } = await import(
      './src/agent/tg-proposals'
    )
    const { handleAgentChat } = await import('./src/agent/routes')
    forgetProposals()
    // A draft mid-turn: it belongs to a turn that is not this request's.
    remember({
      id: 'abc123456789',
      telegramId: OWNER,
      action: 'send',
      target: '@ivan',
      what: 'секретное предложение',
      turn: 'ход-владельца',
    })
    filesDraft = false
    const res = response()
    await handleAgentChat(
      request() as never,
      res as never,
      OWNER,
      async () => pool
    )
    const raw = res.written.join('')
    expect(raw, 'чужой запрос унёс черновик').not.toContain('секретное')
    expect(eventsOf(res).some(e => e['тип'] === 'proposal')).toBe(false)
    // ...and the draft is still there for its own turn.
    expect(issueFor(OWNER, 'ход-владельца')?.secret).toBeTruthy()
  })

  it('somebody else never receives it', async () => {
    // A different person asking a question in the same minute must not be
    // handed the owner's secret.
    yields.push({ ['тип']: 'текст', ['текст']: 'Здравствуйте.' })
    const { forgetProposals, remember } = await import(
      './src/agent/tg-proposals'
    )
    const { handleAgentChat } = await import('./src/agent/routes')
    forgetProposals()
    remember({
      id: 'abc123456789',
      telegramId: OWNER,
      action: 'send',
      target: '@ivan',
      what: 'привет',
      turn: 'ход-владельца',
    })
    filesDraft = false
    const res = response()
    await handleAgentChat(
      request() as never,
      res as never,
      '987654321',
      async () => pool
    )
    const raw = res.written.join('')
    expect(raw).not.toContain('abc123456789')
    expect(eventsOf(res).some(e => e['тип'] === 'proposal')).toBe(false)
  })
})
