import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A SOCKET THAT DIES MID-BODY, DRIVEN THROUGH A REAL SERVER.
 *
 * MEASURED IN PRODUCTION 2026-09-16:
 *   09:00:15 [ERROR] ❌ [INNGEST FAILURE] crm-proactive-sweep
 *   09:00:29 [ERROR] [crm-proactive] sweep FAILED {"why":"terminated"}
 *   09:01:15 [WARN]  [crm-proactive] sweep FAILED {"why":"terminated","consecutive":2}
 *
 * The render answered 200, streamed the agent's NDJSON -- tool calls, answer
 * text, a COMPLETE proposal with its one-time secret -- and then dropped the
 * TCP connection while the body was still being read. `terminated` is undici's
 * word for exactly that, and the reader loop had no catch: everything already
 * parsed off the wire was thrown away, so the owner never saw a card the
 * seller had already earned.
 *
 * WHY A REAL http.createServer. The whole defect lives in undici's behaviour:
 * which error object it constructs, with which `code` and which `cause`, when
 * a peer destroys a socket after headers. A mocked fetch would let us invent
 * that error -- and would prove only that our own invention matches our own
 * classifier. Here the bytes are real, the socket is real, and the error is
 * the one production saw. `fetch` is wrapped ONLY to redirect the hardcoded
 * production host to this server's port; the call itself is the real undici
 * fetch.
 */

const OWNER = '144022504'
const БАЗА = 'https://vibee-render-production.up.railway.app' // cyrillic-ok: mirrors the service constant

const event = (o: Record<string, unknown>) => JSON.stringify(o) + '\n'
const TEXT = event({ ['тип']: 'текст', ['текст']: 'Подготовил письмо.' })
const TOOL = event({ ['тип']: 'инструмент', ['имя']: 'crm_read' })
const DRAFT = event({
  ['тип']: 'proposal',
  proposal: {
    id: 'abc123456789',
    action: 'send',
    target: '@ivan',
    what: 'привет',
    secret: 'f'.repeat(32),
  },
})
const LIMIT = event({
  ['тип']: 'ошибка',
  ['текст']:
    'nemotron: ResourceExhausted: Worker local total request limit reached (16/16)',
})
const BROKEN_MODEL = event({
  ['тип']: 'ошибка',
  ['текст']: 'unknown model: nemotron-99b — bad configuration',
})

type Turn = (res: http.ServerResponse) => void

/** Writes bytes, waits for them to leave, then kills the socket under undici. */
const dieAfter = (body: string): Turn => {
  return res => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    res.write(body)
    // The flush has to reach the client before the destroy, otherwise undici
    // never sees headers and reports "fetch failed" instead of "terminated".
    setTimeout(() => res.socket?.destroy(), 60)
  }
}

const finish =
  (body: string): Turn =>
  res => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    res.end(body)
  }

let server: http.Server
let base: string
/** One entry per /api/agent/chat request, in order. */
let chatRequests: number
let script: Turn[]

async function serve(turns: Turn[]): Promise<void> {
  script = turns
  chatRequests = 0
  server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/api/agent/history')) {
      // Not what is under test: an empty transcript keeps the turn honest.
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ messages: [] }))
      return
    }
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      const turn = script[chatRequests] ?? script[script.length - 1]
      chatRequests++
      turn(res)
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const real = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    (url: any, init?: any) => real(String(url).replace(БАЗА, base), init) // cyrillic-ok: mirrors the service constant
  )
}

const ask = async () => {
  const mod = await import('@/services/trinityAgent')
  return mod.спроситьАгента(OWNER, 'напиши Ивану') // cyrillic-ok: pre-existing export name
}

beforeEach(() => {
  vi.resetModules()
  process.env.RENDER_API_KEY = 'test-key'
})
afterEach(async () => {
  vi.unstubAllGlobals()
  if (server) await new Promise<void>(r => server.close(() => r()))
})

