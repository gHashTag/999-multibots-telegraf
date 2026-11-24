import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { Readable, Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setRevokedSessions, signAccessToken } from '../../session'
import { createHiveProxy } from '../hive/proxy-route'
import * as SPEC from './hive-proxy.gen'
// Every fn of the spec runs from its compiled body: the host
// (src/hive/proxy-route.ts) imports them and writes none of them.
import * as LOGIC from './hive-proxy.logic'

// Fake values only: nothing here is a real credential.
const PROXY = 'test-server-proxy-token' // secret-guard-ok: synthetic unit-test fixture
const PROVIDER_SECRET = 'fake-provider-secret-for-tests' // secret-guard-ok: synthetic unit-test fixture
const BASE = 'https://queen.example'
const STREAM =
  'event: message_start\ndata: {"type":"message_start"}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'

class FakeRes extends Writable {
  status = 0
  headers: Record<string, string> = {}
  headersSent = false
  chunks: Buffer[] = []
  writeHead(status: number, headers: Record<string, string> = {}) {
    this.status = status
    this.headers = headers
    this.headersSent = true
    return this
  }
  _write(chunk: Buffer, _enc: string, done: () => void) {
    this.chunks.push(Buffer.from(chunk))
    done()
  }
  get text() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
  get json() {
    return JSON.parse(this.text)
  }
}
const done = (res: FakeRes) =>
  new Promise<void>(resolve =>
    res.writableFinished || res.destroyed
      ? resolve()
      : res.once('close', resolve)
  )

const session = (id = '123') =>
  signAccessToken({
    telegramId: id,
    sessionId: `test-proxy-session-${id}`,
    deviceKeyThumbprint: 'test-device',
  })
function post(
  body: string | Buffer | Readable,
  headers: Record<string, string> = {},
  method = 'POST'
): IncomingMessage {
  const stream =
    body instanceof Readable ? body : Readable.from([Buffer.from(body)])
  return Object.assign(stream, {
    url: SPEC.ROUTE,
    method,
    headers: {
      authorization: `Bearer ${session()}`,
      'content-type': 'application/json',
      ...headers,
    },
  }) as unknown as IncomingMessage
}

type Call = { url: string; init: RequestInit }
type Provider = {
  keys: unknown
  listStatus?: number
  answer?: (call: Call) => Response | Promise<Response>
  calls: Call[]
}
const key = (
  id: number,
  provider = 'zai',
  enabled = true,
  model = 'glm-4.5-flash'
) => ({
  id,
  provider,
  model,
  enabled,
})
function queen(p: Provider): typeof fetch {
  return (async (url: URL | string, init: RequestInit = {}) => {
    const call = { url: String(url), init }
    p.calls.push(call)
    if (String(url).endsWith(SPEC.QUEEN_KEYS_PATH))
      return Response.json(p.keys, { status: p.listStatus ?? 200 })
    return (
      (await p.answer?.(call)) ??
      new Response(STREAM, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          [SPEC.UPSTREAM_HEADER]: '200',
        },
      })
    )
  }) as typeof fetch
}
const refusal = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, {
    status,
    headers: { [SPEC.UPSTREAM_HEADER]: String(status), ...extra },
  })

let p: Provider
let now = 1_000_000
function proxy(extra: Record<string, unknown> = {}) {
  return createHiveProxy({
    flag: 'on',
    proxyToken: PROXY,
    baseUrl: BASE,
    fetchImpl: queen(p),
    now: () => now,
    ...extra,
  })
}
async function run(
  handler: ReturnType<typeof createHiveProxy>,
  req: IncomingMessage
) {
  const res = new FakeRes()
  await handler(req, res as never)
  await done(res)
  return res
}
const BODY = JSON.stringify({
  model: 'claude-sonnet-4-5',
  max_tokens: 64,
  stream: true,
  messages: [{ role: 'user', content: 'hi' }],
})

