import dotenv from 'dotenv'

dotenv.config()

<<<<<<< HEAD
import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update } from 'telegraf/types'
import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'
import { logger } from './utils/logger'
import { ADMIN_IDS_ARRAY } from './config'

// Глобальный массив для хранения экземпляров ботов
export const botInstances: Telegraf<MyContext>[] = []
=======
import { NODE_ENV } from '@/config'
import { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import type { BotName } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { toBotName } from '@/helpers/botName.helper'

import { getBotGroupFromAvatars } from '@/core/supabase'
>>>>>>> adf7ec30 (bugfix)

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

  const botIndex = Object.keys(BOT_NAMES).indexOf(validBotName)
  const bot = bots[botIndex]

  if (!bot) {
    logger.error('❌ Экземпляр бота не найден:', {
      description: 'Bot instance not found',
      botName: validBotName,
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

export function getBotByName(bot_name: string): {
  bot?: Telegraf<MyContext>
  error?: string | null
} {
  try {
    const validBotName = toBotName(bot_name)
    logger.info({
      message: '🔎 getBotByName запрошен для',
      description: 'getBotByName requested for',
      bot_name: validBotName,
    })

    const token = BOT_NAMES[validBotName]
    if (!token) {
      logger.error({
        message: '❌ Токен бота не найден в конфигурации',
        description: 'Bot token not found in configuration',
        bot_name: validBotName,
        availableBots: Object.keys(BOT_NAMES),
      })
      return { error: 'Bot not found in configuration' }
    }

    logger.info({
      message: '🔑 Токен бота получен из конфигурации',
      description: 'Bot token retrieved from configuration',
      bot_name: validBotName,
      tokenLength: token.length,
    })

    const botIndex = Object.keys(BOT_NAMES).indexOf(validBotName)
    let bot = bots[botIndex]

    if (!bot || !bot.telegram?.sendMessage) {
      logger.info({
        message: '🔄 Создание нового экземпляра бота',
        description: 'Creating new bot instance',
        bot_name: validBotName,
      })
      bot = new Telegraf<MyContext>(token)
      if (!bot.telegram?.sendMessage) {
        logger.error({
          message: '❌ Ошибка инициализации бота',
          description: 'Bot initialization error',
          bot_name: validBotName,
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
      bot_name: validBotName,
      hasSendMessage: typeof bot.telegram?.sendMessage === 'function',
    })

    return { bot }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при получении бота',
      description: 'Error getting bot',
      bot_name,
      error,
    })
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
<<<<<<< HEAD

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  console.log(`🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`)

  // 1. Останавливаем ботов
  console.log(`[${signal}] Stopping ${botInstances.length} bot instance(s)...`)
  const stopPromises = botInstances.map(async (bot, index) => {
    try {
      console.log(
        `[${signal}] Initiating stop for bot instance index ${index}...`
      )
      // bot.stop() для long polling обычно синхронный, но для надежности можно обернуть
      // Хотя Telegraf 4.x stop() возвращает void для polling
      bot.stop(signal)
      console.log(
        `[${signal}] Successfully stopped bot instance index ${index}.`
      )
    } catch (error) {
      console.error(
        `[${signal}] Error stopping bot instance index ${index}:`,
        error // Логируем полную ошибку
      )
    }
  })
  // Не нужно Promise.all, так как bot.stop() синхронный для polling
  // await Promise.all(stopPromises) // Убираем ожидание, если оно не нужно
  console.log(`[${signal}] All bot instances processed for stopping.`)

  // 3. Добавляем небольшую задержку перед выходом
  console.log(`[${signal}] Adding a short delay before exiting...`)
  await new Promise(resolve => setTimeout(resolve, 3000))

  console.log(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0)
}

// Обрабатываем сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

console.log('🏁 Запуск приложения')
initializeBots()
  .then(() => {
    console.log('✅ Боты успешно запущены')
  })
  .catch(error => {
    console.error('❌ Ошибка при инициализации ботов:', error)
    process.exit(1)
  })

/**
 * Запускает всех ботов, указанных в process.env.BOT_TOKENS.
 */
export async function launchBots() {
  const botTokensEnv = process.env.BOT_TOKENS
  if (!botTokensEnv) {
    // logger.error( // Убедимся, что logger импортирован или удалим использование
    //  '❌ Переменная окружения BOT_TOKENS не установлена. Невозможно запустить ботов.'
    // )
    console.error(
      '❌ Переменная окружения BOT_TOKENS не установлена. Невозможно запустить ботов.'
    )
    return
  }

  const tokens = botTokensEnv.split(',').map(token => token.trim())
  logger.info(`Found ${tokens.length} bot tokens. Initializing...`)

  for (const token of tokens) {
    if (!token) continue
    try {
      const bot = new Telegraf<MyContext>(token)

      // Получаем информацию о боте асинхронно
      const botInfo = await bot.telegram.getMe()
      bot.botInfo = botInfo // Сохраняем информацию о боте
      logger.info(`Initializing bot: ${botInfo.username} (ID: ${botInfo.id})`)

      botInstances.push(bot) // Добавляем экземпляр в массив

      // Настройка бота (сцены, команды, мидлвары) происходит через registerCommands
      // await startBotInstance(bot) // Removed unused call
    } catch (error) {
      logger.error(
        `❌ Failed to initialize bot with token fragment: ...${token.slice(-5)}`,
        error
      )
    }
  }

  if (botInstances.length === 0) {
    logger.warn('No bots were launched. Check BOT_TOKENS environment variable.')
  }

  // Запуск регистрации команд после инициализации ботов
  if (botInstances.length > 0) {
    // await registerCommands(botInstances[0]) // Пример для одного бота, нужно адаптировать
    logger.info('Command registration might be needed here.')
  }

  logger.info(`Total bots launched: ${botInstances.length}`)
}
=======
>>>>>>> adf7ec30 (bugfix)
