import { testSelfImprovement } from './test-utils/self-improvement.test'

async function main() {
  console.log('🚀 Запуск тестов самосовершенствования...')

  try {
    const result = await testSelfImprovement()
    
    if (result.success) {
      console.log(`✅ ${result.name}: ${result.message}`)
      process.exit(0)
    } else {
      console.log(`❌ ${result.name}: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов:', error)
    process.exit(1)
  }
}

main() 