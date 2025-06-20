import { logger } from '@/utils/logger'

// Маппинг имен ботов на переменные окружения с их токенами
const botNameToTokenEnvMap: Record<string, string> = {
  neuro_blogger_bot: 'BOT_TOKEN_1',
  MetaMuse_Manifest_bot: 'BOT_TOKEN_2',
  ZavaraBot: 'BOT_TOKEN_3',
  LeeSolarbot: 'BOT_TOKEN_4',
  NeuroLenaAssistant_bot: 'BOT_TOKEN_5',
  NeurostylistShtogrina_bot: 'BOT_TOKEN_6',
  Gaia_Kamskaia_bot: 'BOT_TOKEN_7',
  Kaya_easy_art_bot: 'BOT_TOKEN_8',
  AI_STARS_bot: 'BOT_TOKEN_9',
  ai_koshey_bot: 'BOT_TOKEN_TEST_1', // Тестовый бот 1
  clip_maker_neuro_bot: 'BOT_TOKEN_TEST_2', // Тестовый бот 2
  // Добавьте других ботов по мере необходимости
}

/**
 * Возвращает токен бота из переменных окружения по его имени.
 * @param botName Имя пользователя бота (например, 'neuro_blogger_bot').
 * @returns Токен бота или undefined, если имя не найдено или токен отсутствует.
 */
export function getBotTokenByName(botName: string): string | undefined {
  const envVarName = botNameToTokenEnvMap[botName]
  if (!envVarName) {
    logger.warn(
      `[getBotTokenByName] No environment variable mapped for bot name: ${botName}`
    )
    return undefined
  }

  const token = process.env[envVarName]
  if (!token) {
    logger.warn(
      `[getBotTokenByName] Token not found in environment variable: ${envVarName} for bot: ${botName}`
    )
    return undefined
  }

  return token
}
