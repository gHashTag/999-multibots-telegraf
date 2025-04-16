import dotenv from 'dotenv'

dotenv.config()

import { Telegraf, session } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'

import { logger } from '@/utils/logger'
import { NODE_ENV } from '@/config'
import { getBotGroupFromAvatars } from '../supabase/getBotGroupFromAvatars'

// Объявляем интерфейс BotExtraOptions, который используется в функции createBot
interface BotExtraOptions {
  // Дополнительные опции для создания бота
  // Можно добавить необходимые свойства при необходимости
}

// Определим интерфейсы Bot и BotList, если они не импортируются
interface Bot {
  bot: Telegraf<MyContext>
  id: string
}

type BotList = Bot[]

interface Scenes {
  // Определение для Scenes
}

/**
 * Функция проверяет валидность токена
 */
function validateToken(token?: string): boolean {
  if (!token) {
    console.error('validateToken: Bot token is empty or undefined')
    return false
  }

  const regex = /^\d+:[\w-]+$/
  const isValid = regex.test(token)

  if (!isValid) {
    console.error(`validateToken: Invalid token format: ${token}`)
  }

  return isValid
}

/**
 * Функция маскирует токен, оставляя видимыми только первые и последние 5 символов
 */
function maskToken(token: string): string {
  if (!token || token.length < 11) return '[INVALID_TOKEN_FORMAT]'

  const parts = token.split(':')
  if (parts.length !== 2) return '[INVALID_TOKEN_FORMAT]'

  const botId = parts[0]
  const secret = parts[1]

  // Маскируем часть секрета, оставляя видимыми первые и последние 5 символов
  const maskedSecret =
    secret.length > 10
      ? `${secret.substring(0, 5)}...${secret.substring(secret.length - 5)}`
      : '[SECRET_TOO_SHORT]'

  return `${botId}:${maskedSecret}`
}

