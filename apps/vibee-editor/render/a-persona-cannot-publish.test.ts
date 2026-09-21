/**
 * A PERSONA'S "LET US PUBLISH" PUBLISHES NOTHING.
 *
 * Duet duet-mub68idg, 2026-09-21: the buyer model -- a persona playing the
 * client -- said "let us publish it as a trial", and the seller called
 * feed_publish twice. The hidden-by-default gate held, but a persona's line is
 * not the client's approval (gHashTag/t27#4522 PERSONA_CONSENT_IS_NOT_CONSENT).
 *
 * The duet now denies feed_publish on every turn. The promise is "refused, and
 * nothing is written", and that is a property of the DISPATCHER -- whether the
 * handler runs at all -- so it is proved through the dispatcher itself, with a
 * pool and a network that record everything, and a control that shows the
 * same call outside the ban does reach both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

/*
 * One model provider the test owns: runAgent walks allProviders(), and the
 * turn below must reach a model whose every answer the test wrote.
 */
const model = vi.hoisted(() => ({
  providers: [] as unknown[],
}))
vi.mock('./src/agent/provider', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/agent/provider')>()),
  allProviders: () => model.providers,
}))

import {
  dispatchToolCall,
  runAgent,
  DENIED_DEFAULT_REASON,
} from './src/agent/chat'
import {
  toOpenAITools,
  TOOLS_BY_NAME,
  type ToolContext,
} from './src/agent/tools'
import {
  deniedToolsFor,
  refusedOf,
  DUET_DENY_REASONS,
  DISCOVERY_SELLER_TURNS,
} from './src/agent/crm-duet-tool'

const SELLER = '900000061'
const PUBLISH = {
  function: {
    name: 'feed_publish',
    arguments: JSON.stringify({
      name: 'План 6 — проба',
      description: 'Пробный ролик по плану 6 #leela',
      video_url: 'https://bucket.example/renders/leela-plan-6.mp4',
    }),
  },
}

function recording() {
  const queries: string[] = []
  const ctx = {
    telegramId: SELLER,
    pool: {
      query: async (sql: string) => {
        queries.push(sql)
        return { rows: [{ n: 'Author', un: '' }] }
      },
    },
  } as unknown as ToolContext
  const fetched = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: 80, template: { created_at: 't' } }), {
        status: 200,
      })
  )
  vi.stubGlobal('fetch', fetched)
  return { ctx, queries, fetched }
}

