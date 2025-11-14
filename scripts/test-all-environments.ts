#!/usr/bin/env tsx
/**
 * Проверяет работоспособность всех трёх окружений
 */

import { config } from 'dotenv'
import { InfisicalSDK } from '@infisical/sdk'

config()

interface EnvironmentStatus {
  name: string
  totalSecrets: number
  botTokens: number
  supabase: boolean
  inngest: boolean
  apiKeys: number
  status: 'OK' | 'WARNING' | 'ERROR'
  issues: string[]
}

async function testEnvironment(
  client: InfisicalSDK,
  projectId: string,
  environment: 'dev' | 'staging' | 'prod'
): Promise<EnvironmentStatus> {
  const status: EnvironmentStatus = {
    name: environment,
    totalSecrets: 0,
    botTokens: 0,
    supabase: false,
    inngest: false,
    apiKeys: 0,
    status: 'OK',
    issues: [],
  }

  try {
    const result = await client.secrets().listSecrets({
      projectId,
      environment,
      secretPath: '/',
    })

    status.totalSecrets = result.secrets.length

    // Проверяем BOT токены
    const botTokens = result.secrets.filter(s => s.secretKey.startsWith('BOT_TOKEN'))
    status.botTokens = botTokens.length

    // Минимальное количество токенов - 1
    if (status.botTokens === 0) {
      status.issues.push('Не найдено ни одного BOT токена!')
      status.status = 'ERROR'
    }

    // Информируем о текущем состоянии (не ошибка, просто информация)
    if (environment === 'dev' && status.botTokens < 2) {
      status.issues.push(`Dev окружение: найден ${status.botTokens} бот. Можно добавить BOT_TOKEN_2`)
    }
    if ((environment === 'staging' || environment === 'prod') && status.botTokens < 3) {
      status.issues.push(`${environment} окружение: найдено ${status.botTokens} бот${status.botTokens === 1 ? '' : 'а'}. Можно добавить больше для масштабирования`)
    }

    // Проверяем Supabase
    const supabaseKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
    const hasSupabase = supabaseKeys.every(key =>
      result.secrets.some(s => s.secretKey === key)
    )
    status.supabase = hasSupabase
    if (!hasSupabase) {
      status.issues.push('Отсутствуют Supabase credentials')
      status.status = 'ERROR'
    }

    // Проверяем Inngest
    const inngestKeys = ['BOT_INNGEST_EVENT_KEY', 'BOT_INNGEST_SIGNING_KEY']
    const hasInngest = inngestKeys.every(key =>
      result.secrets.some(s => s.secretKey === key)
    )
    status.inngest = hasInngest
    if (!hasInngest) {
      status.issues.push('Отсутствуют Inngest credentials')
      status.status = 'WARNING'
    }

    // Считаем API keys
    const apiKeys = result.secrets.filter(s =>
      s.secretKey.includes('API_KEY') || s.secretKey.includes('_KEY')
    )
    status.apiKeys = apiKeys.length

    // Проверяем критичные API keys
    const criticalKeys = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY']
    const missingCritical = criticalKeys.filter(key =>
      !result.secrets.some(s => s.secretKey === key)
    )
    if (missingCritical.length > 0) {
      status.issues.push(`Отсутствуют критичные API keys: ${missingCritical.join(', ')}`)
      status.status = 'WARNING'
    }

  } catch (error: any) {
    status.status = 'ERROR'
    status.issues.push(`Ошибка подключения: ${error.message}`)
  }

  return status
}

async function testAllEnvironments() {
  console.log('🧪 Тестирование всех окружений...\n')

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
  })

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID!,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
  })

  const projectId = process.env.INFISICAL_PROJECT_ID!
  const environments = ['dev', 'staging', 'prod'] as const

  const results: EnvironmentStatus[] = []

  for (const env of environments) {
    const result = await testEnvironment(client, projectId, env)
    results.push(result)
  }

  // Вывод результатов
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  for (const result of results) {
    const statusIcon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌'
    console.log(`${statusIcon} ${result.name.toUpperCase()}:`)
    console.log(`   Всего секретов: ${result.totalSecrets}`)
    console.log(`   BOT токенов: ${result.botTokens}`)
    console.log(`   Supabase: ${result.supabase ? '✅' : '❌'}`)
    console.log(`   Inngest: ${result.inngest ? '✅' : '❌'}`)
    console.log(`   API Keys: ${result.apiKeys}`)

    if (result.issues.length > 0) {
      console.log(`\n   Проблемы:`)
      result.issues.forEach(issue => console.log(`   - ${issue}`))
    }

    console.log('')
  }

  // Итоговая таблица
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 СВОДНАЯ ТАБЛИЦА')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Окружение │ Секретов │ BOT токенов │ Supabase │ Status')
  console.log('──────────┼──────────┼─────────────┼──────────┼────────')

  for (const result of results) {
    const statusIcon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌'
    const name = result.name.padEnd(9)
    const secrets = result.totalSecrets.toString().padEnd(8)
    const bots = result.botTokens.toString().padEnd(11)
    const supabase = result.supabase ? '✅       ' : '❌       '

    console.log(`${name} │ ${secrets} │ ${bots} │ ${supabase} │ ${statusIcon}`)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Проверка на конфликты токенов
  console.log('🔍 Проверка конфликтов между окружениями...')

  let hasConflicts = false
  const devBots = results.find(r => r.name === 'dev')?.botTokens || 0
  const stagingBots = results.find(r => r.name === 'staging')?.botTokens || 0
  const prodBots = results.find(r => r.name === 'prod')?.botTokens || 0

  console.log(`\n   Dev BOT токены: ${devBots} (BOT_TOKEN_1-${devBots})`)
  console.log(`   Staging BOT токены: ${stagingBots} (BOT_TOKEN_1-${stagingBots})`)
  console.log(`   Prod BOT токены: ${prodBots} (BOT_TOKEN_1-${prodBots})`)

  if (devBots === stagingBots || devBots === prodBots || stagingBots === prodBots) {
    console.log(`\n   ⚠️  Окружения используют одинаковое количество токенов`)
    console.log(`   ℹ️  Убедитесь что токены разные для каждого окружения`)
    hasConflicts = true
  }

  if (!hasConflicts) {
    console.log(`\n   ✅ Конфликтов не обнаружено`)
  }

  console.log('')

  // Итоговый статус
  const allOk = results.every(r => r.status === 'OK')
  const hasWarnings = results.some(r => r.status === 'WARNING')
  const hasErrors = results.some(r => r.status === 'ERROR')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (allOk) {
    console.log('✅ ВСЕ ОКРУЖЕНИЯ РАБОТАЮТ КОРРЕКТНО')
  } else if (hasErrors) {
    console.log('❌ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ОШИБКИ')
  } else if (hasWarnings) {
    console.log('⚠️  ОБНАРУЖЕНЫ ПРЕДУПРЕЖДЕНИЯ')
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

testAllEnvironments().catch(console.error)
