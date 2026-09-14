/**
 * App sessions for the native client.
 *
 * WHY THIS EXISTS. The server proves who you are from `X-Telegram-Init-Data`,
 * a signature that only exists inside a Telegram WebView. A native iOS app
 * cannot produce it, so it needs its own way to say "I am telegram_id N" —
 * one that is at least as hard to forge.
 *
 * The shape: a short-lived access token this module verifies SYNCHRONOUSLY on
 * every request, plus a long-lived opaque refresh token that rotates. The
 * split exists because the access path runs on every single API call and
 * cannot afford a database round trip, while revocation must still take
 * effect in seconds rather than at the token's natural expiry.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not talk to Telegram. Establishing
 * WHO the person is happens elsewhere (OIDC exchange); this module only
 * turns an already-proven telegram_id into a session and back. Keeping that
 * boundary means the identity proof can change without touching session
 * handling.
 */

import crypto from 'node:crypto'

/** Access token lifetime. Short on purpose — see `revoke`. */
const ACCESS_TTL_SECONDS = 600

/** Refresh lifetime. Long, because rotation makes age far less interesting. */
const REFRESH_TTL_SECONDS = 60 * 24 * 3600

/**
 * Clock skew allowance when checking `exp`/`iat`.
 *
 * Device clocks drift, and a person whose phone is 40 seconds fast should not
 * be locked out. Sixty seconds is the usual allowance; larger windows start
 * to matter for replay.
 */
const CLOCK_SKEW_SECONDS = 60

export interface SessionClaims {
  /** telegram_id — the only identity claim that means anything downstream. */
  sub: string
  /** Session id. Revocation works on this, not on the token itself. */
  sid: string
  /*
   * Отпечаток ключа устройства — ЗАРЕЗЕРВИРОВАН, А НЕ РАБОТАЕТ.
   *
   * Здесь было написано «привязывает токен к одному устройству». Проверено
   * 07.09.2026: не привязывает и привязать нечем.
   *
   *   verifyAppSession сверяет форму, алгоритм, подпись, срок и отзыв —
   *   и НИ РАЗУ не смотрит на dkt;
   *   ни один клиент не отправляет device_pubkey: ни мини-апп, ни iOS —
   *   поиск по всему репозиторию не находит ни одной отправки;
   *   значит поле пусто в каждом выданном токене.
   *
   * Обещание защиты, которой нет, опаснее её отсутствия: на него опираются.
   * Автор `deviceThumbprint` в session-routes.ts был точен — «колонка есть,
   * она заполнится», — а этот комментарий говорил, будто уже заполнилась.
   *
   * Что теперь ДЕЙСТВИТЕЛЬНО происходит: если у сессии записан ключ, обмен
   * refresh-токена требует его предъявления (см. session-routes.ts). Пока
   * ключей нет ни у кого, это ничего не меняет, — но перестаёт быть
   * украшением в тот день, когда первый клиент его пришлёт.
   */
  dkt: string
  /** Unique per token, so a leaked token can be named in a log. */
  jti: string
  iat: number
  exp: number
  /** Claim-set version, so a future change can be rejected rather than guessed. */
  v: 1
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'malformed'
      | 'bad_algorithm'
      | 'bad_signature'
      | 'expired'
      | 'not_yet_valid'
      | 'revoked'
      | 'revocation_unavailable'
      | 'wrong_version'
      | 'wrong_audience'
  ) {
    super(message)
  }
}

const b64url = (b: Buffer) => b.toString('base64url')
const unb64url = (s: string) => Buffer.from(s, 'base64url')

function signingKey(): Buffer {
  const raw = process.env.SESSION_SIGNING_KEY
  if (!raw || raw.length < 32) {
    // Loud failure, not a silent weak default. A signing key that quietly
    // falls back to something guessable is worse than no sessions at all:
    // everything keeps working and nothing is actually protected.
    throw new Error(
      'SESSION_SIGNING_KEY is missing or shorter than 32 chars. ' +
        'Generate one with: openssl rand -base64 48'
    )
  }
  return Buffer.from(raw, 'utf8')
}

/** sha256 as base64url — used for refresh tokens and device keys alike. */
export function digest(value: string): string {
  return b64url(crypto.createHash('sha256').update(value, 'utf8').digest())
}

// ─── Access token ────────────────────────────────────────────────────────

