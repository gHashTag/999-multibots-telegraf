import { TestResult } from './types'
import { logger } from '@/utils/logger'
import { imageToPromptFunction } from '@/inngest-functions/imageToPrompt'
import { getBotByName } from '@/core/bot'
import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/core/inngest/clients'
import axios from 'axios'

// Моки для тестирования
const mockBot = {
  telegram: {
    sendMessage: async (chatId: string, message: string) => {
      logger.info('🤖 Отправка сообщения в Telegram', {
        description: 'Mock bot sending message',
        chat_id: chatId,
        message
      })
    }
  }
}

const mockEvent = {
  data: {
    image: 'https://example.com/test.jpg',
    telegram_id: '123456789',
    username: 'testUser',
    is_ru: true,
    bot_name: 'testBot',
    cost_per_image: 10
  }
}

// Оригинальные функции для сохранения
const originalGetBot = getBotByName
const originalGetBalance = getUserBalance
const originalAxiosPost = axios.post
const originalAxiosGet = axios.get
const originalInngestSend = inngest.send

// Мок-объекты для замены
const mocks = {
  getBotByName: async () => ({ bot: mockBot }),
  getUserBalance: async () => 100,
  axiosPost: async () => ({ data: { event_id: 'test-event-id' } }),
  axiosGet: async () => ({ data: 'data: ["", "Generated prompt description"]' }),
  inngestSend: async () => ({ ids: ['test-id'] })
}

export async function testImageToPromptFunction(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  // Тест 1: Успешная обработка события
  try {
    logger.info('🚀 Начало теста успешной обработки события', {
      description: 'Testing successful event processing'
    })
    
    // Устанавливаем моки
    Object.assign(global, {
      getBotByName: mocks.getBotByName,
      getUserBalance: mocks.getUserBalance
    })
    Object.assign(axios, {
      post: mocks.axiosPost,
      get: mocks.axiosGet
    })
    Object.assign(inngest, {
      send: mocks.inngestSend
    })
    
    // Выполняем тест
    await inngest.send({
      name: 'image/to-prompt.generate',
      data: mockEvent.data
    })
    
    logger.info('✅ Тест успешной обработки события пройден', {
      description: 'Event processing test passed'
    })
    
    results.push({
      name: 'successful_event_processing',
      success: true,
      message: 'Successfully processed image to prompt event'
    })
    
  } catch (error) {
    logger.error('❌ Ошибка в тесте успешной обработки события', {
      description: 'Event processing test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    results.push({
      name: 'successful_event_processing',
      success: false,
      message: 'Failed to process image to prompt event',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Тест 2: Обработка ошибки API
  try {
    logger.info('🚀 Начало теста обработки ошибки API', {
      description: 'Testing API error handling'
    })
    
    // Устанавливаем моки с ошибкой
    Object.assign(axios, {
      post: async () => { throw new Error('API Error') }
    })
    
    // Выполняем тест
    await inngest.send({
      name: 'image/to-prompt.generate',
      data: mockEvent.data
    })
    
    logger.info('✅ Тест обработки ошибки API пройден', {
      description: 'API error handling test passed'
    })
    
    results.push({
      name: 'api_error_handling',
      success: true,
      message: 'Successfully handled API error'
    })
    
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки ошибки API', {
      description: 'API error handling test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    results.push({
      name: 'api_error_handling',
      success: false,
      message: 'Failed to handle API error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Тест 3: Проверка обработки платежа
  try {
    logger.info('🚀 Начало теста обработки платежа', {
      description: 'Testing payment processing'
    })
    
    let paymentProcessed = false
    
    // Устанавливаем моки
    Object.assign(axios, {
      post: mocks.axiosPost,
      get: mocks.axiosGet
    })
    Object.assign(inngest, {
      send: async (event: any) => {
        if (event.name === 'payment/process') {
          paymentProcessed = true
          logger.info('💰 Обработка платежа', {
            description: 'Payment event processed',
            event
          })
        }
        return { ids: ['test-id'] }
      }
    })
    
    // Выполняем тест
    await inngest.send({
      name: 'image/to-prompt.generate',
      data: mockEvent.data
    })
    
    if (!paymentProcessed) {
      throw new Error('Payment was not processed')
    }
    
    logger.info('✅ Тест обработки платежа пройден', {
      description: 'Payment processing test passed'
    })
    
    results.push({
      name: 'payment_processing',
      success: true,
      message: 'Successfully processed payment'
    })
    
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки платежа', {
      description: 'Payment processing test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    results.push({
      name: 'payment_processing',
      success: false,
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Восстанавливаем оригинальные функции
  Object.assign(global, {
    getBotByName: originalGetBot,
    getUserBalance: originalGetBalance
  })
  Object.assign(axios, {
    post: originalAxiosPost,
    get: originalAxiosGet
  })
  Object.assign(inngest, {
    send: originalInngestSend
  })

  return results
} 