async function drain(gen: AsyncGenerator<unknown, unknown, void>) {
  for (;;) {
    const step = await gen.next()
    if (step.done) return step.value as Record<string, unknown>
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('feed_publish in a duet', () => {
  it('is refused on every seller turn, with a reason the model can read, and nothing is read, written or sent', async () => {
    for (const turn of [0, DISCOVERY_SELLER_TURNS, 7]) {
      const { ctx, queries, fetched } = recording()
      const value = await drain(
        dispatchToolCall(PUBLISH, ctx, {
          denyTools: deniedToolsFor(turn),
          denyReasons: DUET_DENY_REASONS,
        })
      )
      expect(refusedOf(value), `turn ${turn}`).toBe(true)
      expect(String(value['ошибка'])).toContain('не одобрение клиента') // cyrillic-ok: tool result key
      expect(queries, `turn ${turn}`).toEqual([])
      expect(fetched, `turn ${turn}`).not.toHaveBeenCalled()
    }
  })

  it('is not even offered to the model after discovery', () => {
    const offered = toOpenAITools(undefined, deniedToolsFor(5)).map(
      t => t.function.name
    )
    expect(offered).not.toContain('feed_publish')
    // The ban is narrow: the paid reel is offered again after discovery.
    expect(offered).toContain('reel_render')
  })

  it('CONTROL: outside the ban the same call reaches the database and the publish route', async () => {
    const { ctx, queries, fetched } = recording()
    const value = await drain(dispatchToolCall(PUBLISH, ctx))
    expect(refusedOf(value)).toBe(false)
    expect(queries.length).toBeGreaterThan(0)
    expect(fetched).toHaveBeenCalled()
  })

  it('a discovery refusal of a paid tool keeps its own reason', async () => {
    const { ctx } = recording()
    const value = await drain(
      dispatchToolCall(
        { function: { name: 'reel_render', arguments: '{}' } },
        ctx,
        { denyTools: deniedToolsFor(0), denyReasons: DUET_DENY_REASONS }
      )
    )
    expect(refusedOf(value)).toBe(true)
    expect(String(value['ошибка'])).toContain(DENIED_DEFAULT_REASON) // cyrillic-ok: tool result key
  })
})

/*
 * THROUGH runAgent, NOT BESIDE IT (review of PR #2709).
 *
 * The tests above call dispatchToolCall directly, and the live-wiring test in
 * crm-duet.test.ts mocks runAgent. So the one seam that carries the ban into
 * a real turn -- runAgent handing its options to dispatchToolCall -- could be
 * cut (`dispatchToolCall(call, ctx, undefined, t0)`) and every test stayed
 * green. Here a real runAgent talks to a model the test scripts: the model
 * calls feed_publish although it was not offered, and the handler must not
 * run.
 */
describe('feed_publish through a real agent turn', () => {
  const BASE = 'http://model.test/v1'
  const FAKE_PROVIDER = {
    id: 'reserve',
    base: BASE,
    model: 'scripted',
    key: 'k',
    thinking: false,
    tools: true,
    vision: false,
    audio: false,
    context: 128_000,
    compact: false,
  }

  /** A streamed chat completion, the shape runAgent reads. */
  function sse(delta: Record<string, unknown>): Response {
    const chunk = JSON.stringify({ choices: [{ delta }] })
    return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  function scriptedTurn() {
    model.providers = [FAKE_PROVIDER]
    const offered: string[][] = []
    const elsewhere: string[] = []
    const queries: string[] = []
    let answers = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: { body?: unknown }) => {
        const url = String(input)
        if (!url.startsWith(BASE)) {
          elsewhere.push(url)
          return new Response('{}', { status: 200 })
        }
        const body = JSON.parse(String(init?.body ?? '{}'))
        offered.push(
          (body.tools ?? []).map(
            (t: { function: { name: string } }) => t.function.name
          )
        )
        // First answer: the persona-consented publish. Then: words.
        return answers++ === 0
          ? sse({
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'feed_publish',
                    arguments: PUBLISH.function.arguments,
                  },
                },
              ],
            })
          : sse({ content: 'Публикует только она сама.' })
      })
    )
    const ctx = {
      telegramId: SELLER,
      pool: {
        query: async (sql: string) => {
          queries.push(sql)
          return { rows: [] }
        },
      },
    } as unknown as ToolContext
    return { ctx, offered, elsewhere, queries }
  }

  async function play(ctx: ToolContext, opts?: Parameters<typeof runAgent>[2]) {
    const events: Array<Record<string, unknown>> = []
    for await (const ev of runAgent(
      [{ role: 'user', content: 'давайте опубликуем как пробу' }],
      ctx,
      opts
    ))
      events.push(ev as unknown as Record<string, unknown>)
    return events
  }

  // Quoted keys: the event envelope's own field names.
  const resultOf = (events: Array<Record<string, unknown>>) =>
    events.find(e => e['тип'] === 'результат' && e['имя'] === 'feed_publish')?.[
      'значение'
    ]

  afterEach(() => {
    model.providers = []
    vi.restoreAllMocks()
  })

  it('a call that arrives despite the hidden listing is refused by the turn, and the handler never runs', async () => {
    const handler = vi.spyOn(TOOLS_BY_NAME.get('feed_publish')!, 'handler')
    const { ctx, offered, elsewhere, queries } = scriptedTurn()
    const events = await play(ctx, {
      denyTools: deniedToolsFor(5),
      denyReasons: DUET_DENY_REASONS,
    })
    expect(offered.length).toBeGreaterThan(0)
    for (const names of offered) expect(names).not.toContain('feed_publish')
    const value = resultOf(events)
    expect(refusedOf(value)).toBe(true)
    const said = String((value as Record<string, unknown>)['ошибка'])
    expect(said).toContain('не одобрение клиента')
    expect(handler).not.toHaveBeenCalled()
    expect(queries.filter(q => /FROM users/.test(q))).toEqual([])
    expect(elsewhere).toEqual([])
  })

  it('CONTROL: the same turn without the ban lists the tool and runs its handler', async () => {
    const handler = vi
      .spyOn(TOOLS_BY_NAME.get('feed_publish')!, 'handler')
      .mockResolvedValue({ ok: true })
    const { ctx, offered } = scriptedTurn()
    const events = await play(ctx)
    expect(offered[0]).toContain('feed_publish')
    expect(refusedOf(resultOf(events))).toBe(false)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

/*
 * A one-name ban let the next publishing tool through: skills_publish puts
 * the owner's skill on the public market at once. Every tool whose name says
 * it publishes or unpublishes is denied in a duet, with a reason to read --
 * including one added tomorrow.
 */
describe('every publishing tool is denied in a duet', () => {
  it('the ban covers every tool in the registry that publishes', async () => {
    const { TOOLS } = await import('./src/agent/tools')
    const { DUET_NEVER, DUET_DENY_REASONS } = await import(
      './src/agent/crm-duet-tool'
    )
    const publishing = TOOLS.map(t => t.name).filter(n => /publish/.test(n))
    expect(publishing.length).toBeGreaterThanOrEqual(3)
    for (const name of publishing) {
      expect(DUET_NEVER.has(name), name).toBe(true)
      expect(DUET_DENY_REASONS.get(name), name).toBeTruthy()
    }
  })
})
