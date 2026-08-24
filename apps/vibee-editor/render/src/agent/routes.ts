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
import { executeSafeAgentTool } from './access'
import { decideAgentToolAccess } from '../../../packages/vibee-atoms/src/agent-policy'
import { runAgent, type ChatMessage } from './chat'
import { resolveProvider } from './provider'
import { verifiedTelegramId } from '../../auth'

/**
 * Codex key authentication is release-blocked until a reviewed server-side
 * store exists with hash-only lookup, revocation and immutable owner binding.
 * Plaintext/static AGENT_KEYS is never an identity source in SAFE BETA.
 */
export const CODEX_AGENT_KEY_STATUS = 'release-blocked' as const

/** @deprecated Kept only so old imports fail closed instead of authenticating. */
export function agentKeyOwner(_key: string): null {
  return null
}

/**
 * The only active SAFE BETA identity is fresh Telegram initData already
 * verified against the configured auth bot. X-Agent-Key is intentionally
 * ignored: no trustworthy hash/revocation schema exists in this release.
 */
export function resolveAgentIdentity(
  _req: IncomingMessage,
  verifiedTelegramOwner: string | null
): string | null {
  return verifiedTelegramOwner || null
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
  } catch {
    провайдер = 'не настроен'
  }
  return {
    сервис: 'Trinity S³AI — фабрика рилсов',
    протокол: 'MCP поверх JSON-RPC 2.0',
    как_подключиться: {
      шаг1: 'Используйте свежий подписанный Telegram initData от @t27ai_bot.',
      шаг2: 'Codex X-Agent-Key path release-blocked: hash-only revocable owner store ещё не реализован.',
      шаг3: 'Начните с {"jsonrpc":"2.0","id":1,"method":"tools/list"}.',
    },
    codex_key_path: {
      статус: CODEX_AGENT_KEY_STATUS,
      причина: 'нет hash-only lookup, revocation и owner binding',
    },
    методы: ['initialize', 'tools/list', 'tools/call'],
    инструментов: toMcpTools().length,
    модель: провайдер,
    видно_размышление: размышление,
    чего_сервис_НЕ_умеет: [
      'платные операции и публикация недоступны в SAFE BETA',
      'выдача ключей, доступов, approvals и квот недоступна в SAFE BETA',
    ],
    safe_beta: [
      'whoami: прочитать свою подтверждённую личность',
      'feed_stats: прочитать только свою статистику',
      'content_plan_prepare: сохранить только приватный draft',
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
  // Identity resolves before body parsing and before pool/handler dispatch.
  const owner = resolveAgentIdentity(req, verifiedTelegramId(req))
  if (!owner) {
    // Сообщение константно и не отражает содержимое заголовков: любое
    // эхо чужого ввода — путь к инъекции, даже в JSON.
    return json(res, 401, {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message:
          'Нужна свежая подпись Telegram initData от @t27ai_bot. Codex key path release-blocked.',
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
        'SAFE BETA: доступны только whoami, feed_stats и content_plan_prepare. ' +
        'Платные операции, публикация, доступы, approvals и квоты недоступны.',
    })
  }

  if (rpc.method === 'tools/list') {
    return ok({ tools: toMcpTools() })
  }

  if (rpc.method === 'tools/call') {
    const имя = rpc.params?.name
    const tool = имя ? TOOLS_BY_NAME.get(имя) : null
    const decision = decideAgentToolAccess(tool)
    if (!decision.allowed) {
      return err(
        -32003,
        'SAFE_BETA_TOOL_DENIED: доступны только whoami, feed_stats, content_plan_prepare.'
      )
    }
    try {
      const pool = await getPool()
      const execution = await executeSafeAgentTool(
        имя,
        rpc.params?.arguments || {},
        { telegramId: owner, pool },
        name => TOOLS_BY_NAME.get(name)
      )
      if (!execution.ok) return err(-32003, execution.error)
      const значение = execution.value
      return ok({
        content: [{ type: 'text', text: JSON.stringify(значение, null, 1) }],
        structuredContent: значение,
      })
    } catch {
      return err(
        -32603,
        'SAFE_BETA_TOOL_FAILED: инструмент не выполнен; детали скрыты.'
      )
    }
  }

  return err(
    -32601,
    'Метод не поддерживается. Доступны: initialize, tools/list, tools/call.'
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
 * Compatibility wrapper used by existing server routes. It accepts only the
 * already verified Telegram owner; X-Agent-Key always fails closed.
 */
export function chatIdentity(
  req: IncomingMessage,
  verified: string | null
): string | null {
  return resolveAgentIdentity(req, verified)
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
  } catch {
    res.write(
      JSON.stringify({
        тип: 'ошибка',
        код: 'SAFE_BETA_CHAT_FAILED',
        текст: 'Чат временно недоступен; детали ошибки скрыты.',
      }) + '\n'
    )
  }
  res.end()
}
