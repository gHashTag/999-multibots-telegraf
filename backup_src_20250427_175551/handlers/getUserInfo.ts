import type { MyContext } from '@/interfaces'

export function getUserInfo(ctx: MyContext): {
  userId: number
  telegramId: string
} {
  const isRu = ctx.from?.language_code === 'ru'
  const userId = ctx.from?.id
  const telegramId = ctx.from?.id?.toString()

  if (!userId) {
    ctx.reply(
      isRu
        ? '❌ Ошибка идентификации пользователя'
        : '❌ User identification error'
    )
    if (!ctx.from) {
      console.error('❌ Telegram ID не найден')
      return {
        userId: 0,
        telegramId: '',
      }
    }
    if (!telegramId) {
      console.error('❌ Telegram ID не найден')
      return {
        userId: 0,
        telegramId: '',
      }
    }
    ctx.scene.leave()
    return {
      userId: 0,
      telegramId: '',
    }
  }
  if (!telegramId) {
    console.error('❌ Telegram ID не найден')
    return {
      userId: 0,
      telegramId: '',
    }
  }
  return {
    userId,
    telegramId,
  }
}
