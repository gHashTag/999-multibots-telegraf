import { runRobokassaFormTests } from './src/test-utils/tests/payment/robokassaFormValidator.test'
import { logger } from './src/utils/logger'

async function main() {
  try {
    logger.info('🚀 Запуск тестов Robokassa...')
    const results = await runRobokassaFormTests()
    logger.info('✅ Результаты тестов:', results)
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', error)
  }
}

main()
