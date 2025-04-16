import { TestResult } from './types'
import { testEngine as inngestTestEngine, TEST_CONFIG } from './test-config'

export async function runTests(tests: Array<() => Promise<TestResult>>) {
  console.log('🚀 Starting tests...')
  const results: TestResult[] = []

  for (const test of tests) {
    try {
      await inngestTestEngine.clearEvents()
      const result = await test()
      results.push(result)
      console.log(
        `${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`
      )
    } catch (error) {
      results.push({
        success: false,
        message: error instanceof Error ? error.message : String(error),
        name: test.name || 'Unknown Test',
      })
      console.error(`❌ ${test.name || 'Unknown Test'} failed:`, error)
    }
  }

  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.log('\n📊 Test Results:')
  console.log(`✅ Passed: ${successful}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(
    `📈 Success Rate: ${((successful / results.length) * 100).toFixed(2)}%\n`
  )

  return results
}

export async function createTestPayment(type = 'money_income') {
  return inngestTestEngine.sendEvent({
    name: 'payment/process',
    data: {
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      amount: TEST_CONFIG.TEST_AMOUNT,
      type,
      description: 'Test payment',
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    },
    timestamp: Date.now(),
  })
}

export async function waitForPaymentEvent(timeout = TEST_CONFIG.TEST_TIMEOUT) {
  return inngestTestEngine.waitForEvent('payment/process', timeout)
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
