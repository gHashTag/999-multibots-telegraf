/**
 * 🔐 INFISICAL CLOUD-FIRST SECRET MANAGER
 *
 * ✅ ВСЕ секреты загружаются ТОЛЬКО из Infisical (облако)
 * ❌ НЕТ fallback на локальный .env файл
 * 🚀 Полная централизация секретов в облаке
 *
 * Требуется ТОЛЬКО 3 переменные окружения для подключения:
 * - INFISICAL_CLIENT_ID
 * - INFISICAL_CLIENT_SECRET
 * - INFISICAL_PROJECT_ID
 *
 * Все остальные секреты загружаются автоматически из Infisical!
 * Документация: https://infisical.com/docs/sdks/node
 */

// Правильный импорт для Infisical SDK v4
import { InfisicalSDK } from '@infisical/sdk'
import { logger } from '@/utils/logger'

// Интерфейс для секретов
export interface SecretCache {
  [key: string]: string
}

// Singleton instance клиента
let infisicalClient: InfisicalSDK | null = null
let isAuthenticated = false
let secretCache: SecretCache = {}

// 🔐 ПОДДЕРЖКА ТРЕХ ОКРУЖЕНИЙ: development, staging, production
// Environment detection с поддержкой трех окружений
const isDev = process.env.NODE_ENV !== 'production'
const environment = (process.env.INFISICAL_ENVIRONMENT || (isDev ? 'dev' : 'prod')) as 'dev' | 'staging' | 'prod'

/**
 * 🚀 Инициализация Infisical и загрузка ВСЕХ секретов
 *
 * Эта функция должна быть вызвана ПЕРЕД запуском приложения!
 * Она загрузит все секреты в память для быстрого доступа.
 */
export async function initInfisical(): Promise<void> {
  logger.info('[Infisical] 🔐 Initializing cloud-first secret manager...')

  // Проверяем наличие ТОЛЬКО credentials для Infisical
  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID

  if (!clientId || !clientSecret || !projectId) {
    const error = new Error('❌ CRITICAL: Infisical credentials missing! Application cannot start.')
    logger.error('[Infisical] Missing required credentials:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasProjectId: !!projectId,
      message: 'Set INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID'
    })
    throw error
  }

  try {
    // 🔥 Проверяем наличие Service Token (приоритет над Universal Auth)
    const serviceToken = process.env.INFISICAL_SERVICE_TOKEN

    // Создаем клиент Infisical SDK
    infisicalClient = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
    })

    if (serviceToken) {
      logger.info('[Infisical] Authenticating with Service Token...')
      // Используем accessToken метод для установки service token
      infisicalClient.auth().accessToken(serviceToken)
    } else {
      // Fallback: Авторизация через Universal Auth (Machine Identity)
      logger.info('[Infisical] Authenticating with Universal Auth...')
      await infisicalClient.auth().universalAuth.login({
        clientId,
        clientSecret
      })
    }

    isAuthenticated = true
    logger.info('[Infisical] ✅ Authentication successful')

    // 🔥 ЗАГРУЖАЕМ ВСЕ СЕКРЕТЫ СРАЗУ В ПАМЯТЬ
    await loadAllSecrets()

    logger.info('[Infisical] ✅ Cloud-first initialization complete', {
      projectId,
      environment,
      secretsLoaded: Object.keys(secretCache).length,
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
    })
  } catch (error) {
    logger.error('[Infisical] ❌ Authentication failed:', {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      projectId,
      environment,
      stack: error instanceof Error ? error.stack : undefined,
      clientIdLength: clientId.length,
      clientSecretLength: clientSecret.length,
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
    })

    const err = new Error(`❌ CRITICAL: Infisical authentication failed! ${error instanceof Error ? error.message : String(error)}`)
    throw err
  }
}

/**
 * 🔥 Загрузить ВСЕ секреты из Infisical в память
 * Это происходит один раз при старте приложения
 */
