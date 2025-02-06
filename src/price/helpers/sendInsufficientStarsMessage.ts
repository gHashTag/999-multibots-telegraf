import bot from '@/core/bot'

export const sendInsufficientStarsMessage = async (
  telegram_id: number,
  currentBalance: number,
  isRu: boolean
) => {
  const message = isRu
    ? `Недостаточно звезд для генерации изображения. Ваш баланс: ${currentBalance} звезд. Пополните баланс вызвав команду /buy.`
    : `Insufficient stars for image generation. Your balance: ${currentBalance} stars. Top up your balance by calling the /buy command.`

  await bot.telegram.sendMessage(telegram_id, message)
}
