import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPublic } from './auth'
import { advanceQr, beginQr, loginUrl } from './src/agent/tg-qr-login'
import {
  pollQrLogin,
  startQrLogin,
  подтвердитьКод, // cyrillic-ok: pre-existing export
  подтвердитьПароль, // cyrillic-ok: pre-existing export
  обработатьПодключение, // cyrillic-ok: pre-existing export
  этоПутьПодключения, // cyrillic-ok: pre-existing export
  забытьПопытки, // cyrillic-ok: pre-existing export
  забытьТаблицуСессий, // cyrillic-ok: pre-existing export
  числоПопыток, // cyrillic-ok: pre-existing export
} from './src/agent/tg-connect'

/**
 * QR LOGIN: THE WAY IN THAT DOES NOT WAIT FOR A CODE.
 *
 * The owner spent two days on the code screen. Telegram said "sent to the app"
 * every time and nothing came, and from our side it cannot be told whether the
 * number was another account's or the codes were being dropped. With a QR code
 * no number is typed and no code is delivered: the account that scans is the
 * account that connects.
 *
 * What is pinned here is the walk GramJS itself takes (export, wait for the
 * update, export again, migrate if told to, password if asked), that Telegram
 * is not asked on every poll, and the same boundaries the code path has: an
 * attempt belongs to one person, and the session never reaches the screen.
 */

const confirmCode = подтвердитьКод // cyrillic-ok: pre-existing export
const confirmPassword = подтвердитьПароль // cyrillic-ok: pre-existing export
const handleRoute = обработатьПодключение // cyrillic-ok: pre-existing export
const isConnectPath = этоПутьПодключения // cyrillic-ok: pre-existing export
const forgetAttempts = забытьПопытки // cyrillic-ok: pre-existing export
const forgetTable = забытьТаблицуСессий // cyrillic-ok: pre-existing export
const attemptCount = числоПопыток // cyrillic-ok: pre-existing export

const T0 = Date.parse('2026-09-17T12:00:00Z')
const seconds = (ms: number) => Math.floor(ms / 1000)

const token = (n: number) => ({
  className: 'auth.LoginToken',
  token: Buffer.from([n, 0xfb, 0xff, 0xfe]),
  expires: seconds(T0) + 30 * n,
})
const scanned = (user: Record<string, unknown> | null) => ({
  className: 'auth.LoginTokenSuccess',
  authorization: { className: 'auth.Authorization', user },
})
/** `id` is a BigInteger in GramJS: something with its own toString. */
const owner = {
  className: 'User',
  id: { toString: () => '229866794' },
  username: 'owner',
  firstName: 'Dmitry',
  phone: '79991234567',
}

/**
 * A fake MTProto client that REFUSES WHAT GRAMJS REFUSES and records the rest,
 * in order -- the order is half of what is being checked here.
 */
function fakeClient(answers: Array<unknown | (() => unknown)>) {
  const events: string[] = []
  const handlers: Array<(u: unknown) => void> = []
  let destroyed = 0
  const client = {
    events,
    apiId: '17',
    apiHash: 'hash-of-the-app',
    session: { save: () => 'SESSION' },
    get destroyed() {
      return destroyed
    },
    count: (name: string) => events.filter(e => e.startsWith(name)).length,
    /** What Telegram pushes to the waiting client once the phone accepts. */
    push(update: unknown) {
      handlers.forEach(h => h(update))
    },
    addEventHandler(h: (u: unknown) => void) {
      events.push('addEventHandler')
      handlers.push(h)
    },
    async invoke(request: any) {
      if (!request || request.classType !== 'request') {
        throw new Error('You can only invoke MTProtoRequests')
      }
      if (request.className === 'auth.ExportLoginToken') {
        if (typeof request.apiId !== 'number') throw new Error('apiId: number')
        if (!Array.isArray(request.exceptIds)) throw new Error('exceptIds: []')
      }
      events.push(
        request.className === 'auth.ImportLoginToken'
          ? `${request.className}:${Buffer.from(request.token).toString('hex')}`
          : request.className
      )
      if (!answers.length)
        throw new Error(`no answer left for ${request.className}`)
      const next = answers.shift()
      return typeof next === 'function' ? (next as () => unknown)() : next
    },
    async _switchDC(dcId: number) {
      events.push(`switchDC:${dcId}`)
    },
    async signInWithPassword() {
      events.push('signInWithPassword')
      return owner
    },
    async destroy() {
      destroyed++
    },
  }
  return client
}

