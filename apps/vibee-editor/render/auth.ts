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
import {
  verifyAppSession,
  SessionError,
  initDataCutoffRefusal,
} from './session'
import { countInitDataBot } from './src/auth/initdata-bot-counts'
import type { IncomingMessage } from 'node:http'

// Env читается ЛЕНИВО, а не на импорте. На импорте это делало модуль
// непроверяемым (ESM поднимает import выше любого присваивания process.env в
// тесте) и, что важнее в проде, требовало рестарта процесса для смены токена
// или режима.
/**
 * Is this a deployed instance rather than someone's laptop?
 *
 * Railway sets RAILWAY_GIT_COMMIT_SHA, and this codebase already trusts it —
 * /health reports `version` from it, and production currently answers with a
 * real sha rather than 'unknown', so the marker is measured, not assumed.
 * Detecting the deployment this way rather than through NODE_ENV matters: if
 * NODE_ENV happened not to be 'production' there, a NODE_ENV check would make
 * the whole guard below a decoration that never fires.
 */
const deployed = () =>
  !!process.env.RAILWAY_GIT_COMMIT_SHA || !!process.env.RAILWAY_ENVIRONMENT

/**
 * The enforcement mode, fail-closed wherever this is deployed.
 *
 * WHY. This used to be `(RENDER_AUTH_MODE || 'warn').toLowerCase()`, and the
 * call sites read `allowed: mode() !== 'enforce'`. So the guard opened for
 * ANYTHING that was not the exact string 'enforce': an unset variable, a typo,
 * a stray space. A configuration slip did not weaken production, it opened it,
 * and nothing said so — the mode reached one line in the startup log (#902).
 *
 * On a deployed instance the requested value no longer decides: enforce wins.
 * That is deliberate rather than aborting startup, because turning a weak
 * configuration into an outage is the worse failure, and because #902 asks for
 * exactly this — a protected request must stay rejected even with
 * RENDER_AUTH_MODE=warn set at runtime in production.
 *
 * Locally the variable still decides, so the warn-first rollout the original
 * author described (auth.ts:20) keeps working on a laptop. Unknown values
 * normalise to 'warn' there instead of being passed through as themselves.
 */
const KNOWN_MODES = new Set(['enforce', 'warn'])
const mode = () => {
  const requested = (process.env.RENDER_AUTH_MODE || '').trim().toLowerCase()
  if (deployed()) return 'enforce'
  return KNOWN_MODES.has(requested) ? requested : 'warn'
}
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

export interface VerifiedTelegramWidgetUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
}

/**
 * Verify the Telegram Login Widget payload for the single production login
 * bot. Unlike Mini App initData, Login Widget data uses SHA256(bot token) as
 * the HMAC key and arrives as a JSON object. The browser must never decide
 * that this object is authentic: it becomes an application session only here.
 */
