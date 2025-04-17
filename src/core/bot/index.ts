import { Telegraf } from 'telegraf'
import { MyContext } from '../../interfaces'
import { registerCommands } from '../../registerCommands'
import logger from '../../utils/logger'
import { Composer } from 'telegraf'
import { validateToken } from './utils'

export {
  getBotNameByToken,
  DEFAULT_BOT_NAME,
  BOT_NAMES,
  BOT_TOKENS,
  maskToken,
} from './utils'

/**
 * Информация о боте
 */
export interface BotInfo {
  id: string
  token: string
  username?: string
  error?: Error
}

/**
 * Экземпляр запущенного бота
 */
export interface BotInstance {
  id: string
  username?: string
  instance: Telegraf<MyContext>
}

/**
 * Список ботов
 */
export type BotList = BotInfo[]

/**
 * Создает экземпляр бота Telegram и настраивает его
 * @param botInfo Информация о боте
 * @returns Экземпляр бота
 */
export async function createBot(botInfo: BotInfo): Promise<BotInstance | null> {
  const { id, token, username } = botInfo
  const identifier = username ? `@${username}` : `ID ${id}`

  try {
    // Проверяем валидность токена
    if (!validateToken(token)) {
      logger.error({
        message: `❌ Невалидный формат токена для бота ${identifier}`,
        description: 'Invalid token format',
        bot_id: id,
      })
      return null
    }

    // Создаем экземпляр бота
    logger.info({
      message: `🤖 Создание экземпляра бота ${identifier}`,
      description: 'Creating bot instance',
      bot_id: id,
    })

    const bot = new Telegraf<MyContext>(token)

    // Регистрируем обработчики команд
    const composerInstance = new Composer<MyContext>()
    await registerCommands({ bot, composer: composerInstance })

    // Добавляем контекст бота
    bot.context.botId = id
    bot.context.botUsername = username

    // Настраиваем обработку ошибок
    bot.catch((error, ctx) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: `❌ Ошибка в боте ${identifier}: ${errorMessage}`,
        description: 'Bot error',
        bot_id: id,
        update_id: ctx.update?.update_id,
        chat_id: ctx.chat?.id,
        user_id: ctx.from?.id,
        error: errorMessage,
      })
    })

    logger.info({
      message: `✅ Бот ${identifier} успешно создан и настроен`,
      description: 'Bot instance created',
      bot_id: id,
    })

    // Возвращаем экземпляр бота
    return {
      id,
      username,
      instance: bot,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Не удалось создать экземпляр бота ${identifier}: ${errorMessage}`,
      description: 'Failed to create bot instance',
      bot_id: id,
      error: errorMessage,
    })
    return null
  }
}

/**
 * Получает информацию о ботах из переменных окружения
 * @returns Список информации о ботах
 */
export function getBotsInfo(): BotInfo[] {
  const botInfos: BotInfo[] = []

  // Проверяем переменную BOT_TOKEN (для одного бота)
  const singleBotToken = process.env.BOT_TOKEN
  if (singleBotToken) {
    botInfos.push({
      id: 'main',
      token: singleBotToken,
    })
  }

  // Проверяем переменную BOT_TOKENS (для нескольких ботов через запятую)
  const multipleBotTokens = process.env.BOT_TOKENS
  if (multipleBotTokens) {
    const tokens = multipleBotTokens.split(',').map(token => token.trim())
    tokens.forEach((token, index) => {
      if (token) {
        botInfos.push({
          id: `bot${index + 1}`,
          token,
        })
      }
    })
  }

  // Проверяем переменные вида BOT_TOKEN_1, BOT_TOKEN_2, и т.д.
  for (let i = 1; i <= 20; i++) {
    const envKey = `BOT_TOKEN_${i}`
    const token = process.env[envKey]
    if (token) {
      botInfos.push({
        id: `bot${i}`,
        token,
      })
    }
  }

  return botInfos
}

/**
 * Инициализирует несколько ботов с улучшенной изоляцией ошибок
 * @param botsInfo Список информации о ботах для инициализации
 * @returns Список успешно инициализированных экземпляров ботов
 */
export async function initBots(botsInfo: BotInfo[]): Promise<BotInstance[]> {
  if (!botsInfo || botsInfo.length === 0) {
    logger.warn('Нет информации о ботах для инициализации')
    return []
  }

  logger.info({
    message: `🚀 Инициализация ${botsInfo.length} ботов...`,
    description: 'Initializing bots',
    bots_count: botsInfo.length,
  })

  const botInstances: BotInstance[] = []

  // Инициализируем каждого бота отдельно для лучшей изоляции ошибок
  for (const botInfo of botsInfo) {
    try {
      // Создаем экземпляр бота
      const bot = await createBot(botInfo)

      if (bot) {
        // Получаем информацию о боте
        try {
          const me = await bot.instance.telegram.getMe()
          bot.username = me.username

          logger.info({
            message: `ℹ️ Получена информация о боте: @${me.username} (${me.id})`,
            description: 'Bot info retrieved',
            bot_id: botInfo.id,
            bot_username: me.username,
            bot_telegram_id: me.id,
          })

          botInstances.push(bot)
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          // Проверяем, связана ли ошибка с авторизацией токена
          if (
            errorMessage.includes('401') ||
            errorMessage.includes('Unauthorized')
          ) {
            logger.error({
              message: `🔒 Ошибка авторизации для бота ${botInfo.id}. Токен недействителен или был отозван.`,
              description: 'Bot token authorization error',
              bot_id: botInfo.id,
              error: errorMessage,
            })
          } else {
            logger.error({
              message: `❌ Ошибка при получении информации о боте ${botInfo.id}: ${errorMessage}`,
              description: 'Failed to get bot info',
              bot_id: botInfo.id,
              error: errorMessage,
            })
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: `❌ Не удалось инициализировать бота ${botInfo.id}: ${errorMessage}`,
        description: 'Bot initialization failed',
        bot_id: botInfo.id,
        error: errorMessage,
      })
      // Продолжаем инициализацию других ботов
    }
  }

  logger.info({
    message: `✅ Инициализация ботов завершена: ${botInstances.length} из ${botsInfo.length} успешно`,
    description: 'Bots initialization completed',
    successful_count: botInstances.length,
    total_count: botsInfo.length,
  })

  return botInstances
}

/**
 * Инициализирует ботов из переменных окружения
 * @returns Список инициализированных ботов для системы мультибота
 */
async function init() {
  logger.info({
    message: '🚀 Инициализация ботов из переменных окружения',
    description: 'Initializing bots from environment variables',
  })

  // Получаем информацию о ботах
  const botsInfo = getBotsInfo()

  if (botsInfo.length === 0) {
    logger.warn('Нет ботов для инициализации')
    return []
  }

  // Инициализируем ботов
  const botInstances = await initBots(botsInfo)

  // Возвращаем результат в формате, ожидаемом в bot.ts
  return botInstances.map(botInstance => ({
    id: botInstance.id,
    username: botInstance.username,
    instance: botInstance.instance,
  }))
}

export default init
