/**
 * 🧪 Проверка валидности всех бот токенов
 */

import { config } from 'dotenv'
import path from 'path'
import { telegramApiFor } from '../src/services/telegramApi'

// Load .env
config({ path: path.join(process.cwd(), '.env') })

async function checkToken(
  token: string,
  name: string
): Promise<{
  name: string
  valid: boolean
  username?: string
  error?: string
}> {
  try {
    const response = await fetch(`${telegramApiFor(token)}/getMe`)
    const data = (await response.json()) as any

    if (data.ok) {
      return {
        name,
        valid: true,
        username: data.result.username,
      }
    } else {
      return {
        name,
        valid: false,
        error: data.description || 'Unknown error',
      }
    }
  } catch (error) {
    return {
      name,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkAllTokens() {
  console.log('🔐 [CHECK] Проверка всех BOT токенов...\n')

  const { initInfisical, getSecret, getSecretsStats } = await import(
    '../src/core/infisical'
  )

  // Инициализация Infisical
  await initInfisical()
  const stats = getSecretsStats()

  console.log(`✅ Infisical: ${stats.environment}`)
  console.log(`📊 Всего секретов: ${stats.totalSecrets}\n`)

  // Ищем все BOT_TOKEN_* в окружении
  const tokens: { key: string; token: string }[] = []

  for (let i = 1; i <= 20; i++) {
    const key = `BOT_TOKEN_${i}`
    try {
      const token = getSecret(key)
      if (token) {
        tokens.push({ key, token })
      }
    } catch {
      // Token not found
    }
  }

  console.log(`🔍 Найдено токенов: ${tokens.length}\n`)

  // Проверяем каждый токен
  const results: Array<{
    name: string
    valid: boolean
    username?: string
    error?: string
  }> = []

  for (const { key, token } of tokens) {
    console.log(`📡 Проверка ${key}...`)
    const result = await checkToken(token, key)
    results.push(result)

    if (result.valid) {
      console.log(`  ✅ ${key} → @${result.username}`)
    } else {
      console.log(`  ❌ ${key} → ${result.error}`)
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // Итоговая статистика
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const valid = results.filter(r => r.valid)
  const invalid = results.filter(r => !r.valid)

  console.log(`✅ Валидных: ${valid.length}/${results.length}`)
  console.log(`❌ Невалидных: ${invalid.length}/${results.length}\n`)

  if (valid.length > 0) {
    console.log('✅ РАБОТАЮЩИЕ БОТЫ:')
    for (const bot of valid) {
      console.log(`   @${bot.username} (${bot.name})`)
    }
  }

  if (invalid.length > 0) {
    console.log('\n❌ НЕРАБОТАЮЩИЕ БОТЫ:')
    for (const bot of invalid) {
      console.log(`   ${bot.name} → ${bot.error}`)
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

checkAllTokens().catch(console.error)
