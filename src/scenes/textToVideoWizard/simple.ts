import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

// Простой wizard без коллбэков
export const simpleTextToVideoWizard = new Scenes.WizardScene<MyContext>(
  'simple_text_to_video',

  // ШАГ 1: Выбор модели
  async ctx => {
    console.log('🎬 [SIMPLE] Step 1: Model selection started')
    logger.info('[SimpleTextToVideoWizard] Step 1: Model selection', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
    })

    const isRu = isRussianFromState(ctx)

    // Простая клавиатура с основными моделями
    const keyboard = Markup.keyboard([
      ['Veo 3 Fast (40 ⭐)', 'Veo 3 (80 ⭐)'],
      ['Kling v1.6 Pro (60 ⭐)', 'Minimax (50 ⭐)'],
      ['⬅️ Назад в меню'],
    ]).resize()

    await ctx.reply(
      isRu
        ? '🎥 Выберите модель для генерации видео:'
        : '🎥 Select a model for video generation:',
      keyboard
    )

    return ctx.wizard.next()
  },

  // ШАГ 2: Обработка выбора модели и выбор параметров
  async ctx => {
    console.log('🎬 [SIMPLE] Step 2: Model processing and parameters')
    logger.info('[SimpleTextToVideoWizard] Step 2: Processing model choice', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'NO_TEXT',
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Выберите модель из кнопок выше.'
          : 'Select a model from the buttons above.'
      )
      return
    }

    const selectedText = ctx.message.text

    // Обработка кнопки "Назад"
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
      return ctx.scene.leave()
    }

    // Определяем выбранную модель
    let selectedModel = 'kie-veo-3-fast' // по умолчанию
    let cost = 40

    if (selectedText.includes('Veo 3 Fast')) {
      selectedModel = 'kie-veo-3-fast'
      cost = 40
    } else if (selectedText.includes('Veo 3')) {
      selectedModel = 'kie-veo-3'
      cost = 80
    } else if (selectedText.includes('Kling')) {
      selectedModel = 'kling-v1.6-pro'
      cost = 60
    } else if (selectedText.includes('Minimax')) {
      selectedModel = 'minimax'
      cost = 50
    }

    // Сохраняем в сессии
    ctx.session.selectedVideoModel = selectedModel
    ctx.session.selectedVideoCost = cost

    logger.info('[SimpleTextToVideoWizard] Model selected', {
      telegramId: ctx.from?.id,
      selectedModel,
      cost,
    })

    // Выбор соотношения сторон (упрощенно)
    const aspectKeyboard = Markup.keyboard([
      ['📱 Вертикальное (9:16)', '🖥️ Горизонтальное (16:9)'],
      ['⬅️ Назад'],
    ]).resize()

    await ctx.reply(
      isRu
        ? `✅ Выбрана модель: ${selectedText}\n📱 Выберите соотношение сторон:`
        : `✅ Selected model: ${selectedText}\n📱 Select aspect ratio:`,
      aspectKeyboard
    )

    return ctx.wizard.next()
  },

  // ШАГ 3: Обработка соотношения сторон
  async ctx => {
    console.log('🎬 [SIMPLE] Step 3: Aspect ratio processing')
    logger.info('[SimpleTextToVideoWizard] Step 3: Processing aspect ratio', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'NO_TEXT',
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Выберите соотношение сторон из кнопок выше.'
          : 'Select aspect ratio from the buttons above.'
      )
      return
    }

    const selectedText = ctx.message.text

    // Обработка кнопки "Назад"
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      return ctx.wizard.back()
    }

    // Определяем соотношение сторон
    let aspectRatio = '9:16' // по умолчанию вертикальное
    if (
      selectedText.includes('16:9') ||
      selectedText.includes('Горизонтальное') ||
      selectedText.includes('Horizontal')
    ) {
      aspectRatio = '16:9'
    }

    // Сохраняем в сессии
    ctx.session.selectedAspectRatio = aspectRatio

    logger.info('[SimpleTextToVideoWizard] Aspect ratio selected', {
      telegramId: ctx.from?.id,
      aspectRatio,
    })

    // Переходим к вводу промпта
    await ctx.reply(
      isRu
        ? `✅ Выбрано: ${
            aspectRatio === '9:16'
              ? 'Вертикальное (9:16)'
              : 'Горизонтальное (16:9)'
          }\n\n💭 Теперь введите описание видео (промпт):`
        : `✅ Selected: ${
            aspectRatio === '9:16' ? 'Vertical (9:16)' : 'Horizontal (16:9)'
          }\n\n💭 Now enter your video description (prompt):`,
      Markup.removeKeyboard()
    )

    return ctx.wizard.next()
  },

  // ШАГ 4: Получение промпта и генерация
  async ctx => {
    console.log('🎬 [SIMPLE] Step 4: Prompt processing and generation')
    logger.info('[SimpleTextToVideoWizard] Step 4: Processing prompt', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      messageText:
        ctx.message && 'text' in ctx.message
          ? ctx.message.text?.substring(0, 50)
          : 'NO_TEXT',
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите описание видео текстом.'
          : 'Please enter video description as text.'
      )
      return
    }

    const prompt = ctx.message.text.trim()

    if (!prompt || prompt.length < 3) {
      await ctx.reply(
        isRu
          ? 'Описание слишком короткое. Пожалуйста, введите более подробное описание.'
          : 'Description is too short. Please enter a more detailed description.'
      )
      return
    }

    // Получаем данные из сессии
    const selectedModel = ctx.session.selectedVideoModel || 'kie-veo-3-fast'
    const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
    const cost = ctx.session.selectedVideoCost || 40

    logger.info('[SimpleTextToVideoWizard] Starting video generation', {
      telegramId: ctx.from?.id,
      selectedModel,
      aspectRatio,
      cost,
      prompt: prompt.substring(0, 50),
    })

    // Начинаем генерацию
    await ctx.reply(
      isRu
        ? `🎬 Генерируем видео...\n\n📋 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐\n💭 Промпт: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
        : `🎬 Generating video...\n\n📋 Model: ${selectedModel}\n📱 Aspect ratio: ${aspectRatio}\n💰 Cost: ${cost} ⭐\n💭 Prompt: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
    )

    try {
      // Импортируем функцию генерации видео
      const { generateTextToVideo } = await import(
        '@/services/generateTextToVideo'
      )

      // Генерируем видео
      const response = await generateTextToVideo({
        prompt,
        videoModel: selectedModel as any,
        aspectRatio,
        telegram_id: ctx.from?.id.toString() || '',
        username: ctx.from?.username || 'unknown',
        is_ru: isRu,
        bot_name: ctx.botInfo?.username || 'unknown_bot',
      })

      if (response.success && response.videoUrl) {
        // Если есть готовое видео, отправляем его
        await ctx.replyWithVideo(response.videoUrl, {
          caption: `🎬 ${prompt}\n\n🤖 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐`,
        })

        await ctx.reply(
          isRu
            ? '✅ Видео успешно сгенерировано!'
            : '✅ Video generated successfully!'
        )
      } else {
        // Если есть только сообщение
        await ctx.reply(
          isRu
            ? `✅ ${response.message || 'Генерация видео запущена!'}`
            : `✅ ${response.message || 'Video generation started!'}`
        )
      }

      logger.info('[SimpleTextToVideoWizard] Video generation completed', {
        telegramId: ctx.from?.id,
        selectedModel,
        aspectRatio,
        cost,
        success: response.success,
      })
    } catch (error) {
      logger.error('[SimpleTextToVideoWizard] Generation error', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации видео. Попробуйте позже.'
          : '❌ Error occurred during video generation. Please try again later.'
      )
    }

    // Выходим из wizard'a
    return ctx.scene.leave()
  }
)

// Добавляем обработчик входа в сцену
simpleTextToVideoWizard.enter(async ctx => {
  console.log('🎬 [SIMPLE] Wizard entered! User:', ctx.from?.id)
  logger.info('[SimpleTextToVideoWizard] Wizard entered', {
    telegramId: ctx.from?.id,
    step: ctx.wizard?.cursor,
  })
  
  // TELEGRAF АВТОМАТИЧЕСКИ ВЫЗЫВАЕТ ПЕРВЫЙ ШАГ - НЕ НУЖНО ДЕЛАТЬ ЭТО ВРУЧНУЮ!
  console.log('🎬 [SIMPLE] Wizard will automatically execute first step...')
})

// Добавляем обработчик выхода
simpleTextToVideoWizard.leave(async ctx => {
  console.log('🎬 [SIMPLE] Wizard left! User:', ctx.from?.id)
  logger.info('[SimpleTextToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
  })
})

export default simpleTextToVideoWizard