/**
 * Sign an access token.
 *
 * Deliberately hand-rolled rather than a JWT library. Not because libraries
 * are bad, but because the generic `verify` of most of them accepts an
 * algorithm list from the token header — and that is the root of the whole
 * `alg: none` / RS256→HS256 confusion family. Here the algorithm is a
 * literal in the code and cannot be negotiated by the caller.
 */
export function signAccessToken(params: {
  telegramId: string
  sessionId: string
  deviceKeyThumbprint: string
  now?: number
}): string {
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const claims: SessionClaims = {
    sub: params.telegramId,
    sid: params.sessionId,
    dkt: params.deviceKeyThumbprint,
    jti: b64url(crypto.randomBytes(12)),
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    v: 1,
  }
  const head = b64url(Buffer.from(JSON.stringify(header), 'utf8'))
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = crypto
    .createHmac('sha256', signingKey())
    .update(`${head}.${body}`, 'utf8')
    .digest()
  return `${head}.${body}.${b64url(mac)}`
}

/**
 * Verify an access token. SYNCHRONOUS and self-contained by design.
 *
 * This runs on every request, so it must not touch the database. Revocation
 * therefore relies on an in-memory set refreshed in the background — see
 * `setRevokedSessions`. That trade is the reason `ACCESS_TTL_SECONDS` is ten
 * minutes and not ten hours: a revoked session stops working within the
 * refresh window in the worst case, and within seconds in the normal one.
 */
export function verifyAppSession(token: string, now?: number): SessionClaims {
  const parts = token.split('.')
  if (parts.length !== 3)
    throw new SessionError('token is not three parts', 'malformed')
  const [head, body, sig] = parts

  let header: Record<string, unknown>
  try {
    header = JSON.parse(unb64url(head).toString('utf8'))
  } catch {
    throw new SessionError('header is not JSON', 'malformed')
  }

  /**
   * Algorithm checked by string equality BEFORE any crypto runs, and key-
   * resolution hints are rejected outright.
   *
   * `kid`, `jku` and `x5u` all tell a verifier where to find a key. We have
   * exactly one key and it is not negotiable, so their presence means either
   * a bug or an attempt — both worth refusing rather than ignoring.
   */
  if (header.alg !== 'HS256') {
    throw new SessionError(
      `algorithm ${String(header.alg)} refused`,
      'bad_algorithm'
    )
  }
  if ('kid' in header || 'jku' in header || 'x5u' in header) {
    throw new SessionError('key-resolution header refused', 'bad_algorithm')
  }

  const expected = crypto
    .createHmac('sha256', signingKey())
    .update(`${head}.${body}`, 'utf8')
    .digest()
  const given = unb64url(sig)
  // Constant-time, and length-checked first: timingSafeEqual throws on a
  // length mismatch, and that throw would itself be a signal.
  if (
    given.length !== expected.length ||
    !crypto.timingSafeEqual(given, expected)
  ) {
    throw new SessionError('signature mismatch', 'bad_signature')
  }

  let claims: SessionClaims
  try {
    claims = JSON.parse(unb64url(body).toString('utf8'))
  } catch {
    throw new SessionError('claims are not JSON', 'malformed')
  }

  if (claims.v !== 1)
    throw new SessionError('unknown claim version', 'wrong_version')
  if (!claims.sub || !claims.sid)
    throw new SessionError('sub/sid missing', 'malformed')

  const t = now ?? Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || t > claims.exp + CLOCK_SKEW_SECONDS) {
    throw new SessionError('token expired', 'expired')
  }
  if (typeof claims.iat !== 'number' || claims.iat > t + CLOCK_SKEW_SECONDS) {
    throw new SessionError('token issued in the future', 'not_yet_valid')
  }
  if (
    !revocationsSyncedAt ||
    Date.now() - revocationsSyncedAt > REVOCATION_SYNC_MAX_AGE_MS
  ) {
    throw new SessionError(
      'revocation state is unavailable',
      'revocation_unavailable'
    )
  }
  if (revoked.has(claims.sid)) {
    throw new SessionError('session revoked', 'revoked')
  }
  if (claims.iat < (notBefore.get(claims.sub) ?? 0)) {
    throw new SessionError(
      'session issued before sign-out everywhere',
      'revoked'
    )
  }
  return claims
}

