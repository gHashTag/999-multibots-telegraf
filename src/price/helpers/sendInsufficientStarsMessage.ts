import { MyContext } from '@/interfaces'

export const sendInsufficientStarsMessage = async (
  ctx: MyContext,
  currentBalance: number,
  isRu: boolean
) => {
  const message = isRu
    ? `Недостаточно звезд для генерации изображения. Ваш баланс: ${currentBalance} звезд. Пополните баланс в главном меню.`
    : `Insufficient stars for image generation. Your balance: ${currentBalance} stars. Top up your balance in the main menu.`

  await ctx.telegram.sendMessage(ctx.from?.id?.toString() || '', message)
}
