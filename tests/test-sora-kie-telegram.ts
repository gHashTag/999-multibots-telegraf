/**
 * Тест генерации видео через Sora 2 API (Kie.ai) с отправкой в Telegram
 *
 * ВАЖНО: Все API ключи загружаются из .env файла!
 * Перед запуском убедитесь, что в .env есть:
 * - KIE_AI_API_KEY
 * - BOT_TOKEN
 *
 * Этот тест проверяет:
 * 1. Работу KieAiProvider с моделями Sora 2
 * 2. Генерацию профессионального промпта
 * 3. Отправку результата в Telegram
 */

import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'
import { Telegraf } from 'telegraf'
import * as dotenv from 'dotenv'

// Загрузка переменных окружения из .env
dotenv.config()

// Проверка наличия необходимых ключей
if (!process.env.KIE_AI_API_KEY) {
  console.error('❌ ERROR: KIE_AI_API_KEY not found in .env file!')
  process.exit(1)
}

if (!process.env.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN not found in .env file!')
  process.exit(1)
}

const TELEGRAM_ID = '144022504' // Telegram ID для отправки результата

async function testSoraGeneration() {
  console.log('\n🎬 Тест генерации видео через Sora 2 (Kie.ai)\n')
  console.log('=' .repeat(50))

  // Инициализация провайдера
  const provider = new KieAiProvider()

  // Инициализация Telegram бота
  const bot = new Telegraf(process.env.BOT_TOKEN || '')

  try {
    // Шаг 1: Создаем профессиональный промпт
    const userIdea = 'робот идет по улице ночного города'

    console.log('\n📝 ИСХОДНАЯ ИДЕЯ ПОЛЬЗОВАТЕЛЯ:')
    console.log(userIdea)

    // Профессиональный промпт по гайду OpenAI
    const enhancedPrompt = `Cinematic sci-fi style, wide tracking shot at street level,
humanoid robot with glowing blue circuitry walks slowly through rain-soaked neon-lit street,
wet pavement reflecting colorful shop signs and holograms,
camera tracks from behind at walking pace, low angle emphasizing robot against towering buildings,
dramatic single-source lighting from overhead neon, blue-purple color palette with warm accent lights,
ambient sound of rain, distant traffic, mechanical footsteps`

    console.log('\n✨ УЛУЧШЕННЫЙ ПРОМПТ (по гайду OpenAI):')
    console.log(enhancedPrompt)
    console.log('\n' + '='.repeat(50))

    // Шаг 2: Тест с Sora 2 (Standard)
    console.log('\n🎬 ТЕСТ 1: Sora 2 (Standard)')
    console.log('─'.repeat(50))

    const request1 = {
      model: 'sora-2',
      prompt: enhancedPrompt,
      duration: 10,
      aspectRatio: '16:9' as '16:9',
    }

    console.log('\n⏳ Отправка запроса в Kie.ai...')
    console.log('Модель:', request1.model)
    console.log('Длительность:', request1.duration, 'секунд')
    console.log('Ожидаемая стоимость: ~94⭐ (за 10 сек)')

    const result1 = await provider.generateVideo(request1)

    if (!result1.success) {
      console.error('\n❌ ОШИБКА:', result1.error)
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `❌ Тест Sora 2 (Standard) не прошел:\n\n${result1.error}`
      )
      return
    }

    console.log('\n✅ УСПЕШНО СГЕНЕРИРОВАНО!')
    console.log('Task ID:', result1.data?.taskId)
    console.log('Стоимость: $' + result1.cost.usd.toFixed(3), '(' + result1.cost.stars + '⭐)')
    console.log('Провайдер:', result1.provider)
    console.log('Время обработки:', result1.processingTime, 'мс')

    // Отправка уведомления в Telegram
    await bot.telegram.sendMessage(
      TELEGRAM_ID,
      `✅ Sora 2 (Standard) - Генерация запущена!

📊 Детали:
• Task ID: ${result1.data?.taskId}
• Модель: ${result1.model}
• Стоимость: $${result1.cost.usd.toFixed(3)} (${result1.cost.stars}⭐)
• Провайдер: ${result1.provider}

⏳ Ожидайте результат через ~90 секунд...`
    )

    // Шаг 3: Polling статуса (до 3 минут)
    console.log('\n⏳ Ожидание завершения генерации...')
    const taskId = result1.data?.taskId

    if (!taskId) {
      console.error('❌ Task ID не получен!')
      return
    }

    let attempts = 0
    const maxAttempts = 36 // 36 * 5 сек = 3 минуты
    let videoUrl: string | undefined

    while (attempts < maxAttempts) {
      attempts++
      console.log(`\n🔄 Попытка ${attempts}/${maxAttempts}...`)

      await new Promise(resolve => setTimeout(resolve, 5000)) // Ждем 5 секунд

      const status = await provider.checkVideoStatus(taskId)

      if (status.success && status.data?.videoUrl) {
        videoUrl = status.data.videoUrl
        console.log('\n🎉 ВИДЕО ГОТОВО!')
        console.log('URL:', videoUrl)
        break
      }

      if (!status.success && status.error) {
        console.error('\n❌ ОШИБКА:', status.error)
        await bot.telegram.sendMessage(
          TELEGRAM_ID,
          `❌ Ошибка генерации Sora 2:\n\n${status.error}`
        )
        return
      }

      console.log('⏳ Все еще обрабатывается...')
    }

    // Шаг 4: Отправка видео в Telegram
    if (videoUrl) {
      console.log('\n📤 Отправка видео в Telegram...')

      try {
        await bot.telegram.sendVideo(
          TELEGRAM_ID,
          videoUrl,
          {
            caption: `🎬 Sora 2 (Standard) - Готово!

📝 Промпт:
${userIdea}

✨ Улучшенный промпт:
${enhancedPrompt.substring(0, 200)}...

📊 Характеристики:
• Модель: Sora 2 (Kie.ai)
• Длительность: 10 секунд
• Стоимость: $${result1.cost.usd.toFixed(3)} (${result1.cost.stars}⭐)
• Провайдер: ${result1.provider}

🎯 Видео сгенерировано по официальному Sora 2 Prompting Guide от OpenAI`
          }
        )

        console.log('✅ Видео успешно отправлено!')
      } catch (error) {
        console.error('❌ Ошибка отправки видео:', error)
        await bot.telegram.sendMessage(
          TELEGRAM_ID,
          `✅ Видео сгенерировано, но не удалось отправить!\n\nURL: ${videoUrl}`
        )
      }
    } else {
      console.log('\n⏱️ ТАЙМАУТ: Видео не успело сгенерироваться за 3 минуты')
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `⏱️ Таймаут: видео все еще генерируется.\n\nTask ID: ${taskId}\n\nПроверьте статус позже.`
      )
    }

    console.log('\n' + '='.repeat(50))
    console.log('✅ ТЕСТ ЗАВЕРШЕН!')
    console.log('='.repeat(50) + '\n')

  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error)

    await bot.telegram.sendMessage(
      TELEGRAM_ID,
      `❌ Критическая ошибка теста Sora 2:\n\n${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Запуск теста
testSoraGeneration()
  .then(() => {
    console.log('\n✅ Скрипт завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Необработанная ошибка:', error)
    process.exit(1)
  })
