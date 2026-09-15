/**
 * A2A (Agent2Agent) — вход для ВНЕШНИХ агентов по открытому протоколу.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ MCP. MCP (routes.ts) — это «дай мне список инструментов и
 * я сам их дёргаю». A2A — это «вот агент, пошли ему ЗАДАЧУ словами, он сам
 * решит, какие функции вызвать». Обоим внешний агент рад, но А2А — это то, на
 * что смотрят агентные платформы (agent card в /.well-known), и его просил
 * владелец. Мы отдаём и то, и другое поверх ОДНОГО движка (runAgent) и ОДНОГО
 * реестра инструментов (TOOLS_BY_NAME) — расхождения быть не может.
 *
 * СКВОЗНОЙ ДОСТУП КО ВСЕМ ФУНКЦИЯМ. Два пути в message/send:
 *   1. Естественный язык: текст задачи → runAgent (GLM со ВСЕМИ 32
 *      инструментами) сам планирует и выполняет. Это канон A2A.
 *   2. Прямой вызов: message.metadata = { skill: "feed_publish", args: {…} }
 *      → дёргаем инструмент напрямую, детерминированно, без модели. Так
 *      внешний агент получает КАЖДУЮ функцию «насквозь», без угадывания.
 *
 * Спецификация: JSON-RPC 2.0, методы message/send, message/stream (SSE),
 * tasks/get, tasks/cancel. Карточка — /.well-known/agent-card.json.
 */
import type { IncomingMessage, ServerResponse } from 'http'
import { randomUUID } from 'node:crypto'
import { TOOLS_BY_NAME, toMcpTools } from './tools'
import { runAgent, type ChatMessage } from './chat'
import { resolveIdentity, readBody } from './routes'

const PROTOCOL_VERSION = '0.3.0'

function json(res: ServerResponse, code: number, obj: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

/** Тег скилла по имени инструмента — чтобы внешний агент видел группы. */
function skillTag(name: string): string {
  if (name.startsWith('feed_')) return 'лента'
  if (name.startsWith('skills_')) return 'скиллы'
  if (name.startsWith('plan_')) return 'план'
  if (name.startsWith('soul_')) return 'голос-владельца'
  if (/^(image|audio|video|reel|render)/.test(name)) return 'производство'
  return 'разведка'
}

/**
 * Agent Card — паспорт агента для A2A. Публичен намеренно: внешний агент
 * первым делом читает /.well-known/agent-card.json, чтобы понять, кто это,
 * как аутентифицироваться и что умеет. Скиллы выводятся ИЗ реестра
 * инструментов — рукописный список неизбежно разошёлся бы с реализацией.
 */
export function a2aCard(baseUrl: string) {
  const skills = toMcpTools().map(t => ({
    id: t.name,
    name: t.name,
    description: t.description,
    tags: [skillTag(t.name)],
    inputModes: ['text/plain'],
    outputModes: ['application/json', 'text/plain'],
  }))
  // Общий скилл: свободная задача словами — агент сам подберёт инструменты.
  skills.unshift({
    id: 'do',
    name: 'Выполнить задачу словами',
    description:
      'Пошли задачу естественным языком — агент сам решит, какие функции ' +
      'вызвать (лента, производство, скиллы, план, голос владельца) и выполнит.',
    tags: ['агент'],
    inputModes: ['text/plain'],
    outputModes: ['text/plain', 'application/json'],
  })
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: 'Trinity S³AI — фабрика рилсов',
    description:
      'Агент социальной сети рилсов Trinity S³AI. Читает и меняет ленту, ' +
      'производит контент (картинки/озвучка/видео/рендер), ведёт скиллы, план ' +
      'и голос владельца. Пошли задачу словами ИЛИ вызови конкретный skill ' +
      'напрямую через metadata.',
    url: `${baseUrl}/a2a`,
    preferredTransport: 'JSONRPC',
    provider: { organization: 'Trinity S³AI', url: 'https://t27.ai' },
    version: '1.0.0',
    documentationUrl: `${baseUrl}/mcp`,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    securitySchemes: {
      agentKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Agent-Key',
        description:
          'Ключ агента, привязанный к telegram_id. Выпускается владельцем в ' +
          'мини-аппе (POST /api/agent/keys). Либо подпись Telegram initData.',
      },
    },
    security: [{ agentKey: [] }],
    skills,
  }
}

/** GET /.well-known/agent-card.json (и /.well-known/agent.json legacy). */
export function handleA2ACard(res: ServerResponse, baseUrl: string) {
  json(res, 200, a2aCard(baseUrl))
}

