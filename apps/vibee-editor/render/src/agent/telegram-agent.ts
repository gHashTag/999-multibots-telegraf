import { runAgent, type AgentEvent } from './chat'
import {
  appendConversationMessage,
  findConversationMessage,
  loadConversationHistory,
  replaceConversationMessageMetadata,
  withConversationOwnerLock,
  type AppendConversationMessage,
  type ConversationMessage,
  type ConversationPool,
} from './conversation'

export interface TelegramTextTurn {
  updateId: number
  messageId: number
  telegramId: string
  chatId: number
  messageThreadId?: number
  text: string
  externalId: string
  replyExternalId: string
}

type AgentRunner = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ctx: { telegramId: string; pool: ConversationPool }
) => AsyncGenerator<AgentEvent>

interface TelegramAgentDeps {
  pool: ConversationPool
  botToken: string
  appendMessage?: typeof appendConversationMessage
  findMessage?: typeof findConversationMessage
  loadHistory?: typeof loadConversationHistory
  replaceMetadata?: typeof replaceConversationMessageMetadata
  withOwnerLock?: typeof withConversationOwnerLock
  runAgent?: AgentRunner
  fetchFn?: typeof fetch
  now?: () => number
}

export type TelegramAgentResult = 'ignored' | 'duplicate' | 'handled'

/** `/start` explains the text-first UX without invoking or charging the model. */
export async function sendTelegramAgentWelcome(
  update: any,
  deps: Pick<TelegramAgentDeps, 'botToken' | 'fetchFn'>
): Promise<boolean> {
  const message = update?.message
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  const fromId = Number(message?.from?.id)
  const chatId = Number(message?.chat?.id)
  if (
    !/^\/(start|help)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text) ||
    message?.chat?.type !== 'private' ||
    message?.from?.is_bot === true ||
    !Number.isSafeInteger(fromId) ||
    !Number.isSafeInteger(chatId) ||
    fromId <= 0 ||
    chatId !== fromId ||
    !deps.botToken
  ) {
    return false
  }
  await botApi(
    deps.botToken,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        'Я агент Trinity S³AI. Просто напишите задачу обычным сообщением: ' +
        'я вижу тот же профиль и ту же историю, что и Mini App. ' +
        'Во время работы ответ будет появляться в реальном времени.',
    },
    deps.fetchFn ?? fetch
  )
  return true
}

export async function acceptTelegramAgentTextUpdate(
  update: unknown,
  deps: Pick<TelegramAgentDeps, 'pool' | 'appendMessage'>
): Promise<
  | { result: 'ignored'; turn: null }
  | { result: 'duplicate'; turn: TelegramTextTurn }
  | { result: 'accepted'; turn: TelegramTextTurn }
> {
  const turn = parseTelegramAgentTextUpdate(update)
  if (!turn) return { result: 'ignored', turn: null }
  const append = deps.appendMessage ?? appendConversationMessage
  const user = await append(deps.pool, {
    telegramId: turn.telegramId,
    channel: 'telegram',
    externalId: turn.externalId,
    role: 'user',
    content: turn.text,
  })
  if (!user.inserted) return { result: 'duplicate', turn }
  return { result: 'accepted', turn }
}

export function parseTelegramAgentTextUpdate(
  update: any
): TelegramTextTurn | null {
  const message = update?.message
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  const updateId = Number(update?.update_id)
  const messageId = Number(message?.message_id)
  const fromId = Number(message?.from?.id)
  const chatId = Number(message?.chat?.id)
  if (
    !text ||
    text.startsWith('/') ||
    message?.chat?.type !== 'private' ||
    message?.from?.is_bot === true ||
    !Number.isSafeInteger(updateId) ||
    !Number.isSafeInteger(messageId) ||
    !Number.isSafeInteger(fromId) ||
    !Number.isSafeInteger(chatId) ||
    fromId <= 0 ||
    chatId !== fromId
  ) {
    return null
  }
  const thread = Number(message?.message_thread_id)
  const messageThreadId =
    Number.isSafeInteger(thread) && thread > 0 ? thread : undefined
  return {
    updateId,
    messageId,
    telegramId: String(fromId),
    chatId,
    messageThreadId,
    text: text.slice(0, 8_000),
    externalId: `telegram:${updateId}:${messageId}`,
    replyExternalId: `telegram-reply:${updateId}:${messageId}`,
  }
}

function previewText(text: string, tool: string | null): string {
  const suffix = tool ? `\n\n⚙️ ${tool}…` : ''
  const joined = (text || '') + suffix
  return joined.slice(-4_096)
}

