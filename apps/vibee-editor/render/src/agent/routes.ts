/**
 * Входы агента: чат мини-аппа и MCP для ЛЮБОГО внешнего агента.
 *
 * СЕРВИС СПРОЕКТИРОВАН ПОД АГЕНТА КАК ГЛАВНОГО ПОЛЬЗОВАТЕЛЯ. Что это значит
 * на практике — каждое решение ниже принято из опыта работы агентом:
 *
 * 1. GET /mcp отдаёт КАРТОЧКУ ПОДКЛЮЧЕНИЯ обычным текстом. Агент, которому
 *    дали голый адрес, первым делом делает GET. Ответ «405 Method Not
 *    Allowed» стоит ему витка и ничего не объясняет.
 * 2. ОШИБКА ОБЯЗАНА ГОВОРИТЬ, ЧТО ДЕЛАТЬ ДАЛЬШЕ. Не «invalid arguments», а
 *    «поле description должно содержать хештег — добавь и повтори». Агент
 *    исправляется за один виток вместо трёх попыток вслепую.
 * 3. ЕСТЬ ДЕШЁВАЯ РАЗВЕДКА. whoami и feed_stats бесплатны и мгновенны:
 *    агенту нужно понять, где он оказался, не тратя денег и не меняя
 *    состояния.
 * 4. СЕРВИС ЧЕСТНО ГОВОРИТ, ЧЕГО НЕ УМЕЕТ. Список отсутствующих возможностей
 *    отдаётся прямо в карточке — иначе агент потратит витки, выясняя это
 *    перебором.
 * 5. ОДИН РЕЕСТР НА ВСЕ ВХОДЫ. Рукописный список возможностей в этом проекте
 *    уже расходился с реализацией: /compositions обещал шесть шаблонов при
 *    одной существующей композиции.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import {
  verifyAppSession,
  isGameToken,
  verifyGameToken,
  SessionError,
} from '../../session'
import { TOOLS_BY_NAME, toMcpTools, countInitDataToolCall } from './tools'
import { runAgent, type ChatMessage } from './chat'
import { resolveProvider } from './provider'
import { verifiedTelegramId, hasServerKey, initDataBotOf } from '../../auth'
import {
  записатьРеплику,
  прочитатьРазговор,
  собратьОтвет,
  удалитьРеплику,
  очиститьРазговор,
  РЕПЛИК_ПО_УМОЛЧАНИЮ,
  SELF_THREAD,
  CLIENT_ID_RE,
  clientThread,
} from './conversation'

/**
 * WHICH THREAD A REQUEST TALKS TO, AND WHETHER IT MAY.
 *
 * `body.client` / `?client=` names a client; the thread is `client:<id>`.
 * Without it the request is about the caller's own thread and nothing here
 * changes. Spec: t27 specs/automation/crm-client-workspace.t27.
 *
 * Fail-closed and BEFORE any read of the thread: a malformed id is 400, a
 * caller who is not a seller is 403, and the owner naming themselves as a
 * client is 400. The seller check is the gate's own lookup of the caller's
 * row (`isSeller`), keyed by the verified id -- nothing about the client is
 * read here.
 */
export type ThreadGate =
  | { ok: true; thread: string; client: string | null }
  | { ok: false; status: number; error: string }

export async function threadFor(
  rawClient: unknown,
  owner: string,
  getPool: () => any
): Promise<ThreadGate> {
  if (rawClient == null || rawClient === '')
    return { ok: true, thread: SELF_THREAD, client: null }
  const client = String(rawClient).trim()
  if (!CLIENT_ID_RE.test(client))
    return { ok: false, status: 400, error: 'bad client' }
  if (client === String(owner))
    return { ok: false, status: 400, error: 'bad client' }
  let seller = false
  try {
    const { isSeller } = await import('./telegram-tools')
    const pool = await getPool()
    seller = await isSeller({ telegramId: String(owner), pool })
  } catch {
    seller = false
  }
  if (!seller) return { ok: false, status: 403, error: 'not a seller' }
  return { ok: true, thread: clientThread(client), client }
}

/** The client id from the query string, or null when absent. */
function clientParam(req: IncomingMessage): string | null {
  return new URL(req.url || '', 'http://x').searchParams.get('client')
}

/**
 * CONSTANT-TIME key comparison.
 *
 * A plain `a === b` returns at the first differing character, so response time
 * leaks the key prefix by prefix and it can be guessed piece by piece. initData
 * and X-Api-Key in auth.ts already use timingSafeEqual; the agent key lagged
 * behind.
 *
 * timingSafeEqual needs buffers of equal length and keys differ in length, so
 * the comparison runs over SHA-256 of each (always 32 bytes). That also stops
 * the key's length leaking through the buffer's length.
 */