/** Текст из A2A-сообщения: собираем все text-части. */
function messageText(message: any): string {
  const parts = Array.isArray(message?.parts) ? message.parts : []
  return parts
    .filter((p: any) => p && (p.kind === 'text' || p.type === 'text'))
    .map((p: any) => String(p.text ?? ''))
    .join('\n')
    .trim()
}

/** Прогнать движок агента до конца, собрать финальный текст и результаты. */
async function runToResult(
  history: ChatMessage[],
  telegramId: string,
  pool: unknown
): Promise<{ text: string; data: unknown[]; обрыв?: string }> {
  let text = ''
  const data: unknown[] = []
  let обрыв: string | undefined
  for await (const ev of runAgent(history, { telegramId, pool } as any)) {
    if (ev.тип === 'текст') text += ev.текст
    else if (ev.тип === 'результат')
      data.push({ инструмент: ev.имя, значение: ev.значение })
    else if (ev.тип === 'ошибка') throw new Error(ev.текст)
    else if (ev.тип === 'готово') обрыв = ev.обрыв
  }
  return { text, data, обрыв }
}

/** Сборка A2A-Task (завершённой) с текстом и структурными артефактами. */
function completedTask(
  taskId: string,
  contextId: string,
  userMessage: any,
  text: string,
  data: unknown[]
) {
  const artifacts: any[] = []
  if (text) {
    artifacts.push({
      artifactId: randomUUID(),
      name: 'ответ',
      parts: [{ kind: 'text', text }],
    })
  }
  if (data.length) {
    artifacts.push({
      artifactId: randomUUID(),
      name: 'данные',
      parts: [{ kind: 'data', data: { результаты: data } }],
    })
  }
  const agentMessage = {
    role: 'agent',
    parts: [
      { kind: 'text', text: text || '(без текста — см. артефакт данных)' },
    ],
    messageId: randomUUID(),
    taskId,
    contextId,
    kind: 'message',
  }
  return {
    id: taskId,
    contextId,
    status: {
      state: 'completed',
      timestamp: new Date().toISOString(),
      message: agentMessage,
    },
    history: [userMessage, agentMessage].filter(Boolean),
    artifacts,
    kind: 'task',
  }
}

/**
 * Задачи держим в памяти процесса — синхронные (выполняются в message/send
 * целиком), так что tasks/get отдаёт уже завершённую. Хранилище нужно только
 * чтобы tasks/get по id не отвечал «не найдено» тому же клиенту в том же
 * процессе. Ёмкость ограничена: агент не должен течь по памяти.
 */
const TASKS = new Map<string, any>()
// Owner of each remembered task, tracked separately so it is never serialised
// into the task returned over the wire. tasks/get consults it: a caller may
// read only their own task. Kept in lock-step with TASKS on insert and eviction.
const TASK_OWNERS = new Map<string, string>()
function rememberTask(t: any, owner: string) {
  TASKS.set(t.id, t)
  TASK_OWNERS.set(t.id, owner)
  if (TASKS.size > 500) {
    const oldest = TASKS.keys().next().value as string
    TASKS.delete(oldest)
    TASK_OWNERS.delete(oldest)
  }
}

