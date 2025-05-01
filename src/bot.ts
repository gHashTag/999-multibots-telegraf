import dotenv from 'dotenv'

dotenv.config()

import { Telegraf, Scenes, Context } from 'telegraf'
import { Update, BotCommand } from 'telegraf/types'
import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'
import { logger } from './utils/logger'
import { ADMIN_IDS_ARRAY, NODE_ENV } from './config'
import type { BotName } from '@/interfaces/telegram-bot.interface'
import { toBotName } from '@/helpers/botName.helper'
import { getBotGroupFromAvatars } from '@/core/supabase'
import { setupHearsHandlers } from './hearsHandlers'

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
  process.env.BOT_TOKEN_1!,
  process.env.BOT_TOKEN_2!,
  process.env.BOT_TOKEN_3!,
  process.env.BOT_TOKEN_4!,
  process.env.BOT_TOKEN_5!,
  process.env.BOT_TOKEN_6!,
  process.env.BOT_TOKEN_7!,
].filter(Boolean)

const BOT_TOKENS_TEST: string[] = [
  process.env.BOT_TOKEN_TEST_1!,
  process.env.BOT_TOKEN_TEST_2!,
].filter(Boolean)

export const BOT_NAMES: Record<BotName, string> = {
  ['neuro_blogger_bot']: process.env.BOT_TOKEN_1!,
  ['MetaMuse_Manifest_bot']: process.env.BOT_TOKEN_2!,
  ['ZavaraBot']: process.env.BOT_TOKEN_3!,
  ['LeeSolarbot']: process.env.BOT_TOKEN_4!,
  ['NeuroLenaAssistant_bot']: process.env.BOT_TOKEN_5!,
  ['NeurostylistShtogrina_bot']: process.env.BOT_TOKEN_6!,
  ['Gaia_Kamskaia_bot']: process.env.BOT_TOKEN_7!,
  ['ai_koshey_bot']: process.env.BOT_TOKEN_TEST_1!,
  ['clip_maker_neuro_bot']: process.env.BOT_TOKEN_TEST_2!,
} as const

export const BOT_URLS: Partial<Record<BotName, string>> = {
  MetaMuse_Manifest_bot: 'https://t.me/MetaMuse_manifestation/16',
  neuro_blogger_bot: 'https://t.me/neuro_coder_ai/1212',
  ai_koshey_bot: 'https://t.me/neuro_coder_ai/1212',
}

const privateCommands: BotCommand[] = [
  { command: 'start', description: '🚀 Начать / Restart' },
  { command: 'menu', description: '🏠 Главное меню / Main Menu' },
  { command: 'help', description: '❓ Помощь / Help' },
  { command: 'balance', description: '💰 Баланс / Balance' },
  { command: 'buy', description: '💎 Пополнить баланс / Top up' },
  { command: 'invite', description: '👥 Пригласить друга / Invite' },
  { command: 'support', description: '💬 Техподдержка / Support' },
  { command: 'neuro_coder', description: '🤖 НейроКодер / NeuroCoder' },
]

export async function validateBotToken(token: string): Promise<boolean> {
  try {
    const bot = new Telegraf(token)
    await bot.telegram.getMe()
    return true
  } catch (error) {
    console.error(`❌ Ошибка валидации токена: ${(error as Error).message}`)
    return false
  }
}

export const BOT_TOKENS =
  NODE_ENV === 'production' ? BOT_TOKENS_PROD : BOT_TOKENS_TEST

export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1!
export const DEFAULT_BOT_NAME = 'neuro_blogger_bot'
export const defaultBot = new Telegraf<MyContext>(DEFAULT_BOT_TOKEN)

if (!defaultBot.context.botName) {
  defaultBot.context.botName = DEFAULT_BOT_NAME
}

logger.info('🤖 Инициализация defaultBot:', {
  description: 'DefaultBot initialization',
  tokenLength: DEFAULT_BOT_TOKEN.length,
})

export const bots = Object.entries(BOT_NAMES)
  .filter(([, token]) => token)
  .filter(([name, token]) => {
    if (NODE_ENV === 'development') {
      return BOT_TOKENS_TEST.includes(token)
    }
    return BOT_TOKENS_PROD.includes(token)
  })
  .map(([name, token]) => {
    const botName = name as BotName
    if (botName === DEFAULT_BOT_NAME) {
      logger.info('🤖 Использование существующего defaultBot:', {
        description: 'Using existing defaultBot',
        bot_name: botName,
      })
      if (!defaultBot.context.botName) {
        defaultBot.context.botName = botName
      }
      return defaultBot
    }
    const bot = new Telegraf<MyContext>(token)
    bot.context.botName = botName

    logger.info('🤖 Инициализация бота:', {
      description: 'Bot initialization',
      bot_name: botName,
      tokenLength: token.length,
    })
    return bot
  })

logger.info('🌟 Инициализировано ботов:', {
  description: 'Bots initialized',
  count: bots.length,
  bot_names: bots.map(b => b.context.botName).filter(Boolean),
})

export const PULSE_BOT_TOKEN = process.env.BOT_TOKEN_1!
export const pulseBot = new Telegraf<MyContext>(PULSE_BOT_TOKEN)

if (!pulseBot.context.botName) {
  const pulseBotNameEntry = Object.entries(BOT_NAMES).find(
    ([_, token]) => token === PULSE_BOT_TOKEN
  )
  if (pulseBotNameEntry) {
    pulseBot.context.botName = pulseBotNameEntry[0] as BotName
  }
}

logger.info('🤖 Инициализация pulseBot:', {
  description: 'PulseBot initialization',
  tokenLength: PULSE_BOT_TOKEN.length,
})

export function getBotNameByToken(token: string): { bot_name: BotName } {
  const entry = Object.entries(BOT_NAMES).find(([_, value]) => value === token)
  if (!entry) {
    logger.warn('⚠️ Token not found, returning default bot name', {
      tokenLength: token.length,
    })
    return { bot_name: DEFAULT_BOT_NAME }
  }
  const [bot_name] = entry
  return { bot_name: bot_name as BotName }
}

export function getTokenByBotName(botName: string): string | undefined {
  const validBotName = toBotName(botName)
  const token = BOT_NAMES[validBotName]
  if (!token) {
    logger.warn(`Bot token for name ${validBotName} not found.`)
    return undefined
  }
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

  const botInstance = bots.find(b => b.context.botName === validBotName)

  if (!botInstance) {
    logger.error('❌ Экземпляр бота не найден в инициализированном массиве:', {
      description: 'Bot instance not found in initialized array',
      botName: validBotName,
      tokenLength: token.length,
      initializedBotsCount: bots.length,
    })
    return undefined
  }

  return {
    token,
    groupId: groupIdResult,
    bot: botInstance,
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

    const botInstance = bots.find(b => b.context.botName === validBotName)

    if (!botInstance) {
      logger.error(
        '❌ Экземпляр бота не найден в инициализированном массиве (getBotByName):',
        {
          description:
            'Bot instance not found in initialized array (getBotByName)',
          botName: validBotName,
          initializedBotsCount: bots.length,
        }
      )
      return { error: 'Bot instance not initialized' }
    }

    logger.info({
      message: '✅ Экземпляр бота найден',
      description: 'Bot instance found',
      bot_name: validBotName,
    })
    return { bot: botInstance }
  } catch (error) {
    logger.error('❌ Ошибка в getBotByName:', {
      description: 'Error in getBotByName function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      bot_name,
    })
    return { error: 'Internal error in getBotByName' }
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
