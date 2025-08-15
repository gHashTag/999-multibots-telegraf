#!/usr/bin/env bun

import { inngest } from '../src/inngest_app/client'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Загружаем .env
dotenv.config({ path: resolve(__dirname, '../.env') })

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

async function testInngestLipSync() {
  console.log(`${colors.cyan}🕉️ === ТЕСТИРОВАНИЕ INNGEST LIPSYNC ===${colors.reset}\n`)

  // Проверяем что Inngest сервер доступен
  const inngestUrl = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:8288'
    : 'https://ai-server-u14194.vm.elestio.app/api/inngest'

  console.log(`${colors.blue}🔍 Проверяем Inngest сервер: ${inngestUrl}${colors.reset}`)

  try {
    const response = await fetch(inngestUrl)
    if (response.ok) {
      console.log(`${colors.green}✅ Inngest сервер доступен${colors.reset}`)
    } else {
      console.log(`${colors.yellow}⚠️ Inngest сервер отвечает с кодом: ${response.status}${colors.reset}`)
    }
  } catch (error) {
    console.log(`${colors.red}❌ Не удалось подключиться к Inngest серверу${colors.reset}`)
    console.log(`${colors.red}Ошибка: ${error}${colors.reset}`)
    console.log(`${colors.yellow}Попробуйте запустить: npx inngest-cli@latest dev --port 8288${colors.reset}`)
  }

  // Тестовые данные для липсинга
  const testData = {
    // Используем публичные тестовые файлы
    videoUrl: 'https://replicate.delivery/pbxt/JlyrbsfnfctaN0R7xKtXA8euicilM24OTj7RE9Qgj2mGdAVqA/tmpvub9fleq.png', // Заменить на реальное видео
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Тестовый аудио файл
    telegramId: 'test_user_123',
    chatId: 123456789, // Заменить на реальный chat ID для тестирования
    username: 'test_user',
    isRu: true,
  }

  console.log(`\n${colors.blue}📤 Отправляем событие в Inngest...${colors.reset}`)
  console.log(`${colors.magenta}Данные события:${colors.reset}`)
  console.log(JSON.stringify(testData, null, 2))

  try {
    // Отправляем событие в Inngest
    const eventId = await inngest.send({
      name: 'lipsync/process',
      data: testData,
    })

    console.log(`${colors.green}✅ Событие отправлено успешно!${colors.reset}`)
    console.log(`${colors.green}Event ID: ${eventId}${colors.reset}`)
    console.log(`\n${colors.cyan}📊 Проверьте статус выполнения в Inngest Dashboard:${colors.reset}`)
    console.log(`${colors.cyan}http://localhost:8288${colors.reset}`)

    // Тестируем webhook endpoint
    console.log(`\n${colors.blue}🔔 Тестируем webhook endpoint...${colors.reset}`)
    
    const webhookUrl = 'http://localhost:2999/api/webhooks/replicate/health'
    try {
      const webhookResponse = await fetch(webhookUrl)
      const webhookData = await webhookResponse.json()
      
      console.log(`${colors.green}✅ Webhook endpoint доступен:${colors.reset}`)
      console.log(JSON.stringify(webhookData, null, 2))
    } catch (error) {
      console.log(`${colors.yellow}⚠️ Webhook endpoint недоступен${colors.reset}`)
      console.log(`${colors.yellow}Убедитесь что API сервер запущен на порту 2999${colors.reset}`)
    }

    // Симулируем webhook от Replicate
    console.log(`\n${colors.blue}🎭 Симулируем webhook от Replicate...${colors.reset}`)
    
    const mockWebhookData = {
      id: 'test_prediction_123',
      status: 'succeeded',
      output: 'https://example.com/result-video.mp4',
      webhook_event_type: 'completed',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }

    try {
      const webhookResponse = await fetch('http://localhost:2999/api/webhooks/replicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockWebhookData),
      })

      const result = await webhookResponse.json()
      console.log(`${colors.green}✅ Webhook симуляция отправлена:${colors.reset}`)
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.log(`${colors.red}❌ Ошибка при отправке webhook:${colors.reset}`)
      console.log(`${colors.red}${error}${colors.reset}`)
    }

  } catch (error) {
    console.log(`${colors.red}❌ Ошибка при отправке события в Inngest:${colors.reset}`)
    console.log(`${colors.red}${error}${colors.reset}`)
    
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.log(`\n${colors.yellow}💡 Подсказки:${colors.reset}`)
      console.log(`${colors.yellow}1. Запустите Inngest Dev Server: npx inngest-cli@latest dev --port 8288${colors.reset}`)
      console.log(`${colors.yellow}2. Запустите API сервер: npm run start:api${colors.reset}`)
      console.log(`${colors.yellow}3. Проверьте переменные окружения в .env${colors.reset}`)
    }
  }
}

// Запускаем тест
testInngestLipSync()
  .then(() => {
    console.log(`\n${colors.green}✅ Тестирование завершено${colors.reset}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n${colors.red}❌ Критическая ошибка: ${error}${colors.reset}`)
    process.exit(1)
  })
