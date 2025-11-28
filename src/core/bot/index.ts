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

import { NODE_ENV, isDev } from '@/config'
import { MyContext, BotName } from '@/interfaces'
import { logger } from '@/utils/logger'
import { toBotName } from '@/helpers/botName.helper'

import { getBotGroupFromAvatars } from '@/core/supabase'

// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: везде используем BOT_TOKEN_1-N
// Токены загружаются из Infisical автоматически, warnings убраны

// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: токены 1-10 для всех окружений
const BOT_TOKENS_ALL: string[] = [
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

// 🔐 Продакшн токены (BOT_TOKEN_1-10)
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
].filter(Boolean)

// Маппинг имен ботов на токены (зависит от окружения)
export const BOT_NAMES: Record<BotName, string> = {
  // Production боты (BOT_TOKEN_1-10 в prod/staging)
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

  // Dev боты (BOT_TOKEN_1-2 в dev)
  ['ai_koshey_bot']: process.env.BOT_TOKEN_1,
  ['clip_maker_neuro_bot']: process.env.BOT_TOKEN_1,
  ['helper_999_bot']: process.env.BOT_TOKEN_2,
  ['TestNeurocoder_bot']: process.env.BOT_TOKEN_2,
} as const

// Tutorial URLs
export const BOT_URLS: Partial<Record<BotName, string>> = {
  MetaMuse_Manifest_bot: 'https://t.me/MetaMuse_manifestation/16',
  neuro_blogger_bot: 'https://t.me/neuro_coder_ai/1212',
  ai_koshey_bot: 'https://t.me/neuro_coder_ai/1212',
  Kaya_easy_art_bot: 'https://t.me/kaya_easy_art/13',
  Gaia_Kamskaia_bot: 'https://t.me/neuromeets/1876',
}

// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: всегда используем BOT_TOKENS_ALL
export const BOT_TOKENS = BOT_TOKENS_ALL

// 🔐 DEFAULT токен - всегда BOT_TOKEN_1
export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1

export const DEFAULT_BOT_NAME = isDev ? 'ai_koshey_bot' : 'neuro_blogger_bot'
export const defaultBot = DEFAULT_BOT_TOKEN
  ? new Telegraf<MyContext>(DEFAULT_BOT_TOKEN)
  : (null as any)

if (DEFAULT_BOT_TOKEN) {
  logger.info('🤖 Инициализация defaultBot:', {
    description: 'DefaultBot initialization',
    tokenLength: DEFAULT_BOT_TOKEN.length,
  })
}

// Вместо массива:
export const bots: Record<BotName, Telegraf<MyContext>> = {} as any

Object.entries(BOT_NAMES)
  .filter(([, token]) => token)
  .filter(([name, token]) => {
    // В dev режиме инициализируем все боты (включая тестовых)
    // В production - только продакшн ботов
    if (isDev) {
      return true // В dev режиме - все боты
    }
    return BOT_TOKENS_PROD.includes(token) // В production - только продакшн боты
  })
  .forEach(([name, token]) => {
    bots[name as BotName] =
      name === DEFAULT_BOT_NAME ? defaultBot : new Telegraf<MyContext>(token)
  })

logger.info('🌟 Инициализировано ботов:', {
  description: 'Bots initialized',
  count: Object.keys(bots).length,
  bot_names: Object.keys(bots),
})

// 🔐 В dev используем тестовый токен, в production - продакшн
export const PULSE_BOT_TOKEN = isDev
  ? process.env.BOT_TOKEN_TEST_1
  : process.env.BOT_TOKEN_1

export const pulseBot = PULSE_BOT_TOKEN
  ? new Telegraf<MyContext>(PULSE_BOT_TOKEN)
  : (null as any)

if (PULSE_BOT_TOKEN) {
  logger.info('🤖 Инициализация pulseBot:', {
    description: 'PulseBot initialization',
    tokenLength: PULSE_BOT_TOKEN.length,
  })
}

/**
 * Определяет имя бота по токену
 * Если несколько ботов используют один токен, возвращает первый найденный
 */
