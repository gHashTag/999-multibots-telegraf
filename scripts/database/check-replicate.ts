/**
 * 🔍 Проверка REPLICATE ключей в Infisical
 */

import { initInfisical, getSecretsStats, getSecret } from '../src/core/infisical'

async function checkReplicateKeys() {
  console.log('🔍 [CHECK] Проверка REPLICATE ключей...\n')

  try {
    await initInfisical()
    const stats = getSecretsStats()

    console.log(`✅ Infisical подключен: ${stats.environment}`)
    console.log(`📊 Всего секретов: ${stats.totalSecrets}\n`)

    // Ищем REPLICATE ключи
    const replicateKeys = stats.secretKeys.filter(k => k.toUpperCase().includes('REPLICATE'))

    if (replicateKeys.length === 0) {
      console.log('❌ REPLICATE ключи НЕ НАЙДЕНЫ в Infisical!')
      console.log('\n💡 Нужно добавить в Infisical (environment: dev):')
      console.log('   - REPLICATE_API_TOKEN = ваш_api_токен_из_replicate')
      console.log('   - REPLICATE_USERNAME = ваше_имя_пользователя_replicate')
      console.log('\n🌐 Получить токен: https://replicate.com/account/api-tokens')
      return false
    }

    console.log('🔍 Найденные REPLICATE ключи:\n')

    for (const key of replicateKeys) {
      try {
        const value = getSecret(key)
        const preview = value.substring(0, 20) + '...'
        console.log(`  ✅ ${key}: ${preview} (${value.length} символов)`)
      } catch (e) {
        console.log(`  ❌ ${key}: ошибка чтения`)
      }
    }

    return true

  } catch (error) {
    console.error('❌ Ошибка:', error instanceof Error ? error.message : String(error))
    return false
  }
}

checkReplicateKeys().then(success => {
  process.exit(success ? 0 : 1)
})
