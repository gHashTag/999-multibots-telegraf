import { isRussian } from '@/helpers/language'
import { getStarsWord } from '@/utils/getStarsWord'

export async function sendInsufficientStarsMessage(
  ctx: any,
  balance: number,
  requiredStars: number
) {
  const isRu = isRussian(ctx)
  const message = isRu
    ? `⚠️ Недостаточно звезд на балансе. Необходимо: ${requiredStars} ${getStarsWord(requiredStars, isRu)}. Текущий баланс: ${balance} ${getStarsWord(balance, isRu)}`
    : `⚠️ Insufficient stars balance. Required: ${requiredStars} ${getStarsWord(requiredStars, isRu)}. Current balance: ${balance} ${getStarsWord(balance, isRu)}`

  await ctx.reply(message)
}
