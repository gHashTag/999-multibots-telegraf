import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

/**
 * WHICH BOT SIGNED THE initData THAT WAS ACCEPTED.
 *
 * /api/auth/telegram mints a 60-day session, and /api/auth/pair/start issues a
 * code that mints one, from initData signed by ANY configured bot token. Before
 * that set can be narrowed to the bots that really launch the app, the journal
 * has to say which bot each accepted signature came from.
 *
 * The bot id is the part of a token before the colon and is public. The part
 * after it is the secret, so the note must carry digits and nothing else --
 * also when a misconfigured token has no colon and `split(':')[0]` is the whole
 * secret.
 */

const BOT_ID = '5550001'
const AFTER_COLON = 'SecretPartOfTheTokenNeverInAnyLog123'
const TOKEN = `${BOT_ID}:${AFTER_COLON}`

function sign(fields: Record<string, string>, token: string): string {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const p = new URLSearchParams(fields)
  p.set(
    'hash',
    crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  )
  return p.toString()
}

const launch = (id: number, token: string) =>
  sign(
    {
      user: JSON.stringify({ id, first_name: 'Test' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    },
    token
  )

/** A pool that answers every query with no rows and keeps the journal writes. */
function recordingPool() {
  const events: unknown[][] = []
  return {
    events,
    async query(sql: string, params: unknown[] = []) {
      if (/^\s*INSERT INTO hive_events/.test(sql)) events.push(params)
      return { rows: [] }
    },
  }
}

let source = 0
function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const r = Readable.from([Buffer.from(JSON.stringify(body))]) as any
  r.url = path
  r.method = 'POST'
  r.headers = headers
  r.socket = { remoteAddress: `10.9.0.${++source}` }
  return r
}

function response() {
  const o: any = { status: 0, body: null }
  o.setHeader = () => undefined
  o.writeHead = (code: number) => {
    o.status = code
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  return o
}

describe('the sign-in journal names the bot whose token verified initData', () => {
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute
  let logged: string[]

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.SESSION_SIGNING_KEY ||= 'x'.repeat(48)
    logged = []
    const keep = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    }
    vi.spyOn(console, 'log').mockImplementation(keep)
    vi.spyOn(console, 'warn').mockImplementation(keep)
    vi.resetModules()
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const botOf = (what: unknown) => /\bbot (\S+)/.exec(String(what))?.[1]

  it('POST /api/auth/telegram records the bot id, digits only', async () => {
    const pool = recordingPool()
    const res = response()
    await handleAuthRoute(
      request('/api/auth/telegram', { init_data: launch(7001, TOKEN) }),
      res,
      () => pool as any
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    await vi.waitFor(() => expect(pool.events).toHaveLength(1))
    const [kind, who, , , what] = pool.events[0]
    expect(kind).toBe('sign-in')
    expect(who).toBe('7001')
    expect(botOf(what)).toBe(BOT_ID)
    expect(botOf(what)).not.toContain(':')
    expect(JSON.stringify(pool.events)).not.toContain(AFTER_COLON)
    expect(logged.join('\n')).not.toContain(AFTER_COLON)
  })

  it('POST /api/auth/pair/start records the bot id, digits only', async () => {
    const pool = recordingPool()
    const res = response()
    await handleAuthRoute(
      request(
        '/api/auth/pair/start',
        {},
        {
          'x-telegram-init-data': launch(7002, TOKEN),
        }
      ),
      res,
      () => pool as any
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    await vi.waitFor(() => expect(pool.events).toHaveLength(1))
    const [kind, who, , , what] = pool.events[0]
    expect(kind).toBe('code-issued')
    expect(who).toBe('7002')
    expect(botOf(what)).toBe(BOT_ID)
    expect(botOf(what)).not.toContain(':')
    expect(JSON.stringify(pool.events)).not.toContain(AFTER_COLON)
    // The code itself is a live credential and stays out of the log as before.
    expect(logged.join('\n')).not.toContain(String(res.body.code))
    expect(logged.join('\n')).not.toContain(AFTER_COLON)
  })

  it('a token configured without its colon is still accepted but never written', async () => {
    const colonless = `${BOT_ID}${AFTER_COLON}`
    process.env.TELEGRAM_BOT_TOKEN = colonless
    const pool = recordingPool()
    const res = response()
    await handleAuthRoute(
      request('/api/auth/telegram', { init_data: launch(7003, colonless) }),
      res,
      () => pool as any
    )
    // Which tokens verify is unchanged by the note.
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    await vi.waitFor(() => expect(pool.events).toHaveLength(1))
    expect(botOf(pool.events[0][4])).toBe('unknown')
    expect(JSON.stringify(pool.events)).not.toContain(AFTER_COLON)
    expect(logged.join('\n')).not.toContain(AFTER_COLON)
  })
})
