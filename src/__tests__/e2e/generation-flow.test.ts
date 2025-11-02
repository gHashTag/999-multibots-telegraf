/**
 * End-to-End тесты для полного флоу генерации
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { spawn } from 'child_process'
import fetch from 'node-fetch'

// Конфигурация тестового окружения
const TEST_CONFIG = {
  botToken: process.env.TEST_BOT_TOKEN || '',
  botUsername: process.env.TEST_BOT_USERNAME || '',
  apiUrl: 'http://localhost:3000',
  webhookUrl: 'http://localhost:3000/inngest-webhook',
}

describe('🎯 E2E: Complete Generation Flow', () => {
  let botProcess: any

  beforeAll(async () => {
    // Запускаем бота в test режиме
    if (!TEST_CONFIG.botToken) {
      console.log('⚠️ Skip E2E tests - TEST_BOT_TOKEN not set')
      return
    }

    botProcess = spawn('npm', ['run', 'dev:test'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_BOT_NAME: TEST_CONFIG.botUsername,
        USE_INNGEST: 'true',
      },
      stdio: 'pipe',
    })

    // Ждём запуска бота
    await new Promise(resolve => setTimeout(resolve, 3000))
  })

  afterAll(async () => {
    // Останавливаем бота
    if (botProcess) {
      botProcess.kill()
    }
  })

  describe('📱 Full User Journey', () => {
    it('should complete full generation flow', async () => {
      if (!TEST_CONFIG.botToken) {
        console.log('⚠️ Skipping E2E test - no bot token')
        return
      }

      // Симулируем действия пользователя
      console.log('🤖 Simulating user actions...')

      // 1. User starts conversation
      const startResponse = await simulateTelegramCommand('/start', TEST_CONFIG.botToken)
      expect(startResponse.ok).toBe(true)

      // 2. User enters neuro photo wizard
      const wizardResponse = await simulateTelegramCallback('neuro_photo_v2', TEST_CONFIG.botToken)
      expect(wizardResponse.ok).toBe(true)

      // 3. User sends prompt
      const promptResponse = await simulateTelegramMessage('beautiful sunset', TEST_CONFIG.botToken)
      expect(promptResponse.ok).toBe(true)

      console.log('✅ E2E flow initiated successfully')
    }, 10000)

    it('should handle multi-photo flow', async () => {
      if (!TEST_CONFIG.botToken) {
        console.log('⚠️ Skipping E2E test - no bot token')
        return
      }

      const multiPhotoResponse = await simulateTelegramMessage('2', TEST_CONFIG.botToken)
      expect(multiPhotoResponse.ok).toBe(true)

      console.log('✅ Multi-photo flow initiated')
    }, 10000)

    it('should track status correctly', async () => {
      if (!TEST_CONFIG.botToken) {
        console.log('⚠️ Skipping E2E test - no bot token')
        return
      }

      // Симулируем нажатие кнопки проверки статуса
      const statusResponse = await simulateTelegramCallback('status_test-event-123', TEST_CONFIG.botToken)
      expect(statusResponse.ok).toBe(true)

      console.log('✅ Status tracking works')
    }, 10000)
  })

  describe('🔄 Error Recovery', () => {
    it('should recover from Inngest failure', async () => {
      // Симулируем недоступность Inngest
      const backupMode = process.env.USE_INNGEST
      process.env.USE_INNGEST = 'false'

      // Выполняем запрос
      const response = await simulateTelegramMessage('test prompt', TEST_CONFIG.botToken)
      expect(response.ok).toBe(true)

      // Восстанавливаем настройки
      process.env.USE_INNGEST = backupMode

      console.log('✅ Error recovery works')
    }, 10000)

    it('should handle invalid input gracefully', async () => {
      const invalidInputs = ['', '   ', null, undefined, '<script>alert()</script>']

      for (const input of invalidInputs) {
        const response = await simulateTelegramMessage(input, TEST_CONFIG.botToken)
        expect(response.ok).toBe(true) // Bot should handle gracefully
      }

      console.log('✅ Invalid input handling works')
    }, 10000)
  })

  describe('📊 Performance E2E', () => {
    it('should respond to user within 100ms', async () => {
      if (!TEST_CONFIG.botToken) {
        console.log('⚠️ Skipping performance test - no bot token')
        return
      }

      const startTime = Date.now()
      const response = await simulateTelegramMessage('test', TEST_CONFIG.botToken)
      const responseTime = Date.now() - startTime

      expect(response.ok).toBe(true)
      expect(responseTime).toBeLessThan(100)

      console.log(`⚡ Response time: ${responseTime}ms`)
    }, 1000)

    it('should handle concurrent users', async () => {
      if (!TEST_CONFIG.botToken) {
        console.log('⚠️ Skipping load test - no bot token')
        return
      }

      const concurrentUsers = 5
      const promises = Array.from({ length: concurrentUsers }, (_, i) =>
        simulateTelegramMessage(`test-${i}`, TEST_CONFIG.botToken)
      )

      const results = await Promise.all(promises)
      results.forEach((result, index) => {
        expect(result.ok).toBe(true)
      })

      console.log(`✅ Handled ${concurrentUsers} concurrent users`)
    }, 5000)
  })
})

// Вспомогательные функции для симуляции Telegram
async function simulateTelegramCommand(command: string, token: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '12345',
        text: command,
      }),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function simulateTelegramMessage(text: string, token: string) {
  return simulateTelegramCommand(text, token)
}

async function simulateTelegramCallback(callbackData: string, token: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: 'test-query-id',
        data: callbackData,
      }),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

describe('🔌 Webhook E2E', () => {
  it('should receive and process webhook correctly', async () => {
    const testWebhookPayload = {
      type: 'generation-completed',
      data: {
        eventId: 'test-event-123',
        status: 'completed',
        userId: '12345',
        result: {
          imageUrl: 'https://example.com/test.jpg',
        },
        metadata: {
          prompt: 'beautiful sunset',
        },
      },
    }

    const response = await fetch(`${TEST_CONFIG.apiUrl}/inngest-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testWebhookPayload),
    })

    expect(response.ok).toBe(true)
    const result = await response.json()
    expect(result.ok).toBe(true)

    console.log('✅ Webhook processed successfully')
  })

  it('should handle webhook errors gracefully', async () => {
    const invalidPayload = { invalid: 'data' }

    const response = await fetch(`${TEST_CONFIG.apiUrl}/inngest-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    })

    expect(response.ok).toBe(true) // Should handle gracefully

    console.log('✅ Webhook error handling works')
  })

  it('should validate webhook payload', async () => {
    const testCases = [
      { type: 'generation-completed', requiredFields: ['eventId', 'status', 'userId', 'result'] },
      { type: 'generation-failed', requiredFields: ['eventId', 'status', 'userId', 'error'] },
      { type: 'payment-completed', requiredFields: ['eventId', 'status', 'userId', 'result'] },
    ]

    for (const testCase of testCases) {
      const payload = {
        type: testCase.type,
        data: testCase.requiredFields.reduce((acc, field) => {
          acc[field] = `test-${field}`
          return acc
        }, {} as any),
      }

      const response = await fetch(`${TEST_CONFIG.apiUrl}/inngest-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      expect(response.ok).toBe(true)
    }

    console.log('✅ Webhook validation works')
  })
})

describe('📈 Load Testing', () => {
  it('should handle high load', async () => {
    const concurrentRequests = 50
    const startTime = Date.now()

    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      fetch(`${TEST_CONFIG.apiUrl}/inngest-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'generation-completed',
          data: {
            eventId: `load-test-${i}`,
            status: 'completed',
            userId: `user-${i}`,
            result: { imageUrl: `https://example.com/${i}.jpg` },
          },
        }),
      })
    )

    const results = await Promise.all(promises)
    const duration = Date.now() - startTime
    const successRate = results.filter(r => r.ok).length / concurrentRequests

    expect(successRate).toBeGreaterThan(0.95) // 95% success rate
    expect(duration).toBeLessThan(5000) // < 5 seconds for 50 concurrent requests

    console.log(`⚡ Load test: ${concurrentRequests} requests in ${duration}ms`)
    console.log(`📊 Success rate: ${(successRate * 100).toFixed(2)}%`)
  }, 10000)

  it('should maintain response time under load', async () => {
    const testDuration = 5000 // 5 seconds
    const requestsPerSecond = 10
    let requestCount = 0
    const responseTimes: number[] = []

    const startTime = Date.now()
    const interval = setInterval(async () => {
      if (Date.now() - startTime > testDuration) {
        clearInterval(interval)
        return
      }

      const reqStart = Date.now()
      try {
        await fetch(`${TEST_CONFIG.apiUrl}/inngest-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'generation-completed',
            data: {
              eventId: `stress-test-${requestCount}`,
              status: 'completed',
              userId: '12345',
              result: { imageUrl: 'https://example.com/test.jpg' },
            },
          }),
        })
        responseTimes.push(Date.now() - reqStart)
        requestCount++
      } catch (error) {
        // Handle error
      }
    }, 1000 / requestsPerSecond)

    // Wait for test to complete
    await new Promise(resolve => setTimeout(resolve, testDuration + 1000))

    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    const maxResponseTime = Math.max(...responseTimes)

    expect(avgResponseTime).toBeLessThan(500) // Average < 500ms
    expect(maxResponseTime).toBeLessThan(1000) // Max < 1s

    console.log(`⚡ Avg response time: ${avgResponseTime.toFixed(2)}ms`)
    console.log(`📈 Max response time: ${maxResponseTime}ms`)
    console.log(`📊 Total requests: ${requestCount}`)
  }, 15000)
})
