import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeSentCode } from './src/agent/tg-code-delivery'
import {
  resendCode,
  начатьВход, // cyrillic-ok: pre-existing export
  подтвердитьКод, // cyrillic-ok: pre-existing export
  обработатьПодключение, // cyrillic-ok: pre-existing export
  забытьПопытки, // cyrillic-ok: pre-existing export
  числоПопыток, // cyrillic-ok: pre-existing export
} from './src/agent/tg-connect'

/**
 * "REQUEST A NEW CODE" HAS TO REACH TELEGRAM AS A RESEND.
 *
 * The owner, 2026-09-16, stuck on the code screen of the Mini App: nothing
 * arrived, and the resend button changed nothing. It could not have: the
 * button started the login again, which is `auth.sendCode` a second time --
 * the same code through the same channel -- and the screen described the
 * delivery with two words, "app" or "SMS", whatever Telegram had really done.
 *
 * What is pinned here: the resend continues the SAME attempt with
 * `auth.resendCode`, the hash follows Telegram's latest answer, the attempt
 * still belongs to one person, and the screen is told the real channel, the
 * next one, and how long Telegram asks to wait.
 */

const startLogin = начатьВход // cyrillic-ok: pre-existing export
const confirmCode = подтвердитьКод // cyrillic-ok: pre-existing export
const handleRoute = обработатьПодключение // cyrillic-ok: pre-existing export
const forgetAttempts = забытьПопытки // cyrillic-ok: pre-existing export
const attemptCount = числоПопыток // cyrillic-ok: pre-existing export

/** An `auth.sentCode` as the code under test reads it: by `className`. */
function sentCode(
  typeClass: string,
  extra: {
    hash?: string
    next?: string
    timeout?: number
    type?: Record<string, unknown>
  } = {}
) {
  return {
    className: 'auth.SentCode',
    type: { className: typeClass, length: 5, ...extra.type },
    phoneCodeHash: extra.hash ?? 'HASH-1',
    nextType: extra.next ? { className: extra.next } : undefined,
    timeout: extra.timeout,
  }
}

/**
 * A fake MTProto client that REFUSES WHAT GRAMJS REFUSES and records the rest.
 *
 * It rejects anything that is not a real request object, the way GramJS does
 * before serialising, and it throws on a request it was not told about: a fake
 * that agrees with everything is how a plain object once reached production
 * in place of `auth.signIn`.
 */
function fakeClient(
  script: {
    onSend?: (n: number) => unknown
    onResend?: (request: any, n: number) => unknown
  } = {}
) {
  const calls: any[] = []
  const count = (name: string) => calls.filter(c => c.className === name).length
  return {
    calls,
    count,
    apiId: 17,
    apiHash: 'hash-of-the-app',
    session: { save: () => 'SESSION' },
    async invoke(request: any) {
      if (!request || request.classType !== 'request') {
        throw new Error('You can only invoke MTProtoRequests')
      }
      calls.push(request)
      if (request.className === 'auth.SendCode') {
        return script.onSend
          ? script.onSend(count('auth.SendCode'))
          : sentCode('auth.SentCodeTypeApp')
      }
      if (request.className === 'auth.ResendCode') {
        return script.onResend
          ? script.onResend(request, count('auth.ResendCode'))
          : sentCode('auth.SentCodeTypeSms', { hash: 'HASH-2' })
      }
      if (request.className === 'auth.SignIn') return {}
      throw new Error(`the fake was not told about ${request.className}`)
    },
    async destroy() {},
  }
}

let keys = 0
const nextKey = () => `KEY-${++keys}`

