#!/usr/bin/env tsx
/**
 * Очистка мёртвых переменных во ВСЕХ окружениях
 */

import { config } from 'dotenv'
import { InfisicalSDK } from '@infisical/sdk'

config()

// Список мёртвых переменных (одинаковый для всех окружений)
const DEAD_VARIABLES = [
  // API Keys (не используются)
  'ANTHROPIC_API_KEY',
  'BFL_API_KEY',
  'CREATOMATE_API_KEY',
  'E2B_API_KEY',
  'GLAMA_API_KEY',
  'MINIMAX_API_KEY',
  'NPM_TOKEN',
  'PIXEL_API_KEY',
  'RUNWAY_API_KEY',
  'SECRET_TOKEN',
  'ZEP_API_KEY',

  // Docker переменные (не нужны)
  'DOCKER_CLI_HINTS',
  'DOCKER_CONFIG',
  'DOCKER_CONTEXT',
  'DOCKER_DESKTOP_CHECK',
  'DOCKER_DESKTOP_DISABLED',
  'DOCKER_DESKTOP_ENABLED',
  'DOCKER_DESKTOP_LOGIN_CHECK',
  'DOCKER_HOST',
  'DOCKER_NETWORK',
  'DOCKER_SOCKET',

  // Старые конфиги
  'ALLOWED_COMMANDS',
  'ALLOWED_DIR',
  'ALLOWED_FLAGS',
  'API_HASH',
  'API_ID',
  'API_PORT',
  'BFL_WEBHOOK_SECRET',
  'BFL_WEBHOOK_URL',
  'BOT_OWNER_ID',
  'BOT_PATH',
  'COMMAND_TIMEOUT',
  'ELEVENLABS_VOICE_ID',
  'GITHUB_USERNAME',
  'HOST_DIR',
  'LOG_FORMAT',
  'MAX_COMMAND_LENGTH',
  'MCP_MODE',
  'MERCHANT_LOGIN',
  'MODE',
  'PHONE_NUMBER',
  'PINATA_GATEWAY',
  'PINATA_JWT',
  'PLATFORM',
  'RENDER_INNGEST_BASE_URL',
  'RESULT_URL2',
  'ROBOKASSA_PASSWORD_1',
  'ROBOKASSA_PASSWORD_2',
  'SERVER_PORT',
  'SUPABASE_KEY', // Дубликат SUPABASE_SERVICE_KEY
  'TELEGRAM_API_HASH',
  'TELEGRAM_API_ID',
  'TEST_PASSWORD1',
  'TEST_PASSWORD2',
  'TEST_TELEGRAM_ID',
  'USE_PRODUCTION_API',
  'USE_SERVE',
  'WORKSPACE_DIR',
]

async function cleanupEnvironment(
  client: InfisicalSDK,
  projectId: string,
  environment: 'dev' | 'staging' | 'prod'
) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🗑️  ОЧИСТКА: ${environment.toUpperCase()}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  let deleted = 0
  let notFound = 0
  let errors = 0

  for (const varName of DEAD_VARIABLES) {
    try {
      // Проверяем существование
      const allSecrets = await client.secrets().listSecrets({
        projectId,
        environment,
        secretPath: '/',
      })

      const exists = allSecrets.secrets.some(s => s.secretKey === varName)

      if (!exists) {
        notFound++
        continue
      }

      // Удаляем
      await client.secrets().deleteSecret(varName, {
        projectId,
        environment,
        secretPath: '/',
      })

      console.log(`  ✅ ${varName}`)
      deleted++
    } catch (error: any) {
      console.error(`  ❌ ${varName}: ${error.message}`)
      errors++
    }
  }

  console.log(`\n📊 Результаты для ${environment}:`)
  console.log(`  ✅ Удалено:          ${deleted}`)
  console.log(`  ⏭️  Уже отсутствовали: ${notFound}`)
  console.log(`  ❌ Ошибки:           ${errors}`)

  return { deleted, notFound, errors }
}

async function cleanupAll() {
  console.log('🗑️  Очистка мёртвых переменных во ВСЕХ окружениях...\n')

  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID

  if (!clientId || !clientSecret || !projectId) {
    console.error('❌ ОШИБКА: Отсутствуют Infisical credentials')
    process.exit(1)
  }

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
  })

  console.log('🔐 Авторизация в Infisical...')
  await client.auth().universalAuth.login({ clientId, clientSecret })
  console.log('✅ Авторизация успешна')

  console.log(`📦 Всего мёртвых переменных для удаления: ${DEAD_VARIABLES.length}`)

  const environments = ['dev', 'staging', 'prod'] as const
  const totalStats = { deleted: 0, notFound: 0, errors: 0 }

  for (const env of environments) {
    const stats = await cleanupEnvironment(client, projectId, env)
    totalStats.deleted += stats.deleted
    totalStats.notFound += stats.notFound
    totalStats.errors += stats.errors
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА')
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`✅ Всего удалено:          ${totalStats.deleted}`)
  console.log(`⏭️  Всего уже отсутствовали: ${totalStats.notFound}`)
  console.log(`❌ Всего ошибок:           ${totalStats.errors}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  if (totalStats.deleted > 0) {
    console.log('✨ Очистка завершена! Все окружения стали чище.')
  } else {
    console.log('ℹ️  Все мёртвые переменные уже были удалены ранее.')
  }
}

cleanupAll().catch(console.error)
