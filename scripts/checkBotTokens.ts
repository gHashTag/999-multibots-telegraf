import dotenv from 'dotenv'
import { Telegraf } from 'telegraf'
import { logger } from '../src/utils/logger' // Используем существующий логгер

// Загружаем переменные окружения из корневого .env файла
dotenv.config({ path: require('path').resolve(__dirname, '../.env') })

/**
 * Проверяет валидность одного токена Telegram.
 * @param token Токен для проверки
 * @param name Имя переменной окружения (для логов)
 * @returns true, если токен валиден, иначе false
 */
async function checkToken(token: string, name: string): Promise<boolean> {
  if (!token) {
    logger.warn(`🟡 Токен ${name} не установлен или пуст.`)
    return false
  }
  const bot = new Telegraf(token)
  try {
    // Используем простой запрос getMe для проверки токена
    const botInfo = await bot.telegram.getMe()
    logger.info(`✅ Токен ${name} (Бот: @${botInfo.username}) ВАЛИДЕН.`)
    return true
  } catch (error: any) {
    // Явно проверяем ошибку 401 Unauthorized
    if (error.response && error.response.error_code === 401) {
      logger.error(`❌ Токен ${name} НЕВАЛИДЕН (401 Unauthorized).`)
    } else {
      // Логируем другие возможные ошибки (сеть, таймауты и т.д.)
      logger.error(`❓ Токен ${name} вернул неожиданную ошибку:`, {
        message: error.message || String(error),
        code: error.code,
        response: error.response,
      })
    }
    return false
  }
}

/**
 * Основная функция для проверки всех токенов ботов.
 */
async function checkAllBotTokens() {
  logger.info('========================================')
  logger.info('🔍 Запуск проверки токенов Telegram ботов...')
  logger.info('========================================')

  const botTokensToCheck: { name: string; token: string }[] = []

  // Ищем все переменные BOT_TOKEN_, исключая тестовые
  for (const key in process.env) {
    // Интересуют только токены для production
    if (key.startsWith('BOT_TOKEN_') && !key.startsWith('BOT_TOKEN_TEST_')) {
      const tokenValue = process.env[key]
      if (tokenValue) {
        botTokensToCheck.push({ name: key, token: tokenValue })
      } else {
        logger.warn(`🟡 Переменная ${key} определена, но не имеет значения.`)
      }
    }
  }

  if (botTokensToCheck.length === 0) {
    logger.warn(
      'Не найдены переменные BOT_TOKEN_... для проверки в .env файле.'
    )
    return
  }

  logger.info(`Найдено ${botTokensToCheck.length} токенов для проверки.`)

  let invalidCount = 0
  // Проверяем каждый токен последовательно с небольшой задержкой
  for (const { name, token } of botTokensToCheck) {
    const isValid = await checkToken(token, name)
    if (!isValid) {
      invalidCount++
    }
    // Небольшая пауза между запросами к Telegram API
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  logger.info('========================================')
  if (invalidCount > 0) {
    logger.error(
      `🏁 Проверка завершена. Найдено НЕВАЛИДНЫХ токенов: ${invalidCount}`
    )
  } else {
    logger.info(
      `🏁 Проверка завершена. Все ${botTokensToCheck.length} токенов ВАЛИДНЫ.`
    )
  }
  logger.info('========================================')
}

// Запускаем проверку
checkAllBotTokens()
