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
import type { IncomingMessage, ServerResponse } from 'http'
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto'
import { TOOLS_BY_NAME, toMcpTools } from './tools'
import { runAgent, type ChatMessage } from './chat'
import { resolveProvider } from './provider'
import { verifiedTelegramId } from '../../auth'

/**
 * Сравнение ключей за КОНСТАНТНОЕ время.
 *
 * Обычное `a === b` завершается на первом несовпавшем символе, и по времени
 * ответа можно подбирать ключ префикс за префиксом. initData и X-Api-Key в
 * auth.ts уже сравниваются через timingSafeEqual — ключ агента отставал.
 *
 * timingSafeEqual требует равной длины буферов, а ключи бывают разной длины;
 * поэтому сравниваем не сами строки, а их SHA-256 (всегда 32 байта). Это
 * заодно не даёт утечь длине ключа через длину буфера.
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
/** SHA-256 hex ключа — то, что храним в БД вместо самого ключа. */
function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Владелец по ключу: сначала статические ключи из ENV, затем выданные
 * пользователями через самообслуживание (таблица agent_keys).
 *
 * ЗАЧЕМ САМООБСЛУЖИВАНИЕ. «Подключи ЛЮБОГО агента» — наш ров против Postiz и
 * HeyGen. Но пока ключ выдавался только правкой ENV руками владельцем, это был
 * не self-service, а заявка. Теперь пользователь мини-аппа выпускает ключ сам
 * (POST /api/agent/keys), и его внешний агент подключается к MCP от его имени.
 *
 * В БД лежит ТОЛЬКО SHA-256 ключа — как пароль. Сам ключ показывается один раз
 * при выдаче и больше нигде не хранится.
 */
export function agentKeyOwner(key: string): string | null {
  if (!key) return null
  // Статические ключи из ENV (серверные, автопилот). Остаётся синхронной:
  // её зовут из десятка мест render-server, и превращение в Promise молча
  // сломало бы их (Promise всегда truthy в `if (who)`).
  const raw = process.env.AGENT_KEYS || ''
  let owner: string | null = null
  for (const pair of raw.split(',')) {
    const [k, id] = pair.split(':').map(s => s.trim())
    // Проходим ВСЕ ключи, а не выходим на первом совпадении: ранний return
    // выдал бы по числу итераций, какой ключ совпал. Сравнение постоянного
    // времени.
    if (k && id && sameKey(k, key)) owner = id
  }
  return owner
}

/**
 * Владелец по ВЫДАННОМУ ключу (таблица agent_keys). Отдельно и async, потому
 * что синхронный agentKeyOwner зовут из десятка мест, а DB-запрос там ни к
 * чему. Зовётся только на входах агента (MCP/чат) как второй шаг, если ENV
 * ключ не совпал. Поиск по SHA-256 — точное сравнение в БД, ключ не хранится.
 */
export async function agentKeyOwnerDb(
  key: string,
  pool: { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }
): Promise<string | null> {
  if (!key) return null
  try {
    const r = await pool.query(
      `SELECT telegram_id FROM agent_keys
       WHERE key_hash = $1 AND revoked = FALSE LIMIT 1`,
      [keyHash(key)]
    )
    return r.rows[0]?.telegram_id ?? null
  } catch {
    return null
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let b = ''
    req.on('data', (c: Buffer) => {
      b += c.toString()
    })
    req.on('end', () => resolve(b))
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
export async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => any
) {
  // Личность ДВЕ: ключ агента (внешний клиент, привязан к человеку) ИЛИ
  // подпись initData (сам мини-апп). Раньше был только ключ — и профиль
  // внутри Telegram не мог вызвать собственные инструменты человека,
  // хотя подпись доказывает то же самое и не слабее.
  const owner = await resolveIdentity(
    req,
    verifiedTelegramId(req),
    await getPool()
  )
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
    return ok({ tools: toMcpTools() })
  }

  if (rpc.method === 'tools/call') {
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
      const значение = await tool.handler(rpc.params?.arguments || {}, {
        telegramId: owner,
        pool,
      })
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
  const key = (req.headers['x-agent-key'] as string | undefined) || ''
  return key ? agentKeyOwner(key) : null
}

/**
 * Личность С УЧЁТОМ выданных ключей (async, ходит в БД). Синхронный
 * chatIdentity зовут из десятка мест render-server, где DB-запрос не нужен;
 * DB-ключи важны только на ВНЕШНЕМ входе агента (/mcp). Поэтому резолвинг
 * выданных ключей — отдельный шаг: сначала env/подпись, затем таблица.
 */
export async function resolveIdentity(
  req: IncomingMessage,
  verified: string | null,
  pool: { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }
): Promise<string | null> {
  const sync = chatIdentity(req, verified)
  if (sync) return sync
  const key = (req.headers['x-agent-key'] as string | undefined) || ''
  return key ? await agentKeyOwnerDb(key, pool) : null
}

/**
 * Выпуск/список/отзыв ключей агента. Личность — из ПОДПИСИ мини-аппа: ключ
 * привязывается к тому, кто его выпустил, чужой telegram_id подставить нельзя.
 *
 * POST   /api/agent/keys        {label?}  → выпускает ключ, показывает ОДИН раз
 * GET    /api/agent/keys                  → список своих (префикс+метка, не ключ)
 * DELETE /api/agent/keys/:prefix          → отзывает по префиксу
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
    // Ключ = tri_ + 40 hex. Криптостойкая случайность, не Math.random.
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
        'Сохраните ключ — он показан ОДИН раз. Подключение: ' +
        'X-Agent-Key к POST /mcp. Отзыв: DELETE /api/agent/keys/' +
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
    // /api/agent/keys/<prefix>
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

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    // Без этого nginx и прокси Railway копят ответ целиком, и поток
    // превращается в один пакет в конце — то есть в отсутствие потока.
    'X-Accel-Buffering': 'no',
  })

  try {
    const pool = await getPool()
    for await (const ev of runAgent(history, { telegramId, pool })) {
      res.write(JSON.stringify(ev) + '\n')
    }
  } catch (e) {
    res.write(
      JSON.stringify({ тип: 'ошибка', текст: String(e).slice(0, 500) }) + '\n'
    )
  }
  res.end()
}
