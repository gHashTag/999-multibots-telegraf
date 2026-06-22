/**
 * Chat Memory Service — persistent conversation history in Supabase.
 * Table: chat_memory (telegram_id, bot_name, role, content, model, created_at).
 * All queries handle missing table gracefully.
 */
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

export interface ChatMemory {
  telegram_id: string
  bot_name: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model: string
  created_at: string
}

/** Insert a single message into chat_memory. */
export async function saveMessage(
  telegram_id: string, bot_name: string,
  role: ChatMemory['role'], content: string, model: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('chat_memory').insert({
      telegram_id, bot_name, role, content, model,
    })
    if (error) throw error
  } catch (err) {
    logger.debug('[ChatMemory] saveMessage failed (table may not exist)', { error: String(err) })
  }
}

/** Load the last N messages for a user+bot pair, ordered oldest-first. */
export async function loadHistory(
  telegram_id: string, bot_name: string, limit = 20
): Promise<ChatMemory[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_memory')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('bot_name', bot_name)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((data as ChatMemory[]) ?? []).reverse()
  } catch {
    return []
  }
}

/** Delete all messages for a user+bot pair. */
export async function clearHistory(
  telegram_id: string, bot_name: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('chat_memory')
      .delete()
      .eq('telegram_id', telegram_id)
      .eq('bot_name', bot_name)
    if (error) throw error
  } catch (err) {
    logger.debug('[ChatMemory] clearHistory failed', { error: String(err) })
  }
}

/** Build a concise user-profile summary from the last 50 messages. */
export async function getUserContext(
  telegram_id: string, bot_name: string
): Promise<string> {
  try {
    const msgs = await loadHistory(telegram_id, bot_name, 50)
    if (msgs.length === 0) return ''

    const userMsgs = msgs.filter(m => m.role === 'user').map(m => m.content)
    if (userMsgs.length === 0) return ''

    const hasRussian = userMsgs.some(t => /[а-яё]/i.test(t))
    const topics = new Set<string>()
    const keywords: Record<string, string> = {
      'video|видео': 'video generation', 'photo|фото|image': 'photo generation',
      'music|музык': 'music', 'voice|голос': 'voice/TTS',
      'avatar|аватар': 'avatars', 'lipsync|lip': 'lip-sync',
      'code|код': 'coding', 'text|текст|write|пиши': 'text/writing',
    }
    for (const [pattern, topic] of Object.entries(keywords)) {
      if (userMsgs.some(t => new RegExp(pattern, 'i').test(t))) topics.add(topic)
    }

    const parts = [
      `Conversation history: ${msgs.length} messages.`,
      hasRussian ? 'User prefers Russian.' : 'User prefers English.',
      topics.size > 0 ? `Frequent topics: ${[...topics].join(', ')}.` : '',
    ].filter(Boolean)

    return parts.join(' ')
  } catch {
    return ''
  }
}
