import { describe, it, expect, beforeEach } from 'vitest'
import {
  signAccessToken,
  verifyAppSession,
  SessionError,
  setRevokedSessions,
  issueRefreshToken,
  rotateRefreshToken,
  digest,
  REUSE_GRACE_SECONDS,
} from './session'

/**
 * These tests exist because the module is full of confident prose, and prose
 * is not evidence. Each one deletes an assumption: that the signature is
 * checked, that `alg` cannot be negotiated, that a reused refresh token burns
 * the whole family rather than just itself.
 */

const KEY = 'test-key-that-is-definitely-long-enough-0123456789'

beforeEach(() => {
  process.env.SESSION_SIGNING_KEY = KEY
  setRevokedSessions([])
})

const mint = (over: Partial<Parameters<typeof signAccessToken>[0]> = {}) =>
  signAccessToken({
    telegramId: '144022504',
    sessionId: 'sess-1',
    deviceKeyThumbprint: 'dk-1',
    ...over,
  })

describe('access token', () => {
  it('round-trips the identity it was given', () => {
    const claims = verifyAppSession(mint())
    expect(claims.sub).toBe('144022504')
    expect(claims.sid).toBe('sess-1')
    expect(claims.dkt).toBe('dk-1')
  })

  it('rejects a tampered payload', () => {
    const [h, b, s] = mint().split('.')
    const forged = JSON.parse(Buffer.from(b, 'base64url').toString())
    forged.sub = '999999'
    const swapped = Buffer.from(JSON.stringify(forged)).toString('base64url')
    expect(() => verifyAppSession(`${h}.${swapped}.${s}`)).toThrow(SessionError)
  })

  it('refuses alg:none', () => {
    // The classic. A header claiming no algorithm, with an empty signature.
    const claims = Buffer.from(
      JSON.stringify({
        sub: 'x',
        sid: 'y',
        dkt: 'z',
        jti: 'j',
        iat: 1,
        exp: 9e9,
        v: 1,
      })
    ).toString('base64url')
    const head = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url')
    expect(() => verifyAppSession(`${head}.${claims}.`)).toThrow(
      /algorithm none refused/
    )
  })

  it('refuses a key-resolution header', () => {
    // `kid` invites the verifier to fetch a key of the attacker's choosing.
    const head = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'https://evil/key' })
    ).toString('base64url')
    const [, b, s] = mint().split('.')
    expect(() => verifyAppSession(`${head}.${b}.${s}`)).toThrow(
      /key-resolution/
    )
  })

  it('rejects an expired token, and honours clock skew', () => {
    // Один и тот же момент для чеканки и проверки: иначе тест сравнивает
    // токен из реального «сейчас» с вымышленной эпохой и падает на «выдан
    // в будущем», ничего не сказав про срок годности.
    const now = 1_800_000_000
    const t = mint({ now })
    // Inside the skew window: still good.
    expect(() => verifyAppSession(t, now + 600 + 30)).not.toThrow()
    // Past it: refused.
    expect(() => verifyAppSession(t, now + 600 + 3600)).toThrow(/expired/)
  })

  it('rejects a revoked session even though the signature is valid', () => {
    const t = mint()
    expect(() => verifyAppSession(t)).not.toThrow()
    setRevokedSessions(['sess-1'])
    expect(() => verifyAppSession(t)).toThrow(/revoked/)
  })

  it('refuses to sign without a real key', () => {
    process.env.SESSION_SIGNING_KEY = 'short'
    expect(() => mint()).toThrow(/SESSION_SIGNING_KEY/)
  })
})

