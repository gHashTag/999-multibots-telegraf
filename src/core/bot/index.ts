import dotenv from 'dotenv'

dotenv.config()

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockBot } from '@/test-utils/mocks/botMock'
import { logger } from '@/utils/logger'
import { isProduction, isTest } from '@/config'
import { getBotGroupFromAvatars } from '@/core/supabase'

// Проверяем токены в зависимости от окружения
if (isProduction) {
  // Check production tokens
  if (!process.env.BOT_TOKEN_1) throw new Error('❌ BOT_TOKEN_1 must be set')
  if (!process.env.BOT_TOKEN_2) throw new Error('❌ BOT_TOKEN_2 must be set')
  if (!process.env.BOT_TOKEN_3) throw new Error('❌ BOT_TOKEN_3 must be set')
  if (!process.env.BOT_TOKEN_4) throw new Error('❌ BOT_TOKEN_4 must be set')
  if (!process.env.BOT_TOKEN_5) throw new Error('❌ BOT_TOKEN_5 must be set')
  if (!process.env.BOT_TOKEN_6) throw new Error('❌ BOT_TOKEN_6 must be set')
  if (!process.env.BOT_TOKEN_7) throw new Error('❌ BOT_TOKEN_7 must be set')
} else {
  // Check test tokens
  if (!process.env.BOT_TOKEN_TEST_1)
    throw new Error('❌ BOT_TOKEN_TEST_1 must be set')
  if (!process.env.BOT_TOKEN_TEST_2)
    throw new Error('❌ BOT_TOKEN_TEST_2 must be set')
}

const BOT_TOKENS_PROD = [
  process.env.BOT_TOKEN_1,
  process.env.BOT_TOKEN_2,
  process.env.BOT_TOKEN_3,
  process.env.BOT_TOKEN_4,
  process.env.BOT_TOKEN_5,
  process.env.BOT_TOKEN_6,
  process.env.BOT_TOKEN_7,
].filter((token): token is string => typeof token === 'string')

const BOT_TOKENS_TEST = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
].filter((token): token is string => typeof token === 'string')

export const BOT_NAMES: Record<string, string | undefined> = {
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

export const BOT_TOKENS = isProduction ? BOT_TOKENS_PROD : BOT_TOKENS_TEST

export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1
if (!DEFAULT_BOT_TOKEN) throw new Error('❌ DEFAULT_BOT_TOKEN must be set')

export const DEFAULT_BOT_NAME = 'neuro_blogger_bot'
export const defaultBot = new Telegraf<MyContext>(DEFAULT_BOT_TOKEN)

logger.info('🤖 Инициализация defaultBot:', {
  description: 'DefaultBot initialization',
  tokenLength: DEFAULT_BOT_TOKEN.length,
})

// Инициализируем ботов при старте приложения
export const bots = Object.entries(BOT_NAMES)
  .filter(([, token]) => token !== undefined)
  .map(([name, token]) => {
    if (!token) {
      logger.error('❌ Токен не определен:', {
        description: 'Token is undefined',
        bot_name: name,
      })
      throw new Error(`Token is undefined for bot ${name}`)
    }

    // Если это defaultBot, используем существующий экземпляр
    if (name === DEFAULT_BOT_NAME) {
      logger.info('🤖 Использование существующего defaultBot:', {
        description: 'Using existing defaultBot',
        bot_name: name,
      })
      return defaultBot
    }

    const bot = new Telegraf<MyContext>(token)

    bot.use((ctx, next) => {
      console.log('RAW REQUEST:', ctx.update)
      return next()
    })

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
if (!PULSE_BOT_TOKEN) throw new Error('❌ PULSE_BOT_TOKEN must be set')

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

  const groupId = (await getBotGroupFromAvatars(botName)) || ''

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
  if (isTest) {
    logger.info({
      message: '🧪 Возвращаем мок бота для тестов',
      description: 'Returning mock bot for tests',
      bot_name,
    })
    return {
      bot: createMockBot('test-token') as unknown as Telegraf<MyContext>,
    }
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

  // Ищем бота в массиве bots
  const botIndex = Object.keys(BOT_NAMES).indexOf(bot_name)
  const bot = bots[botIndex]

  if (!bot) {
    logger.error({
      message: '❌ Экземпляр бота не найден',
      description: 'Bot instance not found',
      bot_name,
      botIndex,
      availableBots: Object.keys(BOT_NAMES),
    })
    return { error: 'Bot instance not found' }
  }

  return { bot }
}

export const supportRequest = async (title: string, data: any) => {
  if (!process.env.SUPPORT_CHAT_ID) {
    logger.error('❌ SUPPORT_CHAT_ID не установлен', {
      description: 'SUPPORT_CHAT_ID is not set',
    })
    return
  }

  try {
    await defaultBot.telegram.sendMessage(
      process.env.SUPPORT_CHAT_ID,
      `${title}\n\n${JSON.stringify(data, null, 2)}`
    )
  } catch (error) {
    logger.error('❌ Ошибка отправки сообщения в поддержку:', {
      description: 'Error sending message to support',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
