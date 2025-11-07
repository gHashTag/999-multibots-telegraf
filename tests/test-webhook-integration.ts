/**
 * Интеграционный тест для webhook callback системы
 * Запускает API сервер и тестирует полный цикл webhook обработки
 */

import { spawn } from 'child_process'
import axios from 'axios'
import { logger } from '../src/utils/logger'

const API_PORT = process.env.PORT || '2999'
const API_URL = `http://localhost:${API_PORT}`

let serverProcess: any = null

/**
 * Запускает API сервер для тестирования
 */
async function startApiServer(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.log('🚀 [INTEGRATION TEST] Запуск API сервера...')

    // Запускаем API сервер
    serverProcess = spawn('npx', ['tsx', 'src/api_server/runServer.ts'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    })

    let serverStarted = false

    // Обработка вывода сервера
    serverProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log(`[API SERVER] ${output.trim()}`)

      // Ищем признаки успешного запуска
      if (output.includes('listening on port') || output.includes('Server started') || output.includes('API server')) {
        if (!serverStarted) {
          serverStarted = true
          setTimeout(() => resolve(true), 2000) // Даём серверу время полностью стартовать
        }
      }
    })

    serverProcess.stderr.on('data', (data: Buffer) => {
      console.error(`[API SERVER ERROR] ${data.toString().trim()}`)
    })

    serverProcess.on('close', (code: number) => {
      console.log(`[API SERVER] Процесс завершён с кодом ${code}`)
      if (!serverStarted) {
        reject(new Error(`API сервер завершился с кодом ${code}`))
      }
    })

    serverProcess.on('error', (error: Error) => {
      console.error('[API SERVER] Ошибка запуска:', error)
      reject(error)
    })

    // Таймаут запуска
    setTimeout(() => {
      if (!serverStarted) {
        reject(new Error('Таймаут запуска API сервера'))
      }
    }, 30000)
  })
}

/**
 * Останавливает API сервер
 */
