/**
 * Конфигурация для вывода Telegram Stars
 *
 * Все 11 ботов проекта с их токенами из переменных окружения
 */

export interface BotConfig {
  username: string
  tokenEnvVar: string
  description: string
}

// Все боты проекта (из src/core/getBotTokenByName.ts)
export const BOTS: BotConfig[] = [
  {
    username: 'neuro_blogger_bot',
    tokenEnvVar: 'BOT_TOKEN_1',
    description: 'Основной бот NeuroBlogger',
  },
  {
    username: 'MetaMuse_Manifest_bot',
    tokenEnvVar: 'BOT_TOKEN_2',
    description: 'MetaMuse Manifest',
  },
  {
    username: 'ZavaraBot',
    tokenEnvVar: 'BOT_TOKEN_3',
    description: 'Zavara Bot',
  },
  {
    username: 'LeeSolarbot',
    tokenEnvVar: 'BOT_TOKEN_4',
    description: 'Lee Solar Bot',
  },
  {
    username: 'NeuroLenaAssistant_bot',
    tokenEnvVar: 'BOT_TOKEN_5',
    description: 'NeuroLena Assistant',
  },
  {
    username: 'NeurostylistShtogrina_bot',
    tokenEnvVar: 'BOT_TOKEN_6',
    description: 'Neurostylist Shtogrina',
  },
  {
    username: 'Gaia_Kamskaia_bot',
    tokenEnvVar: 'BOT_TOKEN_7',
    description: 'Gaia Kamskaia',
  },
  {
    username: 'Kaya_easy_art_bot',
    tokenEnvVar: 'BOT_TOKEN_8',
    description: 'Kaya Easy Art',
  },
  {
    username: 'AI_STARS_bot',
    tokenEnvVar: 'BOT_TOKEN_9',
    description: 'AI Stars Bot',
  },
  {
    username: 'ai_koshey_bot',
    tokenEnvVar: 'BOT_TOKEN_TEST_1',
    description: 'AI Koshey (тестовый)',
  },
  {
    username: 'clip_maker_neuro_bot',
    tokenEnvVar: 'BOT_TOKEN_TEST_2',
    description: 'Clip Maker Neuro (тестовый)',
  },
]

// MTProto конфигурация (из переменных окружения)
// Поддерживаются оба варианта: TG_* и TELEGRAM_*
export const MTPROTO_CONFIG = {
  api_id: Number(process.env.TG_API_ID || process.env.TELEGRAM_API_ID),
  api_hash: process.env.TG_API_HASH || process.env.TELEGRAM_API_HASH || '',
  phone: process.env.TG_PHONE || process.env.TELEGRAM_PHONE || '',
  password: process.env.TG_2FA_PASSWORD || '',
  // Готовая session string (если есть)
  sessionString: process.env.TELEGRAM_SESSION_STRING || '',
}

// TON кошелек для вывода
export const TON_WALLET = process.env.TON_WALLET_ADDRESS || ''

// Минимальное количество Stars для вывода
export const MIN_WITHDRAWAL_AMOUNT = 1000

// Задержка между выводами (мс) для предотвращения rate limit
export const WITHDRAWAL_DELAY_MS = 5000