function sameKey(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Ключи внешних агентов: AGENT_KEYS="ключ1:telegramId,ключ2:telegramId".
 *
 * Ключ ПРИВЯЗАН к человеку. Без привязки инструмент не знает, чью ленту
 * читать и от чьего имени публиковать, а «telegram_id в аргументах» означал
 * бы, что любой желающий публикует от чужого имени.
 */
export function agentKeyOwner(key: string): string | null {
  const raw = process.env.AGENT_KEYS || ''
  if (!key) return null
  let owner: string | null = null
  for (const pair of raw.split(',')) {
    const [k, id] = pair.split(':').map(s => s.trim())
    // Walk EVERY key instead of returning at the first hit: an early return
    // would reveal which key matched through the iteration count. The key set
    // is small and server-side, but keeping the comparison constant is cheap.
    if (k && id && sameKey(k, key)) owner = id
  }
  return owner
}

/**
 * Read a request body, bounded.
 *
 * The old version accumulated `b += c.toString()` with no cap, no deadline and
 * no error handler, and it is the shared body reader for ~10 POST/DELETE routes
 * (feed, assets, tokens, agent-chat, mcp, a2a). Three ways to hurt it: a huge
 * body exhausted memory; a client that never sent `end` left the promise
 * pending forever, holding the connection; a socket error left it pending with
 * no resolve and no reject. See #901.
 *
 * Now it rejects on any of the three. Every caller already does
 * `JSON.parse(await readBody(req))` inside a try/catch — bad JSON would crash
 * them otherwise — so a rejection is caught by the same handler that catches a
 * parse error, and turns into that route's error response.
 *
 * The limits are generous on purpose: bodies here are JSON, so 10 MB is far
 * above anything legitimate while still bounding the unbounded case, and 60 s
 * outlasts a slow-but-real upload while still bounding a client that stalls.
 */
export function readBody(
  req: IncomingMessage,
  maxBytes = 10 * 1024 * 1024,
  timeoutMs = 60_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = ''
    let size = 0
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(
      () =>
        settle(() => {
          req.destroy()
          reject(new Error('readBody: timed out'))
        }),
      timeoutMs
    )
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) {
        settle(() => {
          req.destroy()
          reject(new Error('readBody: body too large'))
        })
        return
      }
      b += c.toString()
    })
    req.on('end', () => settle(() => resolve(b)))
    req.on('error', err => settle(() => reject(err)))
    req.on('aborted', () =>
      settle(() => reject(new Error('readBody: client aborted')))
    )
  })
}