beforeEach(() => {
  vi.stubEnv(
    'SESSION_SIGNING_KEY',
    'test-signing-key-long-enough-for-local-tests'
  )
  vi.stubEnv('RENDER_API_KEY', 'test-server-api-key')
  vi.stubEnv('RENDER_AUTH_MODE', 'warn')
  setRevokedSessions([])
  p = { keys: { keys: [key(-1)] }, calls: [] }
  now = 1_000_000
})

describe('hive-proxy.t27: every spec test, against the host', () => {
  it('the proxy is off unless the flag says on', async () => {
    expect(LOGIC.flagOn('on')).toBe(true)
    for (const v of ['', 'off', 'true', '1', 'ON'])
      expect(LOGIC.flagOn(v)).toBe(false)
    for (const flag of ['', 'off', 'ON', 'true']) {
      const res = await run(proxy({ flag }), post(BODY))
      expect(res.status).toBe(404)
      expect(res.json.error.code).toBe(SPEC.CODE_OFF)
    }
    expect(p.calls).toEqual([])
    expect(SPEC.FLAG_ENV).toBe('HIVE_PROXY')
  })

  it('only a full app session with a valid subject may spend a key', async () => {
    expect(LOGIC.maySpend(true, true, true)).toBe(true)
    expect(LOGIC.maySpend(false, true, true)).toBe(false)
    expect(LOGIC.maySpend(true, false, true)).toBe(false)
    expect(LOGIC.maySpend(true, true, false)).toBe(false)
    // No credential, a Telegram initData identity, the server key and a bad
    // Bearer all stop here, before the Queen is asked anything.
    const none = post(BODY, { authorization: '' })
    const bad = post(BODY, { authorization: 'Bearer not.a.session' })
    for (const req of [none, bad]) {
      const res = await run(proxy(), req)
      expect(res.status).toBe(401)
      expect(res.json.error).toMatchObject({
        type: 'authentication_error',
        code: SPEC.CODE_AUTH,
      })
    }
    for (const via of ['telegram', 'api-key', 'agent-key', 'public'] as const) {
      const res = await run(
        proxy({
          identity: () => ({ via, allowed: true, telegramId: '123' }),
        }),
        post(BODY)
      )
      expect(res.status).toBe(401)
    }
    expect(p.calls).toEqual([])
    const ok = await run(proxy(), post(BODY))
    expect(ok.status).toBe(200)
  })

  it('a request is bounded and never empty', async () => {
    expect(LOGIC.requestFits(0)).toBe(false)
    expect(LOGIC.requestFits(1)).toBe(true)
    expect(LOGIC.requestFits(4194304)).toBe(true)
    expect(LOGIC.requestFits(4194305)).toBe(false)
    expect(SPEC.REQUEST_MAX_BYTES).toBe(4194304)
    // Declared too large: refused before the body is read.
    const declared = await run(
      proxy(),
      post('{}', { 'content-length': String(SPEC.REQUEST_MAX_BYTES + 1) })
    )
    expect(declared.status).toBe(413)
    expect(declared.json.error).toMatchObject({
      type: 'request_too_large',
      code: SPEC.CODE_TOO_LARGE,
    })
    // Undeclared and too large: cut off as it arrives.
    const big = Readable.from(
      (function* () {
        for (let i = 0; i < 5; i++) yield Buffer.alloc(1024 * 1024, 120)
      })()
    )
    const streamed = await run(proxy(), post(big))
    expect(streamed.status).toBe(413)
    // Empty, not JSON, not an object, not JSON content-type.
    for (const body of ['', 'nope', '[]', 'null', '"x"']) {
      const res = await run(proxy(), post(body))
      expect(res.status).toBe(400)
      expect(res.json.error.code).toBe(SPEC.CODE_BAD_BODY)
    }
    const text = await run(
      proxy(),
      post(BODY, { 'content-type': 'text/plain' })
    )
    expect(text.status).toBe(415)
    expect(text.json.error.code).toBe(SPEC.CODE_JSON)
    expect(p.calls).toEqual([])
  })

  it('a person has a call rate and a stream count, both strict upper bounds', async () => {
    expect(LOGIC.rateAllows(0)).toBe(true)
    expect(LOGIC.rateAllows(119)).toBe(true)
    expect(LOGIC.rateAllows(120)).toBe(false)
    expect(LOGIC.rateAllows(121)).toBe(false)
    expect(LOGIC.mayStart(0)).toBe(true)
    expect(LOGIC.mayStart(7)).toBe(true)
    expect(LOGIC.mayStart(8)).toBe(false)
    expect(LOGIC.mayStart(9)).toBe(false)
    expect(SPEC.RATE_WINDOW_MS).toBe(60000)
    // The rate: 120 calls in a window pass, the 121st is told to wait.
    const h = proxy()
    for (let i = 0; i < SPEC.RATE_MAX_CALLS; i++)
      expect((await run(h, post(BODY))).status).toBe(200)
    const over = await run(h, post(BODY))
    expect(over.status).toBe(429)
    expect(over.json.error).toMatchObject({
      type: 'rate_limit_error',
      code: SPEC.CODE_RATE,
    })
    expect(over.headers['Retry-After']).toBe(String(SPEC.BUSY_RETRY_SECONDS))
    // Another person is not slowed by it.
    const other = await run(
      h,
      post(BODY, { authorization: `Bearer ${session('456')}` })
    )
    expect(other.status).toBe(200)
    // The window moves on.
    now += SPEC.RATE_WINDOW_MS + 1
    expect((await run(h, post(BODY))).status).toBe(200)
  })

  it('only a provider that speaks the Anthropic protocol can serve a call', () => {
    expect(LOGIC.speaksAnthropic('zai')).toBe(true)
    for (const v of ['nvidia', 'openai', 'Zai', ''])
      expect(LOGIC.speaksAnthropic(v)).toBe(false)
  })

  it('a key is usable when it is enabled and its provider speaks the protocol', () => {
    expect(LOGIC.keyUsable(true, 'zai')).toBe(true)
    expect(LOGIC.keyUsable(false, 'zai')).toBe(false)
    expect(LOGIC.keyUsable(true, 'nvidia')).toBe(false)
    expect(LOGIC.keyUsable(false, 'nvidia')).toBe(false)
  })

  it('the pick walks the usable keys in turn and never leaves the list', async () => {
    expect(LOGIC.pickIndex(3, 0)).toBe(0)
    expect(LOGIC.pickIndex(3, 1)).toBe(1)
    expect(LOGIC.pickIndex(3, 2)).toBe(2)
    expect(LOGIC.pickIndex(3, 3)).toBe(0)
    expect(LOGIC.pickIndex(3, 301)).toBe(1)
    expect(LOGIC.pickIndex(1, 0)).toBe(0)
    expect(LOGIC.pickIndex(1, 7)).toBe(0)
    expect(LOGIC.pickIndex(0, 5)).toBe(0)
    expect(LOGIC.pickIndex(2, 4294967295)).toBe(1)
    // Three usable keys, one disabled and one nvidia between them: the calls
    // go -1, -3, -4, -1, and a 429 is the client's cue to retry on the next.
    p.keys = {
      keys: [
        key(-1),
        key(-2, 'zai', false),
        key(-3),
        key(-5, 'nvidia'),
        key(-4),
      ],
    }
    const h = proxy()
    for (let i = 0; i < 4; i++) await run(h, post(BODY))
    const called = p.calls
      .filter(c => !c.url.endsWith(SPEC.QUEEN_KEYS_PATH))
      .map(c => c.url.replace(BASE, ''))
    expect(called).toEqual(
      [-1, -3, -4, -1].map(
        id => `${SPEC.QUEEN_CALL_PREFIX}${id}${SPEC.QUEEN_CALL_SUFFIX}`
      )
    )
  })

  it('no usable key is told apart from keys that only need translation', async () => {
    expect(LOGIC.noKeyCode(false)).toBe(SPEC.CODE_NO_KEY)
    expect(LOGIC.noKeyCode(true)).toBe(SPEC.CODE_NEEDS_TRANSLATION)
    expect(SPEC.CODE_NO_KEY).toBe('no_enabled_key')
    expect(SPEC.CODE_NEEDS_TRANSLATION).toBe('provider_needs_translation')
    const cases: [unknown, string][] = [
      [{ keys: [] }, 'no_enabled_key'],
      [{ keys: [key(-1, 'zai', false)] }, 'no_enabled_key'],
      [{ keys: [key(-1, 'nvidia', true)] }, 'provider_needs_translation'],
      [
        { keys: [key(-1, 'nvidia', true), key(-2, 'zai', false)] },
        'provider_needs_translation',
      ],
      [{ keys: 'not a list' }, 'no_enabled_key'],
      [
        { keys: [{ id: 'x', provider: 'zai', model: 'm', enabled: true }] },
        'no_enabled_key',
      ],
    ]
    for (const [keys, code] of cases) {
      p.keys = keys
      const res = await run(proxy(), post(BODY))
      expect(res.status).toBe(404)
      expect(res.json.error).toMatchObject({ type: 'not_found_error', code })
    }
    expect(p.calls.every(c => c.url.endsWith(SPEC.QUEEN_KEYS_PATH))).toBe(true)
  })

  it('an upstream answer reaches the client as the table says', async () => {
    for (const s of [200, 299, 400, 413, 422, 402, 429, 529])
      expect(LOGIC.replyStatus(s)).toBe(s)
    for (const s of [300, 404, 500, 503, 504, 0])
      expect(LOGIC.replyStatus(s)).toBe(502)
    for (const status of [402, 429, 529, 400, 413, 422]) {
      p.answer = () => refusal(status)
      const res = await run(proxy(), post(BODY))
      expect(res.status).toBe(status)
      expect(res.json.type).toBe('error')
    }
    for (const status of [404, 500, 503, 504]) {
      p.answer = () => refusal(status)
      const res = await run(proxy(), post(BODY))
      expect(res.status).toBe(502)
      expect(res.json.error.code).toBe('upstream_unavailable')
    }
    // A provider's Retry-After reaches the client only as a short run of digits.
    p.answer = () => refusal(429, { 'Retry-After': '17' })
    expect((await run(proxy(), post(BODY))).headers['Retry-After']).toBe('17')
    for (const wait of ['Wed, 21 Oct 2026 07:28:00 GMT', '1234567', '1e3']) {
      p.answer = () => refusal(429, { 'Retry-After': wait })
      expect(
        (await run(proxy(), post(BODY))).headers['Retry-After']
      ).toBeUndefined()
    }
  })

  it('a refused stored key is never an authentication error to the client', async () => {
    expect(LOGIC.replyStatus(401)).toBe(502)
    expect(LOGIC.replyStatus(403)).toBe(502)
    expect(LOGIC.replyType(401)).not.toBe('authentication_error')
    expect(LOGIC.replyType(403)).not.toBe('authentication_error')
    expect(LOGIC.replyType(401)).toBe('api_error')
    expect(LOGIC.replyCode(401)).toBe('upstream_key_rejected')
    expect(LOGIC.replyCode(403)).toBe('upstream_key_rejected')
    for (const status of [401, 403]) {
      // Even if the Queen ever passed a provider body on, it is not echoed.
      p.answer = () =>
        new Response(`{"error":"bad key ${PROVIDER_SECRET}"}`, {
          status,
          headers: { [SPEC.UPSTREAM_HEADER]: String(status) },
        })
      const res = await run(proxy(), post(BODY))
      expect(res.status).toBe(502)
      expect(res.json.error).toMatchObject({
        type: 'api_error',
        code: 'upstream_key_rejected',
      })
      expect(res.text).not.toContain(PROVIDER_SECRET)
    }
  })

  it('every upstream refusal has an Anthropic error type and a stable code', () => {
    const type: [number, string][] = [
      [400, 'invalid_request_error'],
      [422, 'invalid_request_error'],
      [413, 'request_too_large'],
      [402, 'billing_error'],
      [429, 'rate_limit_error'],
      [529, 'overloaded_error'],
      [500, 'api_error'],
    ]
    for (const [status, expected] of type)
      expect(LOGIC.replyType(status)).toBe(expected)
    const code: [number, string][] = [
      [400, 'upstream_rejected_request'],
      [402, 'upstream_payment_required'],
      [429, 'upstream_rate_limited'],
      [529, 'upstream_overloaded'],
      [500, 'upstream_unavailable'],
      [404, 'upstream_unavailable'],
    ]
    for (const [status, expected] of code)
      expect(LOGIC.replyCode(status)).toBe(expected)
  })

  it("the proxy's own refusals carry an Anthropic error type by their status", async () => {
    const own: [number, string][] = [
      [401, 'authentication_error'],
      [404, 'not_found_error'],
      [400, 'invalid_request_error'],
      [405, 'invalid_request_error'],
      [415, 'invalid_request_error'],
      [413, 'request_too_large'],
      [429, 'rate_limit_error'],
      [502, 'api_error'],
      [503, 'api_error'],
    ]
    for (const [status, expected] of own)
      expect(LOGIC.ownType(status)).toBe(expected)
    expect(SPEC.CODE_AUTH).toBe('authentication_required')
    expect(SPEC.CODE_BAD_BODY).toBe('invalid_body')
    expect(SPEC.CODE_JSON).toBe('json_required')
    expect(SPEC.CODE_METHOD).toBe('method_not_allowed')
    expect(SPEC.CODE_NOT_CONFIGURED).toBe('not_configured')
    expect(SPEC.CODE_OFF).toBe('proxy_disabled')
    expect(SPEC.CODE_RATE).toBe('rate_limited')
    expect(SPEC.CODE_BUSY).toBe('too_many_in_flight')
    const get = await run(proxy(), post(BODY, {}, 'GET'))
    expect(get.status).toBe(405)
    expect(get.headers.Allow).toBe('POST')
    // Without the server-to-server token or a safe Queen address it is not configured.
    const noToken = await run(proxy({ proxyToken: '' }), post(BODY))
    expect(noToken.status).toBe(503)
    expect(noToken.json.error.code).toBe(SPEC.CODE_NOT_CONFIGURED)
    for (const baseUrl of [
      'http://queen.example',
      'https://user:pw@queen.example',
      'nope',
    ])
      expect((await run(proxy({ baseUrl }), post(BODY))).status).toBe(503)
  })

  it("the Queen's own refusals are told by their kind and never as a provider answer", async () => {
    expect(LOGIC.queenStatus(404)).toBe(404)
    expect(LOGIC.queenStatus(413)).toBe(413)
    for (const s of [409, 429, 503]) expect(LOGIC.queenStatus(s)).toBe(502)
    expect(LOGIC.queenCode(404)).toBe(SPEC.CODE_NO_KEY)
    expect(LOGIC.queenCode(413)).toBe(SPEC.CODE_TOO_LARGE)
    expect(LOGIC.queenCode(503)).toBe(SPEC.CODE_QUEEN_DOWN)
    expect(LOGIC.queenCode(409)).toBe('queen_unavailable')
    // No marker header: the Queen spoke for herself.
    const cases: [number, number, string][] = [
      [404, 404, 'no_enabled_key'],
      [413, 413, 'request_too_large'],
      [409, 502, 'queen_unavailable'],
      [503, 502, 'queen_unavailable'],
      [200, 502, 'queen_unavailable'],
    ]
    for (const [queenStatus, status, code] of cases) {
      p.answer = () =>
        new Response(`{"error":"${PROVIDER_SECRET}"}`, { status: queenStatus })
      const res = await run(proxy(), post(BODY))
      expect(res.status).toBe(status)
      expect(res.json.error.code).toBe(code)
      expect(res.text).not.toContain(PROVIDER_SECRET)
    }
    // The key listing failing, or the Queen unreachable.
    p.listStatus = 503
    expect((await run(proxy(), post(BODY))).json.error.code).toBe(
      'queen_unavailable'
    )
    p.listStatus = 404
    expect((await run(proxy(), post(BODY))).status).toBe(404)
    const down = await run(
      proxy({
        fetchImpl: (async () => {
          throw new Error(`connect failed ${PROXY}`)
        }) as unknown as typeof fetch,
      }),
      post(BODY)
    )
    expect(down.status).toBe(502)
    expect(down.text).not.toContain(PROXY)
  })

  it('a retry-after is a short run of digits', () => {
    expect(LOGIC.retryAfterOk(1, true)).toBe(true)
    expect(LOGIC.retryAfterOk(6, true)).toBe(true)
    expect(LOGIC.retryAfterOk(0, true)).toBe(false)
    expect(LOGIC.retryAfterOk(7, true)).toBe(false)
    expect(LOGIC.retryAfterOk(3, false)).toBe(false)
  })

  it("the route and the Queen's two doors are fixed paths", async () => {
    expect(SPEC.ROUTE).toBe('/api/hive/proxy/v1/messages')
    expect(SPEC.QUEEN_KEYS_PATH).toBe('/queen/contributor-keys/proxy/keys')
    expect(SPEC.QUEEN_CALL_PREFIX).toBe('/queen/contributor-keys/proxy/')
    expect(SPEC.QUEEN_CALL_SUFFIX).toBe('/messages')
    expect(SPEC.UPSTREAM_HEADER).toBe('x-hive-upstream-status')
    // What a client sends on the way in never chooses what is called on the way out.
    const req = post(BODY, {
      cookie: 'a=b',
      'x-queen-contributor-id': 'telegram:999',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    })
    req.url = `${SPEC.ROUTE}?key=-9&owner=telegram:999`
    await run(proxy(), req)
    expect(p.calls.map(c => new URL(c.url).pathname)).toEqual([
      SPEC.QUEEN_KEYS_PATH,
      `${SPEC.QUEEN_CALL_PREFIX}-1${SPEC.QUEEN_CALL_SUFFIX}`,
    ])
    for (const c of p.calls) {
      const h = new Headers(c.init.headers)
      expect(h.get('authorization')).toBe(`Bearer ${PROXY}`)
      expect(h.get('x-queen-contributor-id')).toBe('telegram:123')
      expect(h.get('cookie')).toBeNull()
    }
    const call = new Headers(p.calls[1].init.headers)
    expect(call.get('anthropic-version')).toBe('2023-06-01')
    expect(call.get('anthropic-beta')).toBe('prompt-caching-2024-07-31')
  })

  it('a stream outlasts a key listing and a key listing is short', async () => {
    expect(
      LOGIC.streamOutlasts(SPEC.STREAM_TIMEOUT_MS, SPEC.KEYS_TIMEOUT_MS)
    ).toBe(true)
    expect(LOGIC.streamOutlasts(600000, 10000)).toBe(true)
    expect(LOGIC.streamOutlasts(10000, 10000)).toBe(false)
    expect(LOGIC.streamOutlasts(10000, 0)).toBe(false)
    expect(
      LOGIC.streamOutlasts(SPEC.STREAM_TIMEOUT_MS, SPEC.BUSY_RETRY_SECONDS)
    ).toBe(true)
    // A client that leaves stops the provider call and gives its stream place back.
    let signal: AbortSignal | undefined
    p.answer = call =>
      new Promise<Response>((_resolve, reject) => {
        signal = call.init.signal as AbortSignal
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const h = proxy()
    const gone = new FakeRes()
    const pending = h(post(BODY), gone as never)
    await vi.waitFor(() => expect(signal).toBeDefined())
    expect(signal?.aborted).toBe(false)
    gone.destroy()
    await pending
    expect(signal?.aborted).toBe(true)
    // The place was given back: eight more streams may start.
    const held: Promise<unknown>[] = []
    const releases: (() => void)[] = []
    p.answer = () =>
      new Promise<Response>(resolve => {
        releases.push(() =>
          resolve(
            new Response(STREAM, {
              status: 200,
              headers: {
                [SPEC.UPSTREAM_HEADER]: '200',
                'Content-Type': 'text/event-stream',
              },
            })
          )
        )
      })
    for (let i = 0; i < SPEC.MAX_IN_FLIGHT; i++) held.push(run(h, post(BODY)))
    await vi.waitFor(() => expect(releases).toHaveLength(SPEC.MAX_IN_FLIGHT))
    const busy = await run(h, post(BODY))
    expect(busy.status).toBe(429)
    expect(busy.json.error).toMatchObject({
      code: SPEC.CODE_BUSY,
      type: 'rate_limit_error',
    })
    expect(busy.headers['Retry-After']).toBe(String(SPEC.BUSY_RETRY_SECONDS))
    for (const release of releases) release()
    await Promise.all(held)
    now += SPEC.RATE_WINDOW_MS + 1
    p.answer = undefined
    expect((await run(h, post(BODY))).status).toBe(200)
  })

  it("VERSION says what the header's last note says", () => {
    expect(LOGIC.sameVersion(SPEC.VERSION, 1)).toBe(true)
    expect(LOGIC.sameVersion(SPEC.VERSION, 2)).toBe(false)
  })
})

describe('the stored key is spent through the host and never seen by it', () => {
  it('streams the answer unchanged and swaps only the model for the key the owner chose', async () => {
    p.keys = { keys: [key(-1, 'zai', true, 'glm-4.5-air')] }
    const res = await run(proxy(), post(BODY))
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/event-stream')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.text).toBe(STREAM)
    const sent = JSON.parse(String(p.calls[1].init.body))
    expect(sent).toEqual({ ...JSON.parse(BODY), model: 'glm-4.5-air' })
    expect(p.calls[1].init.method).toBe('POST')
    expect(p.calls[1].init.redirect).toBe('error')
  })

  it("sends the Queen the proxy capability and the person, never the person's own token", async () => {
    const jwt = session()
    // Claude Code with an apiKeyHelper sends the token in both headers.
    const res = await run(
      proxy(),
      post(BODY, { authorization: `Bearer ${jwt}`, 'x-api-key': jwt })
    )
    expect(res.status).toBe(200)
    for (const c of p.calls) {
      const sent = JSON.stringify([...new Headers(c.init.headers).entries()])
      expect(sent).not.toContain(jwt)
    }
  })

  it('a stream that breaks after it began is cut, not turned into a second reply', async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: message_start\n\n'))
      },
      pull() {
        throw new Error('provider hung up')
      },
    })
    p.answer = () =>
      new Response(broken, {
        status: 200,
        headers: {
          [SPEC.UPSTREAM_HEADER]: '200',
          'Content-Type': 'text/event-stream',
        },
      })
    const res = new FakeRes()
    await proxy()(post(BODY), res as never)
    await done(res)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('queen_unavailable')
  })
})

describe('the door is mounted where the other hive doors are', () => {
  it('render-server.ts hands the route to the proxy, once, before the key door', () => {
    const server = readFileSync(
      new URL('../../render-server.ts', import.meta.url),
      'utf8'
    )
    const door = server.indexOf('isHiveProxyPath(req.url')
    expect(door).toBeGreaterThan(0)
    expect(server.indexOf('isHiveProxyPath(req.url', door + 1)).toBe(-1)
    expect(door).toBeLessThan(server.indexOf('isContributorKeyPath(req.url'))
    expect(server).toContain('const hiveProxy = createHiveProxy()')
    expect(server).toContain('await hiveProxy(req, res)')
  })
})