beforeEach(() => {
  forgetAttempts()
  keys = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the delivery is reported, not guessed', () => {
  it('names every channel Telegram can answer with, each as itself', () => {
    const kinds = [
      'auth.SentCodeTypeApp',
      'auth.SentCodeTypeSms',
      'auth.SentCodeTypeCall',
      'auth.SentCodeTypeMissedCall',
      'auth.SentCodeTypeEmailCode',
      'auth.SentCodeTypeSetUpEmailRequired',
      'auth.SentCodeTypeFragmentSms',
    ].map(c => describeSentCode(sentCode(c)).delivery)
    expect(kinds).toEqual([
      'app',
      'sms',
      'call',
      'missed_call',
      'email',
      'email_setup',
      'fragment',
    ])
  })

  it('a login email is an email, with its masked address -- not "SMS"', () => {
    /*
     * This is the case the old two-word answer got wrong: `isCodeViaApp` was
     * false, so the screen said "sent by SMS" to a person whose code was in
     * their mailbox.
     */
    const d = describeSentCode(
      sentCode('auth.SentCodeTypeEmailCode', {
        type: { emailPattern: 'd***@gmail.com', length: 6 },
        next: 'auth.CodeTypeSms',
        timeout: 120,
      })
    )
    expect(d).toEqual({
      phoneCodeHash: 'HASH-1',
      delivery: 'email',
      length: 6,
      emailPattern: 'd***@gmail.com',
      next: 'sms',
      timeout: 120,
    })
  })

  it('no next channel is said as null, and an unsaid timeout is left out', () => {
    // The third-party case: in-app delivery and nothing else on offer. The
    // screen hides the resend button on `next: null`, so it must not be
    // defaulted to a channel, and a made-up timeout would be our constant
    // wearing Telegram's name.
    const d = describeSentCode(sentCode('auth.SentCodeTypeApp'))
    expect(d.next).toBeNull()
    expect('timeout' in d).toBe(false)
  })

  it('a type Telegram adds tomorrow is "unknown", never an assumed channel', () => {
    expect(
      describeSentCode(sentCode('auth.SentCodeTypeCarrierPigeon'))
    ).toEqual({
      phoneCodeHash: 'HASH-1',
      delivery: 'unknown',
      length: 5,
      next: null,
    })
  })

  it('an answer without a code to type is refused, not stored', () => {
    expect(() =>
      describeSentCode({ className: 'auth.SentCodeSuccess' })
    ).toThrow(/without a code/)
    expect(() =>
      describeSentCode({ className: 'auth.SentCode', type: {} })
    ).toThrow(/did not confirm/)
    expect(() => describeSentCode(undefined)).toThrow(/did not confirm/)
  })
})

describe('starting the login keeps the whole answer', () => {
  it('sends a real auth.SendCode with the normalised number', async () => {
    const client = fakeClient()
    await startLogin('1', '+7 (999) 123-45-67', async () => client, nextKey)
    expect(client.calls).toHaveLength(1)
    const request = client.calls[0]
    expect(request.className).toBe('auth.SendCode')
    expect(request.phoneNumber).toBe('+79991234567')
    expect(request.apiId).toBe(17)
    expect(request.apiHash).toBe('hash-of-the-app')
  })

  it('returns channel, next channel and timeout; viaApp only for the app', async () => {
    const viaEmail = await startLogin(
      '1',
      '+79991234567',
      async () =>
        fakeClient({
          onSend: () =>
            sentCode('auth.SentCodeTypeEmailCode', {
              type: { emailPattern: 'd***@gmail.com' },
              next: 'auth.CodeTypeCall',
              timeout: 90,
            }),
        }),
      nextKey
    )
    expect(viaEmail).toEqual({
      handle: 'KEY-1',
      phone: '+79991234567',
      viaApp: false,
      delivery: 'email',
      length: 5,
      emailPattern: 'd***@gmail.com',
      next: 'call',
      timeout: 90,
    })

    const viaApp = await startLogin(
      '1',
      '+79991234567',
      async () => fakeClient(),
      nextKey
    )
    expect(viaApp.viaApp).toBe(true)
    expect(viaApp.delivery).toBe('app')
  })

  it('AUTH_RESTART is retried once; any other refusal is not', async () => {
    const restarting = fakeClient({
      onSend: n => {
        if (n === 1)
          throw new Error('500: AUTH_RESTART (caused by auth.SendCode)')
        return sentCode('auth.SentCodeTypeApp')
      },
    })
    await startLogin('1', '+79991234567', async () => restarting, nextKey)
    expect(restarting.count('auth.SendCode')).toBe(2)

    const flooded = fakeClient({
      onSend: () => {
        throw new Error('400: PHONE_NUMBER_FLOOD (caused by auth.SendCode)')
      },
    })
    await expect(
      startLogin('1', '+79991234567', async () => flooded, nextKey)
    ).rejects.toThrow(/PHONE_NUMBER_FLOOD/)
    expect(flooded.count('auth.SendCode')).toBe(1)
    // A refused start leaves no attempt behind: only the first login is kept.
    expect(attemptCount()).toBe(1)
  })
})

