/**
 * Аутентификация рендер-сервера.
 *
 * Сервис стоит на публичном домене и до сих пор не проверял вообще ничего:
 * любой мог залить 100 МБ в бакет с ключом по своему выбору и жечь кредиты
 * FAL / ElevenLabs / xAI запросами на рендер.
 *
 * ДВА МЕХАНИЗМА, потому что вызывающих два разных типа:
 *
 * 1. Сервер-серверу (бот -> рендер): общий секрет в заголовке X-Api-Key.
 *
 * 2. Редактор в браузере: общий секрет здесь бесполезен — всё, что попало в
 *    бандл, публично. Вместо него проверяется подпись Telegram initData: её
 *    выдаёт Telegram, ключ HMAC выводится из токена бота, который у сервера
 *    уже есть. Подделать её без токена нельзя.
 *
 * РЕЖИМ ВНЕДРЕНИЯ. RENDER_AUTH_MODE:
 *   enforce (по умолчанию) — отвергает
 *   warn    — явный диагностический режим вне production, пропускает и
 *             логирует отказ
 * В production режим всегда enforce, независимо от runtime override.
 */
import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { telegramAuthBotForEnvironment } from '../packages/vibee-atoms/src/telegram-auth'

// Env читается ЛЕНИВО, а не на импорте. На импорте это делало модуль
// непроверяемым (ESM поднимает import выше любого присваивания process.env в
// тесте) и, что важнее в проде, требовало рестарта процесса для смены токена
// или режима.
const normalizedEnvironment = (value?: string) =>
  (value || '').trim().toLowerCase()

const productionRuntime = () =>
  normalizedEnvironment(process.env.NODE_ENV) === 'production' ||
  normalizedEnvironment(process.env.TELEGRAM_AUTH_ENV) === 'production'

const mode = () => {
  if (productionRuntime()) return 'enforce'
  return normalizedEnvironment(process.env.RENDER_AUTH_MODE) === 'warn'
    ? 'warn'
    : 'enforce'
}
const apiKey = () => process.env.RENDER_API_KEY || ''
const TELEGRAM_ID = /^[1-9]\d{0,19}$/

/** One configured bot owns Trinity auth; all other platform tokens are inert. */
const expectedAuthBot = () =>
  telegramAuthBotForEnvironment(
    process.env.TELEGRAM_AUTH_ENV || process.env.NODE_ENV,
    process.env.TELEGRAM_AUTH_BOT_USERNAME
  )

const authBotToken = (): string => {
  const config = expectedAuthBot()
  if (!config.configured) return ''
  return (process.env[config.tokenEnv] || '').trim()
}

export function telegramAuthStatus(): {
  configured: boolean
  username: string
  tokenConfigured: boolean
} {
  const config = expectedAuthBot()
  return {
    configured: config.configured,
    username: config.username,
    tokenConfigured: Boolean(authBotToken()),
  }
}

/** Keep launch credentials out of request logs, including the SSE fallback. */
export function redactRequestTarget(target?: string): string {
  try {
    const parsed = new URL(target || '/', 'http://localhost')
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        /^(?:initdata|tgwebappdata|authorization|cookie|secret|token|password|credential|api.?key|agent.?key|.*[_-](?:key|token|secret))$/i.test(
          key
        )
      ) {
        parsed.searchParams.set(key, '[REDACTED]')
      }
    }
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return '/invalid-request-target'
  }
}

/** Открыто всегда: health для Railway и отдача уже отрендеренных файлов. */
const PUBLIC_EXACT = new Set([
  '/health',
  // /mcp пропускается общим гвардом НАМЕРЕННО: обработчик проверяет свежую
  // Telegram initData до body/DB. Внешний key-path fail-closed в SAFE BETA.
  '/mcp',
  // /api/agent/chat пропускается общим гвардом НАМЕРЕННО: обработчик сам
  // проверяет свежую подпись мини-аппа. Сам маршрут дополнительно заблокирован
  // immutable paid-generation gate в SAFE BETA.
  '/api/agent/chat',
  // POST /api/users/sync-from-telegram пропускается гвардом НАМЕРЕННО:
  // legacy-хендлер сам повторно проверяет подпись initData и игнорирует body,
  // path и query ownership. Он МОЖЕТ писать только своего владельца.
  '/api/users/sync-from-telegram',
  // POST /api/tokens/invoice пропускается гвардом НАМЕРЕННО: хендлер сам
  // проверяет Telegram identity сам; SAFE BETA payment gate срабатывает раньше.
  // Без этого прод-enforce отбивал создание инвойса 401 (ловушка №8,
  // третий случай: локальный warn маскирует).
  '/api/tokens/invoice',
  // verify — тот же принцип: личность проверяет сам хендлер (chatIdentity),
  // а звёзды сверяются с Bot API — первоисточником.
  '/api/tokens/verify',
  // POST /api/assets (сохранить фото в профиль аватара) — тот же принцип:
  // обработчик сам проверяет Telegram identity и пишет файл строго от
  // проверенного владельца. SAFE BETA default-deny блокирует запись раньше.
  // GET /api/assets/:id остаётся ЗА гвардом — чтение чужой истории
  // по известному telegram_id отдавать нельзя.
  '/api/assets',
])
const PUBLIC_PREFIXES = [
  '/renders/',
  '/hls/',
  '/public/',
  '/s3/',
  '/proxy/image',
  // /api/assets* пропускается общим гвардом НАМЕРЕННО: каждый хендлер
  // проверяет личность сам. POST/DELETE — через Telegram подпись;
  // GET /api/assets/:telegram_id — сверяет подписанта с запрошенным id
  // (см. хендлер). До этой правки гвард проверял только валидность
  // подписи, не совпадение с id в пути: подписанный человек мог читать
  // чужую историю. Теперь не может.
  '/api/assets',
]