/** POST /a2a — JSON-RPC 2.0. */
export async function handleA2A(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => any
) {
  /*
   * FOUR IDENTITIES, AND THE FOURTH IS THE ONE THIS ROUTE ADVERTISES.
   *
   * This read `chatIdentity`, which knows the mini-app signature, an app
   * session and keys from the ENVIRONMENT. A key a person issues to
   * themselves lives in the database -- and the 401 below sends them to
   * exactly that door: "get a key in the mini app (POST /api/agent/keys)".
   * So the route told people how to connect and then refused the result.
   * The same shape as a message naming a command nobody registered.
   *
   * `resolveIdentity` is the door /mcp and /api/agent/chat already use: the
   * synchronous three first, then the server key with an explicitly named
   * telegram_id, then the issued key read from `agent_keys`. Strictly wider,
   * and the same answer everywhere -- two identity checks on one service
   * drift apart exactly as the two doors in public_templates once did.
   */
  const owner = await resolveIdentity(req, getPool)
  if (!owner) {
    return json(res, 401, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message:
          'Нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента ' +
          '(X-Agent-Key). Паспорт агента: GET /.well-known/agent-card.json.',
      },
    })
  }

  let rpc: any
  try {
    rpc = JSON.parse((await readBody(req)) || '{}')
  } catch {
    return json(res, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Тело не разобрано как JSON.' },
    })
  }
  const id = rpc.id ?? null
  const ok = (result: unknown) => json(res, 200, { jsonrpc: '2.0', id, result })
  const err = (code: number, message: string) =>
    json(res, 200, { jsonrpc: '2.0', id, error: { code, message } })

  const method = rpc.method
  const params = rpc.params || {}

  // ── message/send и message/stream ──────────────────────────────────────
  if (method === 'message/send' || method === 'message/stream') {
    const message = params.message
    if (!message) return err(-32602, 'params.message обязателен.')
    const contextId = message.contextId || randomUUID()
    const taskId = message.taskId || randomUUID()

    // Прямой вызов инструмента: детерминированный сквозной доступ.
    const skill: string | undefined = message.metadata?.skill
    const stream = method === 'message/stream'

    try {
      const pool = await getPool()

      if (skill) {
        const tool = TOOLS_BY_NAME.get(skill)
        if (!tool) {
          return err(
            -32602,
            `skill «${skill}» нет. Доступные — в agent-card.json (skills[].id).`
          )
        }
        const значение = await tool.handler(message.metadata?.args || {}, {
          telegramId: owner,
          pool,
        })
        const task = completedTask(
          taskId,
          contextId,
          message,
          typeof значение === 'string' ? значение : '',
          [{ инструмент: skill, значение }]
        )
        rememberTask(task, owner)
        return ok(task)
      }

      // Естественный язык → полный движок агента.
      const text = messageText(message)
      if (!text) return err(-32602, 'Пустое сообщение: нужен текст задачи.')
      const history: ChatMessage[] = [{ role: 'user', content: text }]

      if (stream) {
        // SSE-поток статусов и артефактов (A2A message/stream).
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        const send = (result: unknown) =>
          res.write(
            `data: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`
          )
        send({
          taskId,
          contextId,
          kind: 'status-update',
          status: { state: 'working', timestamp: new Date().toISOString() },
          final: false,
        })
        let acc = ''
        const data: unknown[] = []
        try {
          for await (const ev of runAgent(history, {
            telegramId: owner,
            pool,
          } as any)) {
            if (ev.тип === 'текст') {
              acc += ev.текст
              send({
                taskId,
                contextId,
                kind: 'artifact-update',
                artifact: {
                  artifactId: 'ответ',
                  name: 'ответ',
                  parts: [{ kind: 'text', text: ev.текст }],
                },
                append: true,
                lastChunk: false,
              })
            } else if (ev.тип === 'результат') {
              data.push({ инструмент: ev.имя, значение: ev.значение })
            } else if (ev.тип === 'ошибка') {
              throw new Error(ev.текст)
            }
          }
          const task = completedTask(taskId, contextId, message, acc, data)
          rememberTask(task, owner)
          send({
            taskId,
            contextId,
            kind: 'status-update',
            status: { state: 'completed', timestamp: new Date().toISOString() },
            final: true,
          })
        } catch (e) {
          send({
            taskId,
            contextId,
            kind: 'status-update',
            status: {
              state: 'failed',
              timestamp: new Date().toISOString(),
              message: {
                role: 'agent',
                parts: [{ kind: 'text', text: String(e).slice(0, 300) }],
                messageId: randomUUID(),
                kind: 'message',
              },
            },
            final: true,
          })
        }
        res.end()
        return
      }

      // Синхронный message/send.
      const { text: out, data } = await runToResult(history, owner, pool)
      const task = completedTask(taskId, contextId, message, out, data)
      rememberTask(task, owner)
      return ok(task)
    } catch (e) {
      return err(-32603, `Задача упала: ${String(e).slice(0, 300)}`)
    }
  }

  // ── tasks/get ───────────────────────────────────────────────────────────
  if (method === 'tasks/get') {
    const t = TASKS.get(params.id)
    // Owner check folded into the not-found answer on purpose: a caller must
    // not be able to tell "someone else's task exists" from "no such task".
    // taskId is client-chosen (message.taskId), so ids are guessable — before
    // this, any authenticated caller could read another's generation result by
    // its id. Same error for both cases leaks nothing.
    if (!t || TASK_OWNERS.get(params.id) !== owner) {
      return err(-32001, `Задачи «${params.id}» нет в памяти процесса.`)
    }
    return ok(t)
  }

  // ── tasks/cancel ─────────────────────────────────────────────────────────
  if (method === 'tasks/cancel') {
    // Задачи синхронные — к моменту ответа уже завершены, отменять нечего.
    return err(
      -32002,
      'Задача не отменяема: выполняется синхронно и уже завершена.'
    )
  }

  return err(
    -32601,
    `Метода «${method}» нет. Поддерживаются: message/send, message/stream, tasks/get, tasks/cancel.`
  )
}