describe('a stream that dies mid-body keeps the work that already arrived', () => {
  it('(a) returns the finished proposal instead of throwing it away', async () => {
    await serve([dieAfter(TOOL + TEXT + DRAFT)])
    const r = await ask()
    expect(r.proposal?.secret, 'the earned card was discarded').toBe(
      'f'.repeat(32)
    )
    expect(r.proposal?.id).toBe('abc123456789')
    expect(r['текст']).toContain('Подготовил письмо') // cyrillic-ok
    expect(r['инструменты']).toContain('crm_read') // cyrillic-ok
  })

  it('(a2) an unterminated last line is still flushed on the way out', async () => {
    // The realistic shape: the socket dies BETWEEN the JSON and its newline.
    await serve([dieAfter(TEXT + DRAFT.trimEnd())])
    const r = await ask()
    expect(r.proposal?.secret).toBe('f'.repeat(32))
  })

  it('(b) a stream that produced nothing still fails loudly, and names names', async () => {
    // THE LOUD HALF (house rule: silence is not zero). Nothing was salvaged,
    // so this must still reach the owner -- and say more than "terminated".
    await serve([dieAfter(':')])
    await expect(ask()).rejects.toThrow(/the agent stream broke/)
    await serve([dieAfter(':')])
    const err = await ask().catch(e => e as Error)
    expect(
      err.message,
      'the push notification must name the upstream'
    ).toContain(`${БАЗА}/api/agent/chat`)
    expect(err.message).toContain(OWNER)
    expect(err.message).toMatch(/terminated|fetch failed|closed/)
  })

  it('a genuine crash in our own parsing is NOT swallowed as a partial success', async () => {
    /*
     * The guard that keeps change 1 from becoming the swallow it exists to
     * prevent: only undici's transport identity is salvageable. A TypeError
     * from our code carries neither the code nor the message, so it escapes.
     */
    const { isTransportError } = await import('@/services/trinityAgent')
    expect(isTransportError(new TypeError('x.map is not a function'))).toBe(
      false
    )
    const aborted = new Error('This operation was aborted')
    aborted.name = 'AbortError'
    expect(
      isTransportError(aborted),
      'our own 180 s abort is not a break'
    ).toBe(false)
    const terminated: any = new TypeError('terminated')
    terminated.cause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    })
    expect(isTransportError(terminated)).toBe(true)
  })
})

describe('one short retry, only on a provider limit', () => {
  it('(c) a limit error is retried exactly once and the second attempt answers', async () => {
    await serve([finish(LIMIT), finish(TEXT + DRAFT)])
    const r = await ask()
    expect(r['текст']).toContain('Подготовил письмо') // cyrillic-ok
    expect(chatRequests, 'the customer must get a second chance').toBe(2)
  }, 30_000)

  it('(d) a NON-limit error is not retried -- waiting would change nothing', async () => {
    await serve([finish(BROKEN_MODEL), finish(TEXT)])
    await expect(ask()).rejects.toThrow(/unknown model/)
    expect(chatRequests, 'a broken configuration was replayed').toBe(1)
  }, 30_000)

  it('(e) a second limit fails loudly rather than retrying for ever', async () => {
    await serve([finish(LIMIT), finish(LIMIT), finish(TEXT)])
    await expect(ask()).rejects.toThrow(/16\/16/)
    expect(chatRequests, 'the retry budget is one').toBe(2)
  }, 30_000)

  it('a turn that already spent money or already sent is never replayed', async () => {
    // The duet's rule (crm-duet-tool.ts PAID_TOOLS) on the live path: replaying
    // would bill the customer twice or send a stranger a second message.
    const { retryAllowed } = await import('@/services/trinityAgent')
    expect(retryAllowed(0, 'ResourceExhausted (16/16)', ['crm_read'])).toBe(
      true
    )
    expect(
      retryAllowed(0, 'ResourceExhausted (16/16)', ['video_generate']),
      'a paid generation was replayed'
    ).toBe(false)
    expect(
      retryAllowed(0, 'ResourceExhausted (16/16)', ['tg_send']),
      'a delivered message was replayed'
    ).toBe(false)
    expect(retryAllowed(1, 'ResourceExhausted (16/16)', [])).toBe(false)
  })
})
