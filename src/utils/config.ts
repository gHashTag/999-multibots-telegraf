import fs from 'fs'
import path from 'path'
// import dotenv from 'dotenv' // Removed static import
import { botLogger, logSecurityEvent } from './logger'
import crypto from 'crypto'

// Load .env file only in non-production environments
if (process.env.NODE_ENV !== 'production') {
  // Use require for conditional loading
  try {
    const dotenv = require('dotenv')
    dotenv.config()
  } catch (error) {
    console.error(
      'Failed to load dotenv in non-production environment (require):',
      error
    )
  }
}

/**
 * Интерфейс для конфигурации бота
 */
export interface BotConfig {
  name: string
  token: string
  enabled: boolean
  webhookOptions?: {
    enabled: boolean
    path: string
  }
  securityOptions?: {
    ipWhitelist?: string[]
    requestRateLimit?: number
    isolationMode?: 'strict' | 'loose' | 'shared'
  }
}

/**
 * Конфигурация безопасности приложения
 */
export interface SecurityConfig {
  secretKey: string
  rateLimit: {
    windowMs: number
    max: number
  }
  ipWhitelist: string[]
  enableIpFilter: boolean
  tokenValidation: boolean
}

/**
 * Проверяет валидность токена Telegram бота
 * @param token - токен для проверки
 * @returns true если токен имеет правильный формат, иначе false
 */
export function validateToken(token: string): boolean {
  // Проверяем на null или пустую строку
  if (!token || token.trim() === '') {
    return false
  }

  // Стандартный формат токена: число:строка где строка - base64url
  const parts = token.split(':')
  if (parts.length !== 2) {
    return false
  }

  // Первая часть должна быть числом
  const numericPart = Number(parts[0])
  if (isNaN(numericPart)) {
    return false
  }

  // Вторая часть должна быть как минимум 30 символов и содержать только
  // символы, допустимые в base64url (A-Z, a-z, 0-9, -, _)
  const base64Part = parts[1]
  if (base64Part.length < 30 || !/^[A-Za-z0-9\-_]+$/.test(base64Part)) {
    return false
  }

  return true
}

/**
 * Безопасно загружает конфигурацию ботов из файла
 * @param configPath - путь к файлу конфигурации
 * @returns массив конфигураций ботов
 */
export function loadBotsConfig(configPath = 'config/bots.json'): BotConfig[] {
  try {
    // Проверяем существование файла
    const fullPath = path.resolve(process.cwd(), configPath)
    if (!fs.existsSync(fullPath)) {
      botLogger.error('Config', `Файл конфигурации не найден: ${fullPath}`)
      return []
    }

    // Читаем и парсим JSON
    const configData = fs.readFileSync(fullPath, 'utf8')
    const botsConfig: BotConfig[] = JSON.parse(configData)

    // Проверяем токены и отключаем боты с невалидными токенами
    const validatedConfig = botsConfig.map(bot => {
      if (!validateToken(bot.token)) {
        botLogger.error(bot.name, 'Невалидный токен, бот отключен')
        logSecurityEvent('invalid_token', { botName: bot.name }, 'error')
        return { ...bot, enabled: false }
      }
      return bot
    })

    // Проверяем наличие дублирующихся имен ботов
    const botNames = validatedConfig.map(bot => bot.name)
    const duplicateNames = botNames.filter(
      (name, index) => botNames.indexOf(name) !== index
    )

    if (duplicateNames.length > 0) {
      botLogger.error(
        'Config',
        `Обнаружены дублирующиеся имена ботов: ${duplicateNames.join(', ')}`
      )

      // Отключаем дубликаты, оставляя только первое вхождение
      const processedNames = new Set<string>()

      return validatedConfig.map(bot => {
        if (processedNames.has(bot.name)) {
          botLogger.error(
            bot.name,
            'Дублирующееся имя бота, этот экземпляр отключен'
          )
          return { ...bot, enabled: false }
        }

        processedNames.add(bot.name)
        return bot
      })
    }

    return validatedConfig
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    botLogger.error('Config', `Ошибка загрузки конфигурации: ${errorMessage}`)
    logSecurityEvent('config_load_error', { errorMessage }, 'error')

    // В случае ошибки возвращаем пустой массив
    return []
  }
}

/**
 * Генерирует безопасный ключ для приложения
 */
export function generateSecretKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Загружает конфигурацию безопасности
 */
export function loadSecurityConfig(): SecurityConfig {
  // Значения по умолчанию
  const defaultConfig: SecurityConfig = {
    secretKey: process.env.SECRET_KEY || generateSecretKey(),
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 минут
      max: 100, // 100 запросов за 15 минут
    },
    ipWhitelist: [],
    enableIpFilter: false,
    tokenValidation: true,
  }

  // Пытаемся загрузить конфигурацию из файла
  try {
    const configPath = path.resolve(process.cwd(), 'config/security.json')

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8')
      const fileConfig = JSON.parse(configData)

      // Объединяем с значениями по умолчанию
      return {
        ...defaultConfig,
        ...fileConfig,
        rateLimit: {
          ...defaultConfig.rateLimit,
          ...(fileConfig.rateLimit || {}),
        },
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    botLogger.error(
      'SecurityConfig',
      `Ошибка загрузки конфигурации безопасности: ${errorMessage}`
    )
    logSecurityEvent('security_config_load_error', { errorMessage }, 'error')
  }

  return defaultConfig
}

/**
 * Получает конфигурацию вебхуков из переменных окружения
 */
export function getWebhookConfig() {
  return {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    domain: process.env.WEBHOOK_DOMAIN || '',
    path: process.env.WEBHOOK_PATH || '/webhook',
    port: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
  }
}