// Используем перегрузку для функции createBot с разными сигнатурами
export const createBot = async function createBot(
  token: string,
  optionsOrBotId?:
    | (Partial<Telegraf.Options<MyContext>> & BotExtraOptions)
    | string
): Promise<Telegraf<MyContext> | Bot | null> {
  // Если второй параметр - строка, значит это botId, иначе - options
  const isBotId = typeof optionsOrBotId === 'string'
  const botId = isBotId ? optionsOrBotId : ''
  const options = isBotId ? {} : optionsOrBotId || {}

  if (isBotId) {
    // Реализация для варианта с botId
    try {
      logger.info('🤖 Создаем бота...', {
        description: 'Creating bot instance',
        bot_id: botId,
        masked_token: maskToken(token),
      })

      if (!validateToken(token)) {
        logger.error('❌ Невалидный токен, пропускаем создание бота', {
          description: 'Invalid token, skipping bot creation',
          bot_id: botId,
        })
        return null
      }

      const bot = new Telegraf<MyContext>(token)

      try {
        // Проверяем валидность токена путем получения информации о боте
        const botInfo = await bot.telegram.getMe()
        logger.info('✅ Токен валиден, получена информация о боте', {
          description: 'Token is valid, bot info received',
          bot_id: botId,
          bot_username: botInfo.username,
          telegram_id: botInfo.id,
        })
      } catch (error) {
        logger.error('❌ Ошибка при проверке токена бота', {
          description: 'Error verifying bot token',
          bot_id: botId,
          error: error instanceof Error ? error.message : String(error),
          error_code: error.response?.error_code,
          error_description: error.response?.description,
        })

        if (error.response?.error_code === 401) {
          logger.error('❌ Ошибка авторизации (401): Токен недействителен', {
            description: 'Unauthorized (401): Token is invalid',
            bot_id: botId,
          })

          // Проверка наличия специфических ошибок в ответе
          if (error.response?.description?.includes('Unauthorized')) {
            logger.error(
              '❌ Подробности ошибки авторизации: API вернул "Unauthorized"',
              {
                description:
                  'Authorization error details: API returned "Unauthorized"',
                bot_id: botId,
              }
            )
          }
        }

        return null
      }

      // Настраиваем бота: middleware, session, etc.
      bot.use(session())

      // Используем try-catch для обработки потенциальных ошибок
      try {
        bot.use((ctx, next) => {
          // Базовая обработка ошибок
          return next().catch(error => {
            logger.error('❌ Ошибка в middleware бота', {
              description: 'Error in bot middleware',
              bot_id: botId,
              error: error instanceof Error ? error.message : String(error),
            })
            return Promise.resolve()
          })
        })
      } catch (error) {
        logger.error('❌ Ошибка при настройке middleware', {
          description: 'Error setting up middleware',
          bot_id: botId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      logger.info('✅ Бот успешно создан', {
        description: 'Bot created successfully',
        bot_id: botId,
      })

      return { bot, id: botId }
    } catch (error) {
      logger.error('❌ Ошибка при создании бота', {
        description: 'Error creating bot',
        bot_id: botId,
        error: error instanceof Error ? error.message : String(error),
      })

      // Не пробрасываем ошибку дальше, чтобы изолировать сбой одного бота
      return null
    }
  } else {
    // Реализация оригинальной функции createBot с options
    console.log(
      `Creating bot with token: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`
    )

    if (!validateToken(token)) {
      const error = new Error(
        `Invalid bot token format: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`
      )
      console.error(error)
      throw error
    }

    try {
      const bot = new Telegraf<MyContext>(token, options)

      console.log(
        'Bot created successfully, attempting to getMe to verify token...'
      )

      try {
        const me = await bot.telegram.getMe()
        console.log(`Bot verified: @${me.username} (ID: ${me.id})`)
        return bot
      } catch (error) {
        console.error('Error verifying bot with getMe:', error)
        throw new Error(`Failed to verify bot: ${error.message}`)
      }
    } catch (error) {
      console.error('Error creating bot:', error)
      throw new Error(`Failed to create bot: ${error.message}`)
    }
  }
}

// Заменяем перекрывающуюся функцию initBot на одну версию
export async function initBot(
  tokenOrEnv: string,
  optionsOrBotId?:
    | (Partial<Telegraf.Options<MyContext>> & BotExtraOptions)
    | string
): Promise<Telegraf<MyContext> | Bot | null> {
  // Определяем, какой вариант функции вызван
  const isBotId = typeof optionsOrBotId === 'string'

  if (isBotId) {
    // Версия initBot(token_env, bot_id)
    const token_env = tokenOrEnv
    const bot_id = optionsOrBotId || ''

    try {
      logger.info('🚀 Инициализация бота...', {
        description: 'Initializing bot',
        bot_id,
        token_env,
      })

      const token = process.env[token_env]

      if (!token) {
        logger.error(
          `❌ Токен не найден: ${token_env} отсутствует в переменных окружения`,
          {
            description: 'Token not found in environment variables',
            token_env,
            bot_id,
            available_envs: Object.keys(process.env)
              .filter(key => key.includes('TOKEN') || key.includes('BOT'))
              .join(', '),
          }
        )
        return null
      }

      return createBot(token, bot_id)
    } catch (error) {
      logger.error('❌ Ошибка при инициализации бота', {
        description: 'Error initializing bot',
        bot_id,
        token_env,
        error: error instanceof Error ? error.message : String(error),
      })

      // Не пробрасываем ошибку дальше, чтобы изолировать сбой одного бота
      return null
    }
  } else {
    // Оригинальная версия initBot(token, options)
    const token = tokenOrEnv
    const options = optionsOrBotId || {}

    const hasIndex = token.includes('_')
    const botNumber = hasIndex ? token.split('_')[1] : token

    const isDevelopment = process.env.NODE_ENV === 'development'

    const envVarName = `BOT_TOKEN${isDevelopment ? '_TEST' : ''}_${botNumber}`
    const botToken = process.env[envVarName]

    console.log(`Initializing bot ${botNumber} with env var: ${envVarName}`)

    if (!botToken) {
      const error = new Error(
        `Bot token not found in environment variable: ${envVarName}`
      )
      console.error(error)
      throw error
    }

    console.log(
      `Bot token from env: ${botToken.substring(0, 5)}...${botToken.substring(botToken.length - 5)}`
    )

    return createBot(botToken, options)
  }
}

/**
 * Инициализирует список ботов
 */
export default async function init(): Promise<BotList> {
  logger.info('🔄 Начинаем инициализацию ботов...', {
    description: 'Starting bot initialization',
  })

  // Определяем токены для ботов в зависимости от окружения
  const tokenEntries = Object.entries(
    NODE_ENV === 'production'
      ? {
          neuro_blogger_bot: 'BOT_TOKEN_1',
          MetaMuse_Manifest_bot: 'BOT_TOKEN_2',
          ZavaraBot: 'BOT_TOKEN_3',
          LeeSolarbot: 'BOT_TOKEN_4',
          NeuroLenaAssistant_bot: 'BOT_TOKEN_5',
          NeurostylistShtogrina_bot: 'BOT_TOKEN_6',
          Gaia_Kamskaia_bot: 'BOT_TOKEN_7',
        }
      : {
          ai_koshey_bot: 'BOT_TOKEN_TEST_1',
          clip_maker_neuro_bot: 'BOT_TOKEN_TEST_2',
        }
  )

  const botPromises = tokenEntries.map(async ([bot_id, token_env]) => {
    try {
      const bot = await initBot(token_env, bot_id)
      return bot
    } catch (error) {
      logger.error('❌ Ошибка инициализации отдельного бота', {
        description: 'Error initializing individual bot',
        bot_id,
        token_env,
        error: error instanceof Error ? error.message : String(error),
      })

      // Возвращаем null вместо сбойного бота
      return null
    }
  })

  // Собираем результаты инициализации и фильтруем null-значения
  const botResults = await Promise.all(botPromises)
  const validBots = botResults.filter(Boolean) as Bot[]

  // Подсчитываем успешно и неуспешно инициализированные боты
  const successCount = validBots.length
  const failCount = botResults.length - successCount

  logger.info('✅ Инициализация ботов завершена', {
    description: 'Bot initialization completed',
    total_bots: botResults.length,
    success_count: successCount,
    fail_count: failCount,
    success_rate: `${Math.round((successCount / botResults.length) * 100)}%`,
  })

  if (failCount > 0) {
    logger.warn('⚠️ Не все боты были успешно инициализированы', {
      description: 'Not all bots were successfully initialized',
      fail_count: failCount,
      success_count: successCount,
    })
  }

  if (successCount === 0) {
    logger.error('❌ Критическая ошибка: Ни один бот не был инициализирован', {
      description: 'Critical error: No bots were initialized',
    })
  }

  return validBots
}