function json(res: ServerResponse, code: number, obj: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const CARD = () => {
  let провайдер = 'не настроен'
  let размышление = false
  try {
    const p = resolveProvider()
    провайдер = `${p.id} / ${p.model}`
    размышление = p.thinking
  } catch (e) {
    провайдер = String(e).slice(0, 160)
  }
  return {
    сервис: 'Trinity S³AI — фабрика рилсов',
    протокол: 'MCP поверх JSON-RPC 2.0',
    как_подключиться: {
      шаг1: 'Получите ключ у владельца: он выдаётся на ваш telegram_id.',
      шаг2: 'Шлите POST на этот же адрес с заголовком X-Agent-Key: <ключ>.',
      шаг3: 'Начните с {"jsonrpc":"2.0","id":1,"method":"tools/list"}.',
      пример:
        'curl -s https://vibee-render-production.up.railway.app/mcp ' +
        "-H 'X-Agent-Key: КЛЮЧ' -H 'Content-Type: application/json' " +
        '-d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'',
    },
    методы: ['initialize', 'tools/list', 'tools/call'],
    инструментов: toMcpTools().length,
    модель: провайдер,
    видно_размышление: размышление,
    чего_сервис_НЕ_умеет: [
      'публикация от чужого имени: telegram_id берётся из ключа, а не из аргументов',
      'удаление записей ленты',
    ],
    производство: [
      'image_generate: картинка по описанию (Replicate flux-schnell) — файл сразу в S3',
      'audio_generate: озвучка текста (ElevenLabs; только при валидном ключе аккаунта)',
      'video_generate: видеофрагмент по описанию (Replicate seedance-1-lite) — mp4 в S3',
      'reel_render: сборка рилса в mp4 (Remotion), ждёт окончания',
    ],
    совет:
      'Начните с whoami и feed_stats — они бесплатны, мгновенны и ничего не меняют.',
  }
}

/** GET /mcp — карточка подключения. Публичная намеренно. */
export function handleMcpCard(res: ServerResponse) {
  json(res, 200, CARD())
}

/** POST /mcp — JSON-RPC. */
/**
 * Identity including ISSUED keys -- the async layer above chatIdentity.
 *
 * WHY IT IS NEEDED. `handleAgentKeys` issues a key and, in its own response,
 * promises: "Connect with X-Agent-Key to POST /mcp or /a2a". The only resolver
 * was `chatIdentity`, which knows `AGENT_KEYS` from the environment and never
 * reads `agent_keys`. An issued key therefore worked NOWHERE while the endpoint
 * claimed otherwise. Until the issue route was wired (cycle 226) nobody could
 * hear that promise; now they can, so the gap became real.
 *
 * The source order matches chatIdentity, and the database comes LAST: a
 * signature and a session prove a person is present right now, while a key is
 * long-lived and revocable. A revoked key resolves to nobody -- `revoked =
 * FALSE` sits in the query, otherwise revocation would be a row change with no
 * consequence.
 *
 * A database error does NOT grant access: if it cannot be read we return null
 * and the caller answers 401. Refusing because the store is unreachable is
 * more honest than letting someone in unchecked.
 */
export async function resolveIdentity(
  req: IncomingMessage,
  getPool: () => any
): Promise<string | null> {
  const sync = chatIdentity(req, verifiedTelegramId(req))
  if (sync) return sync

  /*
   * ЧЕТВЁРТАЯ ЛИЧНОСТЬ: НАШ СОБСТВЕННЫЙ СЕРВИС БОТА.
   *
   * Сервис бота разговаривает с агентом ОТ ИМЕНИ ЧЕЛОВЕКА, который написал
   * ему в Telegram. Подписи мини-аппа у него нет и быть не может — она
   * существует только внутри WebView, — а личного ключа агента у каждого
   * пользователя тоже нет. Без этой ветки бот не мог бы позвать агента ни за
   * кого, и «вся работа в чате бота» осталась бы обещанием.
   *
   * Механизм тот же, что уже принят в этом сервисе для внутренних вызовов
   * (DELETE /api/feed/:id, GET /api/feed/pending): общий серверный ключ плюс
   * ЯВНО названный telegram_id.
   *
   * Два условия, оба обязательны:
   *
   *  1. Именно СЕРВЕРНЫЙ КЛЮЧ, а не «кто-то опознанный». Подпись мини-аппа
   *     есть у каждого пользователя, и разреши мы ей называть чужой id —
   *     любой читал бы и продолжал чужой разговор.
   *
   *     Проверка идёт через `hasServerKey`, а НЕ через `authenticate`:
   *     последний начинается с `isPublic`, а /api/agent/chat числится
   *     публичным (он проверяет личность сам), поэтому возвращал бы
   *     `via: 'public'`, не дойдя до ключа. Именно на этом условие сначала и
   *     не сработало — бот получал «не удалось определить пользователя» при
   *     верном ключе.
   *  2. id назван ЯВНО. Умолчания здесь быть не может: «не назвали — значит
   *     владелец» превратило бы каждый безымянный вызов в действие от лица
   *     владельца.
   */
  if (hasServerKey(req)) {
    const явный = new URL(req.url || '', 'http://x').searchParams.get(
      'telegram_id'
    )
    if (явный && /^\d{5,15}$/.test(явный)) return явный
  }

  const key = (req.headers['x-agent-key'] as string | undefined) || ''
  if (!key) return null
  try {
    const pool = await getPool()
    const r = await pool.query(
      `SELECT telegram_id FROM agent_keys
        WHERE key_hash = $1 AND revoked = FALSE LIMIT 1`,
      [keyHash(key)]
    )
    return r.rows?.[0]?.telegram_id ? String(r.rows[0].telegram_id) : null
  } catch {
    // The table may not exist on a fresh database -- still no reason to admit.
    return null
  }
}

/**
 * Tools a game token may call on /mcp: who the person is (whoami) and the hive
 * pulse their role may see (hive_pulse). A game token lives in the game origin,
 * whose code this service does not review, so anything that reads or changes a
 * person's data stays off this list.
 */
export const GAME_TOKEN_TOOLS: readonly string[] = ['whoami', 'hive_pulse']

/**
 * The game token behind this request's Bearer, if the Bearer is one.
 *
 * null: no Bearer, or a Bearer whose header does not say game token -- the
 * ordinary identity path decides. A game token that fails verification is
 * refused, and never falls through to another credential on the same request:
 * the client said how it authenticates, as in authenticate().
 */
function gameTokenOf(
  req: IncomingMessage
): null | { ok: true; telegramId: string } | { ok: false; code: string } {
  const bearer = (req.headers['authorization'] as string | undefined) || ''
  if (!bearer.startsWith('Bearer ')) return null
  const token = bearer.slice(7).trim()
  if (!isGameToken(token)) return null
  const origin = String(req.headers['origin'] ?? '')
  try {
    return { ok: true, telegramId: verifyGameToken(token, origin).sub }
  } catch (e) {
    return { ok: false, code: e instanceof SessionError ? e.code : 'malformed' }
  }
}

export async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => any
) {
  // THREE identities: the initData signature (the mini app itself), a key from
  // the environment, and a key the person issued to themselves through
  // /api/agent/keys. The last one resolves through the database, which is why
  // this entry point is async.
  // A game token is a narrower fourth identity: identity tools only (see
  // GAME_TOKEN_TOOLS below), and an invalid one is refused outright.
  const game = gameTokenOf(req)
  if (game && !game.ok) {
    return json(res, 401, {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: `Game token refused: ${game.code}. Mint a new one at POST /api/auth/game-token.`,
      },
    })
  }
  const owner = game ? game.telegramId : await resolveIdentity(req, getPool)
  if (!owner) {
    // Сообщение константно и не отражает содержимое заголовков: любое
    // эхо чужого ввода — путь к инъекции, даже в JSON.
    return json(res, 401, {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message:
          'Нужна подпись Telegram (X-Telegram-Init-Data) или корректный ключ агента (X-Agent-Key). Карточка: GET этот же адрес.',
      },
    })
  }

  let rpc: any
  try {
    rpc = JSON.parse((await readBody(req)) || '{}')
  } catch {
    return json(res, 400, {
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Тело запроса не разобрано как JSON.' },
    })
  }

  const id = rpc.id ?? null
  const ok = (result: unknown) => json(res, 200, { jsonrpc: '2.0', id, result })
  const err = (code: number, message: string) =>
    json(res, 200, { jsonrpc: '2.0', id, error: { code, message } })

  if (rpc.method === 'initialize') {
    return ok({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'trinity-s3ai-reels', version: '1.0.0' },
      instructions:
        'Инструменты читают и меняют состояние приложения по-настоящему. ' +
        'Сначала посмотри (whoami, feed_stats, feed_list), потом действуй. ' +
        'Публикация требует текста поста с хештегами — это канон проекта.',
    })
  }

  if (rpc.method === 'tools/list') {
    const listed = game
      ? toMcpTools().filter(t => GAME_TOKEN_TOOLS.includes(t.name))
      : toMcpTools()
    return ok({ tools: listed })
  }

  if (rpc.method === 'tools/call') {
    // Before the lookup, so a game token learns nothing about other tools,
    // not even whether a name exists.
    if (game && !GAME_TOKEN_TOOLS.includes(String(rpc.params?.name))) {
      return err(
        -32001,
        `A game token may call only: ${GAME_TOKEN_TOOLS.join(', ')}.`
      )
    }
    const имя = rpc.params?.name
    const tool = имя ? TOOLS_BY_NAME.get(имя) : null
    if (!tool) {
      // Подсказываем ИМЕНА, а не просто отказываем: агент исправится за виток.
      return err(
        -32602,
        `Инструмента «${имя}» нет. Доступны: ${toMcpTools()
          .map(t => t.name)
          .join(', ')}.`
      )
    }
    try {
      const pool = await getPool()
      const ctx = {
        telegramId: owner,
        pool,
        // Per-bot privileged path counters; a game token is not initData.
        initDataBot: game
          ? undefined
          : (initDataBotOf(req, owner) ?? undefined),
      }
      countInitDataToolCall(ctx, имя) // cyrillic-ok: pre-existing local
      const значение = await tool.handler(rpc.params?.arguments || {}, ctx)
      return ok({
        content: [{ type: 'text', text: JSON.stringify(значение, null, 1) }],
        structuredContent: значение,
      })
    } catch (e) {
      return err(-32603, `Инструмент «${имя}» упал: ${String(e).slice(0, 400)}`)
    }
  }

  return err(
    -32601,
    `Метода «${rpc.method}» нет. Поддерживаются: initialize, tools/list, tools/call.`
  )
}