describe('a resend continues the same attempt', () => {
  it('calls auth.resendCode with the current hash, and nothing is started again', async () => {
    const client = fakeClient()
    let clientsMade = 0
    const { handle } = await startLogin(
      '1',
      '+79991234567',
      async () => {
        clientsMade++
        return client
      },
      nextKey
    )
    const again = await resendCode('1', handle)

    expect(client.count('auth.SendCode')).toBe(1)
    expect(client.count('auth.ResendCode')).toBe(1)
    const request = client.calls[1]
    expect(request.className).toBe('auth.ResendCode')
    expect(request.phoneNumber).toBe('+79991234567')
    expect(request.phoneCodeHash).toBe('HASH-1')
    // The old button made a second client and a second attempt per press.
    expect(clientsMade).toBe(1)
    expect(attemptCount()).toBe(1)
    expect(again).toEqual({
      handle,
      phone: '+79991234567',
      viaApp: false,
      delivery: 'sms',
      length: 5,
      next: null,
    })
  })

  it('the sign-in uses the hash of the LATEST answer, resend after resend', async () => {
    /*
     * Signing in against a stale hash fails with PHONE_CODE_EXPIRED on a code
     * the person typed correctly -- the screen would blame them for our
     * bookkeeping.
     */
    const client = fakeClient({
      onResend: (_request, n) =>
        sentCode('auth.SentCodeTypeSms', { hash: `HASH-${n + 1}` }),
    })
    const { handle } = await startLogin(
      '1',
      '+79991234567',
      async () => client,
      nextKey
    )
    await resendCode('1', handle)
    await resendCode('1', handle)
    await confirmCode('1', handle, '12345')

    const resends = client.calls.filter(c => c.className === 'auth.ResendCode')
    expect(resends.map(r => r.phoneCodeHash)).toEqual(['HASH-1', 'HASH-2'])
    const signIn = client.calls.find(c => c.className === 'auth.SignIn')
    expect(signIn.phoneCodeHash).toBe('HASH-3')
  })

  it('somebody else cannot make Telegram resend, and Telegram is not asked', async () => {
    const client = fakeClient()
    const { handle } = await startLogin(
      '1',
      '+79991234567',
      async () => client,
      nextKey
    )
    await expect(resendCode('2', handle)).rejects.toThrow('начат другим')
    await expect(resendCode('1', 'no-such-handle')).rejects.toThrow(
      'не начат или истёк'
    )
    expect(client.count('auth.ResendCode')).toBe(0)
  })

  it("Telegram's refusal is passed on, and the first code can still be typed", async () => {
    const client = fakeClient({
      onResend: () => {
        throw new Error(
          '400: SEND_CODE_UNAVAILABLE (caused by auth.ResendCode)'
        )
      },
    })
    const { handle } = await startLogin(
      '1',
      '+79991234567',
      async () => client,
      nextKey
    )
    await expect(resendCode('1', handle)).rejects.toThrow(
      /SEND_CODE_UNAVAILABLE/
    )
    const done = await confirmCode('1', handle, '12345')
    expect(done.сессия).toBe('SESSION') // cyrillic-ok: pre-existing field name
    const signIn = client.calls.find(c => c.className === 'auth.SignIn')
    expect(signIn.phoneCodeHash).toBe('HASH-1')
  })

  it('a fresh code gets a fresh ten minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T10:00:00Z'))
    const minutes = (n: number) => n * 60 * 1000

    // Control: without a resend the attempt is gone after ten minutes. If this
    // stops failing, the second half below proves nothing.
    const stale = await startLogin(
      '1',
      '+79991234567',
      async () => fakeClient(),
      nextKey
    )
    vi.advanceTimersByTime(minutes(11))
    await expect(confirmCode('1', stale.handle, '12345')).rejects.toThrow(
      'не начат или истёк'
    )

    const fresh = await startLogin(
      '1',
      '+79991234567',
      async () => fakeClient(),
      nextKey
    )
    vi.advanceTimersByTime(minutes(9))
    await resendCode('1', fresh.handle)
    vi.advanceTimersByTime(minutes(9))
    const done = await confirmCode('1', fresh.handle, '12345')
    expect(done.сессия).toBe('SESSION') // cyrillic-ok: pre-existing field name
  })
})

