/**
 * Вспомогательные функции для работы с ботами Telegram
 */

// Импортируем необходимые типы из Telegraf
import { Telegraf, Context } from 'telegraf'

/**
 * Объект для хранения ботов
 */
const bots: Record<string, Telegraf<Context>> = {}

/**
 * Регистрирует бота в системе
 * @param botName Имя бота
 * @param bot Экземпляр бота
 */
export const registerBot = (botName: string, bot: Telegraf<Context>) => {
  bots[botName] = bot
  console.log(`Бот ${botName} зарегистрирован`)
}

/**
 * Получает бота по имени
 * @param botName Имя бота
 * @returns Экземпляр бота или undefined, если бот не найден
 */
export const getBot = (botName: string): Telegraf<Context> | undefined => {
  return bots[botName]
}

/**
 * Получает бота по имени с дополнительными метаданными
 * @param botName Имя бота
 * @returns Объект с ботом и его метаданными или null, если бот не найден
 */
export const getBotByName = (botName: string) => {
  try {
    const bot = getBot(botName)

    if (!bot) {
      console.error(`Бот с именем ${botName} не найден`)
      return null
    }

    return {
      bot,
      botName,
    }
  } catch (error) {
    console.error(`Ошибка при получении бота ${botName}:`, error)
    return null
  }
}
