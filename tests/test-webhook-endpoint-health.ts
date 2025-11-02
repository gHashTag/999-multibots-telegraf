/**
 * Тест для проверки health webhook endpoint и предотвращения 502 ошибок
 *
 * Этот тест должен запускаться автоматически после деплоя
 * для проверки что webhook endpoint доступен
 */

import axios from 'axios'
import { logger } from '../src/utils/logger'

const WEBHOOK_URL = 'https://three-head-dragon.shop/api/telegram/ai-reels-callback'
const HEALTH_URL = 'https://three-head-dragon.shop/health'
const LOCAL_API_URL = 'http://localhost:3000'

interface TestResult {
  name: string
  success: boolean
  status?: number
  responseTime?: number
  error?: string
  details?: any
}

async function testWebhookEndpoint(): Promise<TestResult[]> {
  const results: TestResult[] = []

  // Тест 1: GET health check
  console.log('\n=== ТЕСТ 1: Health Check (GET) ===')
  try {
    const start = Date.now()
    const response = await axios.get(HEALTH_URL, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Не бросать ошибку при 4xx
    })

    results.push({
      name: 'Health Check (GET)',
      success: response.status === 200,
      status: response.status,
      responseTime: Date.now() - start,
      details: response.data
    })

    console.log(`✅ Status: ${response.status}, Response: ${JSON.stringify(response.data)}`)
  } catch (error) {
    results.push({
      name: 'Health Check (GET)',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    console.log(`❌ Error: ${error}`)
  }

  // Тест 2: GET webhook endpoint
  console.log('\n=== ТЕСТ 2: Webhook Endpoint (GET) ===')
  try {
    const start = Date.now()
    const response = await axios.get(WEBHOOK_URL, {
      timeout: 5000,
      validateStatus: (status) => status < 500
    })

    results.push({
      name: 'Webhook Endpoint (GET)',
      success: response.status === 200,
      status: response.status,
      responseTime: Date.now() - start,
      details: response.data
    })

    console.log(`✅ Status: ${response.status}, Response: ${JSON.stringify(response.data)}`)
  } catch (error) {
    results.push({
      name: 'Webhook Endpoint (GET)',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    console.log(`❌ Error: ${error}`)
  }

  // Тест 3: POST webhook callback (симуляция Railway)
  console.log('\n=== ТЕСТ 3: Webhook Callback (POST) ===')
  try {
    const start = Date.now()
    const response = await axios.post(
      WEBHOOK_URL,
      {
        download_url: 'https://test-storage.selstorage.ru/test-video.mp4',
        job_id: `telegram-test-${Date.now()}`,
        status: 'completed',
        bot_name: 'HaimGroupMedia_bot',
        metadata: {
          telegram_id: '123456789',
          bot_name: 'HaimGroupMedia_bot'
        }
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        },
        validateStatus: (status) => status < 500
      }
    )

    results.push({
      name: 'Webhook Callback (POST)',
      success: response.status === 202 || response.status === 200,
      status: response.status,
      responseTime: Date.now() - start,
      details: response.data
    })

    console.log(`✅ Status: ${response.status}, Response: ${JSON.stringify(response.data)}`)
  } catch (error) {
    results.push({
      name: 'Webhook Callback (POST)',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: {
        code: error.code,
        message: error.message,
        response: error.response?.data
      }
    })
    console.log(`❌ Error: ${error}`)
  }

  // Тест 4: Локальная проверка (если запущено локально)
  console.log('\n=== ТЕСТ 4: Local API Health ===')
  try {
    const start = Date.now()
    const response = await axios.get(`${LOCAL_API_URL}/health`, {
      timeout: 3000,
      validateStatus: (status) => status < 500
    })

    results.push({
      name: 'Local API Health',
      success: response.status === 200,
      status: response.status,
      responseTime: Date.now() - start,
      details: response.data
    })

    console.log(`✅ Status: ${response.status}, Response: ${JSON.stringify(response.data)}`)
  } catch (error) {
    results.push({
      name: 'Local API Health',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: 'This test only runs if API server is available locally'
    })
    console.log(`⚠️ Skipped (API server not running locally)`)
  }

  // Тест 5: Проверка Docker контейнера
  console.log('\n=== ТЕСТ 5: Docker Container Status ===')
  try {
    const { execSync } = require('child_process')
    const containerInfo = execSync('docker ps --filter "name=999-multibots" --format "{{.Names}}|{{.Status}}|{{.Ports}}"', {
      encoding: 'utf8',
      timeout: 5000
    })

    const [name, status, ports] = containerInfo.trim().split('|')

    results.push({
      name: 'Docker Container Status',
      success: status.includes('Up'),
      status: 200,
      details: {
        name,
        status,
        ports
      }
    })

    console.log(`✅ Container: ${name}`)
    console.log(`   Status: ${status}`)
    console.log(`   Ports: ${ports}`)
  } catch (error) {
    results.push({
      name: 'Docker Container Status',
      success: false,
      error: 'Container not found or not running',
      details: error instanceof Error ? error.message : String(error)
    })
    console.log(`❌ Container check failed`)
  }

  return results
}

async function generateReport(results: TestResult[]): Promise<void> {
  console.log('\n' + '='.repeat(80))
  console.log('📊 WEBHOOK ENDPOINT HEALTH REPORT')
  console.log('='.repeat(80))

  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const total = results.length

  console.log(`\n📈 Statistics: ${passed}/${total} tests passed, ${failed} failed`)

  // Подробный отчет
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌'
    const statusText = result.status ? ` (HTTP ${result.status})` : ''
    const timeText = result.responseTime ? ` [${result.responseTime}ms]` : ''

    console.log(`\n${icon} ${result.name}${statusText}${timeText}`)

    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`)
    }

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2).substring(0, 200)}`)
    }
  })

  // Рекомендации
  console.log('\n' + '-'.repeat(80))
  console.log('💡 Recommendations:')

  if (failed > 0) {
    console.log('\n⚠️ ISSUES DETECTED:')

    const failedTests = results.filter(r => !r.success)
    failedTests.forEach(test => {
      console.log(`\n❌ ${test.name}:`)

      if (test.name.includes('Health Check')) {
        console.log('   🔧 Fix:')
        console.log('      1. Check if API server is running: docker ps | grep 999-multibots')
        console.log('      2. Check logs: docker logs 999-multibots | tail -50')
        console.log('      3. Verify port 3000 is mapped: docker port 999-multibots')
        console.log('      4. Restart container: ./deploy.sh deploy')
      }

      if (test.name.includes('Webhook Endpoint')) {
        console.log('   🔧 Fix:')
        console.log('      1. Check nginx status: systemctl status nginx')
        console.log('      2. Check nginx config: nginx -t')
        console.log('      3. Reload nginx: systemctl reload nginx')
        console.log('      4. Check DNS: nslookup three-head-dragon.shop')
      }

      if (test.name.includes('Callback')) {
        console.log('   🔧 Fix:')
        console.log('      1. Check if POST endpoint is registered in api_server')
        console.log('      2. Check routing in ai-reels-callback.routes.ts')
        console.log('      3. Verify nginx proxy configuration for POST requests')
      }

      if (test.name.includes('Docker')) {
        console.log('   🔧 Fix:')
        console.log('      1. Start container: ./deploy.sh deploy')
        console.log('      2. Check .env file exists and is valid')
        console.log('      3. Rebuild image: docker build --no-cache --pull -t 999-agents-telegraf:latest .')
      }
    })
  } else {
    console.log('\n✅ All tests passed! Webhook endpoint is healthy.')
  }

  console.log('\n' + '='.repeat(80))
}

async function main() {
  console.log('🚀 WEBHOOK ENDPOINT HEALTH CHECK')
  console.log('URL:', WEBHOOK_URL)
  console.log('Time:', new Date().toISOString())
  console.log('')

  try {
    const results = await testWebhookEndpoint()
    await generateReport(results)

    // Exit code based on results
    const failed = results.filter(r => !r.success).length
    process.exit(failed > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n💥 CRITICAL ERROR:', error)
    process.exit(1)
  }
}

// Запуск при вызове напрямую
if (require.main === module) {
  main()
}

export { testWebhookEndpoint, generateReport }
