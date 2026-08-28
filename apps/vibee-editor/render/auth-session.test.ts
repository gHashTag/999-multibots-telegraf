import { describe, it, expect, beforeEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { authenticate } from './auth'
import { signAccessToken, setRevokedSessions } from './session'

/**
 * The session branch inside authenticate(). These tests exist because the
 * branch is short and reads obviously correct — which is exactly the kind of
 * code that turns out to accept a forged token.
 */

const KEY = 'test-signing-key-long-enough-for-the-check-0123456789'

/**
 * ЗАКРЫТЫЙ путь. Первая версия брала `/api/feed/1` — а он публичный, и
 * `isPublic` возвращала `via: 'public'` раньше, чем ветка сессии успевала
 * что-либо проверить. Тест зелёный на неверном основании хуже красного.
 */
function req(
  headers: Record<string, string>,
  url = '/api/tokens/balance'
): IncomingMessage {
  return { headers, url, method: 'GET' } as unknown as IncomingMessage
}

beforeEach(() => {
  process.env.SESSION_SIGNING_KEY = KEY
  // Имя переменной именно RENDER_AUTH_MODE. Первая версия ставила AUTH_MODE,
  // и тесты падали на «allowed: true» — потому что режим оставался 'warn' по
  // умолчанию, а в нём отказ пропускается. Три падения подряд объяснялись
  // одной опечаткой в тесте, а не поведением кода.
  process.env.RENDER_AUTH_MODE = 'enforce'
  setRevokedSessions([])
})

const token = () =>
  signAccessToken({
    telegramId: '144022504',
    sessionId: 's1',
    deviceKeyThumbprint: 'd1',
  })

describe('authenticate: Bearer session', () => {
  it('admits a valid token and reports whose it is', () => {
    const r = authenticate(req({ authorization: `Bearer ${token()}` }))
    expect(r.allowed).toBe(true)
    expect(r.via).toBe('session')
    expect(r.telegramId).toBe('144022504')
  })

  it('refuses a tampered token', () => {
    const [h, b, s] = token().split('.')
    const forged = JSON.parse(Buffer.from(b, 'base64url').toString())
    forged.sub = '999'
    const swapped = Buffer.from(JSON.stringify(forged)).toString('base64url')
    const r = authenticate(
      req({ authorization: `Bearer ${h}.${swapped}.${s}` })
    )
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/bad_signature/)
  })

  it('refuses a revoked session and names the reason', () => {
    const t = token()
    expect(authenticate(req({ authorization: `Bearer ${t}` })).allowed).toBe(
      true
    )
    setRevokedSessions(['s1'])
    const r = authenticate(req({ authorization: `Bearer ${t}` }))
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/revoked/)
  })

  it('does NOT fall through to the initData branch when Bearer is bad', () => {
    /**
     * The important one. A client that sent Bearer declared how it
     * authenticates; silently trying the next method would answer
     * "unauthorized" without telling it the token needs refreshing.
     */
    const r = authenticate(
      req({
        authorization: 'Bearer garbage',
        'x-telegram-init-data': 'user={"id":"1"}',
      })
    )
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/^session rejected/)
    expect(r.reason).not.toMatch(/initData/)
  })

  it('leaves other methods untouched', () => {
    // No Authorization header at all — the initData path must still run.
    const r = authenticate(req({ 'x-telegram-init-data': 'nonsense' }))
    expect(r.reason).toMatch(/initData/)
  })

  it('ignores a non-Bearer Authorization header', () => {
    // Basic auth is not ours; it must not be mistaken for a session.
    const r = authenticate(req({ authorization: 'Basic dXNlcjpwYXNz' }))
    expect(r.via).not.toBe('session')
  })
})
