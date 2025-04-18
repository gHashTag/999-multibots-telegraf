import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { botLogger } from './logger'

/**
 * Удаляет все вебхуки для бота с обработкой ошибок.
 * @param bot Экземпляр бота Telegraf
 * @returns Promise<boolean> Успешно ли выполнено удаление
 */
export async function removeWebhooks(
  bot: Telegraf<MyContext>
): Promise<boolean> {
  try {
    await bot.telegram.deleteWebhook()
    console.log('Old webhook deleted')
    return true
  } catch (error) {
    const botName = bot.botInfo?.username || 'unknown'
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Логируем ошибку в правильном формате
    botLogger.error(botName, `Ошибка при удалении вебхука: ${errorMessage}`)

    console.error('Error deleting webhook:', errorMessage)
    // Не прерываем выполнение программы при ошибке удаления вебхука
    return false
  }
}

export default removeWebhooks