export function verifyTelegramLoginWidget(
  raw: Record<string, unknown>,
  nowSeconds = Math.floor(Date.now() / 1000)
):
  | { ok: true; telegramId: string; user: VerifiedTelegramWidgetUser }
  | { ok: false; reason: string } {
  const token = (process.env.BOT_TOKEN_12 || '').trim()
  if (!token) return { ok: false, reason: 'login bot token is not configured' }

  const hash = typeof raw.hash === 'string' ? raw.hash : ''
  if (!/^[a-f0-9]{64}$/i.test(hash))
    return { ok: false, reason: 'invalid widget hash' }

  const id = Number(raw.id)
  const authDate = Number(raw.auth_date)
  const firstName =
    typeof raw.first_name === 'string' ? raw.first_name.trim() : ''
  if (!Number.isSafeInteger(id) || id <= 0)
    return { ok: false, reason: 'invalid Telegram user id' }
  if (!Number.isSafeInteger(authDate) || authDate <= 0)
    return { ok: false, reason: 'invalid widget auth_date' }
  const age = nowSeconds - authDate
  if (age < -300 || age > 24 * 3600)
    return { ok: false, reason: 'widget authorization is expired' }
  if (!firstName || firstName.length > 128)
    return { ok: false, reason: 'invalid Telegram first name' }

  const allowed = [
    'auth_date',
    'first_name',
    'id',
    'last_name',
    'photo_url',
    'username',
  ] as const
  const checkString = allowed
    .filter(key => raw[key] !== undefined && raw[key] !== null)
    .map(key => [key, String(raw[key])] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = crypto.createHash('sha256').update(token).digest()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(checkString)
    .digest('hex')
  if (
    expected.length !== hash.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
  ) {
    return { ok: false, reason: 'widget signature mismatch' }
  }

  const optional = (key: 'last_name' | 'username' | 'photo_url') => {
    const value = raw[key]
    return typeof value === 'string' && value.length <= 512 ? value : undefined
  }
  return {
    ok: true,
    telegramId: String(id),
    user: {
      id,
      first_name: firstName,
      last_name: optional('last_name'),
      username: optional('username'),
      photo_url: optional('photo_url'),
      auth_date: authDate,
    },
  }
}

/** Открыто всегда: health для Railway и отдача уже отрендеренных файлов. */
const PUBLIC_EXACT = new Set([
  '/health',
  // /api/providers — та же роль, что у /health, только про чужие сервисы:
  // видно, что из платного работает прямо сейчас. Секретов в ответе нет —
  // только имя провайдера, признак «отвечает» и код с текстом его отказа.
  // Закрывать это ключом значит спрятать поломку от того, кто её чинит.
  '/api/providers',
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
  /*
   * /api/agent/history пропускается общим гвардом ПО ТОЙ ЖЕ ПРИЧИНЕ, что и
   * чат рядом: обработчик опознаёт человека сам, тем же resolveIdentity —
   * подписью мини-аппа ИЛИ ключом агента, выданным через /api/agent/keys.
   * Общий гвард второго не умеет, и без этой строки маршрут отвечал бы 401
   * ещё до обработчика.
   *
   * Это не послабление: история отдаётся ТОЛЬКО по опознанному telegram_id,
   * который берётся из проверенной личности, а не из запроса. Иначе любой
   * читал бы чужой разговор, назвав чужой id.
   *
   * Строка добавлена вместе с маршрутом НАМЕРЕННО: в этом файле уже трижды
   * случалось, что написанный и покрытый тестами маршрут возвращал 401, ни
   * разу не дойдя до обработчика (пары, карточка агента, /api/feed/pending).
   */
  '/api/agent/history',
  /*
   * ПОДКЛЮЧЕНИЕ TELEGRAM пропускается общим гвардом НАМЕРЕННО — и это не
   * послабление, а УЖЕСТОЧЕНИЕ.
   *
   * Гвард умеет три способа: серверный ключ, ключ агента, подпись. Для
   * подключения чужого аккаунта годится ровно один — подпись самого
   * человека. Обработчик проверяет именно её (chatIdentity) и отвергает
   * серверный ключ, который гвард пропустил бы. Оставить маршруты за
   * гвардом значило бы разрешить владельцу ключа начать вход за
   * постороннего: Telegram прислал бы код ничего не подозревающему человеку.
   */
  '/api/tg/connect/start',
  '/api/tg/connect/code',
  '/api/tg/connect/password',
  '/api/tg/connect/status',
  '/api/tg/connect',
  // Маршруты входа пропускаются гвардом НАМЕРЕННО: их задача — ВЫДАТЬ
  // личность. Требовать её на входе значит требовать того, чего у клиента
  // ещё нет. Каждый из трёх проверяет личность сам: обмен — подписью
  // Telegram, refresh — самим токеном (одноразовым), выход — Bearer.
  '/api/auth/telegram',
  '/api/auth/widget',
  '/api/auth/refresh',
  '/api/auth/logout',
  /**
   * Pairing MUST be public, and that is the entire point of it.
   *
   * `claim` is called by a client that has no credentials whatsoever — if it
   * had any, it would not need to pair. `start` carries its proof in the BODY
   * (initData), which the guard does not read; the route verifies it itself.
   *
   * Both were added to session-routes.ts and NOT here, so the guard answered
   * 401 before the handler ever ran. The route existed, was deployed, was
   * tested, and could not be reached by anything. See the reachability test in
   * auth-public.test.ts, which now fails when a new /api/auth/* route is
   * added without a line here.
   */
  '/api/auth/pair/start',
  '/api/auth/pair/claim',
  /*
   * The game token route checks identity itself, as the sign-in routes do: an
   * exact Origin, then a live Bearer or initData from a bot in LAUNCH_BOT_IDS.
   * Behind the guard nothing would change for a real caller, agent keys and the
   * service key would still reach the handler, and callers would meet two
   * different 401 bodies for one route. Pinned in auth-public.test.ts.
   */
  '/api/auth/game-token',
  /**
   * THE AGENT CARD MUST BE READABLE BY A STRANGER, or A2A does not exist.
   *
   * Discovery is the FIRST step of the protocol: an external agent platform
   * fetches /.well-known/agent-card.json BEFORE it has any credentials, to
   * learn who we are and which skills we expose. Ours answered 401 "no
   * X-Api-Key and no Telegram initData" -- measured in production 2026-08-31 --
   * so nothing could ever discover this service. The handler in
   * src/agent/a2a.ts was written and correct; the guard simply stood in front
   * of it, the same shape as the /api/inngest mount-order defect that cost nine
   * days of cron and as the pairing routes two entries above.
   *
   * Nothing here is secret: the card lists the service name, the protocol
   * version, the endpoint and the skill names -- the same information the
   * public MCP card at GET /mcp already hands out. Authentication belongs on
   * message/send, which does the work and spends money, and it is there.
   *
   * A card behind a key is a shop with its name written on the inside of the
   * door.
   */
  '/.well-known/agent-card.json',
  // The legacy path, kept because a platform that cached the old name would
  // otherwise silently lose us.
  '/.well-known/agent.json',
  /*
   * THE Z.AI RELAY IS GATED BY ITS OWN BEARER, NOT BY THE GUARD.
   *
   * Its only caller is zep's LLM client: a 2023 snapshot of langchaingo that
   * can send exactly one credential -- the Authorization bearer (the Z.AI key
   * zep holds as ZEP_OPENAI_API_KEY) -- and no X-Api-Key, no initData, ever.
   * Measured in production 2026-09-13: the guard answered 401 before the
   * relay's own check ran, so the freshly deployed route was unreachable.
   *
   * Not a relaxation: the relay (src/zai-relay.ts) refuses every caller whose
   * bearer does not timing-safe-match GLM_API_KEY, fails closed without that
   * key, and rebuilds the upstream Authorization from OUR env so it can never
   * proxy a caller-chosen key. The guard would only add a credential the one
   * legitimate caller is technically unable to send.
   */
  '/api/zai/relay/chat/completions',
  // POST /api/users/sync-from-telegram пропускается гвардом НАМЕРЕННО:
  // хендлер сам достаёт личность из подписи initData (или сверяет
  // dev-ключ с телом). Синк МОЖЕТ писать только своего владельца.
  '/api/users/sync-from-telegram',
  // POST /api/tokens/invoice пропускается гвардом НАМЕРЕННО: хендлер сам
  // проверяет личность (подпись мини-аппа ИЛИ ключ агента) — как /mcp.
  // Без этого прод-enforce отбивал создание инвойса 401 (ловушка №8,
  // третий случай: локальный warn маскирует).
  '/api/tokens/invoice',
  // verify — тот же принцип: личность проверяет сам хендлер (chatIdentity),
  // а звёзды сверяются с Bot API — первоисточником.
  '/api/tokens/verify',
  // The club subscription (club-membership.ts) checks identity in its own
  // handler, like the two token routes above.
  '/api/club/invoice',
  '/api/club/status',
  '/api/club/verify',
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
/**
 * НЕ ПУБЛИЧНЫЕ ИСКЛЮЧЕНИЯ ИЗ ПУБЛИЧНЫХ ПРЕФИКСОВ.
 *
 * Список выше открывает ПРЕФИКС, а не маршруты: любой новый сосед под
 * `/api/feed` становится открытым, и никто этого не выбирал. Так под общий
 * префикс попал `GET /api/feed/pending` — свои НЕОДОБРЕННЫЕ посты, то есть
 * ровно то, что видеть должен только автор.
 *
 * Сам обработчик личность и так требует, но защита в один слой — это защита
 * до первой правки. Здесь она названа явно.
 */
const НЕ_ПУБЛИЧНЫЕ = ['/api/feed/pending']

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
  /*
   * SOUL ОТКРЫТ НА ЧТЕНИЕ. На нём строится знакомство: люди находят друг
   * друга по интересам, а агенты a2a — людей. Закрытый SOUL связывать никого
   * не может. Правка идёт другим путём (инструменты MCP) и личность
   * по-прежнему требует.
   */
  '/api/soul/',
]

export function isPublic(req: IncomingMessage): boolean {
  const url = (req.url || '').split('?')[0]
  // Исключения проверяются ПЕРВЫМИ: иначе более общий префикс уже вернул бы
  // `true` и до них дело не дошло.
  if (НЕ_ПУБЛИЧНЫЕ.some(p => url === p || url.startsWith(p + '/'))) return false
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

  /*
   * Sign out everywhere: a launch string issued before the person's cutoff is
   * refused here, so every initData door refuses it -- the guard, the identity
   * helpers, /api/auth/telegram and pair/start. It stops a CAPTURED launch
   * string, not a forged one: initData signed with a bot token this server
   * accepts carries a fresh auth_date of the forger's choosing.
   */
  let userId: string | null = null
  try {
    const id = JSON.parse(params.get('user') || 'null')?.id
    userId = id != null ? String(id) : null
  } catch {
    userId = null
  }
  const cutoff = initDataCutoffRefusal(userId, authDate)
  if (cutoff) return { ok: false, reason: cutoff }

  return { ok: true, botId: matchedBotId }
}

export interface AuthResult {
  allowed: boolean
  /** true, если пропущено только из-за режима warn. */
  wouldReject: boolean
  via: 'public' | 'api-key' | 'agent-key' | 'telegram' | 'session' | 'none'
  reason?: string
  /**
   * telegram_id, если способ аутентификации его знает.
   *
   * Есть у `session` и у `agent-key`: оба знают, ЧЕЙ запрос. Ключ сервера
   * безличен, а у подписи личность достаёт `verifiedTelegramId` отдельно —
   * она разбирает ту же строку и держать два источника одного значения
   * незачем.
   */
  telegramId?: string
}

/**
 * ЕСТЬ ЛИ У ЗАПРОСА КЛЮЧ СЕРВЕРА — БЕЗ ОГЛЯДКИ НА ПУБЛИЧНОСТЬ МАРШРУТА.
 *
 * Отдельная функция нужна ровно потому, что `authenticate` начинается с
 * `isPublic` и на публичном маршруте возвращает `via: 'public'`, НЕ ДОЙДЯ до
 * проверки ключа. Для «пускать или нет» это правильно. Но обработчик,
 * которому важно отличить СВОЙ СЕРВЕР от «кого-то опознанного», получал от
 * `authenticate` бесполезный ответ.
 *
 * Куплено ошибкой: ветка «сервис бота зовёт агента за человека» сверялась с
 * `authenticate(req).via === 'api-key'` на маршруте /api/agent/chat, который
 * числится публичным (он проверяет личность сам). Условие не выполнялось
 * никогда, и бот получал «не удалось определить пользователя» — при верном
 * ключе. Тот же класс, что и `/api/feed/pending`: проверка стояла не там, где
 * принимается решение.
 *
 * Сравнение постоянного времени: посимвольное `===` возвращается на первом
 * различии и выдаёт ключ по префиксу.
 */
export function hasServerKey(req: IncomingMessage): boolean {
  const expected = apiKey()
  const given = (req.headers['x-api-key'] as string | undefined) || ''
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
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

  /**
   * КЛЮЧ АГЕНТА — и без него приложение не могло дойти до генерации ВООБЩЕ.
   *
   * `Identity` в iOS хранит ровно две вещи: сессионный токен и ключ агента.
   * Токена без входа по коду из бота нет, значит остаётся ключ — а гвард его
   * не спрашивал. Получалось так: в Профиле есть поле для ключа, человек его
   * заполняет, и всё равно каждая генерация отвечает «unauthorized: no
   * X-Api-Key and no Telegram initData». Поле, которое ничего не открывает,
   * хуже отсутствующего: оно обещает вход.
   *
   * Это не новая дверь и не послабление. `AGENT_KEYS` уже сопоставляет ключ
   * КОНКРЕТНОМУ человеку («ключ:telegram_id»), и на этом же сопоставлении
   * работают /mcp и /api/agent/chat — они проверяют его сами, каждый у себя.
   * Здесь та же проверка встаёт в общий гвард, чтобы третьего разошедшегося
   * места не появилось.
   *
   * Ветка стоит ПОСЛЕ ключа сервера и ДО сессии: клиент, приславший
   * X-Agent-Key, уже назвал свой способ, и разбирать за него пустой Bearer
   * незачем.
   */
  const агентКлюч = (req.headers['x-agent-key'] as string | undefined) || ''
  if (агентКлюч) {
    // Сравнение посимвольное по всей паре, а не по началу строки: ключ и
    // идентификатор разделены двоеточием, и ключ «abc» не должен подходить
    // к записи «abcdef:123».
    for (const пара of (process.env.AGENT_KEYS || '').split(',')) {
      const [к, id] = пара.split(':')
      if (!к || !id) continue
      const a = Buffer.from(агентКлюч)
      const b = Buffer.from(к.trim())
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return {
          allowed: true,
          wouldReject: false,
          via: 'agent-key',
          telegramId: id.trim(),
        }
      }
    }
    // Предъявленный, но неверный ключ НЕ проваливается дальше — по той же
    // причине, что и протухший Bearer: клиент назвал способ, и молчаливый
    // переход к другому спрятал бы «ключ не тот» за общим отказом.
    return {
      allowed: mode() !== 'enforce',
      wouldReject: true,
      via: 'none',
      reason: 'agent key rejected: unknown',
    }
  }

  /**
   * СЕССИЯ ПРИЛОЖЕНИЯ — третья ветка, а не отдельное пространство маршрутов.
   *
   * Нативный клиент не может добыть initData: она существует только внутри
   * Telegram WebView. Соблазн — завести /api/ios/* со своей проверкой, и это
   * ровно та вторая дверь, которая в этом файле уже расходилась молча.
   * Вместо этого ветка встраивается ЗДЕСЬ, и всё, что уже зовёт
   * chatIdentity, начинает работать для приложения без единой правки.
   *
   * Порядок веток намеренный: ключ сервера, потом сессия, потом подпись.
   * Сессия выше подписи, потому что у нативного клиента её просто нет, а
   * лишний разбор пустого заголовка на каждом запросе — работа впустую.
   *
   * Проверка СИНХРОННАЯ и без обращения к базе (см. session.ts): она идёт на
   * каждом запросе, и поход в Postgres здесь стоил бы дороже всего
   * остального вместе взятого.
   */
  const bearer = (req.headers['authorization'] as string | undefined) || ''
  if (bearer.startsWith('Bearer ')) {
    try {
      const claims = verifyAppSession(bearer.slice(7).trim())
      return {
        allowed: true,
        wouldReject: false,
        via: 'session',
        telegramId: claims.sub,
      }
    } catch (e) {
      /**
       * Отказ НЕ проваливается в следующую ветку.
       *
       * Клиент, приславший Bearer, заявил, чем он аутентифицируется. Если
       * токен протух или отозван, честный ответ — 401 с причиной, чтобы
       * клиент обновил токен. Молчаливое падение в проверку подписи дало бы
       * ему «unauthorized» без объяснения, и он бы не понял, что нужно
       * именно обновление.
       */
      const code = e instanceof SessionError ? e.code : 'malformed'
      return {
        allowed: mode() !== 'enforce',
        wouldReject: true,
        via: 'none',
        reason: `session rejected: ${code}`,
      }
    }
  }

  // Credentials belong in headers. Query strings are copied into proxy,
  // browser-history and application logs, so accepting Telegram initData there
  // turns a signed identity into a replayable URL. The player uses authenticated
  // polling instead of EventSource for this reason.
  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    ''
  if (initData) {
    const v = verifyTelegramInitData(initData)
    if (v.ok) {
      countInitDataBot(v.botId)
      return { allowed: true, wouldReject: false, via: 'telegram' }
    }
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
  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    ''
  if (!initData) return null
  const v = verifyTelegramInitData(initData)
  if (!v.ok) return null
  countInitDataBot(v.botId)
  try {
    const raw = new URLSearchParams(initData).get('user')
    if (!raw) return null
    const id = JSON.parse(raw)?.id
    return id != null ? String(id) : null
  } catch {
    return null
  }
}

/**
 * The @username from the SAME verified signature, lower-cased, without the
 * "@". Null when the signature is missing, wrong, or carries no username
 * (Telegram lets a person have none). Used by the club's guest pass: the
 * owner names people by @username, and only a verified `user` object may
 * say who is who.
 */
export function verifiedTelegramUsername(req: IncomingMessage): string | null {
  const initData =
    (req.headers['x-telegram-init-data'] as string | undefined) ||
    (req.headers['x-telegram-initdata'] as string | undefined) ||
    ''
  if (!initData) return null
  if (!verifyTelegramInitData(initData).ok) return null
  try {
    const raw = new URLSearchParams(initData).get('user')
    if (!raw) return null
    const u = JSON.parse(raw)?.username
    const name = String(u ?? '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase()
    return name || null
  } catch {
    return null
  }
}

export function authMode(): string {
  return mode()
}