// ─── Revocation ──────────────────────────────────────────────────────────

let revoked = new Set<string>()
/**
 * Per-person cutoff left by "sign out everywhere": telegram_id -> epoch seconds.
 *
 * Revoking every family covers refresh tokens and the access tokens of those
 * families. It does not cover a credential that exists outside them: Mini App
 * initData, valid for 24 hours and able to mint a new family. So a credential
 * issued before the cutoff is refused by its issue time: an access token by iat
 * here, initData by auth_date (auth.ts verifyTelegramInitData), a game token by
 * iat.
 *
 * This map does NOT stop what a sign-in mints: a session minted after the
 * cutoff carries iat >= cutoff and passes here. Minting is stopped in the
 * database instead -- every minting route checks the stored cutoff against
 * the credential it rests on after its row is committed (session-store.ts
 * signedOutSince). That covers a replica that has not polled yet and a
 * sign-in that raced the revocation.
 *
 * Seconds, compared with `<`: a credential issued in the same second as the
 * cutoff passes. Sessions that existed at that moment are revoked by sid anyway.
 *
 * What it cannot stop: initData forged with a bot token the server accepts
 * carries whatever auth_date the forger writes, so it is always fresh. Only
 * narrowing the accepted bot tokens helps against that. And it ends the
 * person's own current Mini App launch too, until they relaunch it.
 *
 * Kept in memory and refreshed by the same poll as the revoked set. Stale state
 * refuses access and game tokens, as the revoked set does, but ADMITS initData
 * (see initDataCutoffRefusal): the minting routes read the cutoff from the
 * database, so only raw per-request initData goes unchecked during a stall.
 */
let notBefore = new Map<string, number>()
let revocationsSyncedAt = 0
let staleCutoffLoggedAt = 0
const REVOCATION_SYNC_MAX_AGE_MS = 15_000

/*
 * Marks made in this process (revokeNow, markNotBefore), numbered in order.
 *
 * A poll replaces the in-memory state with what it read. A mark made while the
 * poll was reading may be missing from that read -- the row was written after
 * the SELECT took its snapshot -- and a plain replacement erased it: the
 * replica that handled "sign out everywhere" admitted the old credentials again
 * until the next poll. So each mark keeps its number until a poll that STARTED
 * after it lands. Every caller marks only after its database write has
 * committed, so a poll that started later has read that write.
 */
let lastMark = 0
const pendingRevokes = new Map<string, number>()
const pendingCutoffs = new Map<string, { seconds: number; mark: number }>()

/** The number of the latest local mark. A poll reads it before its queries. */
export function revocationMark(): number {
  return lastMark
}

/**
 * Replace the revoked-session set and the per-person cutoffs.
 *
 * Called by a background poller, never on the request path. Replacing the
 * whole set rather than mutating it means a request that reads it mid-update
 * sees either the old set or the new one, never a half-built one.
 *
 * `readAfterMark` is revocationMark() taken before the poll's first query.
 * Local marks newer than it are kept on top of what the poll read (a cutoff
 * only moves forward, so the later of the two wins); older ones are dropped,
 * since the read includes them. Without it the state is replaced outright and
 * pending marks are forgotten -- what a replica with empty memory looks like.
 */
export function setRevokedSessions(
  ids: Iterable<string>,
  cutoffs: Iterable<[string, number]> = [],
  readAfterMark?: number
): void {
  const nextRevoked = new Set(ids)
  const nextNotBefore = new Map(cutoffs)
  if (readAfterMark === undefined) {
    pendingRevokes.clear()
    pendingCutoffs.clear()
  } else {
    for (const [sid, mark] of pendingRevokes) {
      if (mark <= readAfterMark) pendingRevokes.delete(sid)
      else nextRevoked.add(sid)
    }
    for (const [id, c] of pendingCutoffs) {
      if (c.mark <= readAfterMark) pendingCutoffs.delete(id)
      else
        nextNotBefore.set(id, Math.max(nextNotBefore.get(id) ?? 0, c.seconds))
    }
  }
  revoked = nextRevoked
  notBefore = nextNotBefore
  revocationsSyncedAt = Date.now()
}

/** Mark a session revoked immediately, without waiting for the next poll. */
export function revokeNow(sessionId: string): void {
  revoked.add(sessionId)
  pendingRevokes.set(sessionId, ++lastMark)
}

