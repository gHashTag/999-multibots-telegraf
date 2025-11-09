/**
 * 🔍 Скрипт для вывода всех BOT токенов из Infisical
 */

import { config } from 'dotenv'

config()

async function listBotTokens() {
  console.log('🔐 [List] Получение списка BOT токенов из Infisical...\n')

  try {
    const { initInfisical, getSecretsStats } = await import('../src/core/infisical')

    await initInfisical()
    const stats = getSecretsStats()

    console.log(`📊 [List] Environment: ${stats.environment}`)
    console.log(`📊 [List] Всего секретов: ${stats.totalSecrets}\n`)

    // Фильтруем только BOT токены
    const botTokens = stats.secretKeys.filter(key => key.startsWith('BOT_TOKEN'))

    console.log(`🤖 [List] Найдено BOT токенов: ${botTokens.length}\n`)

    if (botTokens.length > 0) {
      botTokens.forEach((token, index) => {
        console.log(`   ${index + 1}. ${token}`)
      })
    } else {
      console.log('   ⚠️ BOT токены не найдены!')
    }

    console.log('\n✅ [List] Готово!')
  } catch (error) {
    console.error('\n❌ [List] Ошибка:', error)
    process.exit(1)
  }
}

listBotTokens()
