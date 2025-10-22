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
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Проверяем, является ли это ошибкой "chat not found"
    if (errorMessage.includes('chat not found')) {
      console.warn('⚠️ Chat not found - user may have blocked bot or deleted chat:', {
        chatId: ctx.from?.id,
        balance: currentBalance,
        note: 'This is not critical - main functionality continues'
      })
    } else {
      console.error('❌ Error sending insufficient stars message:', {
        error: errorMessage,
        chatId: ctx.from?.id,
        balance: currentBalance
      })
    }
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}
