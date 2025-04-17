import { BotInfo } from '.'
import logger from '../../utils/logger'

/**
 * Результат валидации токена
 */
export interface TokenValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Проверяет валидность токена бота
 * @param token Токен для проверки
 * @param botId Идентификатор бота (для логирования)
 * @returns true если токен валидный, false если нет
 */
export function validateToken(token: string, botId = 'unknown'): boolean {
  // Проверяем что токен существует
  if (!token) {
    logger.error(
      `🔒 [Security] Попытка использования пустого токена для бота '${botId}'`
    )
    return false
  }

  // Проверяем формат: должен начинаться с цифр, затем ':' и затем буквы/цифры
  const botTokenPattern = /^\d+:[A-Za-z0-9_-]+$/

  if (!botTokenPattern.test(token)) {
    logger.error(
      `🔒 [Security] Неверный формат токена для бота '${botId}': ${maskToken(token)}`
    )
    return false
  }

  // Проверка длины (обычно не менее 40 символов)
  if (token.length < 40) {
    logger.warn(
      `🔒 [Security] Подозрительно короткий токен для бота '${botId}': ${maskToken(token)}`
    )
    return false
  }

  return true
}

/**
 * Маскирует токен для безопасного логирования
 * @param token Токен бота
 * @returns Маскированный токен
 */
export function maskToken(token: string): string {
  if (!token) return 'Токен отсутствует'

  if (token.length <= 10) {
    return '*'.repeat(token.length)
  }

  // Оставляем первые 5 и последние 5 символов видимыми
  const firstPart = token.slice(0, 5)
  const lastPart = token.slice(-5)
  const maskedPart = '*'.repeat(token.length - 10)

  return `${firstPart}${maskedPart}${lastPart}`
}

/**
 * Логирует событие безопасности
 * @param eventType Тип события
 * @param data Данные события
 * @param level Уровень логирования
 */
export function logSecurityEvent(
  eventType: string,
  data: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const logMessage = `Событие безопасности [${eventType}]: ${JSON.stringify(data)}`

  switch (level) {
    case 'warn':
      logger.warn(logMessage)
      break
    case 'error':
      logger.error(logMessage)
      break
    default:
      logger.info(logMessage)
  }
}

/**
 * Получает информацию о ботах из токенов
 * @param botTokens Массив токенов
 * @returns Массив информации о ботах
 */
export function getBotsInfo(botTokens: string[]): BotInfo[] {
  const botsInfo: BotInfo[] = []

  // Обрабатываем каждый токен
  botTokens.forEach((token, index) => {
    const id = `bot${index + 1}`
    if (validateToken(token, id)) {
      botsInfo.push({ id, token })
    } else {
      logger.error(`🔒 Бот '${id}' отключен из-за невалидного токена`)
    }
  })

  return botsInfo
}

/**
 * Список ботов и их токенов из переменных окружения
 */
export const BOT_NAMES: Record<string, string | undefined> = {
  ['neuro_blogger_bot']: process.env.BOT_TOKEN_1,
  ['MetaMuse_Manifest_bot']: process.env.BOT_TOKEN_2,
  ['ZavaraBot']: process.env.BOT_TOKEN_3,
  ['LeeSolarbot']: process.env.BOT_TOKEN_4,
  ['NeuroLenaAssistant_bot']: process.env.BOT_TOKEN_5,
  ['NeurostylistShtogrina_bot']: process.env.BOT_TOKEN_6,
  ['Gaia_Kamskaia_bot']: process.env.BOT_TOKEN_7,
  ['ai_koshey_bot']: process.env.BOT_TOKEN_TEST_1,
  ['clip_maker_neuro_bot']: process.env.BOT_TOKEN_TEST_2,
}

/**
 * Дефолтное имя бота
 */
export const DEFAULT_BOT_NAME = 'neuro_blogger_bot'

/**
 * Получает имя бота по токену
 * @param token Токен бота
 * @returns Объект с именем бота
 */
export function getBotNameByToken(token: string): { bot_name: string } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const entry = Object.entries(BOT_NAMES).find(([_, value]) => value === token)
  if (!entry) {
    return { bot_name: DEFAULT_BOT_NAME }
  }

  const [bot_name] = entry
  return { bot_name }
}

/**
 * Список токенов для продакшн версии ботов
 */
const BOT_TOKENS_PROD = [
  process.env.BOT_TOKEN_1,
  process.env.BOT_TOKEN_2,
  process.env.BOT_TOKEN_3,
  process.env.BOT_TOKEN_4,
  process.env.BOT_TOKEN_5,
  process.env.BOT_TOKEN_6,
  process.env.BOT_TOKEN_7,
].filter((token): token is string => typeof token === 'string')

/**
 * Список токенов для тестовой версии ботов
 */
const BOT_TOKENS_TEST = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
].filter((token): token is string => typeof token === 'string')

/**
 * Список токенов ботов в зависимости от окружения
 */
export const BOT_TOKENS =
  process.env.NODE_ENV === 'production' ? BOT_TOKENS_PROD : BOT_TOKENS_TEST