describe('the routes tell the screen what it needs, and nothing more', () => {
  const deps = (who: string | null, client: ReturnType<typeof fakeClient>) => {
    let body = JSON.stringify({ phone: '+79991234567' })
    return {
      setBody: (b: unknown) => {
        body = JSON.stringify(b)
      },
      getPool: async () => ({
        query: async (sql: string) => {
          throw new Error(`no SQL is expected on these routes: ${sql}`)
        },
      }),
      личность: () => who, // cyrillic-ok: pre-existing dependency name
      readBody: async () => body,
      создатьКлиент: async () => client, // cyrillic-ok: pre-existing dependency name
      случайныйКлюч: nextKey, // cyrillic-ok: pre-existing dependency name
      выйтиВTelegram: async () => {}, // cyrillic-ok: pre-existing dependency name
    }
  }

  it('start and resend answer with the delivery, and never with the hash', async () => {
    const client = fakeClient({
      onSend: () =>
        sentCode('auth.SentCodeTypeApp', {
          next: 'auth.CodeTypeSms',
          timeout: 120,
        }),
    })
    const d = deps('1', client)
    const started = await handleRoute(
      { url: '/api/tg/connect/start', method: 'POST' },
      d as any
    )
    // cyrillic-ok-next-line: pre-existing response shape
    expect(started.тело).toEqual({
      ok: true,
      handle: 'KEY-1',
      phone: '+79991234567',
      viaApp: true,
      delivery: 'app',
      length: 5,
      next: 'sms',
      timeout: 120,
    })

    d.setBody({ handle: 'KEY-1' })
    const resent = await handleRoute(
      { url: '/api/tg/connect/resend', method: 'POST' },
      d as any
    )
    expect(resent.код).toBe(200) // cyrillic-ok: pre-existing response shape
    // cyrillic-ok-next-line: pre-existing response shape
    expect(resent.тело).toEqual({
      ok: true,
      handle: 'KEY-1',
      phone: '+79991234567',
      viaApp: false,
      delivery: 'sms',
      length: 5,
      next: null,
    })
    /*
     * The hash is half of what signs a person in; the other half is the code
     * they are about to type into this very screen. It stays on the server.
     */
    const wire = JSON.stringify([started, resent])
    expect(wire).not.toContain('HASH-1')
    expect(wire).not.toContain('HASH-2')
    expect(wire).not.toContain('phoneCodeHash')
  })

  it('a refusal from Telegram reaches the person in its own words', async () => {
    const client = fakeClient({
      onResend: () => {
        throw new Error(
          '400: SEND_CODE_UNAVAILABLE (caused by auth.ResendCode)'
        )
      },
    })
    const d = deps('1', client)
    await handleRoute(
      { url: '/api/tg/connect/start', method: 'POST' },
      d as any
    )
    d.setBody({ handle: 'KEY-1' })
    const r = await handleRoute(
      { url: '/api/tg/connect/resend', method: 'POST' },
      d as any
    )
    expect(r.код).toBe(400) // cyrillic-ok: pre-existing response shape
    // cyrillic-ok-next-line: pre-existing response shape
    expect(String(r.тело.error)).toContain('SEND_CODE_UNAVAILABLE')
  })

  it('without an identity nothing is resent', async () => {
    const client = fakeClient()
    const r = await handleRoute(
      { url: '/api/tg/connect/resend', method: 'POST' },
      deps(null, client) as any
    )
    expect(r.код).toBe(401) // cyrillic-ok: pre-existing response shape
    expect(client.calls).toHaveLength(0)
  })
})
