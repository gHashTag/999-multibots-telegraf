/**
 * Blocked users check utilities
 */

import { MyContext } from '@/interfaces'

export async function safeSendMessage(ctx: MyContext, message: string): Promise<void> {
  try {
    await ctx.reply(message)
  } catch (error) {
    console.error('Failed to send message:', error)
    // Заглушка для безопасной отправки сообщений
  }
}

export async function markUserAsBlocked(telegramId: string): Promise<void> {
  console.log(`Marking user ${telegramId} as blocked`)
  // Заглушка для маркировки пользователя как заблокированного
}