import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

// Simple wizard without callbacks - exactly like Text to Video
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,

  // ШАГ 1: Выбор модели
  async ctx => {
    console.log('🎬 [I2V] Step 1: Model selection started')
    logger.info('[ImageToVideoWizard] Step 1: Model selection', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
    })

    const isRu = isRussianFromState(ctx)

    // Простая клавиатура с основными моделями
    const keyboard = Markup.keyboard([
      ['Veo 3 Fast (40 ⭐)', 'Veo 3 (80 ⭐)'],
      ['Kling v1.6 Pro (60 ⭐)', 'Minimax (50 ⭐)'],
      ['Seedance Pro 480p (23 ⭐)', 'Seedance Pro 1080p (117 ⭐)'],
      ['WAN 2.2 I2V Fast (70 ⭐)'],
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

  // ШАГ 2: Обработка выбора модели и выбор соотношения сторон
  async ctx => {
    console.log('🎬 [I2V] Step 2: Model processing and aspect ratio')
    logger.info('[ImageToVideoWizard] Step 2: Processing model choice', {
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

    // Определяем выбранную модель и стоимость
    let selectedModel = 'veo-3-fast' // по умолчанию
    let cost = 40
    let showAspectRatio = false // флаг для показа выбора соотношения сторон

    if (selectedText.includes('Veo 3 Fast')) {
      selectedModel = 'veo-3-fast'
      cost = 40
      showAspectRatio = true // Veo модели поддерживают выбор соотношения
    } else if (selectedText.includes('Veo 3') && !selectedText.includes('Fast')) {
      selectedModel = 'veo-3'
      cost = 80
      showAspectRatio = true // Veo модели поддерживают выбор соотношения
    } else if (selectedText.includes('Kling')) {
      selectedModel = 'kling-v1.6-pro'
      cost = 60
    } else if (selectedText.includes('Minimax')) {
      selectedModel = 'minimax'
      cost = 50
      showAspectRatio = true // Minimax поддерживает выбор соотношения
    } else if (selectedText.includes('Seedance') && selectedText.includes('480p')) {
      selectedModel = 'seedance-1-pro'
      cost = 23
      ctx.session.selectedResolution = '480p'
    } else if (selectedText.includes('Seedance') && selectedText.includes('1080p')) {
      selectedModel = 'seedance-1-pro'
      cost = 117
      ctx.session.selectedResolution = '1080p'
    } else if (selectedText.includes('WAN')) {
      selectedModel = 'wan-2.2-i2v-fast'
      cost = 70
      ctx.session.selectedResolution = '720p' // по умолчанию для WAN
    }

    // Проверка баланса
    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      await ctx.reply(
        isRu 
          ? '❌ Не удалось определить пользователя.'
          : '❌ Could not identify user.'
      )
      return ctx.scene.leave()
    }

    // Получаем баланс пользователя
    const { getUserDetailsSubscription } = await import('@/core/supabase/getUserDetailsSubscription')
    const userDetails = await getUserDetailsSubscription(telegram_id)
    const currentBalance = userDetails?.stars || 0

    if (currentBalance < cost) {
      logger.info(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд (${cost} ⭐). Баланс: ${Math.floor(currentBalance)} ⭐.`
          : `😕 Insufficient stars (${cost} ⭐). Balance: ${Math.floor(currentBalance)} ⭐.`
      )
      return ctx.scene.leave()
    }

    // Сохраняем в сессии
    ctx.session.selectedVideoModel = selectedModel
    ctx.session.selectedVideoCost = cost

    logger.info('[ImageToVideoWizard] Model selected', {
      telegramId: ctx.from?.id,
      selectedModel,
      cost,
    })

    // Если модель поддерживает выбор соотношения сторон - показываем его
    if (showAspectRatio) {
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
    } else {
      // Для моделей без выбора соотношения сторон - сразу переходим к загрузке изображения
      ctx.session.selectedAspectRatio = '16:9' // по умолчанию

      await ctx.reply(
        isRu
          ? `✅ Выбрана модель: ${selectedText}\n\n🖼️ Теперь отправьте изображение:`
          : `✅ Selected model: ${selectedText}\n\n🖼️ Now send an image:`,
        Markup.removeKeyboard()
      )

      return ctx.wizard.selectStep(3) // Пропускаем шаг выбора соотношения, переходим к загрузке изображения
    }
  },

  // ШАГ 3: Обработка соотношения сторон
  async ctx => {
    console.log('🎬 [I2V] Step 3: Aspect ratio processing')
    logger.info('[ImageToVideoWizard] Step 3: Processing aspect ratio', {
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

    logger.info('[ImageToVideoWizard] Aspect ratio selected', {
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
    console.log('🎬 [I2V] Step 4: Image processing')
    logger.info('[ImageToVideoWizard] Step 4: Processing image', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
    })

    const isRu = isRussianFromState(ctx)

    // Проверяем, что это фото
    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте изображение (фото).'
          : 'Please send an image (photo).'
      )
      return
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1]
    if (!photo) {
      await ctx.reply(
        isRu
          ? 'Не удалось получить изображение. Попробуйте еще раз.'
          : 'Failed to get the image. Please try again.'
      )
      return
    }

    // Получаем ссылку на файл
    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    ctx.session.imageUrl = fileLink.href

    logger.info('[ImageToVideoWizard] Image received', {
      telegramId: ctx.from?.id,
      imageUrl: fileLink.href,
    })

    // Запрашиваем промпт
    await ctx.reply(
      isRu
        ? '💭 Теперь введите описание видео (промпт):'
        : '💭 Now enter your video description (prompt):'
    )

    return ctx.wizard.next()
  },

  // ШАГ 5: Получение промпта и генерация
  async ctx => {
    console.log('🎬 [I2V] Step 5: Prompt processing and generation')
    logger.info('[ImageToVideoWizard] Step 5: Processing prompt', {
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
    const selectedResolution = ctx.session.selectedResolution

    if (!imageUrl) {
      logger.error('[ImageToVideoWizard] Missing image URL in session', {
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: изображение не найдено. Попробуйте начать сначала.'
          : '❌ Error: image not found. Please try starting over.'
      )
      return ctx.scene.leave()
    }

    logger.info('[ImageToVideoWizard] Starting video generation', {
      telegramId: ctx.from?.id,
      selectedModel,
      aspectRatio,
      cost,
      imageUrl,
      prompt: prompt.substring(0, 50),
      selectedResolution,
    })

    // Начинаем генерацию
    await ctx.reply(
      isRu
        ? `🎬 Генерируем видео...\n\n📋 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐\n🖼️ Изображение загружено\n💭 Промпт: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
        : `🎬 Generating video...\n\n📋 Model: ${selectedModel}\n📱 Aspect ratio: ${aspectRatio}\n💰 Cost: ${cost} ⭐\n🖼️ Image uploaded\n💭 Prompt: ${prompt.substring(
            0,
            100
          )}${prompt.length > 100 ? '...' : ''}`
    )

    try {
      // Получаем bot_name и проверяем его доступность
      const bot_name = ctx.botInfo?.username || 'unknown_bot'
      
      // Проверяем, что бот существует и настроен правильно
      const { getBotByName } = await import('@/core/bot')
      const botResult = getBotByName(bot_name)
      if (!botResult.bot || botResult.error) {
        const errorMsg = isRu 
          ? `❌ Произошла ошибка.\n\nБот "${bot_name}" не найден или не настроен правильно.\n\nОбратитесь в техподдержку.`
          : `❌ An error occurred.\n\nBot "${bot_name}" not found or not configured properly.\n\nPlease contact support.`
        
        logger.error(`[imageToVideoWizard] Bot configuration error`, {
          bot_name,
          error: botResult.error,
          telegram_id: ctx.from?.id.toString(),
          username: ctx.from?.username
        })
        
        await ctx.reply(errorMsg)
        return ctx.scene.leave()
      }

      // Импортируем функцию генерации видео
      const { generateImageToVideo } = await import(
        '@/modules/videoGenerator'
      )

      // Генерируем видео (используем background версию, но ждем результат)
      await generateImageToVideo(
        ctx.from?.id.toString() || '',
        ctx.from?.username || 'unknown',
        isRu,
        bot_name,
        selectedModel,
        imageUrl,
        prompt,
        false, // not morphing
        undefined, // imageAUrl
        undefined, // imageBUrl
        ctx.telegram,
        ctx.from.id,
        selectedResolution, // передаем разрешение для Seedance и WAN
        aspectRatio // передаем соотношение сторон
      )

      // Функция generateImageToVideo сама отправляет видео пользователю
      // Поэтому здесь мы просто подтверждаем, что генерация началась
      logger.info('[ImageToVideoWizard] Video generation started', {
        telegramId: ctx.from?.id,
        selectedModel,
        aspectRatio,
        cost,
      })
    } catch (error) {
      logger.error('[ImageToVideoWizard] Generation error', {
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
imageToVideoWizard.enter(async ctx => {
  console.log('🎬 [I2V] Wizard entered! User:', ctx.from?.id)
  logger.info('[ImageToVideoWizard] Wizard entered', {
    telegramId: ctx.from?.id,
    step: ctx.wizard?.cursor,
  })
  
  // ОКАЗЫВАЕТСЯ TELEGRAF НЕ ВЫЗЫВАЕТ ПЕРВЫЙ ШАГ АВТОМАТИЧЕСКИ!
  // НУЖНО ВЫЗЫВАТЬ ЕГО ВРУЧНУЮ, НО БЕЗ ДВОЙНОГО ВЫЗОВА
  console.log('🎬 [I2V] Manually executing first step since Telegraf doesnt do it automatically...')
  
  try {
    // Проверяем что это первый вход (cursor = undefined)
    if (ctx.wizard.cursor === undefined) {
      console.log('🎬 [I2V] Fresh wizard entry, executing first step...')
      const firstStepHandler = (ctx.wizard as any).steps[0]
      if (typeof firstStepHandler === 'function') {
        await firstStepHandler(ctx)
        console.log('🎬 [I2V] ✅ First step executed successfully from .enter()')
      } else {
        console.error('🎬 [I2V] ❌ First step handler is not a function:', typeof firstStepHandler)
      }
    } else {
      console.log('🎬 [I2V] Wizard already has cursor:', ctx.wizard.cursor, '- NOT executing first step')
    }
  } catch (error) {
    console.error('🎬 [I2V] ❌ ERROR executing first step from .enter():', error)
  }
})

// Добавляем обработчик выхода
imageToVideoWizard.leave(async ctx => {
  console.log('🎬 [I2V] Wizard left! User:', ctx.from?.id)
  logger.info('[ImageToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
  })
})

export default imageToVideoWizard