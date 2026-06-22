/**
 * 🔄 Автоматическое копирование секретов из Infisical в Fly.io
 */

import { InfisicalSDK } from '@infisical/sdk'

const secretsToSet = [
  // Bot tokens
  'BOT_TOKEN_1',
  'BOT_TOKEN_2',
  'BOT_TOKEN_3',
  'BOT_TOKEN_4',
  'BOT_TOKEN_5',
  'BOT_TOKEN_6',
  'BOT_TOKEN_7',  // Gaia bot
  'BOT_TOKEN_8',
  'BOT_TOKEN_9',
  'BOT_TOKEN_10',
  // 'BOT_TOKEN_11', // Пропускаем - невалидный

  // Database
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',

  // Inngest
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',

  // AI Providers
  'KIE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
  'REPLICATE_USERNAME',
  'FAL_KEY',
  'ELEVENLABS_API_KEY',
  'HEYGEN_COCOAGE_API_KEY',
  'HEYGEN_HAIM_API_KEY',
  'HEDRA_API_KEY',
  'DEEPSEEK_API_KEY',
  'GROK_API_KEY',
  'GLM_API_KEY',
  'OPENAI_API_KEY',

  // Robokassa
  'MERCHANT_LOGIN',
  'ROBOKASSA_PASSWORD_1',
  'ROBOKASSA_PASSWORD_2',

  // Other
  'APIFY_TOKEN',
  'GITHUB_TOKEN',
  'BFL_API_KEY',
  'BFL_WEBHOOK_URL',
  'BFL_WEBHOOK_SECRET',
]

async function loadSecretsFromInfisical(env: 'dev' | 'prod'): Promise<Record<string, string>> {
  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID

  if (!clientId || !clientSecret || !projectId) {
    throw new Error('Infisical credentials missing')
  }

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com'
  })

  await client.auth().universalAuth.login({ clientId, clientSecret })

  const result = await client.secrets().listSecrets({
    projectId,
    environment: env,
    secretPath: '/'
  })

  const secrets: Record<string, string> = {}
  for (const secret of result.secrets) {
    secrets[secret.secretKey] = secret.secretValue
  }

  return secrets
}

async function copySecretsToFly() {
  console.log('🔄 Копирование секретов из Infisical (dev + prod) в Fly.io...\n')

  // Load from both environments
  const [devSecrets, prodSecrets] = await Promise.all([
    loadSecretsFromInfisical('dev').catch(e => (console.log('⚠️ Dev secrets failed:', e), {})),
    loadSecretsFromInfisical('prod').catch(e => (console.log('⚠️ Prod secrets failed:', e), {}))
  ])

  // Merge: dev takes priority, prod as fallback
  const allSecrets = { ...prodSecrets, ...devSecrets }
  console.log(`📊 Dev: ${Object.keys(devSecrets).length}, Prod: ${Object.keys(prodSecrets).length}, Total: ${Object.keys(allSecrets).length}\n`)

  // Collect requested secrets
  const secrets: Record<string, string> = {}
  const missing: string[] = []

  for (const key of secretsToSet) {
    const value = allSecrets[key]
    if (value && value.trim() !== '') {
      secrets[key] = value
      const preview = value.substring(0, 10) + '...'
      const source = devSecrets[key] ? 'dev' : 'prod'
      console.log(`✅ ${key}: ${preview} [${source}]`)
    } else {
      missing.push(key)
      console.log(`❌ ${key}: не найден ни в dev ни в prod`)
    }
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  Отсутствуют: ${missing.length} секретов`)
  }

  console.log(`\n📊 Всего собрано: ${Object.keys(secrets).length} секретов\n`)

  // Set secrets to Fly.io
  console.log('🚀 Установка секретов в Fly.io (999-multibots-v2)...\n')

  for (const [key, value] of Object.entries(secrets)) {
    try {
      const result = await Bun.$`flyctl secrets set ${key}=${value} --app 999-multibots-v2`.quiet()

      if (result.exitCode === 0) {
        console.log(`✅ ${key}: добавлен в Fly.io`)
      } else {
        console.log(`❌ ${key}: ошибка добавления`)
      }
    } catch (error) {
      console.error(`❌ ${key}: ${error}`)
    }
  }

  console.log('\n✅ Все секреты установлены!')
  console.log('🔄 Перезапуск машины...')

  // Restart the machine
  try {
    await Bun.$`flyctl machine restart 287d505b10d428 --app 999-multibots-v2`
    console.log('✅ Машина перезапущена!')
  } catch (error) {
    console.error('❌ Ошибка перезапуска:', error)
  }
}

copySecretsToFly().catch(console.error)