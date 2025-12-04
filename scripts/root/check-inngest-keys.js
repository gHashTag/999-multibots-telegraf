// Проверка INNGEST ключей через Infisical API
import { getInfisicalSecrets } from './src/core/infisical/index.js'

async function checkInngestKeys() {
  console.log('🔍 Проверка INNGEST ключей через Infisical...\n')

  try {
    // Загружаем секреты через Infisical (как в production)
    const secrets = await getInfisicalSecrets()

    console.log('✅ Секреты загружены из Infisical\n')

    // Проверяем INNGEST ключи
    const eventKey = process.env.INNGEST_EVENT_KEY
    const signingKey = process.env.INNGEST_SIGNING_KEY

    console.log('📋 НАЙДЕННЫЕ КЛЮЧИ:')
    console.log('='.repeat(60))
    console.log(`INNGEST_EVENT_KEY:`)
    console.log(`  Full:     ${eventKey}`)
    console.log(`  Preview:  ${eventKey ? eventKey.substring(0, 50) + '...' : 'N/A'}`)
    console.log(`  Length:   ${eventKey ? eventKey.length : 0}`)
    console.log()
    console.log(`INNGEST_SIGNING_KEY:`)
    console.log(`  Full:     ${signingKey}`)
    console.log(`  Preview:  ${signingKey ? signingKey.substring(0, 50) + '...' : 'N/A'}`)
    console.log(`  Length:   ${signingKey ? signingKey.length : 0}`)
    console.log('='.repeat(60))
    console.log()

    // Ожидаемые ключи
    const EXPECTED_EVENT_KEY = '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q'
    const EXPECTED_SIGNING_KEY = 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597'

    console.log('🔍 СРАВНЕНИЕ С ОЖИДАЕМЫМИ КЛЮЧАМИ:')
    console.log('='.repeat(60))
    console.log(`INNGEST_EVENT_KEY Match: ${eventKey === EXPECTED_EVENT_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`)
    console.log(`INNGEST_SIGNING_KEY Match: ${signingKey === EXPECTED_SIGNING_KEY ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ'}`)
    console.log('='.repeat(60))
    console.log()

    // Дополнительная диагностика
    console.log('📊 ДОПОЛНИТЕЛЬНАЯ ДИАГНОСТИКА:')
    console.log('INFISICAL_ENVIRONMENT:', process.env.INFISICAL_ENVIRONMENT)
    console.log('NODE_ENV:', process.env.NODE_ENV)
    console.log('Total secrets loaded:', Object.keys(process.env).filter(k =>
      !k.startsWith('INFISICAL_') &&
      !k.startsWith('NODE_') &&
      k !== 'npm_' &&
      k !== 'npm_config_' &&
      k !== 'npm_lifecycle_' &&
      k !== 'npm_node_execpath'
    ).length)

  } catch (error) {
    console.error('❌ Ошибка при загрузке секретов:', error.message)
    console.error(error.stack)
  }
}

checkInngestKeys()
