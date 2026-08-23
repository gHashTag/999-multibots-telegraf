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
import { TOOLS_BY_NAME, toMcpTools } from './tools'
import { runAgent, type ChatMessage } from './chat'
import { resolveProvider } from './provider'

/**
 * Ключи внешних агентов: AGENT_KEYS="ключ1:telegramId,ключ2:telegramId".
 *
 * Ключ ПРИВЯЗАН к человеку. Без привязки инструмент не знает, чью ленту
 * читать и от чьего имени публиковать, а «telegram_id в аргументах» означал
 * бы, что любой желающий публикует от чужого имени.
 */
export function agentKeyOwner(key: string): string | null {
  const raw = process.env.AGENT_KEYS || ''
  for (const pair of raw.split(',')) {
    const [k, id] = pair.split(':').map(s => s.trim())
    if (k && id && k === key) return id
  }
  return null
}

function readBody(req: IncomingMessage): Promise<string> {
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
      'платные генерации (изображение, видео, озвучка, липсинк): списания ' +
        'баланса в сервисе пока нет, и открывать бесплатный доступ к платным ' +
        'провайдерам нельзя',
      'публикация от чужого имени: telegram_id берётся из ключа, а не из аргументов',
      'удаление записей ленты',
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
  const key = (req.headers['x-agent-key'] as string | undefined) || ''
  const owner = key ? agentKeyOwner(key) : null
  if (!owner) {
    return json(res, 401, {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: key
          ? 'Ключ не распознан. Проверьте X-Agent-Key или попросите новый у владельца.'
          : 'Нужен заголовок X-Agent-Key. Карточка подключения: GET этот же адрес.',
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