describe('refresh rotation', () => {
  interface Row {
    familyId: string
    usedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
  }

  function makeStore() {
    const rows = new Map<string, Row>()
    const sessionsOf = new Map<string, string[]>()
    return {
      rows,
      sessionsOf,
      async find(h: string) {
        return rows.get(h) ?? null
      },
      async consumeAndInsert(h: string, next: string, exp: Date) {
        const r = rows.get(h)
        if (!r || r.usedAt || r.revokedAt || r.expiresAt <= new Date()) {
          return false
        }
        r.usedAt = new Date()
        rows.set(next, {
          familyId: r.familyId,
          usedAt: null,
          revokedAt: null,
          expiresAt: exp,
        })
        return true
      },
      async revokeFamily(f: string) {
        for (const r of rows.values())
          if (r.familyId === f) r.revokedAt = new Date()
        return sessionsOf.get(f) ?? []
      },
      async insertInitial(h: string, f: string, exp: Date) {
        rows.set(h, {
          familyId: f,
          usedAt: null,
          revokedAt: null,
          expiresAt: exp,
        })
      },
    }
  }

  it('stores only the hash, never the token', () => {
    const issued = issueRefreshToken()
    expect(issued.hash).toBe(digest(issued.token))
    expect(issued.hash).not.toBe(issued.token)
  })

  it('rotates once and refuses the old token afterwards', async () => {
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insertInitial(first.hash, 'fam-1', first.expiresAt)

    const r1 = await rotateRefreshToken(first.token, store)
    expect(r1.ok).toBe(true)

    // Тот же токен ПОЗЖЕ окна гонки — это сигнал кражи.
    const позже = new Date(Date.now() + (REUSE_GRACE_SECONDS + 1) * 1000)
    const r2 = await rotateRefreshToken(first.token, store, позже)
    expect(r2).toMatchObject({ ok: false, reason: 'reused' })
  })

  it('повтор в первые секунды — гонка вкладок, а НЕ кража', async () => {
    /*
     * Две вкладки одного браузера держат общий refresh в localStorage и заводят
     * таймер от общего срока: они приходят с разницей в миллисекунды. Раньше
     * проигравший читался как вор, и гасилась вся семья — человека выбрасывало
     * из приложения и возвращало за восьмизначным кодом. Без злоумышленника.
     */
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insertInitial(first.hash, 'fam-1', first.expiresAt)
    store.sessionsOf.set('fam-1', ['sess-a'])

    const r1 = await rotateRefreshToken(first.token, store)
    expect(r1.ok).toBe(true)
    const second = (r1 as { ok: true; next: { token: string } }).next.token

    const r2 = await rotateRefreshToken(first.token, store)
    expect(r2).toMatchObject({ ok: false, reason: 'raced' })

    // ГЛАВНОЕ: победитель гонки продолжает работать. Если семья погашена, эта
    // строка вернёт `revoked`, и человек уже выброшен.
    const r3 = await rotateRefreshToken(second, store)
    expect(r3.ok).toBe(true)
  })

  it('граница окна — не «примерно», а именно REUSE_GRACE_SECONDS', async () => {
    // Иначе окно можно молча растянуть до суток, и защита от кражи исчезнет,
    // не сломав ни одного теста.
    const внутри = async (сдвигСекунд: number) => {
      const store = makeStore()
      const first = issueRefreshToken()
      await store.insertInitial(first.hash, 'fam-край', first.expiresAt)
      store.sessionsOf.set('fam-край', ['sess-край'])
      await rotateRefreshToken(first.token, store)
      const r = await rotateRefreshToken(
        first.token,
        store,
        new Date(Date.now() + сдвигСекунд * 1000)
      )
      return (r as { reason: string }).reason
    }
    expect(await внутри(REUSE_GRACE_SECONDS - 1)).toBe('raced')
    expect(await внутри(REUSE_GRACE_SECONDS + 1)).toBe('reused')

    /*
     * И ОТДЕЛЬНО — В АБСОЛЮТНЫХ СЕКУНДАХ.
     *
     * Две строки выше сдвигаются вместе с константой: растяни окно до суток —
     * и они останутся зелёными, потому что меряют «на секунду больше самого
     * себя». Это ровно та форма теста, которая доказывает форму и не
     * доказывает величину. Мутация «REUSE_GRACE_SECONDS = 86400» прошла сквозь
     * них насквозь.
     *
     * Смысл окна — «миллисекунды между вкладками», а не «сколько-нибудь».
     * Минута уже кража при любом значении константы.
     */
    expect(REUSE_GRACE_SECONDS).toBeLessThanOrEqual(60)
    expect(await внутри(60)).toBe('reused')
    expect(await внутри(3600)).toBe('reused')
  })

  it('проигрыш гонки ВНУТРИ базы не гасит семью', async () => {
    /*
     * Ветка `consumeAndInsert -> false`: `find` увидел непотраченный токен, а
     * `UPDATE … WHERE used_at IS NULL` строки не нашёл — значит её потратили в
     * промежутке между двумя запросами, то есть миллисекунды назад.
     *
     * Тест выше («two refreshes race») до этой ветки НЕ ДОХОДИТ: подставное
     * хранилище отвечает синхронно, второй вызов застаёт уже проставленный
     * usedAt и уходит в ветку выше. Мутация «здесь снова гасить семью» прошла
     * сквозь него незамеченной, потому что он проверял не тот путь, что назван
     * в его имени.
     */
    let гасили = false
    const store = {
      async find() {
        return {
          familyId: 'fam-db',
          usedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86_400_000),
        }
      },
      async consumeAndInsert() {
        return false // строку забрали между find и update
      },
      async revokeFamily() {
        гасили = true
        return ['sess-db']
      },
    }
    const r = await rotateRefreshToken('какой-то-токен', store)
    expect(r).toMatchObject({ ok: false, reason: 'raced' })
    expect(гасили, 'семья погашена за гонку внутри базы').toBe(false)
  })

  it('reuse revokes the WHOLE family, not just the presented token', async () => {
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insertInitial(first.hash, 'fam-1', first.expiresAt)
    store.sessionsOf.set('fam-1', ['sess-a', 'sess-b'])

    const r1 = await rotateRefreshToken(first.token, store)
    expect(r1.ok).toBe(true)
    const second = (r1 as { ok: true; next: { token: string } }).next.token

    // Позже окна гонки: сейчас это кража, а не две вкладки.
    await rotateRefreshToken(
      first.token,
      store,
      new Date(Date.now() + (REUSE_GRACE_SECONDS + 1) * 1000)
    )

    // The descendant is dead too — that is the point of family revocation.
    const r3 = await rotateRefreshToken(second, store)
    expect(r3).toMatchObject({ ok: false, reason: 'revoked' })

    // And the sessions it minted are refused without waiting for a poll.
    process.env.SESSION_SIGNING_KEY = KEY
    const t = signAccessToken({
      telegramId: '1',
      sessionId: 'sess-a',
      deviceKeyThumbprint: 'd',
    })
    expect(() => verifyAppSession(t)).toThrow(/revoked/)
  })

  it('refuses an expired refresh token', async () => {
    const store = makeStore()
    const old = issueRefreshToken(new Date(Date.now() - 90 * 24 * 3600 * 1000))
    await store.insertInitial(old.hash, 'fam-1', old.expiresAt)
    expect(await rotateRefreshToken(old.token, store)).toMatchObject({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a token it has never seen', async () => {
    expect(await rotateRefreshToken('made-up', makeStore())).toMatchObject({
      ok: false,
      reason: 'unknown',
    })
  })

  it('allows only one child when two refreshes race', async () => {
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insertInitial(first.hash, 'fam-race', first.expiresAt)
    store.sessionsOf.set('fam-race', ['sess-race'])

    const outcomes = await Promise.all([
      rotateRefreshToken(first.token, store),
      rotateRefreshToken(first.token, store),
    ])

    expect(outcomes.filter(result => result.ok)).toHaveLength(1)
    expect(outcomes.filter(result => !result.ok)).toEqual([
      expect.objectContaining({ reason: 'raced' }),
    ])

    /*
     * Ребёнок ровно один — второй попытки не породила. И он ЖИВОЙ: проигрыш в
     * `consumeAndInsert` — гонка по построению (`find` видел непотраченный
     * токен, а `UPDATE … WHERE used_at IS NULL` строки не нашёл, значит её
     * потратили в промежутке в миллисекунды). Гасить за это семью значило
     * наказывать человека за то, что он открыл две вкладки.
     */
    const liveChildren = [...store.rows.values()].filter(
      row =>
        row.familyId === 'fam-race' &&
        row.usedAt === null &&
        row.revokedAt === null
    )
    expect(liveChildren).toHaveLength(1)
  })
})
