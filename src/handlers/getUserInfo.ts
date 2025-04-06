import { MyContext } from '@/interfaces'

export function getUserInfo(ctx: MyContext): {
  telegramId: string
} {
  const telegramId = ctx.from?.id?.toString()
  if (!telegramId) {
    throw new Error('Telegram ID is not defined')
  }
  return {
    telegramId,
  }
}
