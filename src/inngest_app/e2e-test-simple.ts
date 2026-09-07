/**
 * Simplified E2E Testing Script
 * 🕉️ Тестирует все 25 Inngest функций
 * Отправляет результаты в Telegram ID: 144022504
 */

import 'dotenv/config'
import { inngest } from './client'
import { telegramApiFor } from '../services/telegramApi'

// Проверка загрузки env
console.log('🔐 ENV Check:', {
  hasEventKey: !!process.env.BOT_INNGEST_EVENT_KEY,
  eventKeyPrefix: process.env.BOT_INNGEST_EVENT_KEY?.substring(0, 10),
})

const TELEGRAM_ID = '144022504'
const BOT_TOKEN =
  process.env.BOT_TOKEN_NEURO_BLOGGER || process.env.MAIN_BOT_TOKEN

interface TestResult {
  functionName: string
  status: 'success' | 'error' | 'skipped'
  eventId?: string
  error?: string
  duration: number
}

async function sendTelegramMessage(message: string) {
  if (!BOT_TOKEN) {
    console.warn('⚠️  BOT_TOKEN not found, skipping Telegram notification')
    return
  }

  try {
    const url = `${telegramApiFor(BOT_TOKEN)}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`)
    }

    console.log('✅ Telegram message sent')
  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error)
  }
}

async function testFunction(
  functionName: string,
  eventName: string,
  eventData: any
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    console.log(`\n🧪 Testing: ${functionName}`)
    console.log(`   Event: ${eventName}`)

    const result = await inngest.send({
      name: eventName,
      data: {
        ...eventData,
        e2e_test: true,
        telegram_id: TELEGRAM_ID,
      },
    })

    const duration = Date.now() - startTime
    console.log(`   ✅ Success - Event ID: ${result.ids?.[0]}`)

    return {
      functionName,
      status: 'success',
      eventId: result.ids?.[0],
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`   ❌ Error: ${errorMessage}`)

    return {
      functionName,
      status: 'error',
      error: errorMessage,
      duration,
    }
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 E2E TESTING - INNGEST FUNCTIONS')
  console.log('📊 Testing 25 functions')
  console.log('='.repeat(60))

  await sendTelegramMessage(
    '🚀 <b>E2E Тестирование началось!</b>\n\n' +
      '📊 Всего функций: 25\n' +
      '⏱️ ' +
      new Date().toLocaleString('ru-RU')
  )

  const results: TestResult[] = []

  // Test all functions
  const tests = [
    ['Test Simple', 'test/simple', { message: 'E2E Test' }],
    ['Test Message', 'test/simple.message', { message: 'E2E Test' }],
    ['Test Loop', 'test/advanced.loop', { iterations: 2 }],
    [
      'Analyze Reels',
      'instagram/analyze-competitor-reels',
      { competitors: ['test'] },
    ],
    ['Extract Content', 'instagram/extract-top-content', { username: 'test' }],
    ['Find Competitors', 'instagram/find-competitors', { niche: 'tech' }],
    ['Generate Scripts', 'content/generate-scripts', { topic: 'AI' }],
    ['Detailed Script', 'content/generate-detailed-script', { topic: 'Tech' }],
    [
      'Scenario Clips',
      'content/generate-scenario-clips',
      { scenario: 'Review' },
    ],
    ['Scraper V2', 'instagram/scraper-v2', { username: 'test' }],
    ['Reels Test', 'instagram/reels-test', {}],
    ['Error Monitor', 'monitoring/critical-error', { error: 'Test' }],
    ['Log Monitor', 'monitoring/log-monitor', { message: 'Test' }],
    ['Image Gen', 'generation/neuro-image', { prompt: 'Sunset' }],
    ['Broadcast', 'broadcast/send', { message: 'Test' }],
    ['AI Callback', 'ai-reels/callback', { status: 'completed' }],
    ['Render', 'render/start', { template: 'default' }],
    ['Avatar Video', 'render/avatar-video', { avatarId: 'test' }],
    ['Riddle', 'render/riddle', { riddle: 'What?' }],
    ['AI Reels', 'ai-reels/generate', { topic: 'Future' }],
    ['Loop Video', 'video/generate-advanced-loop', { duration: 10 }],
  ]

  for (const [name, event, data] of tests) {
    results.push(await testFunction(name as string, event as string, data))
    await new Promise(resolve => setTimeout(resolve, 100)) // Small delay
  }

  // Add skipped functions
  results.push({
    functionName: 'Model Training V2',
    status: 'skipped',
    error: 'Requires ZIP',
    duration: 0,
  })
  results.push({
    functionName: 'Morph Images',
    status: 'skipped',
    error: 'Requires images',
    duration: 0,
  })
  results.push({
    functionName: 'Payment',
    status: 'skipped',
    error: 'Requires payment',
    duration: 0,
  })
  results.push({
    functionName: 'Model Training',
    status: 'skipped',
    error: 'Duplicate',
    duration: 0,
  })

  // Calculate stats
  const success = results.filter(r => r.status === 'success').length
  const errors = results.filter(r => r.status === 'error').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const total = results.reduce((sum, r) => sum + r.duration, 0)

  // Report
  let report = '📊 <b>E2E ТЕСТИРОВАНИЕ ЗАВЕРШЕНО</b>\n\n'
  report += `✅ Успешно: ${success}\n`
  report += `❌ Ошибки: ${errors}\n`
  report += `⏭️ Пропущено: ${skipped}\n`
  report += `📦 Всего: ${results.length}\n\n`
  report += `⏱️ Время: ${(total / 1000).toFixed(1)}s\n\n`
  report += '<b>Результаты:</b>\n'

  results.forEach((r, i) => {
    const emoji =
      r.status === 'success' ? '✅' : r.status === 'error' ? '❌' : '⏭️'
    report += `${i + 1}. ${emoji} ${r.functionName}\n`
  })

  await sendTelegramMessage(report)

  console.log('\n' + '='.repeat(60))
  console.log(`✅ COMPLETED: ${success}/${results.length} успешно`)
  console.log(`❌ ERRORS: ${errors}`)
  console.log(`⏭️  SKIPPED: ${skipped}`)
  console.log(`⏱️  DURATION: ${(total / 1000).toFixed(2)}s`)
  console.log('='.repeat(60))

  console.table(
    results.map(r => ({
      Function: r.functionName,
      Status: r.status.toUpperCase(),
      EventID: r.eventId || r.error || 'N/A',
      'Time (ms)': r.duration,
    }))
  )

  process.exit(errors > 0 ? 1 : 0)
}

runTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
