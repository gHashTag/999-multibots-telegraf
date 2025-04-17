import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from './logger'

interface TokenData {
  token: string
  encryptedAt: string
}

interface TokenStorage {
  [botName: string]: TokenData
}

// Путь к файлу хранения зашифрованных токенов
const TOKENS_FILE = path.join(process.cwd(), 'data', 'encrypted_tokens.json')

// Убедимся, что директория существует
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Логирование событий безопасности
const logSecurityEvent = (
  eventType: string,
  details: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'warn'
) => {
  logger[level](`[SECURITY] Событие безопасности: ${eventType}`, {
    ...details,
    timestamp: new Date().toISOString(),
    eventType,
  })
}

// Получаем ключ шифрования из переменных окружения или генерируем временный
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY

  if (!envKey) {
    // В реальном приложении не следует генерировать ключ каждый раз
    // Но для демонстрации мы обеспечим минимальную безопасность
    logger.warn(
      '[SECURITY] ENCRYPTION_KEY не найден в переменных окружения. Будет использован временный ключ!'
    )

    // Логируем событие безопасности
    logSecurityEvent(
      'missing_encryption_key',
      { message: 'Отсутствует ключ шифрования токенов в переменных окружения' },
      'warn'
    )

    // Используем фиксированную строку в качестве соли для генерации ключа (не идеально)
    const tempKey = crypto
      .createHash('sha256')
      .update(process.env.NODE_ENV || 'development')
      .digest()

    return tempKey
  }

  return Buffer.from(envKey, 'hex')
}

// Шифрование токена
const encryptToken = (token: string): TokenData => {
  try {
    const iv = crypto.randomBytes(16) // Инициализирующий вектор
    const key = getEncryptionKey()

    // Используем правильную типизацию для crypto API
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      key as crypto.CipherKey,
      iv
    )
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Сохраняем IV вместе с шифротекстом
    const encryptedToken = `${iv.toString('hex')}:${encrypted}`

    return {
      token: encryptedToken,
      encryptedAt: new Date().toISOString(),
    }
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при шифровании токена: ${error instanceof Error ? error.message : String(error)}`
    )
    logSecurityEvent(
      'token_encryption_failed',
      { error: error instanceof Error ? error.message : String(error) },
      'error'
    )
    throw new Error('Не удалось зашифровать токен')
  }
}

// Расшифровка токена
const decryptToken = (encryptedData: TokenData): string => {
  try {
    const { token } = encryptedData
    const [ivHex, encryptedToken] = token.split(':')

    const iv = Buffer.from(ivHex, 'hex')
    const key = getEncryptionKey()

    // Используем правильную типизацию для crypto API
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      key as crypto.CipherKey,
      iv
    )
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при расшифровке токена: ${error instanceof Error ? error.message : String(error)}`
    )
    logSecurityEvent(
      'token_decryption_failed',
      { error: error instanceof Error ? error.message : String(error) },
      'error'
    )
    throw new Error('Не удалось расшифровать токен')
  }
}

// Загрузка хранилища токенов
const loadTokenStorage = (): TokenStorage => {
  try {
    if (!fs.existsSync(TOKENS_FILE)) {
      return {}
    }

    const data = fs.readFileSync(TOKENS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при загрузке токенов: ${error instanceof Error ? error.message : String(error)}`
    )
    return {}
  }
}

// Сохранение хранилища токенов
const saveTokenStorage = (storage: TokenStorage): void => {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(storage, null, 2))
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при сохранении токенов: ${error instanceof Error ? error.message : String(error)}`
    )
    logSecurityEvent(
      'token_storage_write_failed',
      { error: error instanceof Error ? error.message : String(error) },
      'error'
    )
  }
}

/**
 * Сохраняет токен бота в зашифрованном виде
 * @param botName Имя бота
 * @param token Токен бота
 */
export const storeToken = (botName: string, token: string): void => {
  try {
    const storage = loadTokenStorage()

    // Проверяем правильность формата токена перед шифрованием
    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(token)) {
      logger.warn(
        `[SECURITY] Токен для бота ${botName} имеет неправильный формат`
      )
      logSecurityEvent('invalid_token_format', { botName }, 'warn')
    }

    // Шифруем и сохраняем токен
    storage[botName] = encryptToken(token)
    saveTokenStorage(storage)

    logger.info(`[SECURITY] Токен для бота ${botName} успешно сохранен`)
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при сохранении токена для ${botName}: ${error instanceof Error ? error.message : String(error)}`
    )
    logSecurityEvent(
      'token_store_failed',
      {
        botName,
        error: error instanceof Error ? error.message : String(error),
      },
      'error'
    )
  }
}

/**
 * Получает токен бота из хранилища
 * @param botName Имя бота
 * @returns Расшифрованный токен или undefined, если токен не найден
 */
export const getToken = (botName: string): string | undefined => {
  try {
    const storage = loadTokenStorage()
    const encryptedData = storage[botName]

    if (!encryptedData) {
      logger.warn(`[SECURITY] Токен для бота ${botName} не найден в хранилище`)
      return undefined
    }

    return decryptToken(encryptedData)
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при получении токена для ${botName}: ${error instanceof Error ? error.message : String(error)}`
    )
    logSecurityEvent(
      'token_retrieval_failed',
      {
        botName,
        error: error instanceof Error ? error.message : String(error),
      },
      'error'
    )
    return undefined
  }
}

/**
 * Удаляет токен бота из хранилища
 * @param botName Имя бота
 */
export const removeToken = (botName: string): void => {
  try {
    const storage = loadTokenStorage()

    if (storage[botName]) {
      delete storage[botName]
      saveTokenStorage(storage)
      logger.info(`[SECURITY] Токен для бота ${botName} успешно удален`)
    } else {
      logger.warn(
        `[SECURITY] Попытка удаления несуществующего токена для бота ${botName}`
      )
    }
  } catch (error) {
    logger.error(
      `[SECURITY] Ошибка при удалении токена для ${botName}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Проверяет, существует ли токен для указанного бота
 * @param botName Имя бота
 * @returns true, если токен существует, иначе false
 */
export const hasToken = (botName: string): boolean => {
  const storage = loadTokenStorage()
  return !!storage[botName]
}

/**
 * Получает список имен ботов, для которых есть сохраненные токены
 * @returns Массив имен ботов
 */
export const getStoredBotNames = (): string[] => {
  const storage = loadTokenStorage()
  return Object.keys(storage)
}