/**
 * Получает токены ботов из различных источников (env, файлы)
 * @returns Массив токенов
 */
export function getBotTokens(): string[] {
  const tokens: string[] = []

  // 1. Проверяем переменные окружения
  const envToken = process.env.BOT_TOKEN
  const envTokens = process.env.BOT_TOKENS

  if (envToken && validateToken(envToken)) {
    tokens.push(envToken)
  }

  if (envTokens) {
    // Разбиваем строку токенов по запятым или пробелам
    const tokenArray = envTokens.split(/[,\s]+/).filter(Boolean)

    for (const token of tokenArray) {
      if (validateToken(token) && !tokens.includes(token)) {
        tokens.push(token)
      } else if (!validateToken(token)) {
        botLogger.warn(
          'Config',
          `Невалидный токен найден в BOT_TOKENS: ${maskToken(token)}`
        )
      }
    }
  }

  // 2. Загружаем конфигурацию из файла
  const botsConfig = loadBotsConfig()

  // Добавляем токены из конфигурации
  for (const bot of botsConfig) {
    if (
      bot.enabled &&
      validateToken(bot.token) &&
      !tokens.includes(bot.token)
    ) {
      tokens.push(bot.token)
    }
  }

  // 3. Проверяем файл .env.local если он существует (БОЛЬШЕ НЕ НУЖНО)
  const localEnvPath = path.resolve(process.cwd(), '.env.local')
  // // Load .env.local only in non-production environments
  // if (process.env.NODE_ENV !== 'production' && fs.existsSync(localEnvPath)) {
  //   try {
  //     // Use require here as well for parse
  //     const dotenv = require('dotenv');
  //     localEnvConfig = dotenv.parse(fs.readFileSync(localEnvPath))
  //     botLogger.info('Config', 'Loaded local environment variables from .env.local')
  //   } catch (error) {
  //     botLogger.error('Config', 'Error parsing .env.local:', error)
  //   }
  // }

  // Now only use process.env as envConfig
  const envConfig = { ...process.env } as any // Type assertion still needed for process.env potentially

  // Check BOT_TOKEN from combined env (now just process.env)
  if (
    envConfig.BOT_TOKEN &&
    validateToken(envConfig.BOT_TOKEN) &&
    !tokens.includes(envConfig.BOT_TOKEN)
  ) {
    tokens.push(envConfig.BOT_TOKEN)
  }

  // Check BOT_TOKENS from combined env (now just process.env)
  if (envConfig.BOT_TOKENS) {
    const localTokenArray = envConfig.BOT_TOKENS.split(/[,\s]+/).filter(Boolean)

    for (const token of localTokenArray) {
      if (validateToken(token) && !tokens.includes(token)) {
        tokens.push(token)
      }
    }
  }

  // 4. Проверяем папку secrets, если она существует
  const secretsDir = path.resolve(process.cwd(), 'secrets')
  if (fs.existsSync(secretsDir)) {
    try {
      const files = fs.readdirSync(secretsDir)
      for (const file of files) {
        if (file.startsWith('bot_token')) {
          try {
            const token = fs
              .readFileSync(path.join(secretsDir, file), 'utf8')
              .trim()
            if (validateToken(token) && !tokens.includes(token)) {
              tokens.push(token)
            }
          } catch (fileError) {
            botLogger.error(
              'Config',
              `Ошибка при чтении файла токена ${file}: ${
                fileError instanceof Error
                  ? fileError.message
                  : String(fileError)
              }`
            )
          }
        }
      }
    } catch (dirError) {
      botLogger.error(
        'Config',
        `Ошибка при чтении директории secrets: ${
          dirError instanceof Error ? dirError.message : String(dirError)
        }`
      )
    }
  }

  // Логируем итоги
  botLogger.info('Config', `Найдено ${tokens.length} уникальных токенов бота`)

  // Проверяем, все ли в порядке с токенами
  if (tokens.length === 0) {
    botLogger.error(
      'Config',
      'Не найдено ни одного валидного токена. Проверьте конфигурацию.'
    )
    logSecurityEvent('no_valid_tokens', {}, 'error')
  }

  return tokens
}

/**
 * Маскирует токен для безопасного логирования
 * @param token Токен бота
 * @returns Маскированный токен (видны только первые 5 и последние 4 символа)
 */
function maskToken(token: string): string {
  if (!token || token.length < 10) {
    return '***masked***'
  }

  const visibleStart = 5
  const visibleEnd = 4
  const masked = '*'.repeat(
    Math.max(0, token.length - visibleStart - visibleEnd)
  )

  return `${token.substring(0, visibleStart)}${masked}${token.substring(
    token.length - visibleEnd
  )}`
}

// Экспортируем объект с конфигурацией
export const config = {
  isDev: process.env.NODE_ENV !== 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  webhookConfig: getWebhookConfig(),
  securityConfig: loadSecurityConfig(),
}

/**
 * Загружает полную конфигурацию ботов для запуска
 * @returns Конфигурация ботов для запуска
 */
export function loadConfig() {
  // Получаем токены ботов
  const tokens = getBotTokens()

  if (tokens.length === 0) {
    botLogger.error('Config', 'Не найдено ни одного валидного токена бота')
    return { success: 0, failed: 0, bots: [] }
  }

  // Получаем настройки вебхука
  const webhookConfig = getWebhookConfig()

  // Формируем конфигурацию для запуска
  const bots = tokens.map((token, index) => {
    return {
      id: `bot${index + 1}`,
      token,
    }
  })

  botLogger.info('Config', `Подготовлено ${bots.length} ботов для запуска`)

  return {
    success: 0,
    failed: 0,
    bots,
    webhookConfig,
  }
}

export default config
