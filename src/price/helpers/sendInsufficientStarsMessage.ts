import { type MyContext } from '@/interfaces'

export const sendInsufficientStarsMessage = async (
  ctx: MyContext,
  currentBalance: number,
  isRu: boolean
) => {
  const message = isRu
    ? `Недостаточно звезд для генерации изображения. Ваш баланс: ${currentBalance} звезд. Пополните баланс вызвав команду /buy.`
    : `Insufficient stars for image generation. Your balance: ${currentBalance} stars. Top up your balance by calling the /buy command.`

  await ctx.telegram.sendMessage(ctx.from?.id?.toString() || '', message)
}
