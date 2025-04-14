/**
 * Тест для NeuroPhoto 1 с реальным API и отправкой в Telegram
 */

import { Telegraf } from 'telegraf'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { generateGptPrompt } from './gptPromptGenerator'
import { ModeEnum } from '@/interfaces/modes'
import { MyContext } from '@/interfaces'
import { TestResult } from '@/test-utils/types'

// Загружаем переменные окружения
dotenv.config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
})

// Проверяем наличие ADMIN_TELEGRAM_ID
if (!process.env.ADMIN_TELEGRAM_ID) {
  throw new Error('❌ Не указан ADMIN_TELEGRAM_ID в .env файле')
}

// Константы
const TELEGRAM_GROUP_ID =
  process.env.TELEGRAM_GROUP_ID || '@neuro_blogger_pulse' // ID тестовой группы
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '' // Токен бота (будет проверка перед использованием)
const TEST_USER = {
  telegram_id: process.env.ADMIN_TELEGRAM_ID,
  username: 'test_user',
  is_ru: true,
} // Тестовый пользователь

// Директория для логов
const LOG_DIR = path.join(__dirname, 'logs')

// Создаем директорию для логов, если она не существует
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// Добавляем таймаут для теста
const TEST_TIMEOUT = 180000 // 180 секунд (3 минуты) на выполнение

// Options for neuro photo generation with bypass for testing
const TEST_OPTIONS = {
  prompt: `NEUROCODER Ultra-realistic fashion editorial portrait of a striking bald male model with sharp cheekbones, piercing blue eyes, and a strong jawline. He's wearing an extravagant Balenciaga oversized structured coat in metallic silver over a Tom Ford black turtleneck. The model has perfect skin texture with visible pores and subtle stubble. Background features abstract color blocks in vibrant teal and burnt orange. Studio lighting creates dramatic shadows across his face, emphasizing the elegant bone structure. Shot on Hasselblad medium format camera with 100MP resolution, shallow depth of field with the model in perfect focus against the softly blurred background. The styling includes minimal avant-garde silver accessories from Cartier, creating a futuristic high-fashion aesthetic. The composition follows golden ratio principles with the model positioned slightly off-center. Color grading has rich, saturated tones with slight contrast enhancement typical of high-end magazine spreads. The overall mood is sophisticated, powerful, and artistically compelling. Hyperrealistic rendering with meticulous attention to textile textures, skin details, and subtle lighting reflections. 8K resolution, magazine-quality fashion photograph suitable for Vogue Homme or GQ editorial spread. Inspired by the photographic styles of Steven Klein, David Sims, Peter Lindbergh, Nick Knight, and Tim Walker.`,
  model_url:
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
  numImages: 1,
  telegram_id: TEST_USER.telegram_id,
  username: TEST_USER.username,
  is_ru: TEST_USER.is_ru,
  bot_name: 'neuro_blogger_bot',
  bypass_payment_check: true, // Bypass payment check for testing purposes
}

/**
 * Записывает данные в лог-файл для дебага
 * @param data Данные для записи
 * @param prefix Префикс имени файла
 */
function writeToLogFile(data: any, prefix: string): void {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const logPath = path.join(LOG_DIR, `${prefix}-${timestamp}.json`)
    fs.writeFileSync(logPath, JSON.stringify(data, null, 2))
    console.log(`📝 Лог записан в файл: ${logPath}`)
  } catch (error) {
    console.error('❌ Ошибка при записи лога:', error)
  }
}

/**
 * Основная функция для тестирования прямой генерации нейрофото
 */
export async function testNeuroPhoto1(): Promise<boolean> {
  console.log(
    '🚀 Starting NeuroPhoto 1 test (Man portrait with OpenAI prompt)...'
  )

  // Добавляем таймаут для теста
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Тест прерван по таймауту (3 минуты)'))
    }, TEST_TIMEOUT)
  })

  try {
    console.log('🚀 Запускаем тест креативного фэшн-фотосета')

    // Проверка с таймаутом
    return Promise.race([testNeuroPhotoInternal(), timeoutPromise])
  } catch (error) {
    console.error('❌ Критическая ошибка при выполнении теста:', error)
    return false
  }
}

/**
 * Внутренняя функция теста без таймаута
 */
