import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

// Простой wizard для Image to Video без коллбэков
export const simpleImageToVideoWizard = new Scenes.WizardScene<MyContext>(
  'simple_image_to_video',

  // ШАГ 1: Выбор модели
  async ctx => {
    console.log('🎬 [SIMPLE I2V] Step 1: Model selection started')
    logger.info('[SimpleImageToVideoWizard] Step 1: Model selection', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
    })

    const isRu = isRussianFromState(ctx)

    // Простая клавиатура с основными моделями для Image to Video
    const keyboard = Markup.keyboard([
      ['Veo 3 Fast (40 ⭐)', 'Veo 3 (80 ⭐)'],
      ['⬅️ Назад в меню'],
    ]).resize()

    await ctx.reply(
      isRu
        ? '🎥 Выберите модель для генерации видео из изображения:'
        : '🎥 Select a model for image to video generation:',
      keyboard
    )

    return ctx.wizard.next()
  },

  // ШАГ 2: Обработка выбора модели и выбор параметров
  async ctx => {
    console.log('🎬 [SIMPLE I2V] Step 2: Model processing and parameters')
    logger.info('[SimpleImageToVideoWizard] Step 2: Processing model choice', {
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
    let selectedModel = 'veo-3-fast' // по умолчанию
    let cost = 40

    if (selectedText.includes('Veo 3 Fast')) {
      selectedModel = 'veo-3-fast'
      cost = 40
    } else if (selectedText.includes('Veo 3') && !selectedText.includes('Fast')) {
      selectedModel = 'veo-3'
      cost = 80
    }

    // Сохраняем в сессии
    ctx.session.selectedVideoModel = selectedModel
    ctx.session.selectedVideoCost = cost

    logger.info('[SimpleImageToVideoWizard] Model selected', {
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
    console.log('🎬 [SIMPLE I2V] Step 3: Aspect ratio processing')
    logger.info('[SimpleImageToVideoWizard] Step 3: Processing aspect ratio', {
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

    logger.info('[SimpleImageToVideoWizard] Aspect ratio selected', {
      telegramId: ctx.from?.id,
      aspectRatio,
    })

    // Переходим к загрузке изображения
    await ctx.reply(
      isRu
        ? `✅ Выбрано: ${
            aspectRatio === '9:16'
              ? 'Вертикальное (9:16)'
              : 'Горизонтальное (16:9)'
          }\n\n🖼️ Теперь отправьте изображение для генерации видео:`
        : `✅ Selected: ${
            aspectRatio === '9:16' ? 'Vertical (9:16)' : 'Horizontal (16:9)'
          }\n\n🖼️ Now send an image for video generation:`,
      Markup.removeKeyboard()
    )

    return ctx.wizard.next()
  },

  // ШАГ 4: Получение изображения
  async ctx => {
    console.log('🎬 [SIMPLE I2V] Step 4: Image processing')
    logger.info('[SimpleImageToVideoWizard] Step 4: Processing image', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте изображение.'
          : 'Please send an image.'
      )
      return
    }

    const photo = ctx.message.photo.pop() // Берем максимальное разрешение
    if (!photo) {
      await ctx.reply(
        isRu
          ? '❌ Не удалось получить изображение.'
          : '❌ Failed to get the image.'
      )
      return
    }

    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    ctx.session.imageUrl = fileLink.href

    logger.info('[SimpleImageToVideoWizard] Image received', {
      telegramId: ctx.from?.id,
      imageUrl: fileLink.href,
    })

    // Переходим к вводу промпта
    await ctx.reply(
      isRu
        ? '✅ Изображение получено!\n\n💭 Теперь введите описание, что должно происходить в видео (промпт):'
        : '✅ Image received!\n\n💭 Now enter a description of what should happen in the video (prompt):'
    )

    return ctx.wizard.next()
  },

  // ШАГ 5: Получение промпта и генерация
  async ctx => {
    console.log('🎬 [SIMPLE I2V] Step 5: Prompt processing and generation')
    logger.info('[SimpleImageToVideoWizard] Step 5: Processing prompt', {
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
    const selectedModel = ctx.session.selectedVideoModel || 'veo-3-fast'
    const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
    const cost = ctx.session.selectedVideoCost || 40
    const imageUrl = ctx.session.imageUrl

    if (!imageUrl) {
      await ctx.reply(
        isRu
          ? '❌ Изображение не найдено. Пожалуйста, начните заново.'
          : '❌ Image not found. Please start over.'
      )
      return ctx.scene.leave()
    }

    logger.info('[SimpleImageToVideoWizard] Starting video generation', {
      telegramId: ctx.from?.id,
      selectedModel,
      aspectRatio,
      cost,
      prompt: prompt.substring(0, 50),
      hasImage: !!imageUrl,
    })

    // Начинаем генерацию
    await ctx.reply(
      isRu
        ? `🎬 Генерируем видео из изображения...\n\n📋 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐\n💭 Промпт: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
        : `🎬 Generating video from image...\n\n📋 Model: ${selectedModel}\n📱 Aspect ratio: ${aspectRatio}\n💰 Cost: ${cost} ⭐\n💭 Prompt: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
    )

    try {
      // Получаем bot_name
      const bot_name = ctx.botInfo?.username || 'unknown_bot'
      
      // Проверяем, что бот существует и настроен правильно
      const { getBotByName } = await import('@/core/bot')
      const botResult = getBotByName(bot_name)
      if (!botResult.bot || botResult.error) {
        const errorMsg = isRu 
          ? `❌ Произошла ошибка.\n\nБот "${bot_name}" не найден или не настроен правильно.\n\nОбратитесь в техподдержку.`
          : `❌ An error occurred.\n\nBot "${bot_name}" not found or not configured properly.\n\nPlease contact support.`
        
        logger.error(`[simpleImageToVideoWizard] Bot configuration error`, {
          bot_name,
          error: botResult.error,
          telegram_id: ctx.from?.id.toString(),
          username: ctx.from?.username
        })
        
        await ctx.reply(errorMsg)
        return ctx.scene.leave()
      }

      // Импортируем функцию генерации видео из изображения
      const { generateImageToVideo } = await import(
        '@/services/generateImageToVideo'
      )

      // Генерируем видео
      const response = await generateImageToVideo({
        imageUrl,
        prompt,
        videoModel: selectedModel as any,
        aspectRatio,
        telegram_id: ctx.from?.id.toString() || '',
        username: ctx.from?.username || 'unknown',
        is_ru: isRu,
        bot_name,
      })

      if (response.success && response.videoUrl) {
        // Если есть готовое видео, отправляем его
        await ctx.replyWithVideo(response.videoUrl, {
          caption: `🎬 ${prompt}\n\n🤖 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐`,
        })

        await ctx.reply(
          isRu
            ? '✅ Видео успешно сгенерировано из изображения!'
            : '✅ Video generated from image successfully!'
        )
      } else {
        // Если есть только сообщение
        await ctx.reply(
          isRu
            ? `✅ ${response.message || 'Генерация видео запущена!'}`
            : `✅ ${response.message || 'Video generation started!'}`
        )
      }

      logger.info('[SimpleImageToVideoWizard] Video generation completed', {
        telegramId: ctx.from?.id,
        selectedModel,
        aspectRatio,
        cost,
        success: response.success,
      })
    } catch (error) {
      logger.error('[SimpleImageToVideoWizard] Generation error', {
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
simpleImageToVideoWizard.enter(async ctx => {
  console.log('🎬 [SIMPLE I2V] Wizard entered! User:', ctx.from?.id)
  logger.info('[SimpleImageToVideoWizard] Wizard entered', {
    telegramId: ctx.from?.id,
    step: ctx.wizard?.cursor,
  })
  
  // Вызываем первый шаг вручную
  console.log('🎬 [SIMPLE I2V] Manually executing first step...')
  
  try {
    // Проверяем что это первый вход (cursor = undefined)
    if (ctx.wizard.cursor === undefined) {
      console.log('🎬 [SIMPLE I2V] Fresh wizard entry, executing first step...')
      const firstStepHandler = (ctx.wizard as any).steps[0]
      if (typeof firstStepHandler === 'function') {
        await firstStepHandler(ctx)
        console.log('🎬 [SIMPLE I2V] ✅ First step executed successfully from .enter()')
      } else {
        console.error('🎬 [SIMPLE I2V] ❌ First step handler is not a function:', typeof firstStepHandler)
      }
    } else {
      console.log('🎬 [SIMPLE I2V] Wizard already has cursor:', ctx.wizard.cursor, '- NOT executing first step')
    }
  } catch (error) {
    console.error('🎬 [SIMPLE I2V] ❌ ERROR executing first step from .enter():', error)
  }
})

// Добавляем обработчик выхода
simpleImageToVideoWizard.leave(async ctx => {
  console.log('🎬 [SIMPLE I2V] Wizard left! User:', ctx.from?.id)
  logger.info('[SimpleImageToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
  })
})

export default simpleImageToVideoWizard