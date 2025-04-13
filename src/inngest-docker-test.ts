#!/usr/bin/env node
/**
 * Минимальный тест Inngest без использования Inngest класса
 */
import 'dotenv/config'
import axios, { AxiosError } from 'axios'
import { logger } from './utils/logger'

/**
 * Отправляет тестовое событие напрямую через HTTP API
 */
async function sendTestEvent() {
  const eventKey = process.env.INNGEST_EVENT_KEY || 'dev-key'
  const eventUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:8288/e/' + eventKey
      : 'https://api.inngest.com/e/' + eventKey

  try {
    logger.info({
      message: '🚀 Отправка тестового события через HTTP API',
      description: 'Sending test event via HTTP API',
      event_url: eventUrl,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })

    // Формируем тело события в соответствии с API Inngest
    const eventPayload = {
      name: 'neuro/photo-v2.generate',
      data: {
        prompt: 'shaman',
        num_images: 1,
        telegram_id: '123456789',
        is_ru: true,
        bot_name: 'test_bot',
      },
      id: `test-event-${Date.now()}`,
      ts: new Date().toISOString(),
    }

    // Отправляем событие
    const response = await axios.post(eventUrl, eventPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    logger.info({
      message: '✅ Тестовое событие успешно отправлено',
      description: 'Test event sent successfully',
      status: response.status,
      data: response.data,
      timestamp: new Date().toISOString(),
    })

    return {
      success: true,
      message: 'Тестовое событие успешно отправлено',
      response: {
        status: response.status,
        data: response.data,
      },
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const responseData = (error as AxiosError)?.response?.data
    const responseStatus = (error as AxiosError)?.response?.status

    logger.error({
      message: '❌ Ошибка при отправке тестового события',
      description: 'Error sending test event',
      error: errorMessage,
      response_data: responseData,
      response_status: responseStatus,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      message: 'Ошибка при отправке тестового события',
      error: errorMessage,
      response: responseData
        ? {
            status: responseStatus,
            data: responseData,
          }
        : undefined,
    }
  }
}

/**
 * Проверяет статус Inngest Dev Server
 */
async function checkInngestStatus() {
  try {
    const statusUrl = 'http://localhost:8288/health'

    logger.info({
      message: '🔍 Проверка статуса Inngest Dev Server',
      description: 'Checking Inngest Dev Server status',
      url: statusUrl,
      timestamp: new Date().toISOString(),
    })

    const response = await axios.get(statusUrl)

    logger.info({
      message: '✅ Inngest Dev Server доступен',
      description: 'Inngest Dev Server is available',
      status: response.status,
      data: response.data,
      timestamp: new Date().toISOString(),
    })

    return {
      success: true,
      message: 'Inngest Dev Server доступен',
      response: {
        status: response.status,
        data: response.data,
      },
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'

    logger.error({
      message: '❌ Ошибка при проверке статуса Inngest Dev Server',
      description: 'Error checking Inngest Dev Server status',
      error: errorMessage,
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      message: 'Ошибка при проверке статуса Inngest Dev Server',
      error: errorMessage,
    }
  }
}

/**
 * Запускает все тесты
 */
async function runTests() {
  logger.info({
    message: '🧪 Запуск тестов Inngest',
    description: 'Running Inngest tests',
    timestamp: new Date().toISOString(),
  })

  // Проверяем статус Inngest Dev Server
  await checkInngestStatus()

  // Отправляем тестовое событие
  await sendTestEvent()

  logger.info({
    message: '🏁 Тесты Inngest завершены',
    description: 'Inngest tests completed',
    timestamp: new Date().toISOString(),
  })
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  logger.info({
    message: '🚀 Запуск тестов Inngest',
    description: 'Starting Inngest tests',
    timestamp: new Date().toISOString(),
  })

  runTests()
    .then(() => {
      logger.info({
        message: '✅ Тесты Inngest успешно выполнены',
        description: 'Inngest tests completed successfully',
        timestamp: new Date().toISOString(),
      })
    })
    .catch(error => {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов Inngest',
        description: 'Critical error running Inngest tests',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
      process.exit(1)
    })
}

export { sendTestEvent, checkInngestStatus, runTests }
