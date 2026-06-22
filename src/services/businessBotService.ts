/**
 * Telegram Business Bot Service
 *
 * Handles Telegram Business connections and messages.
 * When an owner enables Business mode and links the bot, incoming messages
 * to the owner's personal account are forwarded here. The bot replies
 * via the business connection so the message appears FROM the owner.
 */

import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { chatWithAI, ChatMessage } from '@/services/aiChatService'

// --- Types (Telegraf 4.16.3 lacks native business event types) ---

export interface BusinessConnection {
  id: string
  user: { id: number; first_name: string; username?: string }
  user_chat_id: number
  date: number
  can_reply: boolean
  is_enabled: boolean
}

export interface BusinessMessage {
  message_id: number
  date: number
  chat: { id: number; first_name?: string; last_name?: string; username?: string; type: string }
  from?: { id: number; first_name: string; username?: string }
  text?: string
  business_connection_id: string
}

// --- State ---

interface ConnectionInfo {
  userId: number
  canReply: boolean
  connectedAt: number
}

const connections = new Map<string, ConnectionInfo>()

interface DailyStats {
  date: string
  messagesHandled: number
  uniqueUsers: Set<string>
}

let stats: DailyStats = { date: todayKey(), messagesHandled: 0, uniqueUsers: new Set() }

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function ensureToday(): void {
  const key = todayKey()
  if (stats.date !== key) {
    stats = { date: key, messagesHandled: 0, uniqueUsers: new Set() }
  }
}

// --- Sales system prompt ---

const SALES_PROMPT = `Ты — личный ассистент владельца AI-бота. Отвечаешь от его имени в личных сообщениях.
Твоя задача — помочь клиенту и предложить услуги бота.

Услуги:
- Генерация фото (NeuroPhoto, AI Photoshop, Face Swap)
- Генерация видео (Text-to-Video, Image-to-Video, AI Reels)
- Цифровое тело (Digital Avatar, LipSync)
- Голос и озвучка (Text-to-Speech, Voice Clone)
- AI Чат (GPT-4, Claude, DeepSeek)
- Музыка (AI Cover, Music Generation)

Тарифы:
- Free: 3 генерации/день бесплатно
- Basic: 299 руб/мес — 50 генераций
- Pro: 699 руб/мес — безлимит
- Studio: 1999 руб/мес — всё + API

Правила:
- Будь дружелюбным и кратким (2-4 предложения).
- Отвечай на языке клиента.
- Если спрашивают о функции — предложи попробовать в боте.
- Если не знаешь ответ — скажи что передашь вопрос владельцу.
- Не выдумывай цены и функции которых нет в списке.`

// --- Handlers ---

export function handleBusinessConnection(connection: BusinessConnection): void {
  if (connection.is_enabled) {
    connections.set(connection.id, {
      userId: connection.user.id,
      canReply: connection.can_reply,
      connectedAt: connection.date,
    })
    logger.info('[Business] Connection established', {
      connectionId: connection.id,
      userId: connection.user.id,
      canReply: connection.can_reply,
    })
  } else {
    connections.delete(connection.id)
    logger.info('[Business] Connection disabled', {
      connectionId: connection.id,
      userId: connection.user.id,
    })
  }
}

export async function handleBusinessMessage(
  msg: BusinessMessage,
  bot: Telegraf<any>,
  botUsername: string
): Promise<void> {
  const connId = msg.business_connection_id
  const conn = connections.get(connId)

  if (!conn || !conn.canReply) {
    logger.warn('[Business] No active connection or cannot reply', { connId })
    return
  }

  const text = msg.text
  if (!text) return // Ignore non-text messages (photos, stickers, etc.)

  const chatId = msg.chat.id
  const senderName = msg.from?.first_name || msg.chat.first_name || 'User'

  logger.info('[Business] Incoming message', {
    connId,
    chatId,
    senderName,
    textLength: text.length,
  })

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: SALES_PROMPT },
      {
        role: 'system',
        content: `Имя клиента: ${senderName}. Бот: @${botUsername}.`,
      },
      { role: 'user', content: text },
    ]

    const reply = await chatWithAI(messages, undefined, {
      telegramId: String(chatId),
      botName: `business_${botUsername}`,
    })

    await bot.telegram.sendMessage(chatId, reply, {
      business_connection_id: connId,
    } as any)

    ensureToday()
    stats.messagesHandled++
    stats.uniqueUsers.add(String(chatId))

    logger.info('[Business] Reply sent', { connId, chatId })
  } catch (error) {
    logger.error('[Business] Failed to reply', {
      error: error instanceof Error ? error.message : String(error),
      connId,
      chatId,
    })
  }
}

// --- Admin stats ---

export function getBusinessStats(): {
  activeConnections: number
  todayMessages: number
  todayUniqueUsers: number
  connections: Array<{ id: string; userId: number; canReply: boolean }>
} {
  ensureToday()
  return {
    activeConnections: connections.size,
    todayMessages: stats.messagesHandled,
    todayUniqueUsers: stats.uniqueUsers.size,
    connections: Array.from(connections.entries()).map(([id, info]) => ({
      id,
      userId: info.userId,
      canReply: info.canReply,
    })),
  }
}
