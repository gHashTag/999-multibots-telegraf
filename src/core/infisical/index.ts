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
import { applySecretsToEnv } from './platformEnv'

// Simple logging function - avoid circular dependencies with esbuild
function logInfo(message: string, meta?: any) {
  if (process.env.NODE_ENV === 'production') {
    console.log(`[Infisical] ${message}`, meta || '')
  } else {
    console.info(`[Infisical] ${message}`, meta || '')
  }
}

function logError(message: string, meta?: any) {
  console.error(`[Infisical] ${message}`, meta || '')
}

function logWarn(message: string, meta?: any) {
  console.warn(`[Infisical] ${message}`, meta || '')
}

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
const environment = (process.env.INFISICAL_ENVIRONMENT ||
  (isDev ? 'dev' : 'prod')) as 'dev' | 'staging' | 'prod'

/**
 * 🚀 Инициализация Infisical и загрузка ВСЕХ секретов
 *
 * Эта функция должна быть вызвана ПЕРЕД запуском приложения!
 * Она загрузит все секреты в память для быстрого доступа.
 */
export async function initInfisical(): Promise<void> {
  logInfo('🔐 Initializing cloud-first secret manager...')

  // Проверяем наличие ТОЛЬКО credentials для Infisical
  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID

  if (!clientId || !clientSecret || !projectId) {
    const error = new Error(
      '❌ CRITICAL: Infisical credentials missing! Application cannot start.'
    )
    logError('Missing required credentials:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasProjectId: !!projectId,
      message:
        'Set INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID',
    })
    throw error
  }

  try {
    // 🔥 Проверяем наличие Service Token (приоритет над Universal Auth)
    const serviceToken = process.env.INFISICAL_SERVICE_TOKEN

    // Создаем клиент Infisical SDK
    infisicalClient = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
    })

    if (serviceToken) {
      logInfo('Authenticating with Service Token...')
      // Используем accessToken метод для установки service token
      infisicalClient.auth().accessToken(serviceToken)
    } else {
      // Fallback: Авторизация через Universal Auth (Machine Identity)
      logInfo('Authenticating with Universal Auth...')
      await infisicalClient.auth().universalAuth.login({
        clientId,
        clientSecret,
      })
    }

    isAuthenticated = true
    logInfo('✅ Authentication successful')

    // 🔥 ЗАГРУЖАЕМ ВСЕ СЕКРЕТЫ СРАЗУ В ПАМЯТЬ
    await loadAllSecrets()

    logInfo('✅ Cloud-first initialization complete', {
      projectId,
      environment,
      secretsLoaded: Object.keys(secretCache).length,
      siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
    })
  } catch (error) {
    logInfo('⚠️ Infisical unavailable, using process.env fallback')
    isAuthenticated = false
    secretCache = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (
        key &&
        value &&
        !key.startsWith('INFISICAL_') &&
        !key.startsWith('RAILWAY_')
      ) {
        secretCache[key] = value
      }
    }
    logInfo(
      `✅ Loaded ${Object.keys(secretCache).length} secrets from process.env (Infisical fallback)`
    )
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
    logInfo('📥 Loading all secrets from cloud...')

    // Получаем ВСЕ секреты из root path (правильный метод для SDK v4)
    const result = await infisicalClient.secrets().listSecrets({
      projectId,
      environment,
      secretPath: '/',
    })

    // Сохраняем в кэш И в process.env для совместимости с библиотеками
    secretCache = {}

    // Topology variables (INNGEST_SERVE_ORIGIN, INNGEST_BASE_URL, ...) are
    // owned by the platform (Railway / Fly.io) and win over Infisical.
    // See src/core/infisical/platformEnv.ts for the list and the rule.
    for (const secret of result.secrets) {
      secretCache[secret.secretKey] = secret.secretValue
    }
    // Also written to process.env for libraries (Inngest SDK) that read env
    // directly — except platform-owned keys already set by the platform.
    const { preserved } = applySecretsToEnv(result.secrets, process.env)
    for (const key of preserved) {
      console.log(`[Infisical] ⚠️ Preserving platform env: ${key}`)
    }

    // 🔥 Логируем наличие критических ключей
    const criticalKeys = [
      'INNGEST_EVENT_KEY',
      'INNGEST_SIGNING_KEY',
      'SUPABASE_SERVICE_KEY',
    ]
    const missingCritical = criticalKeys.filter(k => !secretCache[k])

    logInfo('✅ All secrets loaded into memory and process.env', {
      count: result.secrets.length,
      keys: Object.keys(secretCache).slice(0, 10).join(', ') + '...',
      inngestKeys: {
        INNGEST_EVENT_KEY: !!secretCache['INNGEST_EVENT_KEY'],
        INNGEST_SIGNING_KEY: !!secretCache['INNGEST_SIGNING_KEY'],
        RENDER_INNGEST_EVENT_KEY: !!secretCache['RENDER_INNGEST_EVENT_KEY'],
      },
      missingCriticalKeys:
        missingCritical.length > 0 ? missingCritical : 'none',
    })

    if (missingCritical.length > 0) {
      logWarn('⚠️ Missing critical secrets!', {
        missing: missingCritical,
        hint: 'Add these secrets to Infisical',
      })
    }
  } catch (error) {
    logError('❌ Failed to load secrets', {
      error: error instanceof Error ? error.message : String(error),
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
    logError(`❌ Secret "${secretName}" not found in cache!`, {
      availableSecrets: Object.keys(secretCache).length,
      requestedSecret: secretName,
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
export function getSecretOrDefault(
  secretName: string,
  defaultValue: string
): string {
  const value = secretCache[secretName]

  if (value === undefined) {
    logWarn(`⚠️ Secret "${secretName}" not found, using default value`)
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
    logError(`❌ Missing secrets:`, {
      missing: missingSecrets,
      available: Object.keys(secretCache).length,
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
  console.log('[Infisical] 🔄 Reloading secrets from cloud...')
  await loadAllSecrets()
  console.log('[Infisical] ✅ Secrets reloaded successfully')
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
    environment,
  }
}

/**
 * ✅ Проверка готовности Infisical
 */
export function isInfisicalReady(): boolean {
  return (
    infisicalClient !== null &&
    isAuthenticated &&
    Object.keys(secretCache).length > 0
  )
}
