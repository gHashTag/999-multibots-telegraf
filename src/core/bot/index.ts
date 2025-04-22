import dotenv from 'dotenv'

dotenv.config()

import { NODE_ENV } from '@/config'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

import { getBotGroupFromAvatars } from '@/core/supabase'

// Определяем типы для имен ботов
type BotName =
  | 'neuro_blogger_bot'
  | 'MetaMuse_Manifest_bot'
  | 'ZavaraBot'
  | 'LeeSolarbot'
  | 'NeuroLenaAssistant_bot'
  | 'NeurostylistShtogrina_bot'
  | 'Gaia_Kamskaia_bot'
  | 'ai_koshey_bot'
  | 'clip_maker_neuro_bot'

// Проверяем наличие токенов
if (!process.env.BOT_TOKEN_1) throw new Error('BOT_TOKEN_1 is not set')
if (!process.env.BOT_TOKEN_2) throw new Error('BOT_TOKEN_2 is not set')
if (!process.env.BOT_TOKEN_3) throw new Error('BOT_TOKEN_3 is not set')
if (!process.env.BOT_TOKEN_4) throw new Error('BOT_TOKEN_4 is not set')
if (!process.env.BOT_TOKEN_5) throw new Error('BOT_TOKEN_5 is not set')
if (!process.env.BOT_TOKEN_6) throw new Error('BOT_TOKEN_6 is not set')
if (!process.env.BOT_TOKEN_7) throw new Error('BOT_TOKEN_7 is not set')

if (!process.env.BOT_TOKEN_TEST_1)
  throw new Error('BOT_TOKEN_TEST_1 is not set')
if (!process.env.BOT_TOKEN_TEST_2)
  throw new Error('BOT_TOKEN_TEST_2 is not set')

const BOT_TOKENS_PROD: string[] = [
  process.env.BOT_TOKEN_1,
  process.env.BOT_TOKEN_2,
  process.env.BOT_TOKEN_3,
  process.env.BOT_TOKEN_4,
  process.env.BOT_TOKEN_5,
  process.env.BOT_TOKEN_6,
  process.env.BOT_TOKEN_7,
]

const BOT_TOKENS_TEST: string[] = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
]

export const BOT_NAMES: Record<BotName, string> = {
  ['neuro_blogger_bot']: process.env.BOT_TOKEN_1,
  ['MetaMuse_Manifest_bot']: process.env.BOT_TOKEN_2,
  ['ZavaraBot']: process.env.BOT_TOKEN_3,
  ['LeeSolarbot']: process.env.BOT_TOKEN_4,
  ['NeuroLenaAssistant_bot']: process.env.BOT_TOKEN_5,
  ['NeurostylistShtogrina_bot']: process.env.BOT_TOKEN_6,
  ['Gaia_Kamskaia_bot']: process.env.BOT_TOKEN_7,
  ['ai_koshey_bot']: process.env.BOT_TOKEN_TEST_1,
  ['clip_maker_neuro_bot']: process.env.BOT_TOKEN_TEST_2,
} as const

// Tutorial URLs
export const BOT_URLS: Partial<Record<BotName, string>> = {
  MetaMuse_Manifest_bot: 'https://t.me/MetaMuse_manifestation/16',
  neuro_blogger_bot: 'https://t.me/neuro_coder_ai/1212',
  ai_koshey_bot: 'https://t.me/neuro_coder_ai/1212',
}

export const BOT_TOKENS =
  NODE_ENV === 'production' ? BOT_TOKENS_PROD : BOT_TOKENS_TEST

export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1

export const DEFAULT_BOT_NAME = 'neuro_blogger_bot'
export const defaultBot = new Telegraf<MyContext>(DEFAULT_BOT_TOKEN)

logger.info('🤖 Инициализация defaultBot:', {
  description: 'DefaultBot initialization',
  tokenLength: DEFAULT_BOT_TOKEN.length,
})

// Инициализируем ботов при старте приложения
export const bots = Object.entries(BOT_NAMES)
  .filter(([, token]) => token) // Фильтруем undefined токены
  .filter(([name, token]) => {
    // В development режиме используем только тестовых ботов
    if (NODE_ENV === 'development') {
      return BOT_TOKENS_TEST.includes(token)
    }
    // В production режиме используем только продакшен ботов
    return BOT_TOKENS_PROD.includes(token)
  })
  .map(([name, token]) => {
    // Если это defaultBot, используем существующий экземпляр
    if (name === DEFAULT_BOT_NAME) {
      logger.info('🤖 Использование существующего defaultBot:', {
        description: 'Using existing defaultBot',
        bot_name: name,
      })
      return defaultBot
    }

    const bot = new Telegraf<MyContext>(token)

    logger.info('🤖 Инициализация бота:', {
      description: 'Bot initialization',
      bot_name: name,
      tokenLength: token.length,
    })

    return bot
  })

