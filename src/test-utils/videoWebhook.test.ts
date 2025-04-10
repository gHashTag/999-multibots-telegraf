import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import path from 'path'
import fs from 'fs'
import { TEST_CONFIG } from './test-config'

interface TestResult {
  passed: boolean
  description: string
  error?: Error
}

// Функция задержки
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function cleanupTestData(telegram_id: string) {
  // Очищаем тестовые данные из БД
  await supabase.from('assets').delete().eq('telegram_id', telegram_id)

  // Очищаем тестовые файлы
  const testDir = path.join(process.cwd(), 'uploads', telegram_id)
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true })
  }
}

async function runVideoWebhookTest(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const [successSample, failedSample] = TEST_CONFIG.videoWebhook.samples

  logger.info('🚀 Запуск тестов обработки вебхука видео', {
    description: 'Starting video webhook tests',
  })

  try {
    // Очищаем тестовые данные перед запуском
    await cleanupTestData(successSample.telegram_id)

    // Тест 1: Успешная обработка вебхука
    logger.info('🎯 Тест 1: Успешная обработка вебхука', {
      description: 'Test 1: Successful webhook processing',
    })

    const testEvent = {
      name: 'video/webhook',
      data: successSample,
    }

    logger.info('📤 Отправка события в Inngest', {
      description: 'Sending event to Inngest',
      event: testEvent,
    })

    const result = await inngest.send(testEvent)

    logger.info('✅ Событие отправлено', {
      description: 'Event sent',
      event_id: result.ids[0],
    })

    // Ждем обработки события
    logger.info('⏳ Ожидание обработки события...', {
      description: 'Waiting for event processing',
    })

    // Увеличиваем время ожидания до 5 секунд и проверяем каждую секунду
    for (let i = 0; i < 5; i++) {
      await delay(1000)

      logger.info('🔍 Проверка наличия записи в БД...', {
        description: 'Checking database record',
        attempt: i + 1,
      })

      const { data: savedAsset } = await supabase
        .from('assets')
        .select()
        .eq('telegram_id', successSample.telegram_id)
        .single()

      if (savedAsset) {
        logger.info('✅ Запись найдена в БД', {
          description: 'Record found in database',
          asset: savedAsset,
        })
        break
      }

      if (i === 4) {
        throw new Error('Видео не сохранено в БД после 5 секунд ожидания')
      }
    }

    // Проверяем, что видео сохранено в БД
    const { data: savedAsset } = await supabase
      .from('assets')
      .select()
      .eq('telegram_id', successSample.telegram_id)
      .single()

    if (!savedAsset) {
      throw new Error('Видео не сохранено в БД')
    }

    // Проверяем корректность сохраненных данных
    const assetValidation = [
      { field: 'type', expected: 'video' },
      { field: 'trigger_word', expected: 'video' },
      { field: 'telegram_id', expected: successSample.telegram_id },
      { field: 'public_url', expected: successSample.output },
      { field: 'text', expected: successSample.prompt },
      { field: 'model', expected: successSample.videoModel },
    ]

    for (const check of assetValidation) {
      if (savedAsset[check.field] !== check.expected) {
        throw new Error(
          `Неверное значение поля ${check.field}. Ожидалось: ${
            check.expected
          }, Получено: ${savedAsset[check.field]}`
        )
      }
    }

    results.push({
      passed: true,
      description:
        '✅ Тест 1: Видео успешно сохранено в БД с корректными данными',
    })

    // Тест 2: Обработка ошибки
    logger.info('🎯 Тест 2: Обработка ошибки', {
      description: 'Test 2: Error handling',
    })

    const errorEvent = {
      name: 'video/webhook',
      data: failedSample,
    }

    logger.info('📤 Отправка события с ошибкой в Inngest', {
      description: 'Sending error event to Inngest',
      event: errorEvent,
    })

    const errorResult = await inngest.send(errorEvent)

    logger.info('✅ Событие с ошибкой отправлено', {
      description: 'Error event sent',
      event_id: errorResult.ids[0],
    })

    // Ждем обработки события с ошибкой
    logger.info('⏳ Ожидание обработки события с ошибкой...', {
      description: 'Waiting for error event processing',
    })
    await delay(5000) // Ждем 5 секунд

    // Проверяем, что для неуспешного запроса нет записи в БД
    const { data: failedAsset } = await supabase
      .from('assets')
      .select()
      .eq('telegram_id', failedSample.telegram_id)
      .eq('text', failedSample.prompt)
      .single()

    if (failedAsset) {
      throw new Error('Неуспешный запрос не должен создавать запись в БД')
    }

    results.push({
      passed: true,
      description:
        '✅ Тест 2: Ошибка обработана корректно, запись в БД не создана',
    })
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    results.push({
      passed: false,
      description: '❌ Тест провален',
      error: error instanceof Error ? error : new Error('Unknown error'),
    })
  } finally {
    // Очищаем тестовые данные после выполнения
    await cleanupTestData(successSample.telegram_id)
  }

  // Выводим итоговый результат
  const totalTests = results.length
  const passedTests = results.filter(r => r.passed).length

  logger.info('📊 Результаты тестирования', {
    description: 'Test results',
    total: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
  })

  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runVideoWebhookTest().catch(error => {
    logger.error('❌ Ошибка при запуске тестов', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    process.exit(1)
  })
}

export { runVideoWebhookTest }