beforeEach(() => {
  forgetAttempts()
  forgetTable()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what goes into the QR code', () => {
  it('is the token in base64url, the alphabet a tg:// link survives in', () => {
    // 0xfb 0xff 0xfe is "+//+" in plain base64: both characters break a URL.
    expect(loginUrl(Buffer.from([0xfb, 0xff, 0xfe]))).toBe(
      'tg://login?token=-__-'
    )
    // No padding either: Telegram's own clients do not add it.
    expect(loginUrl(Buffer.from([1]))).toBe('tg://login?token=AQ')
  })
})

describe('beginning', () => {
  it('listens for the phone BEFORE asking for a token', async () => {
    /*
     * The other order leaves a window: a quick scan is accepted, the update
     * that says so has nobody listening, and the screen sits on a used token
     * until it expires.
     */
    const client = fakeClient([token(1)])
    const qr = await beginQr(client)
    expect(client.events).toEqual(['addEventHandler', 'auth.ExportLoginToken'])
    expect(loginUrl(qr.token)).toBe('tg://login?token=Afv__g')
    expect(qr.expires).toBe(seconds(T0) + 30)
  })

  it('an answer that is not a token is refused', async () => {
    await expect(beginQr(fakeClient([scanned(owner)]))).rejects.toThrow(
      /did not issue/
    )
    await expect(
      beginQr(
        fakeClient([{ className: 'auth.LoginToken', token: Buffer.alloc(0) }])
      )
    ).rejects.toThrow(/did not issue/)
  })
})

describe('Telegram is asked only when there is something to learn', () => {
  it('a fresh token that nobody scanned costs no call at all', async () => {
    const client = fakeClient([token(1)])
    const qr = await beginQr(client)
    for (let i = 0; i < 10; i++) {
      const step = await advanceQr(client, qr, T0 + i * 2000)
      expect(step).toEqual({
        state: 'waiting',
        url: loginUrl(qr.token),
        expires: seconds(T0) + 30,
      })
    }
    expect(client.count('auth.ExportLoginToken')).toBe(1)
  })

  it('a token about to run out is replaced, and the screen gets the new one', async () => {
    const client = fakeClient([token(1), token(2)])
    const qr = await beginQr(client)
    const before = loginUrl(qr.token)
    // Inside the margin: a QR that dies mid-scan sends the person back to the
    // start for no reason they can see.
    const step = await advanceQr(client, qr, T0 + 28_000)
    expect(step.state).toBe('waiting')
    expect((step as any).url).not.toBe(before)
    expect((step as any).expires).toBe(seconds(T0) + 60)
    expect(client.count('auth.ExportLoginToken')).toBe(2)
  })

  it('only the login update counts as the phone answering', async () => {
    const client = fakeClient([token(1)])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateUserStatus' })
    await advanceQr(client, qr, T0 + 1000)
    expect(client.count('auth.ExportLoginToken')).toBe(1)
  })

  it('two polls at once ask Telegram once', async () => {
    /*
     * The screen polls every two seconds and finishing takes longer. Without
     * the lock the second poll exports, switches and imports on the same
     * client in the middle of the first one doing it.
     */
    let release: (v: unknown) => void = () => {}
    const client = fakeClient([token(1), () => new Promise(r => (release = r))])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    const first = advanceQr(client, qr, T0 + 1000)
    const second = await advanceQr(client, qr, T0 + 1500)
    expect(second.state).toBe('waiting')
    // The first poll reaches Telegram a few ticks later (it imports the
    // package first); releasing before that would release nothing.
    await vi.waitFor(() =>
      expect(client.count('auth.ExportLoginToken')).toBe(2)
    )
    release(scanned(owner))
    expect((await first).state).toBe('done')
    expect(client.count('auth.ExportLoginToken')).toBe(2)
  })
})

