import dotenv from 'dotenv'

dotenv.config()

import { NODE_ENV } from '@/config'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '@/test-utils/test-config'

import { getBotGroupFromAvatars } from '@/core/supabase'
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

const BOT_TOKENS_PROD = [
  process.env.BOT_TOKEN_1,
  process.env.BOT_TOKEN_2,
  process.env.BOT_TOKEN_3,
  process.env.BOT_TOKEN_4,
  process.env.BOT_TOKEN_5,
  process.env.BOT_TOKEN_6,
  process.env.BOT_TOKEN_7,
]
const BOT_TOKENS_TEST = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
]

export const BOT_NAMES = {
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

// Tutorial URLs
export const BOT_URLS = {
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
  .filter(([_, token]) => token) // Фильтруем undefined токены
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

export function getBotNameByToken(token: string): { bot_name: string } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const entry = Object.entries(BOT_NAMES).find(([_, value]) => value === token)
  if (!entry) {
    return { bot_name: DEFAULT_BOT_NAME }
  }

  const [bot_name] = entry
  return { bot_name }
}

export function getTokenByBotName(botName: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const entry = Object.entries(BOT_NAMES).find(([name, _]) => name === botName)
  if (!entry) {
    console.warn(`Bot name ${botName} not found.`)
    return undefined
  }

  const [, token] = entry
  return token
}

export async function createBotByName(
  botName: string
): Promise<
  { token: string; groupId: string; bot: Telegraf<MyContext> } | undefined
> {
  const token = getTokenByBotName(botName)
  if (!token) {
    logger.error('❌ Токен для бота не найден:', {
      description: 'Token not found for bot',
      botName,
    })
    return undefined
  }

  const groupId = await getBotGroupFromAvatars(botName)

  // Ищем бота в массиве bots
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
    groupId,
    bot,
  }
}

export function getBotByName(bot_name: string): {
  bot?: Telegraf<MyContext>
  error?: string | null
} {
  // В тестовом окружении возвращаем мок
  if (process.env.NODE_ENV === 'test') {
    logger.info({
      message: '🧪 Возвращаем мок бота для тестов',
      description: 'Returning mock bot for tests',
      bot_name,
    })
    return { bot: TEST_CONFIG.mocks.bot }
  }

  logger.info({
    message: '🔎 getBotByName запрошен для',
    description: 'getBotByName requested for',
    bot_name,
  })

  // Проверяем наличие бота в конфигурации
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

  // Ищем бота в массиве bots
  const botIndex = Object.keys(BOT_NAMES).indexOf(bot_name)
  let bot = bots[botIndex]

  // Если бот не найден в массиве или не имеет необходимых методов, создаем новый экземпляр
  if (!bot || !bot.telegram?.sendMessage) {
    logger.info({
      message: '🔄 Создание нового экземпляра бота',
      description: 'Creating new bot instance',
      bot_name,
    })
    bot = new Telegraf<MyContext>(token)
    // Проверяем, что бот создан корректно
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
    // Заменяем бота в массиве
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
      process.env.SUPPORT_CHAT_ID,
      `🚀 ${title}\n\n${JSON.stringify(data)}`
    )
  } catch (error) {
    throw new Error(`Error supportRequest: ${JSON.stringify(error)}`)
  }
}
