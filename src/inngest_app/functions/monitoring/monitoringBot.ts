import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { telegramClientOptions } from '@/services/telegramApi'

/**
 * Бот, от имени которого уходят уведомления мониторинга.
 *
 * Раньше в criticalErrorMonitor.ts и logMonitor.ts был захардкожен токен —
 * он удалён. Токен берётся только из окружения, двумя способами:
 *
 *  1. MONITORING_BOT_TOKEN — уже принятая в проекте переменная для
 *     мониторинга (см. src/utils/production-monitor.ts). Если она задана,
 *     уведомления уходят ровно от того бота, что и раньше.
 *  2. Иначе — тот же токен, что берёт pulseBot: BOT_TOKEN_1 в проде,
 *     BOT_TOKEN_TEST_1 в разработке.
 *
 * ПОЧЕМУ ТОКЕН ЧИТАЕТСЯ ИЗ ОКРУЖЕНИЯ, А НЕ БЕРЁТСЯ ЧЕРЕЗ getPulseBot().
 * Первая версия этого файла импортировала '@/core/bot'. Тот тянет за собой
 * весь граф бота вместе с регистрацией сцен, а в нём есть давно сломанный
 * импорт: src/scenes/imageUpscalerWizard/index.ts:105 падает с «Handler is
 * undefined» ещё на загрузке модуля.
 * Измерено одной и той же командой: на main тест
 * monitoring-test-functions.test.ts даёт 5 падений на уровне тестов (модуль
 * грузится), с импортом '@/core/bot' — падение на СБОРЕ, «Tests: no tests»,
 * то есть ни один тест даже не запускается.
 * Модулю для отправки уведомления нужна ровно строка токена. Тянуть ради неё
 * половину приложения — цена, которую платит каждый, кто импортирует этот
 * файл, включая тесты.
 *
 * Если ни одного токена нет — бросаем исключение с внятным текстом.
 * Молча вернуть бота с пустым токеном нельзя: Telegram ответит
 * невнятной 401 где-то в глубине шага Inngest.
 *
 * ⚠️ Смена отправителя: до этой правки уведомления слал бот с зашитым
 * токеном, которого нет ни в одной переменной BOT_TOKEN_*.
 * Чтобы отправитель не поменялся, заведите MONITORING_BOT_TOKEN до деплоя.
 * Сам зашитый токен утёк в git-историю и подлежит отзыву у @BotFather.
 */
export function getMonitoringBot(): Telegraf<MyContext> {
  const dedicatedToken = process.env.MONITORING_BOT_TOKEN

  if (dedicatedToken) {
    return new Telegraf<MyContext>(dedicatedToken, {
      telegram: telegramClientOptions(),
    })
  }

  // Тот же выбор переменной, что делает src/core/bot для pulseBot.
  const isProd = process.env.NODE_ENV === 'production'
  const fallbackName = isProd ? 'BOT_TOKEN_1' : 'BOT_TOKEN_TEST_1'
  const fallbackToken = process.env[fallbackName]

  if (fallbackToken) {
    logger.warn(
      `⚠️ MONITORING_BOT_TOKEN не задан — уведомления мониторинга уходят от ${fallbackName}`,
      {
        description:
          'Monitoring notifications fall back to the pulse bot token',
        fallbackName,
      }
    )
    return new Telegraf<MyContext>(fallbackToken, {
      telegram: telegramClientOptions(),
    })
  }

  const message =
    'Не найден токен бота для уведомлений мониторинга. ' +
    `Задайте MONITORING_BOT_TOKEN (или ${fallbackName}) ` +
    'в Infisical/Railway: railway variables --kv | grep BOT_TOKEN'

  logger.error(`❌ ${message}`, {
    description: 'Monitoring bot token is not configured',
    hasMonitoringBotToken: false,
    fallbackName,
    hasFallbackToken: false,
  })

  throw new Error(message)
}