/**
 * POST /api/agent/chat — чат мини-аппа, поток NDJSON.
 *
 * NDJSON, а не SSE: EventSource не умеет ставить заголовки, а подпись
 * initData — заголовок. Обходить это через строку запроса значит класть
 * подпись в адрес, откуда она попадает в логи прокси.
 */
/**
 * Личность для чата: подпись мини-аппа ИЛИ ключ агента.
 *
 * Ключ агента добавлен НАРОЧНО и по прямой просьбе владельца: коннектор, через
 * который агента можно тестировать напрямую, curl-ом, без Telegram. initData
 * подделать нельзя (в этом смысл), а форжить её ради теста — значит ослабить
 * проверку навсегда. Ключ же привязан к человеку и отзывается одной строкой.
 */
export function chatIdentity(
  req: IncomingMessage,
  verified: string | null
): string | null {
  if (verified) return verified
  /**
   * Сессия приложения — второй источник личности после подписи.
   *
   * Порядок важен: подпись мини-аппа доказывает, что человек прямо сейчас в
   * Telegram, и это сильнее долгоживущего токена. Сессия идёт следом, ключ
   * агента — последним, потому что он для отладки curl-ом.
   *
   * Проверка та же самая, что в `authenticate`: одна функция, один результат.
   * Две реализации проверки токена разошлись бы ровно так же, как когда-то
   * разошлись две двери в public_templates.
   */
  const bearer = (req.headers['authorization'] as string | undefined) || ''
  if (bearer.startsWith('Bearer ')) {
    try {
      return verifyAppSession(bearer.slice(7).trim()).sub
    } catch {
      // Молча вниз: разбираться с причиной — дело authenticate, который
      // отвечает клиенту. Здесь важно лишь, знаем мы личность или нет.
    }
  }
  const key = (req.headers['x-agent-key'] as string | undefined) || ''
  return key ? agentKeyOwner(key) : null
}