function splitTelegramText(text: string): string[] {
  const chunks: string[] = []
  let rest = text
  while (rest.length > 4_096) {
    const window = rest.slice(0, 4_096)
    const newline = window.lastIndexOf('\n')
    const cut = newline >= 2_048 ? newline : 4_096
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n/, '')
  }
  if (rest) chunks.push(rest)
  return chunks.length
    ? chunks
    : ['Агент не сформулировал ответ. Попробуйте уточнить запрос.']
}

async function botApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<number | null> {
  const response = await fetchFn(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok) throw new Error(`Telegram ${method} failed`)
  const parsed = (await response.json().catch(() => null)) as {
    ok?: boolean
    result?: { message_id?: unknown }
  } | null
  if (!parsed?.ok) throw new Error(`Telegram ${method} rejected`)
  const messageId = Number(parsed.result?.message_id)
  return Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null
}

const INTERRUPTED_REPLY =
  'Предыдущий запуск агента прервался, поэтому я не повторяю его автоматически. ' +
  'Отправьте задачу новым сообщением, если хотите запустить её ещё раз.'

function deliveryProgress(message: ConversationMessage, chunks: string[]) {
  const next = Number(message.metadata.next_chunk)
  return {
    nextChunk:
      Number.isSafeInteger(next) && next >= 0
        ? Math.min(next, chunks.length)
        : 0,
    messageIds: Array.isArray(message.metadata.telegram_message_ids)
      ? message.metadata.telegram_message_ids.filter(
          (id): id is number =>
            typeof id === 'number' && Number.isSafeInteger(id) && id > 0
        )
      : [],
  }
}

async function deliverTelegramReply(
  turn: TelegramTextTurn,
  message: ConversationMessage,
  deps: TelegramAgentDeps
): Promise<void> {
  const replaceMetadata =
    deps.replaceMetadata ?? replaceConversationMessageMetadata
  const fetchFn = deps.fetchFn ?? fetch
  const chunks = splitTelegramText(message.content)
  const progress = deliveryProgress(message, chunks)
  const common = {
    chat_id: turn.chatId,
    ...(turn.messageThreadId
      ? { message_thread_id: turn.messageThreadId }
      : {}),
  }
  if (progress.nextChunk === chunks.length) {
    await replaceMetadata(
      deps.pool,
      turn.telegramId,
      'telegram',
      turn.replyExternalId,
      {
        ...message.metadata,
        delivery: 'sent',
        next_chunk: chunks.length,
        total_chunks: chunks.length,
        telegram_message_ids: progress.messageIds,
      }
    )
    return
  }
  for (let index = progress.nextChunk; index < chunks.length; index += 1) {
    const messageId = await botApi(
      deps.botToken,
      'sendMessage',
      { ...common, text: chunks[index] },
      fetchFn
    )
    if (messageId) progress.messageIds[index] = messageId
    // Telegram sendMessage and PostgreSQL cannot share an atomic transaction.
    // Persist after every chunk: a hard crash in this narrow window is
    // explicitly at-least-once for at most the just-sent chunk, never the
    // complete answer.
    await replaceMetadata(
      deps.pool,
      turn.telegramId,
      'telegram',
      turn.replyExternalId,
      {
        ...message.metadata,
        delivery: index + 1 === chunks.length ? 'sent' : 'pending',
        next_chunk: index + 1,
        total_chunks: chunks.length,
        telegram_message_ids: progress.messageIds,
      }
    )
  }
}