/** Set a person's cutoff immediately, without waiting for the next poll. */
export function markNotBefore(telegramId: string, seconds: number): void {
  notBefore.set(telegramId, Math.max(notBefore.get(telegramId) ?? 0, seconds))
  pendingCutoffs.set(telegramId, { seconds, mark: ++lastMark })
}

/**
 * Why initData issued at `authDate` must be refused, or null to admit it.
 *
 * Fails closed like verifyAppSession once the poller has run and its state is
 * older than the limit. A process whose poller never ran has no cutoffs to
 * enforce: every deployed instance syncs before it listens and refuses to start
 * without SESSION_SIGNING_KEY, so that is a laptop or a test without sessions,
 * where logout-all cannot run at all.
 */
export function initDataCutoffRefusal(
  telegramId: string | null,
  authDate: number
): string | null {
  if (!revocationsSyncedAt) return null
  /*
   * Stale cutoff state ADMITS initData, unlike a stale revoked set for Bearer
   * sessions. initData is how every Mini App request authenticates, so failing
   * closed here turns a 15 s database stall into an outage for all Telegram
   * users, to guard a rare case (a captured launch string replayed after sign
   * out everywhere, inside that stall). Every route that MINTS from initData
   * (telegram, pair/start, game-token) reads the cutoff from the database
   * itself, so a stale process still cannot turn such a replay into a session.
   */
  if (Date.now() - revocationsSyncedAt > REVOCATION_SYNC_MAX_AGE_MS) {
    const now = Date.now()
    if (now - staleCutoffLoggedAt > 60_000) {
      staleCutoffLoggedAt = now
      console.warn(
        '[not-before] cutoff state is stale; initData admitted without the in-memory cutoff check'
      )
    }
    return null
  }
  if (telegramId && authDate < (notBefore.get(telegramId) ?? 0))
    return 'initData was issued before sign-out everywhere'
  return null
}

// ─── Game token ──────────────────────────────────────────────────────────

/**
 * The origins a game token may be minted for and used from. Exact strings:
 * not www.t27.ai, and not app.t27.ai, where the player holds real sessions.
 */
export const GAME_AUDIENCES: readonly string[] = ['https://t27.ai']

/** Five minutes: a leaked game token is worth one identity for that long. */
export const GAME_TOKEN_TTL_SECONDS = 300

/**
 * What a game token says. Deliberately no `sid`: it is not a session, it
 * cannot be refreshed, and it names no family. `scope` is identity only.
 */
export interface GameClaims {
  v: 2
  sub: string
  aud: string
  scope: 'identity'
  iat: number
  exp: number
  jti: string
}

/**
 * The game token key: HMAC of the session key under a fixed label.
 *
 * A separate key keeps the two kinds apart by construction. A game token fails
 * verifyAppSession's signature check before its claims are read, so every
 * route that accepts app sessions refuses it without knowing it exists; and an
 * app access token fails here. One secret still backs both, so there is no new
 * environment value to configure or rotate.
 */
function gameSigningKey(): Buffer {
  return crypto
    .createHmac('sha256', signingKey())
    .update('tri-game-token-v1', 'utf8')
    .digest()
}

export function signGameToken(params: {
  telegramId: string
  audience: string
  now?: number
}): string {
  if (!GAME_AUDIENCES.includes(params.audience)) {
    throw new Error('game token audience is not a game origin')
  }
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'tri-game' }
  const claims: GameClaims = {
    v: 2,
    sub: params.telegramId,
    aud: params.audience,
    scope: 'identity',
    iat: now,
    exp: now + GAME_TOKEN_TTL_SECONDS,
    jti: b64url(crypto.randomBytes(12)),
  }
  const head = b64url(Buffer.from(JSON.stringify(header), 'utf8'))
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = crypto
    .createHmac('sha256', gameSigningKey())
    .update(`${head}.${body}`, 'utf8')
    .digest()
  return `${head}.${body}.${b64url(mac)}`
}

/**
 * Whether a Bearer presents itself as a game token, by its header `typ`.
 * Routing only -- nothing is trusted until verifyGameToken has run.
 */
export function isGameToken(token: string): boolean {
  try {
    const header = JSON.parse(unb64url(token.split('.')[0]).toString('utf8'))
    return header?.typ === 'tri-game'
  } catch {
    return false
  }
}

