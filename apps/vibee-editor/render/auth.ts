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

/**
 * ВСЕ токены ботов платформы, а не один.
 *
 * initData подписывается токеном ТОГО бота, из которого открыли мини-апп, а
 * ботов на платформе двенадцать. Пока здесь читался один TELEGRAM_BOT_TOKEN,
 * вход работал ровно из одного бота, а из остальных человек упирался в
 * «Login to Export» без объяснения причины.
 *
 * Второй, более коварный случай, который это же чинит: TELEGRAM_BOT_TOKEN мог
 * содержать УСТАРЕВШИЙ токен того же бота (id совпадает, строка нет) — тогда
 * подпись не сходилась вообще ни у кого, а симптом выглядел как «мини-апп
 * сломался». Перебор списка переживает ротацию одного значения.
 *
 * В имени токена бот не закодирован, поэтому подходящий ищется перебором.
 * HMAC дешёвый: двенадцать проверок — микросекунды.
 */
const botTokens = (): string[] => {
  const out: string[] = []
  const push = (t?: string) => {
    const v = (t || '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  push(process.env.TELEGRAM_BOT_TOKEN)
  for (let i = 1; i <= 20; i++) push(process.env[`BOT_TOKEN_${i}`])
  push(process.env.BOT_TOKEN_TEST_1)
  push(process.env.BOT_TOKEN_TEST_2)
  return out
}

/** Открыто всегда: health для Railway и отдача уже отрендеренных файлов. */
const PUBLIC_EXACT = new Set([
  '/health',
  // /mcp пропускается общим гвардом НАМЕРЕННО, и это не дыра: обработчик
  // проверяет собственный ключ X-Agent-Key и без него не выполняет ни одного
  // инструмента. Здесь иначе нельзя — общий гвард умеет только подпись
  // мини-аппа и общий серверный ключ, а внешнему агенту нужен ключ,
  // ПРИВЯЗАННЫЙ к конкретному человеку: без привязки инструмент не знает,
  // чью ленту читать и от чьего имени публиковать.
  '/mcp',
  // /api/agent/chat пропускается общим гвардом НАМЕРЕННО: обработчик сам
  // проверяет личность — подпись мини-аппа ИЛИ ключ агента. Общий гвард
  // умеет только первое, а коннектор для тестов требует второго.
  '/api/agent/chat',
  // POST /api/tokens/invoice пропускается гвардом НАМЕРЕННО: хендлер сам
  // проверяет личность (подпись мини-аппа ИЛИ ключ агента) — как /mcp.
  // Без этого прод-enforce отбивал создание инвойса 401 (ловушка №8,
  // третий случай: локальный warn маскирует).
  '/api/tokens/invoice',
  // POST /api/assets (сохранить фото в профиль аватара) — тот же принцип:
  // обработчик сам проверяет личность (подпись или ключ агента) и пишет
  // файл строго от проверенного владельца. Гвард здесь мешал бы dev-ключу.
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
  // проверяет личность сам. POST/DELETE — через подпись или ключ агента;
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
export function verifyTelegramInitData(initData: string): {
  ok: boolean
  reason?: string
  /** id бота, чьей подписью initData сошлась — для журнала и атрибуции. */
  botId?: string
} {
  const tokens = botTokens()
  if (!tokens.length) {
    return { ok: false, reason: 'no bot tokens configured on the server' }
  }
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

  // Подпись сверяется с КАЖДЫМ известным токеном: initData подписан ботом, из
  // которого открыли мини-апп, и заранее неизвестно каким именно.
  let matchedBotId: string | undefined
  for (const token of tokens) {
    const secret = crypto
      .createHmac('sha256', 'WebAppData')
      .update(token)
      .digest()
    const expected = crypto
      .createHmac('sha256', secret)
      .update(checkString)
      .digest('hex')
    // timingSafeEqual бросает на разной длине, поэтому длину сверяем заранее.
    if (expected.length !== hash.length) continue
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
      matchedBotId = token.split(':')[0]
      break
    }
  }
  if (!matchedBotId) {
    // Причина названа полно: «hash mismatch» без числа ботов отправлял
    // диагностику в подпись, тогда как дело обычно в устаревшем или
    // отсутствующем токене нужного бота.
    return {
      ok: false,
      reason: `hash mismatch: подпись не сошлась ни с одним из ${tokens.length} известных токенов ботов`,
    }
  }

  // Просроченный launch. Подпись остаётся валидной вечно, поэтому без этой
  // проверки одна утёкшая ссылка работала бы всегда.
  const authDate = Number(params.get('auth_date') || 0)
  const ageHours = (Date.now() / 1000 - authDate) / 3600
  if (!authDate || ageHours > 24)
    return { ok: false, reason: `initData is ${ageHours.toFixed(1)}h old` }

  return { ok: true, botId: matchedBotId }
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
  const url = new URL(req.url || '/', 'http://localhost')
  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    url.searchParams.get('initData') ||
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
  const url = new URL(req.url || '/', 'http://localhost')
  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    url.searchParams.get('initData') ||
    ''
  if (!initData) return null
  if (!verifyTelegramInitData(initData).ok) return null
  try {
    const raw = new URLSearchParams(initData).get('user')
    if (!raw) return null
    const id = JSON.parse(raw)?.id
    return id != null ? String(id) : null
  } catch {
    return null
  }
}

export function authMode(): string {
  return mode()
}