describe('the phone accepted', () => {
  it('the second export is the login, and it names the account', async () => {
    const client = fakeClient([token(1), scanned(owner)])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    expect(await advanceQr(client, qr, T0 + 5000)).toEqual({
      state: 'done',
      account: {
        id: '229866794',
        username: 'owner',
        firstName: 'Dmitry',
        phone: '+79991234567',
      },
    })
  })

  it('an account on another data center: switch FIRST, then import THEIR token', async () => {
    /*
     * The owner's account lives on DC2 and a fresh client starts on DC4, so
     * this is not the rare branch, it is his. The migrated token is a
     * different one from the token on screen, and importing before the switch
     * sends it to a data center that has never heard of it.
     */
    const client = fakeClient([
      token(1),
      {
        className: 'auth.LoginTokenMigrateTo',
        dcId: 2,
        token: Buffer.from([0xaa, 0xbb]),
      },
      scanned(owner),
    ])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    const step = await advanceQr(client, qr, T0 + 5000)
    expect(step.state).toBe('done')
    expect(client.events.slice(-3)).toEqual([
      'auth.ExportLoginToken',
      'switchDC:2',
      'auth.ImportLoginToken:aabb',
    ])
  })

  it('two-factor protection: the password is asked for, and Telegram is left alone', async () => {
    const client = fakeClient([
      token(1),
      () => {
        const e: any = new Error('401: SESSION_PASSWORD_NEEDED')
        e.errorMessage = 'SESSION_PASSWORD_NEEDED'
        throw e
      },
    ])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    expect(await advanceQr(client, qr, T0 + 5000)).toEqual({
      state: 'password',
    })
    // Every later poll says the same without another auth call: the fake has
    // no answer left and would throw if asked.
    expect(await advanceQr(client, qr, T0 + 7000)).toEqual({
      state: 'password',
    })
    expect(await advanceQr(client, qr, T0 + 90_000)).toEqual({
      state: 'password',
    })
  })

  it('the password can be asked for AFTER the move to the other data center', async () => {
    const client = fakeClient([
      token(1),
      {
        className: 'auth.LoginTokenMigrateTo',
        dcId: 2,
        token: Buffer.from([1]),
      },
      () => {
        throw new Error('SESSION_PASSWORD_NEEDED')
      },
    ])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    expect(await advanceQr(client, qr, T0 + 5000)).toEqual({
      state: 'password',
    })
  })

  it('a scan that returns no account is an error, not a login', async () => {
    const client = fakeClient([token(1), scanned(null)])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    await expect(advanceQr(client, qr, T0 + 5000)).rejects.toThrow(/no account/)
    // And the lock is released: the next poll may ask again.
    expect(qr.busy).toBe(false)
  })

  it('an answer nobody expected is named, not swallowed', async () => {
    const client = fakeClient([token(1), { className: 'auth.Something' }])
    const qr = await beginQr(client)
    client.push({ className: 'UpdateLoginToken' })
    await expect(advanceQr(client, qr, T0 + 5000)).rejects.toThrow(
      /auth\.Something/
    )
  })
})

