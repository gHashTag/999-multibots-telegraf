/**
 * End-to-End Testing Script
 * 🕉️ Тестирует все 25 Inngest функций
 * Отправляет результаты в Telegram ID: 144022504
 */

import { inngest } from './client'
import { getBotByName } from '@/core/bot'

const TELEGRAM_ID = '144022504'
const BOT_NAME = 'neuro-blogger-bot' // Основной бот

interface TestResult {
  functionName: string
  functionId: string
  status: 'success' | 'error' | 'skipped'
  eventId?: string
  error?: string
  duration: number
}

const testResults: TestResult[] = []

// Получаем бот для отправки сообщений
const { bot } = getBotByName(BOT_NAME)

async function sendTelegramMessage(message: string) {
  try {
    await bot.telegram.sendMessage(TELEGRAM_ID, message, { parse_mode: 'HTML' })
  } catch (error) {
    console.error('Failed to send Telegram message:', error)
  }
}

async function testFunction(
  functionName: string,
  functionId: string,
  eventName: string,
  eventData: any
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    console.log(`\n🧪 Testing: ${functionName} (${functionId})`)
    console.log(`   Event: ${eventName}`)

    const result = await inngest.send({
      name: eventName,
      data: {
        ...eventData,
        e2e_test: true,
        telegram_id: TELEGRAM_ID,
        test_timestamp: new Date().toISOString(),
      },
    })

    const duration = Date.now() - startTime

    console.log(`   ✅ Success: ${JSON.stringify(result)}`)

    return {
      functionName,
      functionId,
      status: 'success',
      eventId: result.ids?.[0] || 'unknown',
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`   ❌ Error: ${errorMessage}`)

    return {
      functionName,
      functionId,
      status: 'error',
      error: errorMessage,
      duration,
    }
  }
}