/**
 * Verify a game token for a request from `origin`. Synchronous, like
 * verifyAppSession, and refused on the same stale revocation state.
 *
 * The audience must be a game origin AND equal the Origin the request came
 * with, so a token taken from the game cannot be used from a page elsewhere.
 * A non-browser client can send any Origin; that binding narrows where a
 * browser can use the token, it does not authenticate anyone.
 */
export function verifyGameToken(
  token: string,
  origin: string,
  now?: number
): GameClaims {
  const parts = token.split('.')
  if (parts.length !== 3)
    throw new SessionError('token is not three parts', 'malformed')
  const [head, body, sig] = parts

  let header: Record<string, unknown>
  try {
    header = JSON.parse(unb64url(head).toString('utf8'))
  } catch {
    throw new SessionError('header is not JSON', 'malformed')
  }
  if (header.alg !== 'HS256' || header.typ !== 'tri-game') {
    throw new SessionError('not a game token header', 'bad_algorithm')
  }
  if ('kid' in header || 'jku' in header || 'x5u' in header) {
    throw new SessionError('key-resolution header refused', 'bad_algorithm')
  }

  const expected = crypto
    .createHmac('sha256', gameSigningKey())
    .update(`${head}.${body}`, 'utf8')
    .digest()
  const given = unb64url(sig)
  if (
    given.length !== expected.length ||
    !crypto.timingSafeEqual(given, expected)
  ) {
    throw new SessionError('signature mismatch', 'bad_signature')
  }

  let claims: GameClaims
  try {
    claims = JSON.parse(unb64url(body).toString('utf8'))
  } catch {
    throw new SessionError('claims are not JSON', 'malformed')
  }
  if (claims.v !== 2 || claims.scope !== 'identity')
    throw new SessionError('unknown claim version or scope', 'wrong_version')
  if (!claims.sub) throw new SessionError('sub missing', 'malformed')
  if (!GAME_AUDIENCES.includes(claims.aud) || claims.aud !== origin) {
    throw new SessionError('audience does not match origin', 'wrong_audience')
  }

  const t = now ?? Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || t > claims.exp + CLOCK_SKEW_SECONDS) {
    throw new SessionError('token expired', 'expired')
  }
  if (typeof claims.iat !== 'number' || claims.iat > t + CLOCK_SKEW_SECONDS) {
    throw new SessionError('token issued in the future', 'not_yet_valid')
  }
  if (
    !revocationsSyncedAt ||
    Date.now() - revocationsSyncedAt > REVOCATION_SYNC_MAX_AGE_MS
  ) {
    throw new SessionError(
      'revocation state is unavailable',
      'revocation_unavailable'
    )
  }
  if (claims.iat < (notBefore.get(claims.sub) ?? 0)) {
    throw new SessionError(
      'game token issued before sign-out everywhere',
      'revoked'
    )
  }
  return claims
}

// ─── Refresh tokens ──────────────────────────────────────────────────────

export interface RefreshIssue {
  /** Given to the client once. Never stored anywhere in this form. */
  token: string
  /** What goes in the database. */
  hash: string
  expiresAt: Date
}

/**
 * Mint a refresh token.
 *
 * 32 bytes of CSPRNG. Only the sha256 is stored, for the same reason
 * passwords are hashed: a database dump should not hand over live sessions.
 */
export function issueRefreshToken(now?: Date): RefreshIssue {
  const token = b64url(crypto.randomBytes(32))
  const base = now ?? new Date()
  return {
    token,
    hash: digest(token),
    expiresAt: new Date(base.getTime() + REFRESH_TTL_SECONDS * 1000),
  }
}

/**
 * Насколько недавнее повторное предъявление считается ГОНКОЙ, а не кражей.
 *
 * Разница между честным повтором и воровством не в самом факте повтора, а в
 * ПРОМЕЖУТКЕ. Две вкладки одного браузера держат один и тот же refresh в
 * localStorage и заводят таймер от одного и того же срока — они приходят с
 * разницей в миллисекунды. Вор приходит тогда, когда ему удобно, и попадает
 * между обновлениями законного клиента, то есть через минуты или часы: сам
 * клиент ходит сюда раз в десять минут.
 *
 * Десять секунд отделяют одно от другого с огромным запасом в обе стороны.
 */
export const REUSE_GRACE_SECONDS = 10

