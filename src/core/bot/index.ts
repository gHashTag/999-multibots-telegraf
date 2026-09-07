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
import { telegramClientOptions } from '@/services/telegramApi'

// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: везде используем BOT_TOKEN_1-N
// Токены загружаются из Infisical автоматически, warnings убраны

// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: токены 1-11 для всех окружений
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
  process.env.BOT_TOKEN_11,
  process.env.BOT_TOKEN_12,
]

// 🔐 Продакшн токены (BOT_TOKEN_1-11)
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
  process.env.BOT_TOKEN_11,
  process.env.BOT_TOKEN_12,
].filter(Boolean)

// Маппинг имен ботов на токены (зависит от окружения)
export const BOT_NAMES: Record<BotName, string> = {
  // Production боты (BOT_TOKEN_1-11 в prod/staging)
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
  ['OM_AI_Digital_studio_bot']: process.env.BOT_TOKEN_11,
  // Клуб «Золотая Литейная» (Golden Foundry)
  ['t27ai_bot']: process.env.BOT_TOKEN_12,

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
  ? new Telegraf<MyContext>(DEFAULT_BOT_TOKEN, {
      telegram: telegramClientOptions(),
    })
  : (null as any)

if (DEFAULT_BOT_TOKEN) {
  logger.info('🤖 Инициализация defaultBot:', {
    description: 'DefaultBot initialization',
    tokenLength: DEFAULT_BOT_TOKEN.length,
  })
}

// 🔥 LAZY INITIALIZATION: bots объект заполняется после загрузки Infisical
// Используем Proxy для ленивой инициализации при обращении
const _botsInternal: Record<BotName, Telegraf<MyContext>> = {} as any
let _botsInitialized = false

function _initializeBots(): void {
  if (_botsInitialized) return

  // Проверяем, есть ли токены (Infisical уже загрузил их)
  const hasTokens = Object.values(BOT_NAMES).some(token => token)

  if (!hasTokens) {
    logger.warn(
      '⚠️ [BOT REGISTRY] No tokens available yet, skipping initialization'
    )
    return
  }

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
      _botsInternal[name as BotName] =
        name === DEFAULT_BOT_NAME
          ? defaultBot
          : new Telegraf<MyContext>(token, {
              telegram: telegramClientOptions(),
            })
    })

  _botsInitialized = true

  logger.info('🌟 Инициализировано ботов:', {
    description: 'Bots initialized',
    count: Object.keys(_botsInternal).length,
    bot_names: Object.keys(_botsInternal),
  })
}

// Экспортируем Proxy который инициализирует ботов при первом обращении
export const bots: Record<BotName, Telegraf<MyContext>> = new Proxy(
  _botsInternal,
  {
    get(target, prop: string) {
      _initializeBots()
      return target[prop as BotName]
    },
    set(target, prop: string, value) {
      _initializeBots()
      target[prop as BotName] = value
      return true
    },
    has(target, prop: string) {
      _initializeBots()
      return prop in target
    },
    ownKeys(target) {
      _initializeBots()
      return Object.keys(target)
    },
    getOwnPropertyDescriptor(target, prop: string) {
      _initializeBots()
      return Object.getOwnPropertyDescriptor(target, prop)
    },
  }
)

// 🔐 В dev используем тестовый токен, в production - продакшн
// ⚠️ LAZY INIT: токен читаем при первом использовании, т.к. Infisical загружается асинхронно
let _pulseBot: Telegraf<MyContext> | null = null
let _pulseBotInitialized = false

/**
 * Получить pulseBot с ленивой инициализацией
 * Создаётся при первом вызове, когда Infisical уже загрузил токены
 */
export const getPulseBot = (): Telegraf<MyContext> | null => {
  if (_pulseBotInitialized) {
    return _pulseBot
  }

  const tokenEnvKey = isDev ? 'BOT_TOKEN_TEST_1' : 'BOT_TOKEN_1'
  const token = process.env[tokenEnvKey]

  if (token) {
    _pulseBot = new Telegraf<MyContext>(token, {
      telegram: telegramClientOptions(),
    })
    logger.info('🤖 Инициализация pulseBot (lazy):', {
      description: 'PulseBot lazy initialization',
      tokenEnvKey,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...',
      isDev,
    })
  } else {
    logger.warn('⚠️ PULSE_BOT_TOKEN не найден, pulseBot не инициализирован', {
      description: 'PULSE_BOT_TOKEN not found',
      tokenEnvKey,
      isDev,
      envKeysAvailable: {
        BOT_TOKEN_1: !!process.env.BOT_TOKEN_1,
        BOT_TOKEN_TEST_1: !!process.env.BOT_TOKEN_TEST_1,
      },
    })
  }

  _pulseBotInitialized = true
  return _pulseBot
}

// ✅ Для обратной совместимости - геттер вместо константы
export const pulseBot = new Proxy({} as Telegraf<MyContext>, {
  get(_, prop) {
    const bot = getPulseBot()
    if (!bot) return undefined
    return (bot as any)[prop]
  },
})

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
    OM_AI_Digital_studio_bot: 'OM_AI_Digital_studio_bot',
    om_ai_digital_studio_bot: 'OM_AI_Digital_studio_bot', // case-insensitive
    t27ai_bot: 't27ai_bot',
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
    // Прямая запись в _botsInternal для обхода Proxy
    _botsInternal[validBotName] = bot
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

/**
 * Принудительная инициализация ботов (вызывается после загрузки Infisical)
 */
export function forceInitializeBots(): void {
  _initializeBots()
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
    const bot = getPulseBot()
    if (!bot) {
      logger.warn('⚠️ supportRequest: pulseBot не инициализирован')
      return
    }
    await bot.telegram.sendMessage(
      process.env.SUPPORT_CHAT_ID!,
      `🚀 ${title}\n\n${JSON.stringify(data)}`
    )
  } catch (error) {
    throw new Error(`Error supportRequest: ${JSON.stringify(error)}`)
  }
}

const groupId = process.env.GROUP_ID || ''

// Все функции уже экспортированы выше
// export { getBotByName, createBotByName, getBotNameByToken, getTokenByBotName }