export async function handleAgentChat(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  let body: any
  try {
    body = JSON.parse((await readBody(req)) || '{}')
  } catch {
    return json(res, 400, { error: 'тело запроса не разобрано как JSON' })
  }
  const history: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages
    : []
  if (!history.length) {
    return json(res, 400, {
      error: 'нужен непустой массив messages вида [{role:"user",content:"…"}]',
    })
  }

  // The client thread gate answers before the stream opens: a 4xx must be a
  // real status, not an error event inside a 200.
  const gate = await threadFor(body.client, telegramId, getPool)
  if (!gate.ok) return json(res, gate.status, { error: gate.error })
  const thread = gate.thread

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    // Без этого nginx и прокси Railway копят ответ целиком, и поток
    // превращается в один пакет в конце — то есть в отсутствие потока.
    'X-Accel-Buffering': 'no',
  })

  /*
   * ГДЕ ЧЕЛОВЕК ПИШЕТ. Бот и мини-апп — один разговор, но видеть, с какой
   * стороны пришла реплика, полезно и человеку, и агенту. Значение приходит
   * от клиента, поэтому НЕ доверяем ему слепо: берём короткое известное слово
   * или «unknown».
   */
  /*
   * ONE TOKEN PER TURN, SO A PREPARED ACTION GOES BACK TO ITS OWN CALLER.
   *
   * `remember()` happens during a tool call and the answer is written when the
   * turn ends; the model is still writing in between. Without this token,
   * `issueFor` only asked "is anything pending for this person?", and a
   * concurrent request -- which the shared server key makes possible for any
   * telegram_id -- could answer yes and take the secret. Reproduced: the
   * attacker's turn got the secret, the owner's turn got null, no card was
   * ever shown, and the message went out.
   */
  const turn = randomUUID()

  const ИЗВЕСТНЫЕ_ПОВЕРХНОСТИ = new Set([
    'miniapp',
    'bot',
    'agent',
    'ios',
    'business',
  ]) // cyrillic-ok: pre-existing name
  const поверхность = ИЗВЕСТНЫЕ_ПОВЕРХНОСТИ.has(String(body.surface))
    ? String(body.surface)
    : 'unknown'

  try {
    const pool = await getPool()

    /*
     * Записываем ПОСЛЕДНЮЮ реплику человека, а не всю присланную историю:
     * клиент шлёт весь свой транскрипт каждым запросом, и запись целиком
     * дублировала бы разговор на каждом витке.
     */
    /*
     * THE SWEEP'S BRIEF IS NOT THE OWNER'S CONVERSATION (CRM audit
     * 2026-09-12, P1 #5). `tools_only` turns come from the unattended
     * seller: a ~1 KB brief plus, often, a marker-only answer. Recorded
     * here they pushed the owner's own words out of the 40-turn window in
     * about ten sweeps and taught the next sweep to answer the same way.
     * The bot records the one turn worth keeping itself (crmProactive.ts);
     * the server records nothing for these.
     */
    const ephemeral = body.tools_only === true
    const последняя = history[history.length - 1]
    if (!ephemeral && последняя?.role === 'user') {
      await записатьРеплику(
        pool,
        telegramId,
        {
          role: 'user',
          content: String(последняя.content ?? ''),
          surface: поверхность,
        },
        thread
      ).catch(() => {
        // Хранение — удобство, а не условие разговора. Упавшая запись не
        // должна лишать человека ответа: он и так уже ждёт.
      })
    }

    const события: Array<{ тип?: string; текст?: string }> = []
    for await (const ev of runAgent(
      history,
      {
        telegramId,
        pool,
        turn,
        surface: поверхность, // cyrillic-ok: pre-existing local
        // Per-bot privileged path counters (src/auth/initdata-bot-counts.ts).
        initDataBot: initDataBotOf(req, telegramId) ?? undefined,
      },
      // The surface was already parsed and allow-listed above; the agent needs
      // it so that button markers are proposed in the bot and nowhere else.
      // tools_only: the caller (the seller's sweep) needs a model that calls
      // tools, not one that talks about them. Anything but `true` is false.
      // client: the thread is about this person; the agent reads their
      // profile and the owner's history with them before the first word.
      {
        surface: поверхность, // cyrillic-ok: local defined earlier in this file
        toolsOnly: body.tools_only === true,
        client: gate.client ?? undefined,
      }
    )) {
      события.push(ev as { тип?: string; текст?: string })
      res.write(JSON.stringify(ev) + '\n')
    }

    const ответ = собратьОтвет(события)
    if (ответ && !ephemeral) {
      await записатьРеплику(
        pool,
        telegramId,
        {
          role: 'assistant',
          content: ответ, // cyrillic-ok: pre-existing local
          surface: поверхность, // cyrillic-ok: pre-existing local
        },
        thread
      ).catch(() => {
        // Ответ человек уже получил потоком; потерянная запись — потеря
        // памяти, а не ответа.
      })
    }
  } catch (e) {
    res.write(
      JSON.stringify({ тип: 'ошибка', текст: String(e).slice(0, 500) }) + '\n'
    )
  }

  /*
   * THE SECRET LEAVES HERE AND NOWHERE ELSE.
   *
   * If this turn prepared a message, the draft and its one-time secret go back
   * in the same answer -- to the caller whose request created it. The read
   * route (GET /api/tg/proposal) never returns a secret, so watching the queue
   * with the server key yields a draft that cannot be confirmed.
   *
   * ── OUTSIDE THE try, AND THAT IS THE POINT ────────────────────────────────
   *
   * A tool can succeed and the turn still fail afterwards -- the model errors,
   * the provider drops. The draft exists either way. Written inside the try,
   * the secret would never leave, `issued` would stay false, and the NEXT turn
   * would hand out a card for a message prepared during a conversation the
   * person has moved on from. The turn that created a draft is the turn that
   * accounts for it.
   *
   * Written as an event on the same stream rather than a second request, so
   * there is no window between "a draft exists" and "the client that caused it
   * holds the secret" for anybody to step into.
   *
   * The key is a string literal on purpose: it is this envelope's pre-existing
   * Cyrillic field name, and quoting keeps the no-cyrillic gate looking at code
   * rather than at data.
   */
  try {
    const { issueFor } = await import('./tg-proposals')
    const draft = issueFor(telegramId, turn)
    if (draft) {
      // cyrillic-ok: pre-existing envelope field name
      res.write(JSON.stringify({ тип: 'proposal', proposal: draft }) + '\n') // cyrillic-ok
    }
  } catch {
    // A missing draft event costs a confirmation card, not the answer the
    // person is reading. It must never take the reply down with it.
  }

  res.end()
}

