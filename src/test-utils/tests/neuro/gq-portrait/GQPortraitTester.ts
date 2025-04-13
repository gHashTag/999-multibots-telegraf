import { testGQPortrait } from './testNeuroPhotoGQ'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Основная функция для запуска тестов NeuroPhoto GQ Portrait
 * Запускает тест генерации портрета в стиле GQ
 */
async function main() {
  console.log('🚀 Запуск тестера для GQ Portrait...')

  try {
    await testGQPortrait()
    console.log('✅ Тестер для GQ Portrait успешно завершил работу')
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестера для GQ Portrait:', error)
    process.exit(1)
  }
}

// Запускаем тестер, если файл вызван напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Необработанная ошибка в GQPortraitTester:', error)
    process.exit(1)
  })
}
