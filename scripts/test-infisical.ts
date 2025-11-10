/**
 * 🧪 Тестовый скрипт для проверки Infisical подключения
 * Использование: npx tsx scripts/test-infisical.ts
 */

import { config } from 'dotenv'

// Загружаем .env
config()

async function testInfisical() {
  console.log('🔐 [Test] Проверка Infisical подключения...\n')

  // Проверяем credentials
  console.log('📋 [Test] Credentials:')
  console.log('  INFISICAL_CLIENT_ID:', process.env.INFISICAL_CLIENT_ID?.substring(0, 10) + '...')
  console.log('  INFISICAL_CLIENT_SECRET:', process.env.INFISICAL_CLIENT_SECRET?.substring(0, 10) + '...')
  console.log('  INFISICAL_PROJECT_ID:', process.env.INFISICAL_PROJECT_ID)
  console.log('')

  try {
    // Импортируем Infisical
    const { initInfisical, getSecretsStats, getSecret } = await import('../src/core/infisical')

    console.log('🔄 [Test] Инициализация Infisical...')
    await initInfisical()

    const stats = getSecretsStats()
    console.log(`\n✅ [Test] Успешно подключились к Infisical!`)
    console.log(`📊 [Test] Статистика:`)
    console.log(`   - Environment: ${stats.environment}`)
    console.log(`   - Всего секретов: ${stats.totalSecrets}`)
    console.log(`   - Authenticated: ${stats.authenticated}`)

    if (stats.totalSecrets > 0) {
      console.log(`\n🔑 [Test] Первые 10 секретов:`)
      stats.secretKeys.slice(0, 10).forEach((key, index) => {
        console.log(`   ${index + 1}. ${key}`)
      })

      // Пробуем получить конкретный секрет
      console.log(`\n🧪 [Test] Попытка получить секрет "SUPABASE_URL":`)
      try {
        const supabaseUrl = getSecret('SUPABASE_URL')
        console.log(`   ✅ SUPABASE_URL найден: ${supabaseUrl.substring(0, 30)}...`)
      } catch (error) {
        console.log(`   ❌ SUPABASE_URL не найден:`, error instanceof Error ? error.message : String(error))
      }

      console.log(`\n🧪 [Test] Попытка получить секрет "BOT_TOKEN_1":`)
      try {
        const botToken = getSecret('BOT_TOKEN_1')
        console.log(`   ✅ BOT_TOKEN_1 найден: ${botToken.substring(0, 20)}...`)
      } catch (error) {
        console.log(`   ❌ BOT_TOKEN_1 не найден:`, error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log(`\n⚠️  [Test] В Infisical пока нет секретов!`)
      console.log(`\n📝 [Test] Следующие шаги:`)
      console.log(`   1. Открой https://app.infisical.com`)
      console.log(`   2. Перейди в проект "999"`)
      console.log(`   3. Добавь секреты в environment "${stats.environment}"`)
      console.log(`   4. Запусти этот скрипт снова`)
    }

  } catch (error) {
    console.error('\n❌ [Test] Ошибка подключения к Infisical:')
    console.error(error)
    process.exit(1)
  }
}

testInfisical()