/**
 * Публичные на чтение: это лента сообщества, она и должна читаться без ключа.
 * Запись в неё (/api/feed/publish) — нет.
 */
// /api/assets/:telegram_id намеренно НЕ здесь: это личная история генераций
// конкретного пользователя, а не публичная лента. Открытый GET по ней отдавал
// бы промпты и ссылки любого, кто знает telegram_id — а он в Telegram виден.
// /templates рядом с /compositions: это витрина шаблонов (описания, поля,
// правила канона), а не чьи-то данные. Мини-апп показывает её до входа,
// иначе выбрать шаблон можно только вслепую. Рендер по шаблону — POST /render —
// по-прежнему требует ключа.
const PUBLIC_GET_PREFIXES = [
  '/api/feed',
  // Пакеты токенов публичны (цены — витрина); покупка /api/tokens/invoice
  // проверяет личность сама, вебхук — секретом в пути.
  '/api/tokens/packs',
  // Блог t27.ai через наш прокси: это тот же публичный контент сайта,
  // просто без CORS. На проде (enforce) без этой строки гвард резал
  // GET /api/blog — локально (warn) это не ловилось.
  '/api/blog',
  '/api/users/',
  '/compositions',
  '/templates',
  // /branding отдаёт бренд только при ПОДТВЕРЖДЁННОЙ подписи, иначе
  // {branded:false} — сам маршрут безопасно открыть, решение внутри.
  // /branding/avatar/<id> — картинка, она и так публична в Telegram.
  '/branding',
  '/api/voices',
]

export function isPublic(req: IncomingMessage): boolean {
  const url = (req.url || '').split('?')[0]
  if (PUBLIC_EXACT.has(url)) return true
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return true
  if (req.method === 'GET' && PUBLIC_GET_PREFIXES.some(p => url.startsWith(p)))
    return true
  return false
}

/**
 * Проверка подписи Telegram initData по документированному алгоритму:
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * ожидаемый hash = HMAC_SHA256(key=secret, msg=data_check_string)
 * где data_check_string — все пары кроме hash, отсортированные по ключу,
 * склеенные через \n.
 */
export interface VerifiedTelegramUser {
  id: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
}

export type TelegramInitDataVerification =
  | {
      ok: true
      /** id бота, чьей подписью initData сошлась. */
      botId: string
      user: VerifiedTelegramUser
    }
  | { ok: false; reason: string }

const optionalTelegramString = (
  value: unknown,
  field: string,
  maxLength: number
): { ok: true; value?: string } | { ok: false; reason: string } => {
  if (value === undefined || value === null || value === '') {
    return { ok: true }
  }
  if (typeof value !== 'string') {
    return { ok: false, reason: `Telegram user.${field} must be a string` }
  }
  const normalized = value.trim()
  if (!normalized) return { ok: true }
  return { ok: true, value: normalized.slice(0, maxLength) }
}

const telegramUserFromParams = (
  params: URLSearchParams
): { ok: true; user: VerifiedTelegramUser } | { ok: false; reason: string } => {
  const raw = params.get('user')
  if (!raw) return { ok: false, reason: 'no user in initData' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'Telegram user is not valid JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'Telegram user must be an object' }
  }

  const record = parsed as Record<string, unknown>
  const rawId = record.id
  const id =
    typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
      ? String(rawId)
      : typeof rawId === 'string' && TELEGRAM_ID.test(rawId)
        ? rawId
        : ''
  if (!TELEGRAM_ID.test(id)) {
    return { ok: false, reason: 'Telegram user.id must be a positive integer' }
  }

  if (typeof record.first_name !== 'string' || !record.first_name.trim()) {
    return {
      ok: false,
      reason: 'Telegram user.first_name must be a non-empty string',
    }
  }
  const firstName = record.first_name.trim().slice(0, 128)
  const lastName = optionalTelegramString(record.last_name, 'last_name', 128)
  if (!lastName.ok) return lastName
  const username = optionalTelegramString(record.username, 'username', 64)
  if (!username.ok) return username
  const photoUrl = optionalTelegramString(record.photo_url, 'photo_url', 2048)
  if (!photoUrl.ok) return photoUrl

  return {
    ok: true,
    user: {
      id,
      firstName,
      lastName: lastName.value,
      username: username.value,
      photoUrl: photoUrl.value,
    },
  }
}