export function getBotNameByToken(token: string): { bot_name: BotName } {
  const entry = Object.entries(BOT_NAMES).find(([_, value]) => value === token)
  if (!entry) {
    return { bot_name: 'neuro_blogger_bot' }
  }

  const [bot_name] = entry
  return { bot_name: bot_name as BotName }
}

/**
 * Определяет имя бота по username (Telegram username)
 * Более точный метод, чем getBotNameByToken, так как username уникален
 */
export function getBotNameByUsername(username: string): {
  bot_name: BotName | null
} {
  // Маппинг Telegram username → BotName (case-insensitive поиск)
  const USERNAME_TO_BOT_NAME: Record<string, BotName> = {
    neuro_blogger_bot: 'neuro_blogger_bot',
    metamuse_manifest_bot: 'MetaMuse_Manifest_bot', // case-insensitive
    MetaMuse_Manifest_bot: 'MetaMuse_Manifest_bot', // точное совпадение
    MetaMuse_manifest_bot: 'MetaMuse_Manifest_bot', // вариант с маленькой m
    ZavaraBot: 'ZavaraBot',
    zavarabot: 'ZavaraBot', // case-insensitive
    LeeSolarbot: 'LeeSolarbot',
    leesolarbot: 'LeeSolarbot', // case-insensitive
    NeuroLenaAssistant_bot: 'NeuroLenaAssistant_bot',
    neurolenaassistant_bot: 'NeuroLenaAssistant_bot', // case-insensitive
    NeurostylistShtogrina_bot: 'NeurostylistShtogrina_bot',
    neurostylistshtogrina_bot: 'NeurostylistShtogrina_bot', // case-insensitive
    Gaia_Kamskaia_bot: 'Gaia_Kamskaia_bot',
    gaia_kamskaia_bot: 'Gaia_Kamskaia_bot', // case-insensitive
    Kaya_easy_art_bot: 'Kaya_easy_art_bot',
    kaya_easy_art_bot: 'Kaya_easy_art_bot', // case-insensitive
    AI_STARS_bot: 'AI_STARS_bot',
    ai_stars_bot: 'AI_STARS_bot', // case-insensitive
    HaimGroupMedia_bot: 'HaimGroupMedia_bot',
    haimgroupmedia_bot: 'HaimGroupMedia_bot', // case-insensitive
    // Dev боты
    ai_koshey_bot: 'ai_koshey_bot',
    clip_maker_neuro_bot: 'clip_maker_neuro_bot',
    helper_999_bot: 'helper_999_bot',
    TestNeurocoder_bot: 'TestNeurocoder_bot',
    testneurocoder_bot: 'TestNeurocoder_bot', // case-insensitive
  }

  // Сначала точный поиск
  let bot_name = USERNAME_TO_BOT_NAME[username]

  // Если не нашли, ищем case-insensitive
  if (!bot_name) {
    const lowerUsername = username.toLowerCase()
    const entry = Object.entries(USERNAME_TO_BOT_NAME).find(
      ([key]) => key.toLowerCase() === lowerUsername
    )
    if (entry) {
      bot_name = entry[1]
    }
  }

  return { bot_name: bot_name || null }
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

/**
 * Регистрирует созданный бот в объект bots для доступа через getBotByName
 * Вызывается после создания бота в src/index.ts
 */
export function registerBotInstance(
  bot: Telegraf<MyContext>,
  botName: string
): void {
  try {
    const validBotName = toBotName(botName) as BotName
    bots[validBotName] = bot
    logger.info('✅ [BOT REGISTRY] Bot instance registered', {
      description: 'Bot instance registered in bots object',
      botName: validBotName,
    })
  } catch (error) {
    logger.error('❌ [BOT REGISTRY] Failed to register bot instance', {
      description: 'Failed to register bot instance',
      botName,
      error: error instanceof Error ? error.message : String(error),
    })
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
      logger.warn('⚠️ [BOT REGISTRY] Bot instance not found', {
        description: 'Bot instance not found in bots object',
        requestedBotName: bot_name,
        validBotName,
        availableBots: Object.keys(bots),
      })
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