export type RotateOutcome =
  | { ok: true; next: RefreshIssue }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' }
  | { ok: false; reason: 'reused'; familyId: string }
  /**
   * Тот же токен предъявлен дважды почти одновременно. Семья НЕ гасится:
   * победитель гонки уже положил новый токен туда, откуда проигравший его
   * прочитает.
   */
  | { ok: false; reason: 'raced' }

/**
 * Rotate a refresh token, detecting reuse.
 *
 * A refresh token is single-use. Presenting one that has already been
 * exchanged means one of two things: the network dropped the reply and the
 * client is retrying honestly, or the token was stolen and both parties are
 * now using it. Guessing "just a retry" would let an attacker keep access
 * indefinitely, so a stale reuse revokes the whole family.
 *
 * ── ОДИН СИГНАЛ ВСЁ-ТАКИ ЕСТЬ, И ЗДЕСЬ ЕГО ДОЛГО НЕ ВИДЕЛИ ─────────────────
 *
 * Прежний текст на этом месте утверждал: «различить их снаружи невозможно».
 * Невозможно по самому факту повтора — но не по ПРОМЕЖУТКУ до него.
 *
 * Две вкладки одного браузера держат общий refresh в localStorage и заводят
 * таймер от общего срока: они приходят с разницей в миллисекунды. Это не
 * редкость и не край — это то, что происходит у каждого, кто открыл
 * приложение дважды. Расплата была максимальной из возможных: гасилась вся
 * семья, человека выбрасывало из приложения, и вернуться он мог только через
 * восьмизначный код из Telegram. Без единого злоумышленника.
 *
 * Поэтому повтор в пределах `REUSE_GRACE_SECONDS` — это `raced`: отказ без
 * гашения. Проигравший гонку перечитает хранилище, где победитель уже оставил
 * новый токен.
 *
 * Что при этом теряется, честно: вор, попавший в те же десять секунд, не
 * будет замечен. Чтобы попасть, ему надо угадать момент, когда законный
 * клиент — ходящий сюда раз в десять минут — как раз обновляется. Взамен
 * исчезает выброс из приложения, случавшийся у людей ежедневно.
 *
 * ── ОТДЕЛЬНО ПРО ПРОИГРЫШ В `consumeAndInsert` ─────────────────────────────
 *
 * Эта ветка — гонка ПО ПОСТРОЕНИЮ: `find` увидел непотраченный токен, а
 * `UPDATE … WHERE used_at IS NULL` не нашёл строки, значит её потратили в
 * промежутке между двумя запросами. Промежуток тут исчисляется миллисекундами
 * и никаким «через час» быть не может: вор с чужим токеном пришёл бы к
 * `usedAt` выше. Гасить семью здесь было прямой ошибкой.
 *
 * The caller supplies storage: this module holds no database handle, which
 * is what makes it testable without one.
 */
export async function rotateRefreshToken(
  presented: string,
  store: {
    find(hash: string): Promise<{
      familyId: string
      usedAt: Date | null
      revokedAt: Date | null
      expiresAt: Date
    } | null>
    consumeAndInsert(
      hash: string,
      replacedByHash: string,
      expiresAt: Date
    ): Promise<boolean>
    revokeFamily(familyId: string): Promise<string[]>
  },
  now?: Date
): Promise<RotateOutcome> {
  const t = now ?? new Date()
  const hash = digest(presented)
  const row = await store.find(hash)
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.revokedAt) return { ok: false, reason: 'revoked' }
  if (row.expiresAt.getTime() <= t.getTime())
    return { ok: false, reason: 'expired' }

  if (row.usedAt) {
    const прошлоСекунд = (t.getTime() - row.usedAt.getTime()) / 1000
    if (прошлоСекунд <= REUSE_GRACE_SECONDS) {
      return { ok: false, reason: 'raced' }
    }
    const sessionIds = await store.revokeFamily(row.familyId)
    for (const sid of sessionIds) revokeNow(sid)
    return { ok: false, reason: 'reused', familyId: row.familyId }
  }

  const next = issueRefreshToken(t)
  const consumed = await store.consumeAndInsert(hash, next.hash, next.expiresAt)
  if (!consumed) return { ok: false, reason: 'raced' }
  return { ok: true, next }
}

export const SESSION_TUNING = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  CLOCK_SKEW_SECONDS,
} as const
