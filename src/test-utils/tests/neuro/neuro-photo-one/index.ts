/**
 * Тест для NeuroPhoto 1 с реальным API и отправкой в Telegram
 */

import { Telegraf } from 'telegraf'
import * as dotenv from 'dotenv'
import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { ModeEnum } from '@/interfaces/modes'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import fs from 'fs'
import path from 'path'

// Загружаем переменные окружения из .env.test
dotenv.config({ path: '.env.test' })

// ID группы @neuro_blogger_pulse или другой тестовый канал
const TELEGRAM_GROUP_ID = process.env.TEST_GROUP_ID || '@neuro_blogger_pulse'

// Токен бота
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN_TEST_1

// Тестовый пользователь
const TEST_USER = {
  telegram_id: process.env.TELEGRAM_ID_FOR_TESTS || '144022504',
  username: 'test_user',
}

// Имя бота
const BOT_NAME = 'neuro_blogger_bot'

// URL модели для генерации изображений на Replicate
const MODEL_URL =
  process.env.NEURO_PHOTO_MODEL ||
  'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

// Профессиональный промпт для генерации портрета в стиле GQ
const PROFESSIONAL_PROMPT = `NEUROCODER professional portrait photograph of a confident businessman with thoughtful expression, in elegant tailored formal suit with perfect fit, satin tie, classic pocket square, GQ magazine style editorial, close-up shot, perfect facial features, strong masculine jawline, professional haircut, studio lighting with three-point setup, clean neutral backdrop, blue dramatic background, immaculate grooming, corporate headshot with personality, photorealistic details on skin texture, facial expression conveying leadership, photorealistic, cinematic lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, rich colors, masterpiece, best quality, HDR, UHD, unreal engine, representative, beautiful face, rich in details, high quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines, professional photograph, perfect composition`

// Создаем директорию для логов
const LOG_DIR = path.join(__dirname, 'logs')
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// Функция для записи данных в лог-файл
function writeToLogFile(data: any, prefix: string = 'api-response') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logFilePath = path.join(LOG_DIR, `${prefix}-${timestamp}.json`)
  fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2))
  console.log(`📝 Данные записаны в лог: ${logFilePath}`)
  return logFilePath
}

