import { MyContext } from '@/interfaces'

export const sendInsufficientStarsMessage = async (
  ctx: MyContext,
  currentBalance: number,
  isRu: boolean
) => {
  try {
    const chatId = ctx.from?.id?.toString()
    if (!chatId) {
      console.error('Chat ID not found for insufficient stars message')
      return
    }

    const message = isRu
      ? `Недостаточно звезд для генерации изображения. Ваш баланс: ${currentBalance} звезд. Пополните баланс в главном меню.`
      : `Insufficient stars for image generation. Your balance: ${currentBalance} stars. Top up your balance in the main menu.`

    await ctx.telegram.sendMessage(chatId, message)
  } catch (error) {
    console.error('❌ Error sending insufficient stars message:', {
      error: error instanceof Error ? error.message : String(error),
      chatId: ctx.from?.id,
      balance: currentBalance
    })
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}