async function loadAllSecrets(): Promise<void> {
  if (!infisicalClient || !isAuthenticated) {
    throw new Error('Infisical client not initialized')
  }

  const projectId = process.env.INFISICAL_PROJECT_ID!

  try {
    logger.info('[Infisical] 📥 Loading all secrets from cloud...')

    // Получаем ВСЕ секреты из root path (правильный метод для SDK v4)
    const result = await infisicalClient.secrets().listSecrets({
      projectId,
      environment,
      secretPath: '/'
    })

    // Сохраняем в кэш И в process.env для совместимости с библиотеками
    secretCache = {}

    // 🔥 Fly.io secrets that should NOT be overridden by Infisical
    // These are set via `flyctl secrets set` and take precedence
    const flySecrets = new Set([
      'INNGEST_SERVE_ORIGIN',  // Must match Fly.io app URL
      'BASE_WEBHOOK_URL',      // Webhook URL for Replicate callbacks
    ])

    // Save current Fly.io secret values before Infisical override
    const flySecretValues: Record<string, string> = {}
    for (const key of flySecrets) {
      if (process.env[key]) {
        flySecretValues[key] = process.env[key]!
      }
    }

    for (const secret of result.secrets) {
      secretCache[secret.secretKey] = secret.secretValue
      // 🔥 CRITICAL: Не перезаписываем Fly.io секреты
      if (flySecrets.has(secret.secretKey) && flySecretValues[secret.secretKey]) {
        logger.info(`[Infisical] ⚠️ Preserving Fly.io secret: ${secret.secretKey}`)
        continue
      }
      // Также записываем в process.env для совместимости
      // с библиотеками типа Inngest, которые читают напрямую из process.env
      process.env[secret.secretKey] = secret.secretValue
    }

    // 🔥 Логируем наличие критических ключей
    const criticalKeys = ['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY', 'SUPABASE_SERVICE_KEY']
    const missingCritical = criticalKeys.filter(k => !secretCache[k])

    logger.info('[Infisical] ✅ All secrets loaded into memory and process.env', {
      count: result.secrets.length,
      keys: Object.keys(secretCache).slice(0, 10).join(', ') + '...',
      inngestKeys: {
        INNGEST_EVENT_KEY: !!secretCache['INNGEST_EVENT_KEY'],
        INNGEST_SIGNING_KEY: !!secretCache['INNGEST_SIGNING_KEY'],
        RENDER_INNGEST_EVENT_KEY: !!secretCache['RENDER_INNGEST_EVENT_KEY'],
      },
      missingCriticalKeys: missingCritical.length > 0 ? missingCritical : 'none'
    })

    if (missingCritical.length > 0) {
      logger.warn('[Infisical] ⚠️ Missing critical secrets!', {
        missing: missingCritical,
        hint: 'Add these secrets to Infisical'
      })
    }
  } catch (error) {
    logger.error('[Infisical] ❌ Failed to load secrets', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

/**
 * ⚡ Получить секрет из кэша (БЫСТРО)
 *
 * @param secretName - Имя секрета в Infisical
 * @returns Значение секрета
 * @throws Error если секрет не найден
 */
export function getSecret(secretName: string): string {
  const value = secretCache[secretName]

  if (value === undefined) {
    logger.error(`[Infisical] ❌ Secret "${secretName}" not found in cache!`, {
      availableSecrets: Object.keys(secretCache).length,
      requestedSecret: secretName
    })
    throw new Error(`Secret "${secretName}" not found in Infisical`)
  }

  return value
}

/**
 * ⚡ Получить секрет с fallback значением (для опциональных секретов)
 *
 * @param secretName - Имя секрета
 * @param defaultValue - Значение по умолчанию если секрет не найден
 * @returns Значение секрета или defaultValue
 */
export function getSecretOrDefault(secretName: string, defaultValue: string): string {
  const value = secretCache[secretName]

  if (value === undefined) {
    logger.warn(`[Infisical] ⚠️ Secret "${secretName}" not found, using default value`)
    return defaultValue
  }

  return value
}

/**
 * ⚡ Получить несколько секретов разом
 *
 * @param secretNames - Массив имен секретов
 * @returns Объект с парами ключ-значение
 * @throws Error если хотя бы один секрет не найден
 */
export function getSecrets(secretNames: string[]): Record<string, string> {
  const results: Record<string, string> = {}
  const missingSecrets: string[] = []

  for (const name of secretNames) {
    const value = secretCache[name]
    if (value === undefined) {
      missingSecrets.push(name)
    } else {
      results[name] = value
    }
  }

  if (missingSecrets.length > 0) {
    logger.error(`[Infisical] ❌ Missing secrets:`, {
      missing: missingSecrets,
      available: Object.keys(secretCache).length
    })
    throw new Error(`Secrets not found: ${missingSecrets.join(', ')}`)
  }

  return results
}

/**
 * 🔄 Перезагрузить все секреты из Infisical
 * Используйте если секреты были обновлены в Infisical
 */
export async function reloadSecrets(): Promise<void> {
  logger.info('[Infisical] 🔄 Reloading secrets from cloud...')
  await loadAllSecrets()
  logger.info('[Infisical] ✅ Secrets reloaded successfully')
}

/**
 * 📊 Получить статистику загруженных секретов
 */
export function getSecretsStats(): {
  totalSecrets: number
  secretKeys: string[]
  authenticated: boolean
  environment: string
} {
  return {
    totalSecrets: Object.keys(secretCache).length,
    secretKeys: Object.keys(secretCache),
    authenticated: isAuthenticated,
    environment
  }
}

/**
 * ✅ Проверка готовности Infisical
 */
export function isInfisicalReady(): boolean {
  return infisicalClient !== null && isAuthenticated && Object.keys(secretCache).length > 0
}
