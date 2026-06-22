/**
 * AI Chat Service
 *
 * Simple chat completion service using OpenAI-compatible API.
 * Supports multiple models via OpenAI SDK (works with OpenRouter too).
 */

import OpenAI from 'openai'
import { logger } from '@/utils/logger'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const AI_CHAT_MODELS: Record<string, { id: string; label_ru: string; label_en: string }> = {
  gpt4: { id: 'gpt-4.1', label_ru: 'GPT-4.1', label_en: 'GPT-4.1' },
  claude: { id: 'claude-sonnet-4-20250514', label_ru: 'Claude Sonnet', label_en: 'Claude Sonnet' },
  deepseek: { id: 'deepseek-chat', label_ru: 'DeepSeek', label_en: 'DeepSeek' },
}

const MAX_CONTEXT_MESSAGES = 20

/**
 * Trim conversation history to fit context window
 */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages
  // Keep system message (first) + last N messages
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  const recent = messages.slice(-(MAX_CONTEXT_MESSAGES - system.length))
  return [...system, ...recent]
}

/**
 * Send messages to AI and get a response
 */
export async function chatWithAI(
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('No API key found (OPENROUTER_API_KEY or OPENAI_API_KEY)')
  }

  const baseURL = process.env.OPENROUTER_API_KEY
    ? 'https://openrouter.ai/api/v1'
    : undefined

  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })

  const trimmed = trimHistory(messages)
  const modelId = model || AI_CHAT_MODELS.gpt4.id

  logger.info('AI Chat request', { model: modelId, messageCount: trimmed.length })

  const response = await client.chat.completions.create({
    model: modelId,
    messages: trimmed,
    max_tokens: 2048,
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Empty response from AI')
  }

  return content
}
