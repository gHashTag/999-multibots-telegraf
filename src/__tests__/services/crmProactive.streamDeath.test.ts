import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  sweepOnce,
  reportSweepOutcome,
  resetProactiveForTests,
  isTransportDeath,
  type SweepDeps,
} from '@/services/crmProactive'
import { спроситьАгента } from '@/services/trinityAgent' // cyrillic-ok: pre-existing identifiers

/**
 * THE SWEEP THAT WAS KILLED MID-SENTENCE (production 2026-09-16).
 *
 *   09:00:15 [ERROR] ❌ [INNGEST FAILURE] crm-proactive-sweep
 *   09:00:29 [ERROR] [crm-proactive] sweep FAILED {"why":"terminated","consecutive":1}
 *   09:01:15 [WARN]  [crm-proactive] sweep FAILED {"why":"terminated","consecutive":2}
 *
 * `terminated` is undici's message for one event only: the peer closed the TCP
 * connection AFTER the response headers arrived, while the body was still
 * being read. The render answered 200, started the NDJSON agent stream, and
 * dropped it. The sweep copied that one word into the owner's push
 * notification and gave up for thirty minutes, while the two lines above were
 * in fact TWO DIFFERENT SELLERS inside ONE tick, sharing one global counter.
 *
 * Everything below is driven, never textual: a real `http.createServer` that
 * writes real NDJSON and then destroys the socket, the real `спроситьАгента`
 * reader loop, the real `sweepOnce`, the real `reportSweepOutcome`. Only the
 * hostname is rewritten -- `спроситьАгента` hardcodes the production address
 * and lives outside this change's scope.
 */
const OWNER = '144022504'
const OTHER_SELLER = '987654321'
const UPSTREAM = 'https://vibee-render-production.up.railway.app'

const draft = {
  id: 'p1',
  action: 'send',
  target: '555',
  what: 'привет',
  secret: 's',
}

/** One due row, so the alert has a name it could have printed. */
const DUE_ROWS = [{ lead: '555', display: 'Вася', next: 'talk' }]

type ChatBehaviour = 'die' | 'card'

let server: http.Server
let port = 0
/** What /api/agent/chat should do, call by call; the last entry repeats. */
let script: ChatBehaviour[] = []
let chatCalls = 0
const realFetch = globalThis.fetch

function ndjson(res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
}

/*
 * The render's stream envelope, written as literal JSON.
 *
 * Its field names are Cyrillic (`тип`, `имя`, `текст`) and this is the WIRE
 * FORMAT, not our code: building it with object keys would put Cyrillic
 * identifiers into the source, which the pre-commit guard blocks and prettier
 * un-quotes back into identifiers. String literals keep it data, the same
 * choice trinityAgent.ts makes when it reads `ev['тип']`.
 */
const EV_PROVIDER = '{"тип":"провайдер","id":"openai","model":"gpt"}'
const EV_TOOL = '{"тип":"инструмент","имя":"crm_leads"}'
const EV_TEXT = '{"тип":"текст","текст":"подготовил"}'
const evProposal = (d: unknown) =>
  '{"тип":"proposal","proposal":' + JSON.stringify(d) + '}'

beforeEach(async () => {
  resetProactiveForTests()
  chatCalls = 0
  script = ['die']
  process.env.RENDER_API_KEY = 'test-key'
  server = http.createServer((req, res) => {
    const url = String(req.url ?? '')
    if (url.startsWith('/api/agent/history')) {
      if (req.method === 'POST') {
        req.resume()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"messages":[]}')
      return
    }
    if (url.startsWith('/api/agent/chat')) {
      req.resume()
      const mode = script[Math.min(chatCalls, script.length - 1)]
      chatCalls += 1
      ndjson(res)
      // Headers are out and the body has begun: this is what makes the
      // failure `terminated` rather than `fetch failed`.
      res.write(EV_PROVIDER + '\n')
      if (mode === 'card') {
        res.write(EV_TOOL + '\n')
        res.write(EV_TEXT + '\n')
        res.write(evProposal(draft) + '\n')
        res.end()
        return
      }
      // Nothing usable is written before the socket dies. trinityAgent now
      // KEEPS a partial turn (a tool call, text, a proposal) when the stream
      // breaks, and only re-throws when the turn is genuinely lost -- which is
      // the case this suite is about: a sweep that collected nothing.
      setTimeout(() => res.socket?.destroy(), 20)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
  // The real undici fetch against a real socket; only the host is swapped.
  vi.stubGlobal('fetch', ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input)
    return realFetch(
      url.startsWith(UPSTREAM)
        ? `http://127.0.0.1:${port}${url.slice(UPSTREAM.length)}`
        : url,
      init
    )
  }) as typeof fetch)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise<void>(resolve => {
    server.closeAllConnections?.()
    server.close(() => resolve())
  })
  resetProactiveForTests()
})