/**
 * GET /api/agent/history — общий разговор владельца, откуда бы он ни писал.
 *
 * Пока этого маршрута не было, «синхронизировать» было нечего: история жила в
 * localStorage одного браузера. Теперь обе поверхности читают одно место.
 *
 * Личность НЕ берётся из запроса: telegramId приходит уже проверенным от
 * диспетчера. Иначе любой мог бы прочитать чужой разговор, назвав чужой id.
 */
/**
 * DELETE /api/agent/history — убрать реплику или начать разговор заново.
 *
 * Два действия одним маршрутом, потому что это одно и то же право: править
 * СВОЮ переписку. `?id=<n>` убирает одну реплику, без него — весь разговор.
 *
 * Личность приходит уже проверенной от диспетчера и НЕ берётся из тела: иначе
 * знание чужого telegram_id стало бы правом стирать чужое.
 *
 * Явное `?id` вместо «удалить последнее»: «последнее» зависит от того, что
 * успело записаться, и человек, нажавший дважды, снёс бы лишнее.
 */
export async function handleAgentHistoryDelete(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  const параметры = new URL(req.url || '', 'http://x').searchParams
  const сырой = параметры.get('id')
  // Gate first: a client thread is cleared only by a seller, and only that
  // thread -- the self thread is never touched through `?client=`.
  const gate = await threadFor(clientParam(req), telegramId, getPool)
  if (!gate.ok) return json(res, gate.status, { ok: false, error: gate.error })
  try {
    const pool = await getPool()
    if (сырой != null) {
      const id = Number(сырой)
      if (!Number.isFinite(id) || id <= 0) {
        return json(res, 400, { ok: false, error: 'id должен быть числом' })
      }
      const убрано = await удалитьРеплику(pool, telegramId, id, gate.thread) // cyrillic-ok: pre-existing identifiers
      // 404, а не 200: «удалил ноль строк» и «удалил» — разные исходы, и
      // молчаливое «ок» на несуществующий id скрывало бы опечатку.
      if (!убрано)
        return json(res, 404, { ok: false, error: 'реплика не найдена' })
      return json(res, 200, { ok: true, убрано, thread: gate.thread }) // cyrillic-ok: pre-existing identifier
    }
    const убрано = await очиститьРазговор(pool, telegramId, gate.thread) // cyrillic-ok: pre-existing identifiers
    return json(res, 200, { ok: true, убрано, thread: gate.thread }) // cyrillic-ok: pre-existing identifier
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e).slice(0, 300) })
  }
}