describe('a QR login is an attempt like any other', () => {
  const key = () => 'HANDLE'

  it('starts with a link to draw, and keeps one attempt', async () => {
    const client = fakeClient([token(1)])
    const started = await startQrLogin('1', async () => client, key)
    expect(started).toEqual({
      handle: 'HANDLE',
      url: 'tg://login?token=Afv__g',
      expires: seconds(T0) + 30,
    })
    expect(attemptCount()).toBe(1)
  })

  it('a start Telegram refused leaves nothing behind, client included', async () => {
    const client = fakeClient([
      () => {
        throw new Error('420: FLOOD_WAIT_60')
      },
    ])
    await expect(startQrLogin('1', async () => client, key)).rejects.toThrow(
      /FLOOD_WAIT_60/
    )
    expect(attemptCount()).toBe(0)
    expect(client.destroyed).toBe(1)
  })

  it('somebody else cannot poll it, and Telegram is not asked for them', async () => {
    const client = fakeClient([token(1)])
    await startQrLogin('1', async () => client, key)
    client.push({ className: 'UpdateLoginToken' })
    await expect(pollQrLogin('2', 'HANDLE', T0 + 1000)).rejects.toThrow(
      'начат другим'
    )
    await expect(pollQrLogin('1', 'NO-SUCH', T0 + 1000)).rejects.toThrow(
      'не начат или истёк'
    )
    expect(client.count('auth.ExportLoginToken')).toBe(1)
  })

  it('done: the session comes out once, the attempt is gone, the client is hung up', async () => {
    const client = fakeClient([token(1), scanned(owner)])
    await startQrLogin('1', async () => client, key)
    client.push({ className: 'UpdateLoginToken' })
    const done = await pollQrLogin('1', 'HANDLE', T0 + 5000)
    expect(done).toMatchObject({ state: 'done', session: 'SESSION' })
    expect(attemptCount()).toBe(0)
    // A connected GramJS client left behind pings Telegram for the life of the
    // process (hang-up.ts).
    expect(client.destroyed).toBe(1)
    await expect(pollQrLogin('1', 'HANDLE', T0 + 6000)).rejects.toThrow(
      'не начат или истёк'
    )
  })

  it('has no code to confirm: the code step refuses instead of signing in with an empty hash', async () => {
    const client = fakeClient([token(1)])
    await startQrLogin('1', async () => client, key)
    await expect(confirmCode('1', 'HANDLE', '12345')).rejects.toThrow('QR')
    expect(client.count('auth.SignIn')).toBe(0)
    // The attempt survives the mistake.
    expect(attemptCount()).toBe(1)
  })

  it('after the password the number comes from the account itself', async () => {
    const client = fakeClient([
      token(1),
      () => {
        throw new Error('SESSION_PASSWORD_NEEDED')
      },
    ])
    await startQrLogin('1', async () => client, key)
    client.push({ className: 'UpdateLoginToken' })
    expect(await pollQrLogin('1', 'HANDLE', T0 + 5000)).toEqual({
      state: 'password',
    })
    const done = await confirmPassword('1', 'HANDLE', 'secret')
    // Nobody typed a number during a QR login; the row in tg_sessions still
    // has to say whose session it is.
    expect(done.phone).toBe('+79991234567')
    expect(done.account?.username).toBe('owner')
    expect(client.destroyed).toBe(1)
    expect(attemptCount()).toBe(0)
  })

  it('is swept after ten minutes like a code attempt, and its client with it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
    const stale = fakeClient([token(1)])
    await startQrLogin(
      '1',
      async () => stale,
      () => 'OLD'
    )
    vi.advanceTimersByTime(11 * 60 * 1000)
    // Any later attempt triggers the sweep.
    await startQrLogin(
      '1',
      async () => fakeClient([token(1)]),
      () => 'NEW'
    )
    expect(stale.destroyed).toBe(1)
    await expect(pollQrLogin('1', 'OLD')).rejects.toThrow('не начат или истёк')
  })
})