async function testNeuroPhotoInternal(): Promise<boolean> {
  // Добавляем переменную для отслеживания времени выполнения
  const startTime = Date.now()

  try {
    // 1. Проверяем необходимые переменные окружения
    if (!BOT_TOKEN) {
      console.error(
        '❌ Критическая ошибка: Не указан TELEGRAM_BOT_TOKEN в .env файле'
      )
      return false
    }

    console.log('✅ Переменные окружения проверены')

    // 2. Инициализируем бота
    const bot = new Telegraf(BOT_TOKEN)
    console.log('✅ Бот Telegram инициализирован')

    // Попытка отправить сообщение в группу
    try {
      // 3. Отправляем начальное сообщение в тестовую группу
      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        `🚀 *Создаем фэшн-портрет мужчины*\n\nСейчас будет сгенерирован промпт и фотография`,
        { parse_mode: 'Markdown' }
      )

      console.log('✅ Initial message sent to Telegram group')
    } catch (telegramError) {
      console.error(
        '❌ Ошибка при отправке сообщения в Telegram:',
        telegramError
      )
      console.log('⚠️ Продолжаем тест без отправки сообщений в Telegram')
    }

    // 4. Генерируем креативный промпт с помощью GPT
    try {
      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        `🎨 *Генерируем промпт для фэшн-портрета мужчины...*`,
        { parse_mode: 'Markdown' }
      )
    } catch (telegramError) {
      console.error(
        '❌ Ошибка при отправке сообщения в Telegram:',
        telegramError
      )
    }

    // Генерируем креативный, длинный, детализированный промпт с помощью GPT
    console.log('🔍 Generating prompt using OpenAI...')
    const gptPrompt = await generateGptPrompt()

    console.log(
      '✅ OpenAI prompt received:',
      gptPrompt.substring(0, 100) + '...'
    )

    // 5. Запускаем генерацию изображения
    console.log('🖼️ Launching image generation...')
    try {
      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        '🖼️ *Генерируем фэшн-портрет мужчины...*\n\nЭто может занять некоторое время. Пожалуйста, ожидайте.',
        { parse_mode: 'Markdown' }
      )
    } catch (telegramError) {
      console.error(
        '❌ Ошибка при отправке сообщения в Telegram:',
        telegramError
      )
    }

    // Создаем контекст Telegraf для передачи в функцию генерации
    const mockContext: Partial<MyContext> = {
      from: {
        id: Number(TEST_USER.telegram_id),
        username: 'test_user',
        is_bot: false,
        first_name: 'Test User',
      },
      chat: {
        id: Number(TEST_USER.telegram_id),
        type: 'private',
        first_name: 'Test',
        username: 'test_user',
      },
      session: {
        mode: ModeEnum.NeuroPhoto,
        telegram_id: TEST_USER.telegram_id,
        bypass_payment_check: true, // Добавляем флаг для обхода проверки оплаты
        // Прочие необходимые поля сессии
      } as any,
    }

    // Используем прямой вызов с правильными параметрами
    const generationResult = await generateNeuroPhotoDirect(
      gptPrompt,
      TEST_OPTIONS.model_url,
      TEST_OPTIONS.numImages,
      TEST_USER.telegram_id,
      mockContext as MyContext,
      TEST_OPTIONS.bot_name,
      { disable_telegram_sending: false }
    )

    // 6. Проверяем результат генерации
    console.log('✅ Generation result:', generationResult)

    // Записываем результат генерации в лог для анализа
    writeToLogFile(generationResult, 'generation-result')

    // Если результат null или undefined, тест не прошел
    if (!generationResult) {
      console.error('❌ Критическая ошибка: Результат генерации равен null')
      try {
        await bot.telegram.sendMessage(
          TELEGRAM_GROUP_ID,
          `❌ *Тест провален: Результат генерации равен null*\n\nПроверьте логи для получения дополнительной информации.`,
          { parse_mode: 'Markdown' }
        )
      } catch (sendError) {
        console.error('❌ Ошибка при отправке сообщения об ошибке:', sendError)
      }
      return false
    }

    // Проверяем наличие URLs в результате
    if (!generationResult.urls || generationResult.urls.length === 0) {
      console.error('❌ Критическая ошибка: Не получено URLs изображений!')
      try {
        await bot.telegram.sendMessage(
          TELEGRAM_GROUP_ID,
          `❌ *Тест провален - API вернул успех, но без URL изображений*\n\nПроверьте логи для получения дополнительной информации.`,
          { parse_mode: 'Markdown' }
        )
      } catch (sendError) {
        console.error('❌ Ошибка при отправке сообщения об ошибке:', sendError)
      }
      return false // Тест не прошел
    }

    // Флаг для отслеживания успешной отправки хотя бы одного изображения
    let atleastOneImageSent = false

    // 7. Отправляем результат в Telegram группу
    console.log(`✅ Received ${generationResult.urls.length} images`)

    // Перебираем все полученные URL и отправляем изображения
    for (const imageUrl of generationResult.urls) {
      try {
        console.log(`🔗 Sending image: ${imageUrl}`)

        // Пробуем отправить как фото (более предпочтительный вариант)
        await bot.telegram.sendPhoto(
          TELEGRAM_GROUP_ID,
          { url: imageUrl },
          {
            caption: `🌟 *Фэшн-портрет мужчины*\n\n📸 Создано с помощью NeuroPhoto\n\nИспользуйте промпт выше для своих фото`,
            parse_mode: 'Markdown',
          }
        )

        console.log('✅ Image successfully sent as photo')
        atleastOneImageSent = true
      } catch (sendError) {
        console.error('❌ Error sending image as photo:', sendError)

        // Если не удалось отправить как фото, отправляем текстовое сообщение с URL
        try {
          await bot.telegram.sendMessage(
            TELEGRAM_GROUP_ID,
            `⚠️ *Не удалось отправить изображение*\n\n*URL изображения:* \`${imageUrl}\``,
            { parse_mode: 'Markdown' }
          )
          console.log('ℹ️ Отправлено текстовое сообщение с URL изображения')
          atleastOneImageSent = true // URL был отправлен, считаем тест успешным
        } catch (messageError) {
          console.error(
            '❌ Ошибка при отправке текстового сообщения:',
            messageError
          )
        }
      }
    }

    // 8. Проверяем, было ли отправлено хотя бы одно изображение
    if (!atleastOneImageSent) {
      console.error(
        '❌ Критическая ошибка: Не удалось отправить ни одного изображения'
      )
      try {
        await bot.telegram.sendMessage(
          TELEGRAM_GROUP_ID,
          `❌ *Тест провален - не удалось отправить ни одного изображения*\n\nПроверьте логи для получения дополнительной информации.`,
          { parse_mode: 'Markdown' }
        )
      } catch (sendError) {
        console.error('❌ Ошибка при отправке сообщения об ошибке:', sendError)
      }
      return false // Тест не прошел
    }

    // 9. Отправляем итоговое сообщение о завершении теста
    const endTime = Date.now()
    const executionTime = ((endTime - startTime) / 1000).toFixed(2)

    try {
      await bot.telegram.sendMessage(
        TELEGRAM_GROUP_ID,
        `✅ *Готово!*\n\n⏱️ Время генерации: ${executionTime} сек`,
        { parse_mode: 'Markdown' }
      )
    } catch (sendError) {
      console.error('❌ Ошибка при отправке итогового сообщения:', sendError)
    }

    console.log('🏁 Тест креативного фэшн-фотосета успешно завершен')
    return true
  } catch (error) {
    console.error('❌ Критическая ошибка в тесте:', error)
    return false
  }
}

