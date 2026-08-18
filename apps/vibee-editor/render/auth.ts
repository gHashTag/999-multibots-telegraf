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
 *   warn    (по умолчанию) — пропускает всё, но логирует, что было бы отвергнуто
 *   enforce — отвергает
 * Ретрофит авторизации на живой сервис вслепую ломает вызывающих, о которых не
 * знаешь. Сначала сутки в warn и смотрим лог, потом enforce.
 */
import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'

// Env читается ЛЕНИВО, а не на импорте. На импорте это делало модуль
// непроверяемым (ESM поднимает import выше любого присваивания process.env в
// тесте) и, что важнее в проде, требовало рестарта процесса для смены токена
// или режима.
const mode = () => (process.env.RENDER_AUTH_MODE || 'warn').toLowerCase()
const apiKey = () => process.env.RENDER_API_KEY || ''
const botToken = () => process.env.TELEGRAM_BOT_TOKEN || ''

/** Открыто всегда: health для Railway и отдача уже отрендеренных файлов. */
const PUBLIC_EXACT = new Set(['/health'])
const PUBLIC_PREFIXES = ['/renders/', '/hls/', '/public/', '/s3/', '/proxy/image']

/**
 * Публичные на чтение: это лента сообщества, она и должна читаться без ключа.
 * Запись в неё (/api/feed/publish) — нет.
 */
// /api/assets/:telegram_id намеренно НЕ здесь: это личная история генераций
// конкретного пользователя, а не публичная лента. Открытый GET по ней отдавал
// бы промпты и ссылки любого, кто знает telegram_id — а он в Telegram виден.
const PUBLIC_GET_PREFIXES = ['/api/feed', '/api/users/', '/compositions', '/api/voices']

export function isPublic(req: IncomingMessage): boolean {
  const url = (req.url || '').split('?')[0]
  if (PUBLIC_EXACT.has(url)) return true
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return true
  if (req.method === 'GET' && PUBLIC_GET_PREFIXES.some(p => url.startsWith(p))) return true
  return false
}

/**
 * Проверка подписи Telegram initData по документированному алгоритму:
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * ожидаемый hash = HMAC_SHA256(key=secret, msg=data_check_string)
 * где data_check_string — все пары кроме hash, отсортированные по ключу,
 * склеенные через \n.
 */
export function verifyTelegramInitData(initData: string): { ok: boolean; reason?: string } {
  const token = botToken()
  if (!token) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN not set on the server' }
  if (!initData) return { ok: false, reason: 'empty initData' }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'initData is not urlencoded' }
  }

  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash in initData' }

  const checkString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex')

  // timingSafeEqual бросает на разной длине, поэтому длину сверяем заранее.
  if (expected.length !== hash.length) return { ok: false, reason: 'hash length mismatch' }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
    return { ok: false, reason: 'hash mismatch' }
  }

  // Просроченный launch. Подпись остаётся валидной вечно, поэтому без этой
  // проверки одна утёкшая ссылка работала бы всегда.
  const authDate = Number(params.get('auth_date') || 0)
  const ageHours = (Date.now() / 1000 - authDate) / 3600
  if (!authDate || ageHours > 24) return { ok: false, reason: `initData is ${ageHours.toFixed(1)}h old` }

  return { ok: true }
}

export interface AuthResult {
  allowed: boolean
  /** true, если пропущено только из-за режима warn. */
  wouldReject: boolean
  via: 'public' | 'api-key' | 'telegram' | 'none'
  reason?: string
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

  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    ''
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
    reason: apiKey() ? 'no X-Api-Key and no Telegram initData' : 'RENDER_API_KEY not configured',
  }
}

export function authMode(): string {
  return mode()
}
