import { MyContext } from '@/interfaces'

/**
 * Получение основной информации о пользователе из контекста
 * @param ctx Контекст сообщения Telegram
 * @returns Информация о пользователе (telegramId, chatId, username)
 */
export const getUserInfo = (ctx: MyContext) => {
  if (!ctx.from) {
    throw new Error('Cannot get user info: ctx.from is undefined')
  }

  const telegramId = ctx.from.id
  const chatId = ctx.chat?.id || telegramId
  const username = ctx.from.username || 'unknown'
  const firstName = ctx.from.first_name || ''
  const lastName = ctx.from.last_name || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || username

  return {
    telegramId,
    chatId,
    username,
    firstName,
    lastName,
    fullName,
  }
}
