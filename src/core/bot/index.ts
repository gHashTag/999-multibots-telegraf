import dotenv from 'dotenv'

dotenv.config()

import { NODE_ENV } from '@/config'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

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
    console.error(`Token for bot name ${botName} not found.`)
    return undefined
  }
  const groupId = await getBotGroupFromAvatars(botName)
  const bot = bots.find(bot => bot.telegram.token === token)
  return {
    token,
    groupId,
    bot,
  }
}

export const bots = Object.values(BOT_NAMES).map(
  token => new Telegraf<MyContext>(token)
)

export function getBotByName(bot_name: string): {
  bot?: Telegraf<MyContext>
  error?: string | null
} {
  logger.info({
    message: '🔎 getBotByName запрошен для',
    description: 'getBotByName requested for',
    bot_name,
  })

  // Проверяем, находимся ли мы в тестовом окружении
  if (process.env.NODE_ENV === 'test' || process.env.IS_TESTING === 'true') {
    logger.info({
      message: '🧪 Тестовое окружение, возвращаем мок-бота',
      description: 'Test environment, returning mock bot',
      bot_name,
    })
    const bot = bots.find(bot => bot.telegram.token === token)

    return { bot }
  }
  //

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

  // Ищем экземпляр бота в массиве
  const bot = bots.find(bot => bot.telegram.token === token)

  if (!bot) {
    logger.error({
      message: '❌ Экземпляр бота не найден',
      description: 'Bot instance not found',
      bot_name,
      availableBots: bots.map(bot => ({
        token: bot.telegram.token.substring(0, 5) + '...',
        hasBot: !!bot,
      })),
    })
    return { error: 'Bot instance not found' }
  }

  // Проверка наличия необходимых методов
  if (!bot.telegram || typeof bot.telegram.sendPhoto !== 'function') {
    logger.error({
      message: '❌ Экземпляр бота найден, но отсутствуют необходимые методы',
      description: 'Bot instance found but missing required methods',
      bot_name,
      hasTelegram: !!bot.telegram,
      methods: bot.telegram ? Object.keys(bot.telegram) : [],
    })
    return { error: 'Bot instance is invalid' }
  }

  logger.info({
    message: '✅ Бот успешно получен',
    description: 'Bot successfully retrieved',
    bot_name,
    hasTelegram: !!bot.telegram,
    methodsCount: bot.telegram ? Object.keys(bot.telegram).length : 0,
  })

  return { bot }
}

export const PULSE_BOT_TOKEN = process.env.BOT_TOKEN_1

export const pulseBot = new Telegraf<MyContext>(PULSE_BOT_TOKEN)

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
