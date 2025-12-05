/**
 * 🔍 Проверка ключей из Infisical
 * Проверяет наличие всех необходимых ключей для AI генерации
 */

import { config } from 'dotenv'
import path from 'path'

// Load .env
config({ path: path.join(process.cwd(), '.env') })

async function checkInfisicalKeys() {
  console.log('🔐 [CHECK] Проверка ключей из Infisical...\n')

  const { initInfisical, getSecretsStats, getSecret, getSecretOrDefault } = await import('../src/core/infisical')

  try {
    // Инициализация Infisical
    await initInfisical()
    const stats = getSecretsStats()

    console.log(`✅ Infisical подключен: ${stats.environment}`)
    console.log(`📊 Всего секретов: ${stats.totalSecrets}\n`)

    // Проверяем ключи AI сервисов
    const keysToCheck = [
      'ELEVENLABS_API_KEY',
      'HEYGEN_COCOAGE_API_KEY',
      'HEYGEN_HAIM_API_KEY',
      'HEDRA_API_KEY',
      'KIE_AI_API_KEY',
      'FAL_KEY'
    ]

    console.log('🔍 Проверка ключей AI сервисов:\n')

    for (const keyName of keysToCheck) {
      try {
        const value = getSecret(keyName)
        if (value) {
          // Показываем только первые 20 символов для безопасности
          const preview = value.substring(0, 20) + '...'
          console.log(`  ✅ ${keyName}: ${preview} (${value.length} символов)`)
        } else {
          console.log(`  ⚠️  ${keyName}: ПУСТОЕ ЗНАЧЕНИЕ`)
        }
      } catch (e) {
        console.log(`  ❌ ${keyName}: НЕ НАЙДЕН`)
      }
    }

    // Показываем все ключи, содержащие "HEYGEN" в названии
    console.log('\n🔍 Поиск ключей HeyGen в Infisical:\n')
    const allKeys = stats.secretKeys
    const heygenKeys = allKeys.filter(key => key.toUpperCase().includes('HEYGEN'))

    if (heygenKeys.length > 0) {
      console.log(`  Найдено ${heygenKeys.length} ключей HeyGen:`)
      for (const key of heygenKeys) {
        try {
          const value = getSecret(key)
          const preview = value.substring(0, 20) + '...'
          console.log(`    ✅ ${key}: ${preview} (${value.length} символов)`)
        } catch (e) {
          console.log(`    ❌ ${key}: ошибка чтения`)
        }
      }
    } else {
      console.log('  ❌ Ключи HeyGen не найдены в Infisical')
      console.log('  💡 Нужно добавить:')
      console.log('     - HEYGEN_COCOAGE_API_KEY')
      console.log('     - HEYGEN_HAIM_API_KEY')
    }

    console.log('\n✅ Проверка завершена!')

  } catch (error) {
    console.error('❌ Ошибка:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

checkInfisicalKeys()
