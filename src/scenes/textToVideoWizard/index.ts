import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

console.log('🎬 [WIZARD] Loading simplified textToVideoWizard...')

// Простой wizard без коллбэков - УПРОЩЕННАЯ ВЕРСИЯ
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 1: Model selection started for user:', ctx.from?.id)
    logger.info('[TextToVideoWizard] Step 1: Model selection', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      hasMessage: !!ctx.message,
      messageType: ctx.message ? Object.keys(ctx.message) : []
    })

    const isRu = isRussianFromState(ctx)
    
    // Простая клавиатура с основными моделями
    const keyboard = Markup.keyboard([
      ['Veo 3 Fast (40 ⭐)', 'Veo 3 (80 ⭐)'],
      ['Kling v1.6 Pro (60 ⭐)', 'Minimax (50 ⭐)'],
      ['⬅️ Назад в меню']
    ]).resize()

    await ctx.reply(
      isRu 
        ? '🎥 Выберите модель для генерации видео:'
        : '🎥 Select a model for video generation:',
      keyboard
    )

    console.log('🎬 [WIZARD] Step 1: Model selection keyboard sent, moving to next step')
    return ctx.wizard.next()
  },

  // ========== ШАГ 2: ОБРАБОТКА МОДЕЛИ И ПАРАМЕТРЫ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 2: Model processing for user:', ctx.from?.id)
    logger.info('[TextToVideoWizard] Step 2: Processing model choice', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      hasMessage: !!ctx.message,
      messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : 'NO_TEXT'
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      console.log('🎬 [WIZARD] Step 2: No text message, asking user to select')
      await ctx.reply(isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.')
      return
    }

    const selectedText = ctx.message.text
    console.log('🎬 [WIZARD] Step 2: User selected:', selectedText)

    // Обработка кнопки "Назад"
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      console.log('🎬 [WIZARD] Step 2: User wants to go back, leaving wizard')
      await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
      return ctx.scene.leave()
    }

    // Определяем выбранную модель (упрощенно)
    let selectedModel = 'kie-veo-3-fast'
    let cost = 40

    if (selectedText.includes('Veo 3 Fast')) {
      selectedModel = 'kie-veo-3-fast'
      cost = 40
    } else if (selectedText.includes('Veo 3') && !selectedText.includes('Fast')) {
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

    console.log('🎬 [WIZARD] Step 2: Model selected:', { selectedModel, cost })
    logger.info('[TextToVideoWizard] Model selected', {
      telegramId: ctx.from?.id,
      selectedModel,
      cost,
      originalText: selectedText
    })

    // Простой выбор соотношения сторон
    const aspectKeyboard = Markup.keyboard([
      ['📱 Вертикальное (9:16)', '🖥️ Горизонтальное (16:9)'],
      ['⬅️ Назад']
    ]).resize()

    await ctx.reply(
      isRu
        ? `✅ Выбрана модель: ${selectedText}\n📱 Выберите соотношение сторон:`
        : `✅ Selected model: ${selectedText}\n📱 Select aspect ratio:`,
      aspectKeyboard
    )

    console.log('🎬 [WIZARD] Step 2: Aspect ratio keyboard sent, moving to next step')
    return ctx.wizard.next()
  },

  // ========== ШАГ 3: СООТНОШЕНИЕ СТОРОН ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 3: Aspect ratio processing for user:', ctx.from?.id)
    logger.info('[TextToVideoWizard] Step 3: Processing aspect ratio', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      hasMessage: !!ctx.message,
      messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : 'NO_TEXT'
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      console.log('🎬 [WIZARD] Step 3: No text message, asking user to select')
      await ctx.reply(isRu ? 'Выберите соотношение сторон из кнопок выше.' : 'Select aspect ratio from the buttons above.')
      return
    }

    const selectedText = ctx.message.text
    console.log('🎬 [WIZARD] Step 3: User selected:', selectedText)

    // Обработка кнопки "Назад"
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      console.log('🎬 [WIZARD] Step 3: User wants to go back, returning to previous step')
      return ctx.wizard.back()
    }

    // Определяем соотношение сторон
    let aspectRatio = '9:16' // по умолчанию вертикальное
    if (selectedText.includes('16:9') || selectedText.includes('Горизонтальное') || selectedText.includes('Horizontal')) {
      aspectRatio = '16:9'
    }

    // Сохраняем в сессии
    ctx.session.selectedAspectRatio = aspectRatio

    console.log('🎬 [WIZARD] Step 3: Aspect ratio selected:', aspectRatio)
    logger.info('[TextToVideoWizard] Aspect ratio selected', {
      telegramId: ctx.from?.id,
      aspectRatio,
      originalText: selectedText
    })

    // Переходим к вводу промпта
    await ctx.reply(
      isRu
        ? `✅ Выбрано: ${aspectRatio === '9:16' ? 'Вертикальное (9:16)' : 'Горизонтальное (16:9)'}\n\n💭 Теперь введите описание видео (промпт):\n\nПример: "A majestic shaman dancing around fire"`
        : `✅ Selected: ${aspectRatio === '9:16' ? 'Vertical (9:16)' : 'Horizontal (16:9)'}\n\n💭 Now enter your video description (prompt):\n\nExample: "A majestic shaman dancing around fire"`,
      Markup.removeKeyboard()
    )

    console.log('🎬 [WIZARD] Step 3: Prompt request sent, moving to next step')
    return ctx.wizard.next()
  },

  // ========== ШАГ 4: ПРОМПТ И ГЕНЕРАЦИЯ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 4: Prompt processing for user:', ctx.from?.id)
    logger.info('[TextToVideoWizard] Step 4: Processing prompt', {
      telegramId: ctx.from?.id,
      step: ctx.wizard.cursor,
      hasMessage: !!ctx.message,
      messageText: ctx.message && 'text' in ctx.message ? ctx.message.text?.substring(0, 50) : 'NO_TEXT'
    })

    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      console.log('🎬 [WIZARD] Step 4: No text message, asking for prompt')
      await ctx.reply(isRu ? 'Пожалуйста, введите описание видео текстом.' : 'Please enter video description as text.')
      return
    }

    const prompt = ctx.message.text.trim()
    console.log('🎬 [WIZARD] Step 4: User entered prompt:', prompt.substring(0, 50) + '...')

    if (!prompt || prompt.length < 3) {
      console.log('🎬 [WIZARD] Step 4: Prompt too short')
      await ctx.reply(isRu ? 'Описание слишком короткое. Пожалуйста, введите более подробное описание.' : 'Description is too short. Please enter a more detailed description.')
      return
    }

    // Получаем данные из сессии
    const selectedModel = ctx.session.selectedVideoModel || 'kie-veo-3-fast'
    const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
    const cost = ctx.session.selectedVideoCost || 40

    console.log('🎬 [WIZARD] Step 4: Starting generation with:', { selectedModel, aspectRatio, cost })
    logger.info('[TextToVideoWizard] Starting video generation', {
      telegramId: ctx.from?.id,
      selectedModel,
      aspectRatio,
      cost,
      prompt: prompt.substring(0, 100)
    })

    // Показываем параметры генерации
    await ctx.reply(
      isRu
        ? `🎬 Генерируем видео...\n\n📋 Модель: ${selectedModel}\n📱 Соотношение: ${aspectRatio}\n💰 Стоимость: ${cost} ⭐\n💭 Промпт: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`
        : `🎬 Generating video...\n\n📋 Model: ${selectedModel}\n📱 Aspect ratio: ${aspectRatio}\n💰 Cost: ${cost} ⭐\n💭 Prompt: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`
    )

    try {
      // Имитируем генерацию пока что
      console.log('🎬 [WIZARD] Step 4: Simulating generation...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      await ctx.reply(
        isRu
          ? `✅ Видео готово! (Тестовая версия)\n\n🎥 Модель: ${selectedModel}\n📱 Формат: ${aspectRatio}\n💭 Описание: "${prompt}"\n\n📝 Примечание: Интеграция с реальным API сервером будет добавлена после тестирования wizard'a`
          : `✅ Video is ready! (Test version)\n\n🎥 Model: ${selectedModel}\n📱 Format: ${aspectRatio}\n💭 Description: "${prompt}"\n\n📝 Note: Real API server integration will be added after wizard testing`
      )

      console.log('🎬 [WIZARD] Step 4: Generation completed successfully (test mode)')
      logger.info('[TextToVideoWizard] Video generation completed (test mode)', {
        telegramId: ctx.from?.id,
        selectedModel,
        aspectRatio,
        cost,
        success: true
      })

    } catch (error) {
      console.error('🎬 [WIZARD] Step 4: Generation error:', error)
      logger.error('[TextToVideoWizard] Generation error', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации видео. Попробуйте позже.'
          : '❌ Error occurred during video generation. Please try again later.'
      )
    }

    console.log('🎬 [WIZARD] Step 4: Leaving wizard')
    return ctx.scene.leave()
  }
)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// Обработчик входа в wizard
textToVideoWizard.enter(async (ctx) => {
  console.log('🎬 [WIZARD] ✅ WIZARD ENTERED! User:', ctx.from?.id)
  console.log('🎬 [WIZARD] Scene ID:', ctx.scene.current?.id)
  console.log('🎬 [WIZARD] Current step:', ctx.wizard?.cursor)
  
  logger.info('[TextToVideoWizard] Wizard entered successfully', {
    telegramId: ctx.from?.id,
    sceneId: ctx.scene.current?.id,
    currentStep: ctx.wizard?.cursor,
    timestamp: new Date().toISOString()
  })
})

// Обработчик выхода из wizard
textToVideoWizard.leave(async (ctx) => {
  console.log('🎬 [WIZARD] 👋 WIZARD LEFT! User:', ctx.from?.id)
  
  logger.info('[TextToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
    timestamp: new Date().toISOString()
  })

  // Очищаем данные сессии
  if (ctx.session) {
    delete ctx.session.selectedVideoModel
    delete ctx.session.selectedVideoCost
    delete ctx.session.selectedAspectRatio
  }
})

console.log('🎬 [WIZARD] Simplified textToVideoWizard loaded successfully')

export default textToVideoWizard