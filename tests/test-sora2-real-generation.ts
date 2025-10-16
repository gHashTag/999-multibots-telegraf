/**
 * Реальный тест генерации Sora 2 через Kie.ai с отправкой в Telegram
 *
 * ВАЖНО: Все ключи загружаются из .env!
 * Перед запуском убедитесь что есть:
 * - KIE_AI_API_KEY
 * - BOT_TOKEN
 */

import { KieAiProvider } from '../src/services/video-providers/KieAiProvider'
import { Telegraf } from 'telegraf'
import * as dotenv from 'dotenv'

// Загрузка из .env
dotenv.config()

// Валидация ключей
if (!process.env.KIE_AI_API_KEY) {
  console.error('❌ ERROR: KIE_AI_API_KEY not found in .env!')
  process.exit(1)
}

if (!process.env.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN not found in .env!')
  process.exit(1)
}

const TELEGRAM_ID = '144022504' // ID для отправки результата

async function testSora2Generation() {
  console.log('\n🎬 РЕАЛЬНЫЙ ТЕСТ SORA 2 (Kie.ai)\n')
  console.log('='.repeat(70))

  const provider = new KieAiProvider()
  const bot = new Telegraf(process.env.BOT_TOKEN!)

  try {
    // Исходная идея пользователя
    const userIdea = 'робот идет по улице ночного города'

    // Профессиональный промпт по Sora 2 Prompting Guide
    const enhancedPrompt = `Cinematic sci-fi style, wide tracking shot at street level,
humanoid robot with glowing blue circuitry walks slowly through rain-soaked neon-lit street,
wet pavement reflecting colorful shop signs and holograms,
camera tracks from behind at walking pace, low angle emphasizing robot against towering buildings,
dramatic single-source lighting from overhead neon, blue-purple color palette with warm accent lights,
ambient sound of rain, distant traffic, mechanical footsteps`

    console.log('\n📝 ИСХОДНАЯ ИДЕЯ:')
    console.log(userIdea)
    console.log('\n✨ УЛУЧШЕННЫЙ ПРОМПТ:')
    console.log(enhancedPrompt)
    console.log('\n' + '='.repeat(70))

    // Шаг 1: Создаем task
    console.log('\n🎬 ШАГ 1: Создание Sora 2 task')
    console.log('─'.repeat(70))
    console.log('Модель: sora-2-text-to-video')
    console.log('Aspect Ratio: landscape')
    console.log('Watermark: Удален')
    console.log('Ожидаемая стоимость: 30 credits ($0.15) за 10 сек')

    const createResult = await provider.generateSoraVideo(
      enhancedPrompt,
      'sora-2-text-to-video',
      'landscape',
      true // remove watermark
    )

    if (!createResult.success) {
      console.error('\n❌ ОШИБКА создания task:', createResult.error)
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `❌ Ошибка создания Sora 2 task:\n\n${createResult.error}`
      )
      return
    }

    console.log('\n✅ Task создан успешно!')
    console.log('Task ID:', createResult.data?.taskId)
    console.log('Стоимость: $' + createResult.cost.usd.toFixed(3), '(' + createResult.cost.stars + '⭐)')
    console.log('Provider:', createResult.provider)
    console.log('Processing time:', createResult.processingTime, 'ms')

    const taskId = createResult.data?.taskId
    if (!taskId) {
      console.error('❌ Task ID не получен!')
      return
    }

    // Уведомление в Telegram
    await bot.telegram.sendMessage(
      TELEGRAM_ID,
      `✅ Sora 2 - Task создан!

📊 Детали:
• Task ID: ${taskId}
• Модель: ${createResult.model}
• Стоимость: $${createResult.cost.usd.toFixed(3)} (${createResult.cost.stars}⭐)
• Provider: ${createResult.provider}

⏳ Запускаю polling (макс 3 минуты)...`
    )

    // Шаг 2: Polling статуса
    console.log('\n🔄 ШАГ 2: Polling статуса task')
    console.log('─'.repeat(70))
    console.log('Максимальное время ожидания: 3 минуты')
    console.log('Стратегия: Exponential backoff (5s → 30s)')
    console.log('')

    const pollResult = await provider.pollSoraTaskStatus(taskId, 180000)

    if (!pollResult.success) {
      console.error('\n❌ ОШИБКА polling:', pollResult.error)
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `❌ Ошибка Sora 2 generation:\n\n${pollResult.error}`
      )
      return
    }

    if (!pollResult.data?.videoUrl) {
      console.log('\n⏱️ ТАЙМАУТ: Видео не успело сгенерироваться')
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `⏱️ Таймаут: видео все еще генерируется.

Task ID: ${taskId}

Можно проверить позже через:
provider.checkSoraTaskStatus("${taskId}")`
      )
      return
    }

    // Шаг 3: Отправка видео
    console.log('\n🎉 ВИДЕО ГОТОВО!')
    console.log('─'.repeat(70))
    console.log('URL:', pollResult.data.videoUrl)
    console.log('Duration:', pollResult.data.duration, 'seconds')
    console.log('')

    console.log('📤 Отправка видео в Telegram...')

    try {
      await bot.telegram.sendVideo(
        TELEGRAM_ID,
        pollResult.data.videoUrl,
        {
          caption: `🎬 Sora 2 - Готово!

📝 Исходная идея:
${userIdea}

✨ Профессиональный промпт:
${enhancedPrompt.substring(0, 150)}...

📊 Характеристики:
• Модель: Sora 2 (Kie.ai)
• Длительность: ${pollResult.data.duration} секунд
• Стоимость: $${createResult.cost.usd.toFixed(3)} (${createResult.cost.stars}⭐)
• Provider: ${createResult.provider}
• Task ID: ${taskId}

🎯 Сгенерировано по OpenAI Sora 2 Prompting Guide`
        }
      )

      console.log('✅ Видео успешно отправлено в Telegram!')
    } catch (error) {
      console.error('❌ Ошибка отправки видео:', error)
      await bot.telegram.sendMessage(
        TELEGRAM_ID,
        `✅ Видео сгенерировано, но не удалось отправить!\n\nURL: ${pollResult.data.videoUrl}`
      )
    }

    console.log('\n' + '='.repeat(70))
    console.log('✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!')
    console.log('='.repeat(70) + '\n')

  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error)
    await bot.telegram.sendMessage(
      TELEGRAM_ID,
      `❌ Критическая ошибка теста Sora 2:\n\n${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Запуск
console.log('\n🚀 Запуск реального теста Sora 2...')
testSora2Generation()
  .then(() => {
    console.log('✅ Скрипт завершен успешно')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Необработанная ошибка:', error)
    process.exit(1)
  })