describe('the routes', () => {
  /** A pool that parses the SQL it is given; an unknown query is an error. */
  function fakePool() {
    const rows = new Map<string, { session: string; phone: string | null }>()
    return {
      rows,
      pool: {
        async query(sql: string, params: unknown[] = []) {
          const q = sql.replace(/\s+/g, ' ').trim()
          if (/^CREATE TABLE/i.test(q)) return { rows: [] }
          if (/^INSERT INTO tg_sessions/i.test(q)) {
            rows.set(String(params[0]), {
              session: String(params[1]),
              phone: params[2] == null ? null : String(params[2]),
            })
            return { rows: [] }
          }
          throw new Error(`the fake pool was not told about: ${q.slice(0, 80)}`)
        },
      },
    }
  }

  const deps = (
    who: string | null,
    client: ReturnType<typeof fakeClient>,
    pool: ReturnType<typeof fakePool>['pool']
  ) => {
    let body = '{}'
    return {
      setBody: (b: unknown) => {
        body = JSON.stringify(b)
      },
      getPool: async () => pool,
      личность: () => who, // cyrillic-ok: pre-existing dependency name
      readBody: async () => body,
      создатьКлиент: async () => client, // cyrillic-ok: pre-existing dependency name
      случайныйКлюч: () => 'HANDLE', // cyrillic-ok: pre-existing dependency name
      выйтиВTelegram: async () => {}, // cyrillic-ok: pre-existing dependency name
    }
  }

  it('start, wait, scan: the session is stored under the person who asked, and never shown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
    const client = fakeClient([token(1), scanned(owner)])
    const { pool, rows } = fakePool()
    const d = deps('229866794', client, pool)

    const started = await handleRoute(
      { url: '/api/tg/connect/qr/start', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(started.тело).toEqual({
      ok: true,
      handle: 'HANDLE',
      url: 'tg://login?token=Afv__g',
      expires: seconds(T0) + 30,
    })

    d.setBody({ handle: 'HANDLE' })
    const waiting = await handleRoute(
      { url: '/api/tg/connect/qr/poll', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(waiting.тело).toMatchObject({ ok: true, state: 'waiting' })

    client.push({ className: 'UpdateLoginToken' })
    const done = await handleRoute(
      { url: '/api/tg/connect/qr/poll', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(done.тело).toEqual({
      ok: true,
      подключено: true, // cyrillic-ok: pre-existing response shape
      account: { username: 'owner', firstName: 'Dmitry', phoneEnding: '4567' },
    })
    expect(rows.get('229866794')).toEqual({
      session: 'SESSION',
      phone: '+79991234567',
    })
    /*
     * The session is stronger than a password, and the full number has no use
     * on a screen: the person knows their own, and screens get photographed.
     */
    const wire = JSON.stringify([started, waiting, done])
    expect(wire).not.toContain('SESSION')
    expect(wire).not.toContain('79991234567')
  })

  it('two-factor: the poll says so in the words the code step uses', async () => {
    const client = fakeClient([
      token(1),
      () => {
        throw new Error('SESSION_PASSWORD_NEEDED')
      },
    ])
    const { pool, rows } = fakePool()
    const d = deps('1', client, pool)
    await handleRoute(
      { url: '/api/tg/connect/qr/start', method: 'POST' },
      d as any
    )
    client.push({ className: 'UpdateLoginToken' })
    d.setBody({ handle: 'HANDLE' })
    const asked = await handleRoute(
      { url: '/api/tg/connect/qr/poll', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(asked.тело).toEqual({ ok: true, нужен_пароль: true })

    d.setBody({ handle: 'HANDLE', password: 'secret' })
    const done = await handleRoute(
      { url: '/api/tg/connect/password', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(done.тело).toMatchObject({ ok: true, подключено: true })
    expect(rows.get('1')?.phone).toBe('+79991234567')
  })

  it('without an identity no token is issued', async () => {
    const client = fakeClient([token(1)])
    const r = await handleRoute(
      { url: '/api/tg/connect/qr/start', method: 'POST' },
      deps(null, client, fakePool().pool) as any
    )
    expect(r.код).toBe(401) // cyrillic-ok: pre-existing response shape
    expect(client.events).toEqual([])
  })

  it('both paths are declared and pass the shared guard to the stricter one', () => {
    for (const path of [
      '/api/tg/connect/qr/start',
      '/api/tg/connect/qr/poll',
    ]) {
      expect(isConnectPath(path)).toBe(true)
      expect(
        isPublic({ url: path, method: 'POST', headers: {} } as any),
        `${path} is stopped by the guard: the handler never sees the request`
      ).toBe(true)
    }
  })
})
