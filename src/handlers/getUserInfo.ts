import { MyContext } from '@/interfaces'

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
    ctx.scene.leave()
    return {
      userId,
      telegramId,
    }
  }

  return {
    userId,
    telegramId,
  }
}
