import { Telegraf, type Context, type Middleware } from 'telegraf'
// import dotenv from 'dotenv' // Keep static import removed

// // Load .env file only in non-production environments
// if (process.env.NODE_ENV !== 'production') {
//   // Use require for conditional loading
//   try {
//     const dotenv = require('dotenv');
//     dotenv.config()
//   } catch (error) {
//     console.error("Failed to load dotenv in non-production environment (require):", error);
//   }
// }

import { NODE_ENV } from '@/config'
import { MyContext, BotName } from '@/interfaces'
import { logger } from '@/utils/logger'
import { toBotName } from '@/helpers/botName.helper'

import { getBotGroupFromAvatars } from '@/core/supabase'

// Проверяем наличие токенов
if (!process.env.BOT_TOKEN_1) throw new Error('BOT_TOKEN_1 is not set')
if (!process.env.BOT_TOKEN_2) throw new Error('BOT_TOKEN_2 is not set')
if (!process.env.BOT_TOKEN_3) throw new Error('BOT_TOKEN_3 is not set')
if (!process.env.BOT_TOKEN_4) throw new Error('BOT_TOKEN_4 is not set')
if (!process.env.BOT_TOKEN_5) throw new Error('BOT_TOKEN_5 is not set')
if (!process.env.BOT_TOKEN_6) throw new Error('BOT_TOKEN_6 is not set')
if (!process.env.BOT_TOKEN_7) throw new Error('BOT_TOKEN_7 is not set')
if (!process.env.BOT_TOKEN_8) throw new Error('BOT_TOKEN_8 is not set')
if (!process.env.BOT_TOKEN_9) throw new Error('BOT_TOKEN_9 is not set')
if (!process.env.BOT_TOKEN_10) throw new Error('BOT_TOKEN_10 is not set')

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
  process.env.BOT_TOKEN_8,
  process.env.BOT_TOKEN_9,
  process.env.BOT_TOKEN_10,
]

const BOT_TOKENS_TEST: string[] = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
  process.env.BOT_TOKEN_TEST_3,
]

export const BOT_NAMES: Record<BotName, string> = {
  ['neuro_blogger_bot']: process.env.BOT_TOKEN_1,
  ['MetaMuse_Manifest_bot']: process.env.BOT_TOKEN_2,
  ['ZavaraBot']: process.env.BOT_TOKEN_3,
  ['LeeSolarbot']: process.env.BOT_TOKEN_4,
  ['NeuroLenaAssistant_bot']: process.env.BOT_TOKEN_5,
  ['NeurostylistShtogrina_bot']: process.env.BOT_TOKEN_6,
  ['Gaia_Kamskaia_bot']: process.env.BOT_TOKEN_7,
  ['Kaya_easy_art_bot']: process.env.BOT_TOKEN_8,
  ['AI_STARS_bot']: process.env.BOT_TOKEN_9,
  ['HaimGroupMedia_bot']: process.env.BOT_TOKEN_10,
  ['ai_koshey_bot']: process.env.BOT_TOKEN_TEST_2, // Используем TEST_2 для ai_koshey_bot
  ['clip_maker_neuro_bot']: process.env.BOT_TOKEN_TEST_1, // Используем TEST_1 для clip_maker_neuro_bot
  ['TestNeurocoder_bot']: process.env.BOT_TOKEN_TEST_3,
} as const

// Tutorial URLs
export const BOT_URLS: Partial<Record<BotName, string>> = {
  MetaMuse_Manifest_bot: 'https://t.me/MetaMuse_manifestation/16',
  neuro_blogger_bot: 'https://t.me/neuro_coder_ai/1212',
  ai_koshey_bot: 'https://t.me/neuro_coder_ai/1212',
  Kaya_easy_art_bot: 'https://t.me/kaya_easy_art/13',
  Gaia_Kamskaia_bot: 'https://t.me/neuromeets/1876',
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

// Вместо массива:
export const bots: Record<BotName, Telegraf<MyContext>> = {} as any

Object.entries(BOT_NAMES)
  .filter(([, token]) => token)
  .filter(([name, token]) => {
    if (NODE_ENV === 'development') {
      return BOT_TOKENS_TEST.includes(token)
    }
    return BOT_TOKENS_PROD.includes(token)
  })
  .forEach(([name, token]) => {
    bots[name as BotName] =
      name === DEFAULT_BOT_NAME ? defaultBot : new Telegraf<MyContext>(token)
  })

logger.info('🌟 Инициализировано ботов:', {
  description: 'Bots initialized',
  count: Object.keys(bots).length,
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

export function getTokenByBotName(botName: string): string | undefined {
  const validBotName = toBotName(botName)
  const entry = Object.entries(BOT_NAMES).find(
    ([name, _]) => name === validBotName
  )
  if (!entry) {
    logger.warn(`Bot name ${validBotName} not found.`)
    return undefined
  }

  const [, token] = entry
  return token
}

export async function createBotByName(botName: string): Promise<
  | {
      token: string
      groupId: string
      bot: Telegraf<MyContext>
    }
  | undefined
> {
  const validBotName = toBotName(botName)
  const token = getTokenByBotName(validBotName)
  if (!token) {
    logger.error('❌ Токен для бота не найден:', {
      description: 'Token not found for bot',
      botName: validBotName,
    })
    return undefined
  }

  const groupIdResult = await getBotGroupFromAvatars(validBotName)
  if (!groupIdResult) {
    logger.error('❌ Группа для бота не найдена:', {
      description: 'Group not found for bot',
      botName: validBotName,
    })
    return undefined
  }

  const bot = bots[validBotName as BotName]

  if (!bot) {
    logger.error('❌ Экземпляр бота не найден:', {
      description: 'Bot instance not found',
      botName: validBotName,
    })
    return undefined
  }

  return {
    token,
    groupId: groupIdResult,
    bot,
  }
}

export function getBotByName(bot_name: string): {
  bot?: Telegraf<MyContext>
  error?: string | null
} {
  try {
    const validBotName = toBotName(bot_name)
    const bot = bots[validBotName]
    if (!bot) {
      return { error: 'Bot instance not found' }
    }
    return { bot }
  } catch (error) {
    return { error: 'Invalid bot name' }
  }
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