/** The live wiring of liveDeps(), minus the Telegraf instance. */
function deps(over: Partial<SweepDeps> = {}): SweepDeps {
  return {
    ask: (owner, text) => спроситьАгента(owner, text, { toolsOnly: true }), // cyrillic-ok: pre-existing identifiers
    ingest: async () => undefined,
    push: async () => undefined,
    record: async () => 'recorded',
    leads: async () => DUE_ROWS,
    ...over,
  }
}

describe('the discriminator', () => {
  it('a socket that dies mid-body is a transport death, a refusing model is not', async () => {
    let caught: unknown
    try {
      await спроситьАгента(OWNER, 'привет', { toolsOnly: true }) // cyrillic-ok: pre-existing identifiers
    } catch (e) {
      caught = e
    }
    // The undici message survives inside trinityAgent's wrapper sentence.
    expect((caught as Error)?.message).toContain('terminated')
    expect((caught as Error)?.message).toContain('the agent stream broke')
    expect(isTransportDeath(caught)).toBe(true)
    expect(isTransportDeath(new Error('модель ответила 500'))).toBe(false)
  })
})

describe('a dropped agent stream', () => {
  it('still fails, still pages, and now names the upstream and the person left waiting', async () => {
    script = ['die', 'die']
    const r = await sweepOnce(OWNER, deps(), { holdMs: 0 })
    expect(r.did).toBe('failed')
    // WHAT MUST STAY LOUD: a dropped upstream connection is our machinery.
    // The first failure in a streak is an error, i.e. the Telegram transport.
    expect(reportSweepOutcome(r, OWNER)).toBe('error')
    // The alert used to be the single word "terminated".
    expect(r.why).not.toBe('terminated')
    expect(r.why).toContain('Вася')
    expect(r.why).toContain('vibee-render-production.up.railway.app')
    expect(r.why).toContain('ход модели')
    expect(r.why).toContain('terminated')
    // Exactly one retry: a second dead wire is an outage, not a hiccup.
    expect(chatCalls).toBe(2)
    expect(r.why).toContain('после повтора')
  })

  it('a card that was already earned arrives: one retry, one push', async () => {
    script = ['die', 'card']
    const pushed: unknown[] = []
    const r = await sweepOnce(
      OWNER,
      deps({
        push: async (owner, d) => {
          pushed.push([owner, d])
        },
      }),
      { holdMs: 0 }
    )
    expect(r.did).toBe('card')
    expect(pushed).toEqual([[OWNER, draft]])
    expect(chatCalls).toBe(2)
    // A recovery is not an alert: the alert is for the failure it prevented.
    expect(reportSweepOutcome(r, OWNER)).toBe('info')
  })

  it('a model that answers normally is never retried', async () => {
    script = ['card']
    const r = await sweepOnce(OWNER, deps(), { holdMs: 0 })
    expect(r.did).toBe('card')
    expect(chatCalls).toBe(1)
  })
})

describe('the consecutive count is per seller, and counts only attempts', () => {
  it("one seller's success does not clear another seller's outage", () => {
    expect(
      reportSweepOutcome({ did: 'failed', why: 'terminated' }, OWNER)
    ).toBe('error')
    expect(reportSweepOutcome({ did: 'idle', why: 'тихо' }, OTHER_SELLER)).toBe(
      'info'
    )
    // Before 2026-09-16 the counter was global: @playom's quiet sweep reset
    // the owner's streak and the owner's next failure paged as `consecutive: 1`.
    expect(
      reportSweepOutcome({ did: 'failed', why: 'terminated' }, OWNER)
    ).toBe('warn')
  })

  it('held and busy attempt nothing, so they neither recover nor break the streak', () => {
    expect(
      reportSweepOutcome({ did: 'failed', why: 'terminated' }, OWNER)
    ).toBe('error')
    expect(
      reportSweepOutcome({ did: 'held', why: 'карточка ещё ждёт' }, OWNER)
    ).toBe('info')
    expect(
      reportSweepOutcome({ did: 'busy', why: 'обход уже идёт' }, OWNER)
    ).toBe('info')
    expect(
      reportSweepOutcome({ did: 'failed', why: 'terminated' }, OWNER)
    ).toBe('warn')
  })
})