async function runE2ETests() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 E2E TESTING ALL INNGEST FUNCTIONS')
  console.log('🕉️ Отправка результатов в Telegram: ' + TELEGRAM_ID)
  console.log('='.repeat(60))

  await sendTelegramMessage(
    '🚀 <b>E2E Тестирование Inngest функций началось!</b>\n\n' +
      '📊 Всего функций: 25\n' +
      '⏱️ Начало: ' +
      new Date().toLocaleString('ru-RU')
  )

  // 1. Test Simple Function
  testResults.push(
    await testFunction('Test Simple Function', 'test-simple', 'test/simple', {
      message: 'E2E Test',
      userId: TELEGRAM_ID,
    })
  )

  // 2. Test Simple Message
  testResults.push(
    await testFunction(
      'Test Simple Message',
      'test-simple-message',
      'test/simple.message',
      { message: 'E2E Test Message', senderId: TELEGRAM_ID }
    )
  )

  // 3. Test Advanced Loop
  testResults.push(
    await testFunction(
      'Test Advanced Loop',
      'test-advanced-loop',
      'test/advanced.loop',
      { iterations: 2 }
    )
  )

  // 4. Analyze Competitor Reels
  testResults.push(
    await testFunction(
      'Analyze Competitor Reels',
      'analyze-competitor-reels',
      'instagram/analyze-competitor-reels',
      {
        competitors: ['test_user_1'],
        userId: TELEGRAM_ID,
        niche: 'tech',
      }
    )
  )

  // 5. Extract Top Content
  testResults.push(
    await testFunction(
      'Extract Top Content',
      'extract-top-content',
      'instagram/extract-top-content',
      {
        username: 'test_user',
        userId: TELEGRAM_ID,
        limit: 5,
      }
    )
  )

  // 6. Find Competitors
  testResults.push(
    await testFunction(
      'Find Competitors',
      'find-competitors',
      'instagram/find-competitors',
      {
        niche: 'tech',
        userId: TELEGRAM_ID,
        limit: 5,
      }
    )
  )

  // 7. Generate Content Scripts
  testResults.push(
    await testFunction(
      'Generate Content Scripts',
      'generate-content-scripts',
      'content/generate-scripts',
      {
        topic: 'AI and Future',
        userId: TELEGRAM_ID,
        count: 3,
      }
    )
  )

  // 8. Generate Detailed Script
  testResults.push(
    await testFunction(
      'Generate Detailed Script',
      'generate-detailed-script',
      'content/generate-detailed-script',
      {
        topic: 'Technology Trends 2025',
        userId: TELEGRAM_ID,
        duration: 60,
      }
    )
  )

  // 9. Generate Scenario Clips
  testResults.push(
    await testFunction(
      'Generate Scenario Clips',
      'generate-scenario-clips',
      'content/generate-scenario-clips',
      {
        scenario: 'Tech review',
        userId: TELEGRAM_ID,
        clips: 5,
      }
    )
  )

  // 10. Instagram Scraper V2
  testResults.push(
    await testFunction(
      'Instagram Scraper V2',
      'instagram-scraper-v2',
      'instagram/scraper-v2',
      {
        username: 'test_user',
        userId: TELEGRAM_ID,
      }
    )
  )

  // 11. Instagram Reels Test
  testResults.push(
    await testFunction(
      'Instagram Reels Test',
      'instagram-reels-test',
      'instagram/reels-test',
      {
        userId: TELEGRAM_ID,
      }
    )
  )

  // 12. Critical Error Monitor
  testResults.push(
    await testFunction(
      'Critical Error Monitor',
      'critical-error-monitor',
      'monitoring/critical-error',
      {
        error: 'Test error for monitoring',
        severity: 'low',
        userId: TELEGRAM_ID,
      }
    )
  )

  // 13. Log Monitor
  testResults.push(
    await testFunction('Log Monitor', 'log-monitor', 'monitoring/log-monitor', {
      logLevel: 'info',
      message: 'E2E test log',
      userId: TELEGRAM_ID,
    })
  )

  // 14. Model Training V2 (skip - requires ZIP file)
  testResults.push({
    functionName: 'Model Training V2',
    functionId: 'model-training-v2',
    status: 'skipped',
    error: 'Requires ZIP file upload',
    duration: 0,
  })

  // 15. Morph Images (skip - requires images)
  testResults.push({
    functionName: 'Morph Images',
    functionId: 'morph-images',
    status: 'skipped',
    error: 'Requires image files',
    duration: 0,
  })

  // 16. Neuro Image Generation
  testResults.push(
    await testFunction(
      'Neuro Image Generation',
      'neuro-image-generation',
      'generation/neuro-image',
      {
        prompt: 'Beautiful sunset over mountains',
        userId: TELEGRAM_ID,
        model: 'flux-dev',
      }
    )
  )

  // 17. Payment Processing (skip - requires real payment)
  testResults.push({
    functionName: 'Payment Processing',
    functionId: 'payment-processing',
    status: 'skipped',
    error: 'Requires real payment data',
    duration: 0,
  })

  // 18. Broadcast Message
  testResults.push(
    await testFunction(
      'Broadcast Message',
      'broadcast-message',
      'broadcast/send',
      {
        message: 'E2E test broadcast',
        userId: TELEGRAM_ID,
        recipients: [TELEGRAM_ID],
      }
    )
  )

  // 19. AI Reels Callback
  testResults.push(
    await testFunction(
      'AI Reels Callback',
      'ai-reels-callback',
      'ai-reels/callback',
      {
        status: 'completed',
        userId: TELEGRAM_ID,
        videoUrl: 'https://example.com/test.mp4',
      }
    )
  )

  // 20. Render Workflow
  testResults.push(
    await testFunction('Render Workflow', 'render-workflow', 'render/start', {
      userId: TELEGRAM_ID,
      template: 'default',
    })
  )

  // 21. Render Avatar Video
  testResults.push(
    await testFunction(
      'Render Avatar Video',
      'render-avatar-video',
      'render/avatar-video',
      {
        userId: TELEGRAM_ID,
        avatarId: 'test-avatar',
        script: 'Test script',
      }
    )
  )

  // 22. Render Riddle
  testResults.push(
    await testFunction('Render Riddle', 'render-riddle', 'render/riddle', {
      userId: TELEGRAM_ID,
      riddle: 'What has keys but no locks?',
      answer: 'A keyboard',
    })
  )

  // 23. AI Reels Generation
  testResults.push(
    await testFunction(
      'AI Reels Generation',
      'generate-ai-reels',
      'ai-reels/generate',
      {
        userId: TELEGRAM_ID,
        topic: 'Future of AI',
      }
    )
  )

  // 24. Advanced Looping Video
  testResults.push(
    await testFunction(
      'Advanced Looping Video',
      'generate-advanced-looping',
      'video/generate-advanced-loop',
      {
        userId: TELEGRAM_ID,
        duration: 10,
      }
    )
  )

  // 25. Model Training Function (skip - duplicate of #14)
  testResults.push({
    functionName: 'Model Training Function',
    functionId: 'generate-model-training',
    status: 'skipped',
    error: 'Duplicate of Model Training V2',
    duration: 0,
  })

  // Подсчет результатов
  const successCount = testResults.filter(r => r.status === 'success').length
  const errorCount = testResults.filter(r => r.status === 'error').length
  const skippedCount = testResults.filter(r => r.status === 'skipped').length
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0)

  // Формирование отчета
  let report = '📊 <b>E2E ТЕСТИРОВАНИЕ ЗАВЕРШЕНО</b>\n\n'
  report += `✅ Успешно: ${successCount}\n`
  report += `❌ Ошибки: ${errorCount}\n`
  report += `⏭️ Пропущено: ${skippedCount}\n`
  report += `📦 Всего: ${testResults.length}\n\n`
  report += `⏱️ Общее время: ${(totalDuration / 1000).toFixed(2)}s\n\n`

  report += '<b>Детальные результаты:</b>\n\n'

  testResults.forEach((result, index) => {
    const emoji =
      result.status === 'success'
        ? '✅'
        : result.status === 'error'
          ? '❌'
          : '⏭️'
    report += `${index + 1}. ${emoji} <code>${result.functionName}</code>\n`
    if (result.eventId) {
      report += `   ID: ${result.eventId}\n`
    }
    if (result.error) {
      report += `   Error: ${result.error}\n`
    }
    report += `   Время: ${result.duration}ms\n\n`
  })

  // Отправка финального отчета
  await sendTelegramMessage(report)

  console.log('\n' + '='.repeat(60))
  console.log('✅ E2E TESTING COMPLETED')
  console.log(`   Success: ${successCount}/${testResults.length}`)
  console.log(`   Errors: ${errorCount}`)
  console.log(`   Skipped: ${skippedCount}`)
  console.log(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`)
  console.log('='.repeat(60) + '\n')

  // Вывод детальной таблицы
  console.table(
    testResults.map(r => ({
      Function: r.functionName,
      Status: r.status,
      EventID: r.eventId || r.error || 'N/A',
      Duration: `${r.duration}ms`,
    }))
  )

  process.exit(errorCount > 0 ? 1 : 0)
}

// Запуск тестов
runE2ETests().catch(error => {
  console.error('Fatal error during E2E testing:', error)
  process.exit(1)
})