// Основной тест для NeuroPhoto 1
async function testNeuroPhoto1() {
  // Засекаем время начала теста
  const startTime = Date.now()

  console.log('🚀 Запуск теста NeuroPhoto 1 с реальным API')
  console.log(`👥 Группа для отправки: ${TELEGRAM_GROUP_ID}`)
  console.log(`🤖 Бот: ${BOT_NAME}`)
  console.log(`👤 Тестовый пользователь: ${TEST_USER.telegram_id}`)
  console.log(`🔗 Модель: ${MODEL_URL}`)

  try {
    // Инициализируем бота для отправки результатов
    if (!BOT_TOKEN) {
      throw new Error('❌ Токен бота не найден в .env.test')
    }

    const bot = new Telegraf(BOT_TOKEN)

    // 1. Отправляем сообщение о начале теста
    await bot.telegram.sendMessage(
      TELEGRAM_GROUP_ID,
      `🚀 *Тестирование NeuroPhoto 1 (GQ-портрет)*\n\nТестовый пользователь: \`${TEST_USER.telegram_id}\`\nБот: ${BOT_NAME}\nМодель: \`${MODEL_URL.slice(0, 30)}...\`\n\nГенерируем изображение напрямую через API...`,
      { parse_mode: 'Markdown' }
    )
    console.log('✅ Отправлено сообщение о начале теста')

    // 2. Отправляем промпт который будем использовать
    await bot.telegram.sendMessage(
      TELEGRAM_GROUP_ID,
      `📝 *Промпт для генерации GQ-портрета:*\n\n\`\`\`\n${PROFESSIONAL_PROMPT}\n\`\`\``,
      { parse_mode: 'Markdown' }
    )
    console.log('📝 Промпт:', PROFESSIONAL_PROMPT.substring(0, 100) + '...')

    // 3. Создаем контекст для вызова функции generateNeuroPhotoDirect
    const mockContext: Partial<MyContext> = {
      from: {
        id: Number(TEST_USER.telegram_id),
        username: TEST_USER.username,
        is_bot: false,
        first_name: 'Test User',
      },
      chat: {
        id: Number(TEST_USER.telegram_id),
        type: 'private',
        first_name: 'Test',
        username: TEST_USER.username,
      },
      reply: async text => {
        console.log(`💬 [Бот -> пользователю]: ${text}`)
        // Дублируем сообщение в группу
        await bot.telegram.sendMessage(
          TELEGRAM_GROUP_ID,
          `💬 [Бот -> пользователю]: ${text}`
        )
        // Возвращаем пустой объект сообщения, чтобы соответствовать типу
        return {} as any
      },
      session: {
        email: 'test@example.com',
        selectedModel: MODEL_URL,
        prompt: PROFESSIONAL_PROMPT,
        selectedSize: '1:1',
        userModel: {
          model_name: 'GQ Portrait',
          trigger_word: 'NEUROCODER',
          model_url: MODEL_URL as `${string}/${string}:${string}`,
          model_key: MODEL_URL as `${string}/${string}:${string}`,
        },
        numImages: 1,
        telegram_id: TEST_USER.telegram_id,
        mode: ModeEnum.NeuroPhoto,
        attempts: 0,
        videoModel: '',
        imageUrl: '',
        videoUrl: '',
        audioUrl: '',
        amount: 0,
        subscription: '',
        images: [],
        modelName: 'GQ Portrait',
        targetUserId: 0,
        username: TEST_USER.username,
        triggerWord: '',
        steps: 1,
        inviter: '',
        inviteCode: '',
        invoiceURL: '',
        buttons: [],
        selectedPayment: {
          amount: 0,
          stars: 0,
        },
      },
      attempts: 0,
      amount: 0,
    }

    // 4. Запускаем прямую генерацию через функцию
    console.log(
      '⏳ Запускаем прямую генерацию изображения через generateNeuroPhotoDirect...'
    )
    await bot.telegram.sendMessage(
      TELEGRAM_GROUP_ID,
      '⏳ *Запускаем прямую генерацию изображения через API...*',
      { parse_mode: 'Markdown' }
    )

    // 5. Вызываем функцию напрямую
    console.log('🔄 Вызываем функцию generateNeuroPhotoDirect с реальным API')
    const generationResult = await generateNeuroPhotoDirect(
      PROFESSIONAL_PROMPT,
      MODEL_URL,
      1, // Генерируем одно изображение
      TEST_USER.telegram_id,
      mockContext as MyContext,
      BOT_NAME
    )

    // Подробное логирование ответа для отладки
    console.log('🔍 Подробный вывод результата генерации:')
    console.log('Тип результата:', typeof generationResult)
    console.log('Объект результата:', JSON.stringify(generationResult, null, 2))
    console.log('Успех:', generationResult?.success)
    console.log('Данные:', generationResult?.data)
    console.log('URLs:', generationResult?.urls)

    // Записываем полный ответ в лог-файл для дальнейшего анализа
    const logFilePath = writeToLogFile(generationResult, 'generation-result')

    // Отправим информацию о логе в группу для дебага
    await bot.telegram.sendMessage(
      TELEGRAM_GROUP_ID,
      `📊 *Отладочная информация*\n\nРезультат генерации сохранен в лог: \`${logFilePath}\`\nТип результата: \`${typeof generationResult}\`\nУспех: \`${generationResult?.success}\`\nДанные: \`${generationResult?.data}\`\nURLs: \`${JSON.stringify(generationResult?.urls)}\``,
      { parse_mode: 'Markdown' }
    )

    // 6. Обрабатываем результат
    if (!generationResult || !generationResult.success) {
      const errorMessage =
        generationResult?.data || 'API вернул ошибку при генерации'
      console.error('❌ Ошибка при генерации:', errorMessage)

      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        `❌ *Ошибка при генерации изображения:*\n\n\`${errorMessage}\`\n\nПроверьте настройки и API ключи.`,
        { parse_mode: 'Markdown' }
      )

      throw new Error(`Ошибка при генерации: ${errorMessage}`)
    }

    // 7. Проверяем наличие URL в результате
    console.log('✅ Генерация успешно завершена!')

    if (!generationResult.urls || generationResult.urls.length === 0) {
      console.error('❌ API не вернула URL изображений')
      logger.error({
        message: '❌ API не вернула URL изображений',
        description: 'No URLs returned in API response',
        result: JSON.stringify(generationResult),
      })

      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        '❌ *API не вернула URL изображений*\n\nТест не пройден. Проверьте работу API.',
        { parse_mode: 'Markdown' }
      )

      throw new Error('API не вернула URL изображений')
    }

    console.log('🔗 Получены URLs:', generationResult.urls)
    logger.info({
      message: '🔗 Получены URLs',
      urls: generationResult.urls,
    })

    // 9. Отправляем сгенерированные изображения по их URL
    let atleastOneImageSent = false // Флаг успешной отправки хотя бы одного изображения

    for (const imageUrl of generationResult.urls) {
      try {
        console.log(
          `📤 Отправляем изображение по URL: ${imageUrl.substring(0, 50)}...`
        )

        // Отправляем изображение и информацию о промпте и результате теста
        await bot.telegram.sendPhoto(
          TELEGRAM_GROUP_ID,
          { url: imageUrl },
          {
            caption: `🖼️ *Результат теста генерации*\n\n📝 *Промпт:* \`${PROFESSIONAL_PROMPT.substring(0, 200)}...\`\n\n✅ *Тест успешно выполнен!*\n\nURL: \`${imageUrl}\``,
            parse_mode: 'Markdown',
          }
        )
        console.log('✅ Изображение успешно отправлено в группу')
        atleastOneImageSent = true // Отмечаем успешную отправку
      } catch (sendError) {
        console.error(
          `❌ Ошибка при отправке изображения по URL ${imageUrl}: ${
            sendError instanceof Error ? sendError.message : sendError
          }`
        )

        // В случае ошибки отправляем текстовое сообщение с URL
        try {
          await bot.telegram.sendMessage(
            TELEGRAM_GROUP_ID,
            `⚠️ *Не удалось отправить изображение как фото из-за ошибки:*\n\`${
              sendError instanceof Error ? sendError.message : sendError
            }\`\n\n📝 *Промпт:* \`${PROFESSIONAL_PROMPT.substring(0, 200)}...\`\n\n❌ *Тест не завершен успешно из-за ошибки отправки!*\n\n*URL изображения:* \`${imageUrl}\``,
            { parse_mode: 'Markdown' }
          )
        } catch (msgError) {
          console.error(
            `❌ Не удалось отправить даже текстовое сообщение с URL: ${
              msgError instanceof Error ? msgError.message : msgError
            }`
          )
        }
      }
    }

    // Проверяем, было ли успешно отправлено хотя бы одно изображение
    if (!atleastOneImageSent) {
      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        `❌ *ТЕСТ НЕ ПРОЙДЕН!* Ни одно изображение не удалось отправить в группу.`,
        { parse_mode: 'Markdown' }
      )
      console.error(
        '❌ ТЕСТ НЕ ПРОЙДЕН! Ни одно изображение не удалось отправить в группу.'
      )
      throw new Error(
        'Не удалось отправить ни одно изображение в группу Telegram'
      )
    }

    // 10. Отправляем итоговый отчет о тесте
    await bot.telegram.sendMessage(
      TELEGRAM_GROUP_ID,
      `🏁 *Итоги теста NeuroPhoto 1 (GQ-портрет)*\n\n✅ *Статус:* Успешно\n📊 *Генерация:* ${
        generationResult.urls.length
      } изображений\n📤 *Отправлено в Telegram:* ${atleastOneImageSent ? 'Да' : 'Нет'}\n⏱️ *Время выполнения:* ${
        (Date.now() - startTime) / 1000
      } секунд\n\n📋 *Детали теста:*\n- Модель: \`${MODEL_URL.substring(
        0,
        50
      )}...\`\n- Пользователь: \`${
        TEST_USER.telegram_id
      }\`\n- Сервер: \`${process.env.NODE_ENV}\``,
      { parse_mode: 'Markdown' }
    )

    console.log('🏁 Тест NeuroPhoto 1 (GQ-портрет) завершен успешно')
    return true
  } catch (error) {
    console.error('❌ Ошибка при тестировании NeuroPhoto 1:', error)
    return false
  }
}

// Запускаем тест, если файл запущен напрямую
if (require.main === module) {
  testNeuroPhoto1()
    .then(success => {
      console.log(
        `\n${success ? '✅ Тест NeuroPhoto 1 успешно выполнен' : '❌ Тест NeuroPhoto 1 завершился с ошибкой'}`
      )
      // Завершаем процесс после небольшой задержки
      setTimeout(() => process.exit(success ? 0 : 1), 1000)
    })
    .catch(error => {
      console.error('❌ Неожиданная ошибка:', error)
      process.exit(1)
    })
}
