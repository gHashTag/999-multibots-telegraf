/**
 * AI Chat Service
 *
 * Chat completion service using OpenAI-compatible API with persistent memory.
 * Supports multiple models via OpenAI SDK (works with OpenRouter too).
 */

import OpenAI from 'openai'
import { logger } from '@/utils/logger'
import { saveMessage, loadHistory, getUserContext } from '@/services/chatMemoryService'
import { listSkills } from '@/services/skillManager'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const AI_CHAT_MODELS: Record<string, { id: string; label_ru: string; label_en: string }> = {
  gpt4: { id: 'gpt-4.1-mini', label_ru: 'GPT-4.1 Mini', label_en: 'GPT-4.1 Mini' },
  claude: { id: 'claude-sonnet-4-20250514', label_ru: 'Claude Sonnet', label_en: 'Claude Sonnet' },
  deepseek: { id: 'deepseek-chat', label_ru: 'DeepSeek', label_en: 'DeepSeek' },
}

/** Readable model label for display in responses. */
export function getModelLabel(modelId: string): string {
  const entry = Object.values(AI_CHAT_MODELS).find(m => m.id === modelId)
  return entry ? entry.label_en : modelId
}

const MAX_CONTEXT_MESSAGES = 20

/**
 * Trim conversation history to fit context window
 */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages
  // Keep system messages + last N user/assistant messages
  const system = messages.filter(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')
  const recent = nonSystem.slice(-(MAX_CONTEXT_MESSAGES - system.length))
  return [...system, ...recent]
}

/** Build skill suggestions if user message mentions generation topics. */
async function getSkillHints(userText: string): Promise<string> {
  const patterns: Record<string, string> = {
    'photo|фото|image|картинк': 'neuro_photo',
    'video|видео': 'neuro_video',
    'voice|голос|tts|озвуч': 'text_to_speech',
    'lipsync|lip.?sync|губ': 'lip_sync',
    'music|музык': 'music',
  }
  const matched = Object.entries(patterns)
    .filter(([p]) => new RegExp(p, 'i').test(userText))
    .map(([, svc]) => svc)
  if (matched.length === 0) return ''

  const skills = await listSkills(matched[0])
  if (skills.length === 0) return ''
  const top = skills.slice(0, 3).map(s => s.name).join(', ')
  return `\nAvailable platform skills for this topic: ${top}. Mention them if relevant.`
}

/**
 * Send messages to AI with persistent memory and skill awareness.
 */
export async function chatWithAI(
  messages: ChatMessage[],
  model?: string,
  opts?: { telegramId?: string; botName?: string }
): Promise<string> {
  // Priority: DeepSeek (cheapest) → OpenAI → OpenRouter
  const providers = [
    { key: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1', name: 'deepseek' },
    { key: process.env.OPENAI_API_KEY, url: undefined, name: 'openai' },
    { key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1', name: 'openrouter' },
  ]
  const provider = providers.find(p => p.key)
  if (!provider) throw new Error('No AI API key found')

  const apiKey = provider.key!
  const baseURL = provider.url

  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })

  const defaultModel = provider.name === 'deepseek' ? 'deepseek-chat' : AI_CHAT_MODELS.gpt4.id
  const modelId = model || defaultModel
  const tid = opts?.telegramId ?? ''
  const bot = opts?.botName ?? 'default'

  // --- Persistent memory: load DB history and user context ---
  let dbMessages: ChatMessage[] = []
  let contextAddition = ''
  if (tid) {
    const [history, userCtx] = await Promise.all([
      loadHistory(tid, bot),
      getUserContext(tid, bot),
    ])
    dbMessages = history.map(h => ({ role: h.role, content: h.content }))
    contextAddition = userCtx

    // Find latest user message to check for skill suggestions
    const lastUser = messages.filter(m => m.role === 'user').pop()
    if (lastUser) {
      const hints = await getSkillHints(lastUser.content)
      if (hints) contextAddition += hints
    }
  }

  // Build final message array: system prompts, DB history, then current turn
  const systemMsgs = messages.filter(m => m.role === 'system')
  if (contextAddition) {
    systemMsgs.push({ role: 'system', content: contextAddition })
  }
  const currentTurn = messages.filter(m => m.role !== 'system')
  const allMessages = [...systemMsgs, ...dbMessages, ...currentTurn]
  const trimmed = trimHistory(allMessages)

  logger.info('AI Chat request', { model: modelId, messageCount: trimmed.length, hasMem: dbMessages.length > 0 })

  const response = await client.chat.completions.create({
    model: modelId,
    messages: trimmed,
    max_tokens: 2048,
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Empty response from AI')
  }

  // --- Persist both user and assistant messages ---
  if (tid) {
    const lastUser = currentTurn.filter(m => m.role === 'user').pop()
    if (lastUser) {
      await saveMessage(tid, bot, 'user', lastUser.content, modelId)
    }
    await saveMessage(tid, bot, 'assistant', content, modelId)
  }

  return content
}