export function verifyTelegramInitData(
  initData: string
): TelegramInitDataVerification {
  const bot = expectedAuthBot()
  if (!bot.configured) {
    return {
      ok: false,
      reason: 'Telegram auth bot is not configured for this runtime',
    }
  }
  const token = authBotToken()
  if (!token) {
    return {
      ok: false,
      reason: `auth token for @${bot.username} is not configured on the server`,
    }
  }
  if (!initData) return { ok: false, reason: 'empty initData' }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'initData is not urlencoded' }
  }

  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, reason: 'invalid hash in initData' }
  }

  const checkString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(checkString)
    .digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
    return {
      ok: false,
      reason: `hash mismatch: initData was not signed by @${bot.username}`,
    }
  }

  // Просроченный launch. Подпись остаётся валидной вечно, поэтому без этой
  // проверки одна утёкшая ссылка работала бы всегда.
  const authDate = Number(params.get('auth_date') || 0)
  const ageSeconds = Date.now() / 1000 - authDate
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: 'invalid auth_date in initData' }
  }
  if (ageSeconds < -300) {
    return { ok: false, reason: 'initData auth_date is in the future' }
  }
  if (ageSeconds > 24 * 60 * 60) {
    return {
      ok: false,
      reason: `initData is ${(ageSeconds / 3600).toFixed(1)}h old`,
    }
  }

  const parsedUser = telegramUserFromParams(params)
  if (!parsedUser.ok) return parsedUser

  return { ok: true, botId: token.split(':')[0], user: parsedUser.user }
}

export interface AuthResult {
  allowed: boolean
  /** true, если пропущено только из-за режима warn. */
  wouldReject: boolean
  via: 'public' | 'api-key' | 'telegram' | 'none'
  reason?: string
}

const initDataFromRequest = (req: IncomingMessage): string => {
  const url = new URL(req.url || '/', 'http://localhost')
  const canonicalHeader = req.headers['x-telegram-init-data']
  const legacyHeader = req.headers['x-telegram-initdata']
  return (
    (typeof canonicalHeader === 'string' ? canonicalHeader : '') ||
    (typeof legacyHeader === 'string' ? legacyHeader : '') ||
    url.searchParams.get('initData') ||
    ''
  )
}

/** Return Telegram profile fields only after HMAC, freshness and shape checks. */
export function verifiedTelegramUser(
  req: IncomingMessage
): VerifiedTelegramUser | null {
  const initData = initDataFromRequest(req)
  if (!initData) return null
  const verification = verifyTelegramInitData(initData)
  return verification.ok ? verification.user : null
}

export function authenticate(req: IncomingMessage): AuthResult {
  if (isPublic(req)) return { allowed: true, wouldReject: false, via: 'public' }

  const key = (req.headers['x-api-key'] as string | undefined) || ''
  const expectedKey = apiKey()
  if (expectedKey && key) {
    const a = Buffer.from(key)
    const b = Buffer.from(expectedKey)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { allowed: true, wouldReject: false, via: 'api-key' }
    }
  }

  // Подпись читается из заголовка ИЛИ из строки запроса.
  //
  // EventSource (SSE прогресса рендера) физически не умеет ставить заголовки —
  // это ограничение самого браузерного API. Пока подпись принималась только
  // заголовком, поток прогресса получал 401, срабатывал onerror, и кнопка
  // «Экспорт» молча отжималась через пару секунд, хотя рендер на сервере шёл
  // дальше. Человек видел «кнопка не работает».
  //
  // Отдавать SSE без проверки было бы проще, но статус чужого рендера — не
  // публичные данные. Подпись в query проверяется тем же HMAC и так же
  // протухает через сутки.
  const initData = initDataFromRequest(req)
  if (initData) {
    const v = verifyTelegramInitData(initData)
    if (v.ok) return { allowed: true, wouldReject: false, via: 'telegram' }
    return {
      allowed: mode() !== 'enforce',
      wouldReject: true,
      via: 'none',
      reason: `initData rejected: ${v.reason}`,
    }
  }

  return {
    allowed: mode() !== 'enforce',
    wouldReject: true,
    via: 'none',
    reason: apiKey()
      ? 'no X-Api-Key and no Telegram initData'
      : 'RENDER_API_KEY not configured',
  }
}

/**
 * telegram_id ТОЛЬКО из ПРОВЕРЕННОЙ подписи.
 *
 * Отдельная функция нужна, потому что authenticate() отвечает лишь «пустить
 * или нет», а инструментам агента надо знать, ЧЬИ данные читать и от чьего
 * имени публиковать. Брать идентификатор из тела запроса нельзя: тогда любой,
 * кто умеет писать JSON, читал бы чужие черновики и публиковал за других.
 *
 * Возвращает null, если подпись отсутствует или не сошлась. Пустая строка
 * здесь была бы хуже: она молча превратилась бы в «пользователь ноль».
 */
export function verifiedTelegramId(req: IncomingMessage): string | null {
  return verifiedTelegramUser(req)?.id ?? null
}

export function authMode(): string {
  return mode()
}