function stopApiServer() {
  if (serverProcess) {
    console.log('🛑 [INTEGRATION TEST] Остановка API сервера...')
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

/**
 * Проверяет доступность API сервера
 */
async function waitForServerReady(maxWaitTime = 15000): Promise<boolean> {
  const startTime = Date.now()
  const pollInterval = 1000

  console.log('⏳ [INTEGRATION TEST] Ожидание готовности API сервера...')

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await axios.get(`${API_URL}/health`, { timeout: 2000 })
      if (response.status === 200) {
        console.log('✅ [INTEGRATION TEST] API сервер готов к работе')
        return true
      }
    } catch (error) {
      // Игнорируем ошибки соединения при ожидании
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  console.log('❌ [INTEGRATION TEST] API сервер не готов за отведённое время')
  return false
}

/**
 * Тестирует webhook endpoint напрямую
 */
async function testWebhookEndpoint() {
  console.log('🔍 [INTEGRATION TEST] Тестирование webhook endpoint...')

  const testPayload = {
    id: 'test-task-' + Date.now(),
    status: 'succeeded',
    output: 'https://example.com/result.mp4',
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    model: 'veed/fabric-1'
  }

  try {
    const response = await axios.post(`${API_URL}/api/kie-ai/callback`, testPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    })

    if (response.status === 202) {
      console.log('✅ [INTEGRATION TEST] Webhook endpoint работает корректно')
      console.log('📝 [INTEGRATION TEST] Ответ:', response.data)
      return true
    } else {
      console.log(`❌ [INTEGRATION TEST] Неожиданный статус ответа: ${response.status}`)
      return false
    }
  } catch (error) {
    console.log('❌ [INTEGRATION TEST] Ошибка при тестировании webhook endpoint:',
      error instanceof Error ? error.message : 'Unknown error')
    return false
  }
}

/**
 * Тестирует обработку невалидных данных
 */
async function testInvalidWebhookData() {
  console.log('🔍 [INTEGRATION TEST] Тестирование обработки невалидных данных...')

  const invalidPayloads = [
    {}, // Пустой объект
    { id: 'test' }, // Без обязательных полей
    { invalid: 'data' }, // Совсем невалидные данные
    'not-json' // Строка вместо JSON
  ]

  let passedTests = 0

  for (let i = 0; i < invalidPayloads.length; i++) {
    try {
      const response = await axios.post(`${API_URL}/api/kie-ai/callback`, invalidPayloads[i], {
        headers: { 'Content-Type': 'application/json' },
        timeout: 3000
      })

      // Webhook должен принимать любые данные с 202 статусом (graceful handling)
      if (response.status === 202) {
        passedTests++
        console.log(`✅ [INTEGRATION TEST] Невалидные данные ${i + 1} обработаны корректно`)
      } else {
        console.log(`⚠️ [INTEGRATION TEST] Невалидные данные ${i + 1}: неожиданный статус ${response.status}`)
      }
    } catch (error) {
      console.log(`⚠️ [INTEGRATION TEST] Невалидные данные ${i + 1}: ошибка -`,
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  console.log(`📊 [INTEGRATION TEST] Обработка невалидных данных: ${passedTests}/${invalidPayloads.length} тестов пройдено`)
  return passedTests >= invalidPayloads.length / 2 // Принимаем если > 50% тестов прошли
}

/**
 * Главная функция интеграционного тестирования
 */
async function runIntegrationTests() {
  let testsPassed = 0
  let totalTests = 0

  try {
    console.log('🚀 [INTEGRATION TEST] Начало интеграционного тестирования webhook системы')

    // 1. Запуск API сервера
    totalTests++
    try {
      await startApiServer()
      const serverReady = await waitForServerReady()
      if (serverReady) {
        testsPassed++
        console.log('✅ [INTEGRATION TEST] Тест 1/3 PASSED: API сервер запущен и готов')
      } else {
        console.log('❌ [INTEGRATION TEST] Тест 1/3 FAILED: API сервер не готов')
      }
    } catch (error) {
      console.log('❌ [INTEGRATION TEST] Тест 1/3 FAILED: Ошибка запуска API сервера:',
        error instanceof Error ? error.message : 'Unknown error')
    }

    // 2. Тестирование webhook endpoint
    totalTests++
    const webhookTest = await testWebhookEndpoint()
    if (webhookTest) {
      testsPassed++
      console.log('✅ [INTEGRATION TEST] Тест 2/3 PASSED: Webhook endpoint работает')
    } else {
      console.log('❌ [INTEGRATION TEST] Тест 2/3 FAILED: Проблемы с webhook endpoint')
    }

    // 3. Тестирование обработки невалидных данных
    totalTests++
    const invalidDataTest = await testInvalidWebhookData()
    if (invalidDataTest) {
      testsPassed++
      console.log('✅ [INTEGRATION TEST] Тест 3/3 PASSED: Обработка невалидных данных')
    } else {
      console.log('❌ [INTEGRATION TEST] Тест 3/3 FAILED: Проблемы с обработкой невалидных данных')
    }

    // Итоги
    console.log('\n=== РЕЗУЛЬТАТЫ ИНТЕГРАЦИОННОГО ТЕСТИРОВАНИЯ ===')
    console.log(`📊 [INTEGRATION TEST] Пройдено тестов: ${testsPassed}/${totalTests}`)

    if (testsPassed === totalTests) {
      console.log('🎉 [INTEGRATION TEST] ВСЕ ИНТЕГРАЦИОННЫЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!')
      return true
    } else {
      console.log('⚠️ [INTEGRATION TEST] Некоторые интеграционные тесты не пройдены')
      return false
    }

  } catch (error) {
    console.error('💥 [INTEGRATION TEST] Критическая ошибка интеграционного тестирования:', error)
    return false
  } finally {
    // Всегда останавливаем сервер
    stopApiServer()
  }
}

// Обработка сигналов для корректной остановки
process.on('SIGINT', () => {
  console.log('\n🛑 [INTEGRATION TEST] Получен сигнал SIGINT, останавливаем тестирование...')
  stopApiServer()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 [INTEGRATION TEST] Получен сигнал SIGTERM, останавливаем тестирование...')
  stopApiServer()
  process.exit(0)
})

// Запуск при вызове напрямую
async function main() {
  try {
    const success = await runIntegrationTests()
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('💥 [INTEGRATION TEST] Фатальная ошибка:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { runIntegrationTests, testWebhookEndpoint, testInvalidWebhookData }