export async function handleAgentHistory(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  const предел = Number(
    new URL(req.url || '', 'http://x').searchParams.get('limit') || 0
  )
  const gate = await threadFor(clientParam(req), telegramId, getPool)
  if (!gate.ok) return json(res, gate.status, { ok: false, error: gate.error })
  try {
    const pool = await getPool()
    const реплики = await прочитатьРазговор(
      // cyrillic-ok: pre-existing identifiers
      pool,
      telegramId,
      предел > 0 ? предел : РЕПЛИК_ПО_УМОЛЧАНИЮ, // cyrillic-ok: pre-existing identifiers
      gate.thread
    )
    return json(res, 200, { ok: true, messages: реплики, thread: gate.thread }) // cyrillic-ok: pre-existing identifier
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e).slice(0, 300) })
  }
}

/**
 * APPEND TURNS TO THE SHARED CONVERSATION.
 *
 * Why this route has to exist at all.
 *
 * `handleAgentChat` records both sides of a turn on its way through, so for a
 * normal exchange nothing else is needed. But the bot has a FALLBACK: when the
 * agent is unreachable or returns nothing, it answers with a plain model
 * (`aiChatService`) so the person is not left in silence. That answer went
 * nowhere. Measured 2026-09-07: the user's question was already stored by the
 * server before `runAgent`, so the shared conversation ended on a question with
 * no answer -- and the next turn fed the model a transcript in which the bot
 * appeared to have ignored somebody.
 *
 * WHY IT ACCEPTS A PAIR AND NOT ONE TURN.
 *
 * The two failures differ in what was already stored. If the agent answered
 * with empty text, the server got the request and the question IS on record;
 * only the answer is missing. If the call never arrived -- no key, network
 * down, a 4xx before the handler -- neither is. The caller knows which case it
 * is in, so it sends one turn or two, in order, in a single request. A second
 * round trip could half-succeed and leave exactly the hole this fixes.
 *
 * WHAT IT REFUSES.
 *
 * Roles other than user/assistant: `system` here would let a caller write
 * instructions into someone's conversation that the model then reads as its
 * own. That is not a hypothetical -- the conversation is fed back verbatim on
 * every turn.
 */
export async function handleAgentHistoryAppend(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  let body: any
  try {
    body = JSON.parse((await readBody(req)) || '{}')
  } catch {
    return json(res, 400, {
      ok: false,
      error: 'тело запроса не разобрано как JSON',
    })
  }

  const incoming = Array.isArray(body.turns) ? body.turns : []
  if (!incoming.length) {
    return json(res, 400, {
      ok: false,
      error:
        'нужен непустой массив turns вида [{role:"assistant",content:"…"}]',
    })
  }
  // Two is a question and its answer. More would mean somebody is rewriting
  // the conversation, and this route is not for that.
  if (incoming.length > 2) {
    return json(res, 400, {
      ok: false,
      error: 'за один раз не больше двух реплик',
    })
  }

  const ALLOWED_ROLES = new Set(['user', 'assistant'])
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const raw of incoming) {
    const role = String(raw?.role ?? '')
    if (!ALLOWED_ROLES.has(role)) {
      return json(res, 400, {
        ok: false,
        error: `роль «${role.slice(0, 20)}» недопустима: только user или assistant`,
      })
    }
    const content = String(raw?.content ?? '').trim()
    if (!content) {
      return json(res, 400, {
        ok: false,
        error: 'пустая реплика не записывается',
      })
    }
    turns.push({ role: role as 'user' | 'assistant', content })
  }

  // Same check as the chat route: a word from the client, but only a known one.
  const KNOWN_SURFACES = new Set(['miniapp', 'bot', 'agent', 'ios', 'business'])
  const surface = KNOWN_SURFACES.has(String(body.surface))
    ? String(body.surface)
    : 'unknown'

  const gate = await threadFor(body.client, telegramId, getPool)
  if (!gate.ok) return json(res, gate.status, { ok: false, error: gate.error })

  try {
    const pool = await getPool()
    let stored = 0
    for (const turn of turns) {
      const ok = await записатьРеплику(
        // cyrillic-ok: pre-existing writer
        pool,
        telegramId,
        {
          role: turn.role,
          content: turn.content,
          surface,
        },
        gate.thread
      )
      if (ok) stored++
    }
    return json(res, 200, { ok: true, stored, thread: gate.thread })
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e).slice(0, 300) })
  }
}

