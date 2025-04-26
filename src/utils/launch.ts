import { Telegraf } from 'telegraf'
import { type MyContext } from '@/interfaces'
import { logger } from './logger'

/**
 * Запускает бота в режиме разработки (polling)
 * @param bot Экземпляр бота
 */
export async function development(bot: Telegraf<MyContext>) {
  try {
    // Удаляем вебхук перед запуском в режиме polling
    await bot.telegram.deleteWebhook()
    await bot.launch()
    logger.info('✅ Бот запущен в режиме разработки:', {
      description: 'Bot launched in development mode',
      bot_name: bot.botInfo?.username,
    })
  } catch (error) {
    logger.error('❌ Ошибка запуска бота в режиме разработки:', {
      description: 'Development launch error',
      bot_name: bot.botInfo?.username,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// Функция production и заглушка launch удалены, так как
// запуск в production режиме обрабатывается через
// bot.launch({ webhook: ... }) в src/bot.ts
