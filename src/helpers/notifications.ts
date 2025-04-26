import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { type MyContext } from '@/interfaces'

/**
 * Отправляет пользователю уведомление об успешном пополнении баланса.
 * @param bot Инстанс Telegraf бота
 * @param telegramId ID пользователя Telegram
 * @param stars Количество зачисленных звезд
 * @param languageCode Языковой код пользователя (для локализации)
 */
export const sendPaymentSuccessMessage = async (
  bot: Telegraf<MyContext>,
  telegramId: string | number,
  stars: number,
  languageCode = 'ru'
): Promise<any> => {
  const isRu = languageCode.toLowerCase().startsWith('ru')
  const message = isRu
    ? `✅ Ваш баланс успешно пополнен на ${stars} ⭐️!`
    : `✅ Your balance has been successfully topped up with ${stars} ⭐️!`

  try {
    const result = await bot.telegram.sendMessage(telegramId, message)
    logger.info(
      `[sendPaymentSuccessMessage] Success notification sent to ${telegramId}`,
      { telegramId, stars }
    )
    return result
  } catch (error: any) {
    logger.error(
      `[sendPaymentSuccessMessage] Failed to send notification to ${telegramId}`,
      {
        telegramId,
        stars,
        error: error instanceof Error ? error.message : String(error),
      }
    )
    throw error
  }
}