/** SHA-256 hex ключа — то, что храним в БД вместо самого ключа (как пароль). */
function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Выпуск/список/отзыв ключей агента (самообслуживание). Личность — из ПОДПИСИ
 * мини-аппа (передаётся telegramId вызывающим), чтобы агентским ключом нельзя
 * было плодить ключи.
 *
 *   POST   /api/agent/keys        {label?}  → выпускает ключ, показывает ОДИН раз
 *   GET    /api/agent/keys                  → список своих (префикс+метка, не ключ)
 *   DELETE /api/agent/keys/:prefix          → отзыв по префиксу
 *
 * Only the SHA-256 of the key is stored. Restored after the session refactor
 * (#891) deleted the function while leaving the route in render-server, which
 * broke the build on main.
 *
 * The other half -- RESOLVING issued keys -- lives in `resolveIdentity`:
 * `chatIdentity` is sync and never touches the database, so the `agent_keys`
 * lookup was moved into an async layer wired at the entry of /mcp and the agent
 * chat. Until it existed, this very response promised a way to connect that did
 * not.
 */
export async function handleAgentKeys(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  const pool = await getPool()
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_keys (
       key_hash text PRIMARY KEY,
       key_prefix text NOT NULL,
       telegram_id text NOT NULL,
       label text,
       created_at timestamptz NOT NULL DEFAULT now(),
       revoked boolean NOT NULL DEFAULT FALSE
     )`
  )
  const method = req.method || 'GET'

  if (method === 'POST') {
    let body: any = {}
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      /* тело необязательно */
    }
    const label = String(body.label || 'agent').slice(0, 60)
    const key = 'tri_' + randomBytes(20).toString('hex')
    const prefix = key.slice(0, 12)
    await pool.query(
      `INSERT INTO agent_keys (key_hash, key_prefix, telegram_id, label)
       VALUES ($1, $2, $3, $4)`,
      [keyHash(key), prefix, telegramId, label]
    )
    return json(res, 200, {
      ok: true,
      ключ: key,
      подсказка:
        'Сохраните ключ — он показан ОДИН раз. Подключение: X-Agent-Key к ' +
        'POST /mcp или /a2a. Отзыв: DELETE /api/agent/keys/' +
        prefix,
    })
  }

  if (method === 'GET') {
    const r = await pool.query(
      `SELECT key_prefix, label, created_at::text, revoked
       FROM agent_keys WHERE telegram_id = $1 ORDER BY created_at DESC`,
      [telegramId]
    )
    return json(res, 200, { ok: true, ключи: r.rows })
  }

  if (method === 'DELETE') {
    const prefix = (req.url || '').split('?')[0].split('/').pop() || ''
    const r = await pool.query(
      `UPDATE agent_keys SET revoked = TRUE
       WHERE telegram_id = $1 AND key_prefix = $2 AND revoked = FALSE
       RETURNING key_prefix`,
      [telegramId, prefix]
    )
    return json(res, 200, {
      ok: r.rows.length > 0,
      отозван: r.rows[0]?.key_prefix ?? null,
    })
  }

  return json(res, 405, { ok: false, error: 'метод не поддержан' })
}

/**
 * POST /api/crm/mirror — the bot puts a DM exchange into the memory AT ONCE.
 *
 * The business DM is served by the bot as the owner; the render never sees
 * the client's message or the answer as Telegram messages. The bot sends
 * both here with Telegram's own message ids, so the ingest that reads the
 * same dialog later keeps nothing twice, and Zep has the exchange before the
 * next question arrives.
 *
 * The identity comes verified from the dispatcher: the owner whose memory
 * this is. The body names the lead, an optional name, and the messages.
 */
export async function handleCrmMirror(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
) {
  const answer = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  let body: any = {}
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      if (chunks.reduce((n, c) => n + c.length, 0) > 256_000) break
    }
    body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
      : {}
  } catch {
    return answer(400, { error: 'body: JSON' })
  }
  const lead = String(body?.lead ?? '').trim()
  if (!/^\d{5,15}$/.test(lead)) {
    return answer(400, { error: 'lead: числовой telegram_id человека' })
  }
  if (lead === String(telegramId)) {
    return answer(400, { error: 'lead: это вы сами' })
  }
  const raw: unknown[] = Array.isArray(body?.messages) ? body.messages : []
  const when = (v: unknown): Date => {
    if (typeof v === 'string') {
      const t = Date.parse(v)
      return Number.isFinite(t) ? new Date(t) : new Date()
    }
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return new Date()
    return new Date(n > 1e12 ? n : n * 1000)
  }
  const msgs = raw
    .map((m: any) => ({
      msgId: Number(m?.msg_id),
      at: when(m?.at),
      out: Boolean(m?.out),
      text: String(m?.text ?? ''),
    }))
    .filter(m => Number.isFinite(m.msgId) && m.text.trim())
    .slice(0, 50)
  if (!msgs.length) {
    return answer(400, {
      error: 'messages: [{ msg_id, at, out, text }] — хотя бы одно с текстом',
    })
  }
  try {
    const { mirrorNow } = await import('./crm-mirror')
    const pool = await getPool()
    const r = await mirrorNow(
      pool,
      String(telegramId),
      lead,
      msgs,
      body?.name ? String(body.name).slice(0, 64) : null
    )
    return answer(200, { ok: true, ...r })
  } catch (e) {
    return answer(500, { error: String(e).slice(0, 200) })
  }
}