// Основная функция для запуска теста
export async function runNeuroPhotoOneTest(): Promise<TestResult> {
  try {
    console.log('🚀 Запускаем тест креативного фэшн-фотосета')

    // Запускаем тест с таймаутом
    const timeoutDuration = 180000 // 3 минуты
    const testPromise = testNeuroPhotoInternal()

    // Создаем таймаут
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => {
        reject(new Error('❌ Тест был прерван по таймауту (3 минуты)'))
      }, timeoutDuration)
    })

    // Выполняем тест с таймаутом
    const result = await Promise.race([testPromise, timeoutPromise])

    // Проверяем результат и возвращаем соответствующий статус теста
    if (!result) {
      return {
        success: false,
        message:
          '❌ Тест креативного фэшн-фотосета провален. Не удалось сгенерировать или отправить изображения.',
        name: 'Креативный фэшн-фотосет',
      }
    }

    return {
      success: true,
      message: '✅ Тест креативного фэшн-фотосета успешно выполнен!',
      name: 'Креативный фэшн-фотосет',
    }
  } catch (error) {
    return {
      success: false,
      message: `❌ Тест креативного фэшн-фотосета провален: ${error instanceof Error ? error.message : error}`,
      name: 'Креативный фэшн-фотосет',
    }
  }
}

// Запускаем тест, если файл выполняется напрямую
if (require.main === module) {
  runNeuroPhotoOneTest()
    .then(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.message}`)
      process.exit(result.success ? 0 : 1) // Явное указание кода выхода
    })
    .catch(error => {
      console.error('❌ Unhandled error:', error)
      process.exit(1) // Код ошибки при неперехваченном исключении
    })
}