export async function runAcceptedTelegramAgentTurn(
  turn: TelegramTextTurn,
  deps: TelegramAgentDeps
): Promise<'handled' | 'duplicate'> {
  if (!deps.botToken)
    throw new Error('Telegram agent bot token is not configured')
  const append = deps.appendMessage ?? appendConversationMessage
  const find = deps.findMessage ?? findConversationMessage
  const load = deps.loadHistory ?? loadConversationHistory
  const runner = deps.runAgent ?? (runAgent as AgentRunner)
  const fetchFn = deps.fetchFn ?? fetch
  const now = deps.now ?? Date.now
  const existingReply = await find(
    deps.pool,
    turn.telegramId,
    'telegram',
    turn.replyExternalId
  )

  if (existingReply) {
    if (existingReply.metadata.delivery === 'sent') return 'duplicate'
    await deliverTelegramReply(turn, existingReply, deps)
    return 'handled'
  }

  const history = await load(deps.pool, turn.telegramId, 40)
  if (!history.some(message => message.externalId === turn.externalId)) {
    return 'duplicate'
  }
  const modelHistory = history.map(message => ({
    role: message.role,
    content: message.content,
  }))
  const common = {
    chat_id: turn.chatId,
    ...(turn.messageThreadId
      ? { message_thread_id: turn.messageThreadId }
      : {}),
  }
  const draftId = Math.abs(turn.messageId % 2_147_483_647) || 1
  let draftAvailable = true
  try {
    await botApi(
      deps.botToken,
      'sendMessageDraft',
      { ...common, draft_id: draftId, text: 'Думаю…' },
      fetchFn
    )
  } catch {
    draftAvailable = false
    await botApi(
      deps.botToken,
      'sendChatAction',
      { ...common, action: 'typing' },
      fetchFn
    ).catch(() => undefined)
  }

  let answer = ''
  let activeTool: string | null = null
  const tools = new Set<string>()
  let lastDraftAt = now()
  const flushDraft = async (force = false) => {
    if (!draftAvailable) return
    const current = now()
    if (!force && current - lastDraftAt < 1_000) return
    lastDraftAt = current
    await botApi(
      deps.botToken,
      'sendMessageDraft',
      {
        ...common,
        draft_id: draftId,
        text: previewText(answer, activeTool),
      },
      fetchFn
    ).catch(() => {
      draftAvailable = false
    })
  }

  for await (const event of runner(modelHistory, {
    telegramId: turn.telegramId,
    pool: deps.pool,
  })) {
    if (!event || typeof event !== 'object') continue
    if (event['тип'] === 'текст') {
      answer += String(event['текст'] || '')
      activeTool = null
      await flushDraft()
    } else if (event['тип'] === 'инструмент') {
      activeTool = String(event['имя'] || '').slice(0, 80) || null
      if (activeTool) tools.add(activeTool)
      await flushDraft()
    } else if (event['тип'] === 'результат') {
      activeTool = null
      await flushDraft()
    } else if (event['тип'] === 'ошибка' && !answer.trim()) {
      answer = 'Не получилось выполнить запрос. Попробуйте ещё раз чуть позже.'
    } else if (event['тип'] === 'готово' && event['обрыв']) {
      answer += '\n\n⚠️ Агент остановился на лимите шагов. Уточните задачу.'
    }
  }

  answer =
    answer.trim() || 'Агент не сформулировал ответ. Попробуйте уточнить запрос.'
  await flushDraft(true)
  await append(deps.pool, {
    telegramId: turn.telegramId,
    channel: 'telegram',
    externalId: turn.replyExternalId,
    role: 'assistant',
    content: answer,
    metadata: {
      tools: [...tools],
      delivery: 'pending',
      next_chunk: 0,
      total_chunks: splitTelegramText(answer).length,
      telegram_message_ids: [],
    },
  } satisfies AppendConversationMessage)
  const storedReply = await find(
    deps.pool,
    turn.telegramId,
    'telegram',
    turn.replyExternalId
  )
  if (!storedReply) throw new Error('Telegram reply persistence failed')
  await deliverTelegramReply(turn, storedReply, deps)
  return 'handled'
}

async function recoverInterruptedTelegramTurn(
  turn: TelegramTextTurn,
  deps: TelegramAgentDeps
): Promise<'handled' | 'duplicate'> {
  const find = deps.findMessage ?? findConversationMessage
  const append = deps.appendMessage ?? appendConversationMessage
  let reply = await find(
    deps.pool,
    turn.telegramId,
    'telegram',
    turn.replyExternalId
  )
  if (!reply) {
    await append(deps.pool, {
      telegramId: turn.telegramId,
      channel: 'telegram',
      externalId: turn.replyExternalId,
      role: 'assistant',
      content: INTERRUPTED_REPLY,
      metadata: {
        tools: [],
        delivery: 'pending',
        next_chunk: 0,
        total_chunks: 1,
        telegram_message_ids: [],
        interrupted: true,
      },
    })
    reply = await find(
      deps.pool,
      turn.telegramId,
      'telegram',
      turn.replyExternalId
    )
  }
  if (!reply) throw new Error('Telegram recovery persistence failed')
  if (reply.metadata.delivery === 'sent') return 'duplicate'
  await deliverTelegramReply(turn, reply, deps)
  return 'handled'
}

export async function processTelegramAgentTextUpdate(
  update: unknown,
  deps: TelegramAgentDeps
): Promise<TelegramAgentResult> {
  if (!deps.botToken) return 'ignored'
  const turn = parseTelegramAgentTextUpdate(update)
  if (!turn) return 'ignored'
  const lock = deps.withOwnerLock ?? withConversationOwnerLock
  return lock(deps.pool, turn.telegramId, async lockedPool => {
    const lockedDeps = { ...deps, pool: lockedPool }
    const accepted = await acceptTelegramAgentTextUpdate(update, lockedDeps)
    if (accepted.result === 'ignored') return 'ignored'
    if (accepted.result === 'duplicate') {
      // A retry may arrive after an effectful tool ran but before the answer
      // was stored. Never replay an unknown model/tool run automatically.
      return recoverInterruptedTelegramTurn(accepted.turn, lockedDeps)
    }
    return runAcceptedTelegramAgentTurn(accepted.turn, lockedDeps)
  })
}