logger.info('🌟 Инициализировано ботов:', {
  description: 'Bots initialized',
  count: bots.length,
  bot_names: Object.keys(BOT_NAMES),
})

export const PULSE_BOT_TOKEN = process.env.BOT_TOKEN_1
export const pulseBot = new Telegraf<MyContext>(PULSE_BOT_TOKEN)

logger.info('🤖 Инициализация pulseBot:', {
  description: 'PulseBot initialization',
  tokenLength: PULSE_BOT_TOKEN.length,
})

export function getBotNameByToken(token: string): { bot_name: BotName } {
  const entry = Object.entries(BOT_NAMES).find(([_, value]) => value === token)
  if (!entry) {
    return { bot_name: 'neuro_blogger_bot' }
  }

  const [bot_name] = entry
  return { bot_name: bot_name as BotName }
}

export function getTokenByBotName(botName: BotName): string | undefined {
  const entry = Object.entries(BOT_NAMES).find(([name, _]) => name === botName)
  if (!entry) {
    logger.warn(`Bot name ${botName} not found.`)
    return undefined
  }

  const [, token] = entry
  return token
}

export async function createBotByName(botName: BotName): Promise<
  | {
      token: string
      groupId: string
      bot: Telegraf<MyContext>
    }
  | undefined
> {
  const token = getTokenByBotName(botName)
  if (!token) {
    logger.error('❌ Токен для бота не найден:', {
      description: 'Token not found for bot',
      botName,
    })
    return undefined
  }

  const groupIdResult = await getBotGroupFromAvatars(botName)
  if (!groupIdResult) {
    logger.error('❌ Группа для бота не найдена:', {
      description: 'Group not found for bot',
      botName,
    })
    return undefined
  }

  const botIndex = Object.keys(BOT_NAMES).indexOf(botName)
  const bot = bots[botIndex]

  if (!bot) {
    logger.error('❌ Экземпляр бота не найден:', {
      description: 'Bot instance not found',
      botName,
      botIndex,
      availableBots: Object.keys(BOT_NAMES),
    })
    return undefined
  }

  return {
    token,
    groupId: groupIdResult,
    bot,
  }
}

export function getBotByName(bot_name: BotName): {
  bot?: Telegraf<MyContext>
  error?: string | null
} {
  logger.info({
    message: '🔎 getBotByName запрошен для',
    description: 'getBotByName requested for',
    bot_name,
  })

  const token = BOT_NAMES[bot_name]
  if (!token) {
    logger.error({
      message: '❌ Токен бота не найден в конфигурации',
      description: 'Bot token not found in configuration',
      bot_name,
      availableBots: Object.keys(BOT_NAMES),
    })
    return { error: 'Bot not found in configuration' }
  }

  logger.info({
    message: '🔑 Токен бота получен из конфигурации',
    description: 'Bot token retrieved from configuration',
    bot_name,
    tokenLength: token.length,
  })

  const botIndex = Object.keys(BOT_NAMES).indexOf(bot_name)
  let bot = bots[botIndex]

  if (!bot || !bot.telegram?.sendMessage) {
    logger.info({
      message: '🔄 Создание нового экземпляра бота',
      description: 'Creating new bot instance',
      bot_name,
    })
    bot = new Telegraf<MyContext>(token)
    if (!bot.telegram?.sendMessage) {
      logger.error({
        message: '❌ Ошибка инициализации бота',
        description: 'Bot initialization error',
        bot_name,
        hasTelegram: !!bot.telegram,
        methods: bot.telegram ? Object.keys(bot.telegram) : [],
      })
      return { error: 'Bot initialization failed' }
    }
    bots[botIndex] = bot
  }

  logger.info({
    message: '✅ Бот успешно получен',
    description: 'Bot successfully retrieved',
    bot_name,
    hasSendMessage: typeof bot.telegram?.sendMessage === 'function',
  })

  return { bot }
}

export const supportRequest = async (title: string, data: any) => {
  try {
    await pulseBot.telegram.sendMessage(
      process.env.SUPPORT_CHAT_ID!,
      `🚀 ${title}\n\n${JSON.stringify(data)}`
    )
  } catch (error) {
    throw new Error(`Error supportRequest: ${JSON.stringify(error)}`)
  }
}

const groupId = process.env.GROUP_ID || ''

export const initializeBot = async (
  botName: string,
  token: string,
  groupId: string
) => {
  // ... existing code ...
}
