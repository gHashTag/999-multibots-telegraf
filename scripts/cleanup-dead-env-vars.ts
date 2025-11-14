#!/usr/bin/env tsx
/**
 * Автоматически удаляет мёртвые переменные из Infisical
 * (переменные, которые есть в Infisical, но не используются в коде)
 */

import { config } from 'dotenv'
import { execSync } from 'child_process'
import path from 'path'
import { InfisicalSDK } from '@infisical/sdk'

config()

// Список мёртвых переменных для удаления
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
  'SUPABASE_KEY',
  'TELEGRAM_API_HASH',
  'TELEGRAM_API_ID',
  'TEST_PASSWORD1',
  'TEST_PASSWORD2',
  'TEST_TELEGRAM_ID',
  'USE_PRODUCTION_API',
  'USE_SERVE',
  'WORKSPACE_DIR',
]

async function cleanupDeadVars() {
  console.log('🗑️  Очистка мёртвых переменных из Infisical...\n')

  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID
  const environment = process.env.INFISICAL_ENVIRONMENT || 'dev'

  if (!clientId || !clientSecret || !projectId) {
    console.error('❌ ОШИБКА: Отсутствуют Infisical credentials:')
    console.error('  INFISICAL_CLIENT_ID:', clientId ? '✅' : '❌')
    console.error('  INFISICAL_CLIENT_SECRET:', clientSecret ? '✅' : '❌')
    console.error('  INFISICAL_PROJECT_ID:', projectId ? '✅' : '❌')
    process.exit(1)
  }

  // Инициализация Infisical (правильный способ для SDK v4)
  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
  })

  console.log('🔐 Авторизация в Infisical...')

  // Авторизация через Universal Auth
  await client.auth().universalAuth.login({
    clientId,
    clientSecret,
  })

  console.log('✅ Авторизация успешна')
  console.log(`📋 Окружение: ${environment}`)
  console.log(`📦 Project ID: ${projectId}`)
  console.log(`📦 Всего мёртвых переменных: ${DEAD_VARIABLES.length}\n`)

  let deleted = 0
  let notFound = 0
  let errors = 0

  for (const varName of DEAD_VARIABLES) {
    try {
      // Проверяем, существует ли переменная
      const allSecrets = await client.secrets().listSecrets({
        projectId,
        environment,
        secretPath: '/',
      })

      const exists = allSecrets.secrets.some(s => s.secretKey === varName)

      if (!exists) {
        console.log(`⏭️  ${varName} - уже отсутствует`)
        notFound++
        continue
      }

      // Удаляем (правильный API для SDK v4.0.6)
      // Первый параметр - имя секрета, второй - опции
      await client.secrets().deleteSecret(varName, {
        projectId,
        environment,
        secretPath: '/',
      })

      console.log(`✅ Удалено: ${varName}`)
      deleted++
    } catch (error: any) {
      console.error(`❌ Ошибка при удалении ${varName}:`, error.message)
      errors++
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 РЕЗУЛЬТАТЫ ОЧИСТКИ')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Удалено:          ${deleted}`)
  console.log(`⏭️  Уже отсутствовали: ${notFound}`)
  console.log(`❌ Ошибки:           ${errors}`)
  console.log(`📦 Всего обработано: ${DEAD_VARIABLES.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (deleted > 0) {
    console.log('✨ Очистка завершена! Infisical стал чище.')
  } else {
    console.log('ℹ️  Все мёртвые переменные уже были удалены ранее.')
  }
}

cleanupDeadVars().catch(console.error)
