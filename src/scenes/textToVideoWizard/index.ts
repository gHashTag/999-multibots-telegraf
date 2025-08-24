import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import {
  validateTextToVideoSession,
  validateVideoModel,
  validateTextToVideoRequest,
  TEXT_TO_VIDEO_CONSTANTS,
  TextToVideoSessionSchema,
  VideoModelSchema,
} from '@/interfaces/zod/textToVideo.zod'
import { z } from 'zod'

console.log('🎬 [WIZARD] Loading CONFIG-BASED textToVideoWizard...')

// Функция для расчета стоимости в звездах из конфига (БЕЗОПАСНАЯ)
function calculateStarsFromConfig(modelId: string, duration?: number): number {
  try {
    const config = VIDEO_MODELS_CONFIG[modelId]
    if (!config || !config.basePrice || config.basePrice <= 0) {
      console.warn('🎬 [CALC] Invalid config for model:', modelId)
      return 40 // fallback
    }

    let price = config.basePrice

    // Для Kling модели - цена за секунду
    if (modelId.includes('kling') && duration && duration > 0) {
      price = price * duration
    }

    // Упрощенная конвертация в звезды: price * 100 (примерно)
    const stars = Math.max(1, Math.floor(price * 100))

    console.log(
      '🎬 [CALC] Model:',
      modelId,
      'Price:',
      price,
      'Duration:',
      duration,
      'Stars:',
      stars
    )
    return stars
  } catch (error) {
    console.error(
      '🎬 [CALC] Error calculating stars for model:',
      modelId,
      error
    )
    return 40 // fallback
  }
}

// Функция создания кнопки с правильной ценой и длительностью (БЕЗОПАСНАЯ)
function createModelButton(
  modelId: string,
  aspectRatio: string,
  isRu: boolean
): string {
  try {
    const config = VIDEO_MODELS_CONFIG[modelId]
    if (!config || !config.title) {
      console.warn('🎬 [BUTTON] Invalid config for model:', modelId)
      return `${modelId} | ${aspectRatio} (40⭐)`
    }

    const aspectIcon = aspectRatio === '9:16' ? '📱' : '🖥️'

    // УПРОЩЕННЫЕ длительности и цены
    let durationText = ''
    let stars = 40 // по умолчанию

    switch (modelId) {
      case 'kie-veo-3-fast':
        durationText = ' | 8s'
        stars = 40
        break
      case 'kie-veo-3':
        durationText = ' | 8s'
        stars = 202
        break
      case 'kie-runway-aleph':
        durationText = ' | 6s'
        stars = 182
        break
      case 'kling-v1.6-pro':
        durationText = ' | ~10s'
        stars = 60
        break
      case 'minimax':
        durationText = ' | 6s'
        stars = 50
        break
      case 'hunyuan-video-fast':
        durationText = ' | 5s'
        stars = 25
        break
      case 'wan-text-to-video':
        durationText = ' | 5s'
        stars = 20
        break
      default:
        stars = calculateStarsFromConfig(modelId)
        break
    }

    return `${config.title}${durationText} | ${aspectIcon} (${stars}⭐)`
  } catch (error) {
    console.error(
      '🎬 [BUTTON] Error creating button for model:',
      modelId,
      error
    )
    return `${modelId} | ${aspectRatio} (40⭐)`
  }
}

// Функция парсинга выбранной модели из кнопки (УПРОЩЕННАЯ И БЕЗОПАСНАЯ)
function parseModelSelection(buttonText: string): {
  modelId: string
  aspectRatio: string
  duration?: number
  cost: number
} | null {
  try {
    console.log('🎬 [PARSE] Parsing button text:', buttonText)

    // Определяем соотношение сторон по иконке
    const aspectRatio = buttonText.includes('📱') ? '9:16' : '16:9'

    // УПРОЩЕННЫЙ парсинг по ключевым словам
    if (buttonText.includes('Veo 3 Fast')) {
      return { modelId: 'kie-veo-3-fast', aspectRatio, duration: 8, cost: 40 }
    }
    if (buttonText.includes('Veo 3')) {
      return { modelId: 'kie-veo-3', aspectRatio, duration: 8, cost: 202 }
    }
    if (buttonText.includes('Runway Aleph')) {
      return {
        modelId: 'kie-runway-aleph',
        aspectRatio,
        duration: 6,
        cost: 182,
      }
    }
    if (buttonText.includes('Kling v1.6 Pro')) {
      return { modelId: 'kling-v1.6-pro', aspectRatio, duration: 10, cost: 60 }
    }
    if (buttonText.includes('Minimax')) {
      return { modelId: 'minimax', aspectRatio, duration: 6, cost: 50 }
    }
    if (buttonText.includes('Hunyuan Video Fast')) {
      return {
        modelId: 'hunyuan-video-fast',
        aspectRatio,
        duration: 5,
        cost: 25,
      }
    }
    if (buttonText.includes('Wan-2.1')) {
      return {
        modelId: 'wan-text-to-video',
        aspectRatio,
        duration: 5,
        cost: 20,
      }
    }

    console.warn('🎬 [PARSE] No match found for button text:', buttonText)
    return { modelId: 'kie-veo-3-fast', aspectRatio, duration: 8, cost: 40 } // fallback
  } catch (error) {
    console.error('🎬 [PARSE] Error parsing button text:', buttonText, error)
    return {
      modelId: 'kie-veo-3-fast',
      aspectRatio: '9:16',
      duration: 8,
      cost: 40,
    } // safe fallback
  }
}

// ========== INLINE WIZARD ФУНКЦИИ (КАК В РАБОЧИХ WIZARDS) ==========

// ========== СОЗДАНИЕ WIZARD'A С INLINE ФУНКЦИЯМИ (КАК В textToImageWizard) ==========

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',
  
  // ========== ШАГ 1: ВЫБОР МОДЕЛИ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] 🚀 STEP 1 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard.cursor)
    
    try {
      const isRu = isRussianFromState(ctx)
      console.log('🎬 [WIZARD] Step 1: Language detected:', isRu)

      // Инициализируем сессию с валидацией
      const validatedSession = validateTextToVideoSession({
        step: 'model_selection',
        startTime: Date.now(),
        wizardCursor: 0,
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession
      }
      
      // Отбираем только text-to-video модели
      const allModels = Object.entries(VIDEO_MODELS_CONFIG)
      const textInputModels = allModels.filter(([_, config]) => config.inputType.includes('text'))
      const textModels = textInputModels.filter(([modelId]) =>
        TEXT_TO_VIDEO_CONSTANTS.SUPPORTED_MODELS.includes(modelId as any)
      )
        
      if (textModels.length === 0) {
        console.error('🎬 [WIZARD] Step 1: NO TEXT MODELS FOUND!')
        await ctx.reply('❌ Модели не найдены. Попробуйте позже.')
        return ctx.scene.leave()
      }

      const keyboardRows: string[][] = []
      // Создаем кнопки по 2 в ряд (для каждого соотношения сторон)
      textModels.forEach(([modelId, config]) => {
        const button9x16 = createModelButton(modelId, '9:16', isRu)
        const button16x9 = createModelButton(modelId, '16:9', isRu)
        keyboardRows.push([button9x16, button16x9])
      })

      // Кнопка назад
      keyboardRows.push([isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'])
      const keyboard = Markup.keyboard(keyboardRows).resize()

      await ctx.reply(
        isRu
          ? `🎥 Выберите модель и формат видео:\n\n📱 — 9:16 (вертикально)\n🖥️ — 16:9 (горизонтально)\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n📱 — 9:16 (vertical)\n🖥️ — 16:9 (horizontal)\n\n⭐ Price in Telegram Stars`,
        keyboard
      )

      console.log('🎬 [WIZARD] Step 1: ✅ REPLY SENT! Moving to next step...')
      ctx.wizard.next()
      return
      
    } catch (error) {
      console.error('🎬 [WIZARD] 💥 STEP 1 ERROR:', error)
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 2: ВЫБОР МОДЕЛИ И ПЕРЕХОД К ПРОМПТУ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard.cursor)
    
    try {
      const isRu = isRussianFromState(ctx)
      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [WIZARD] Step 2: No text message')
        await ctx.reply(
          isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [WIZARD] Step 2: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      // Парсим выбранную модель
      const parsedModel = parseModelSelection(selectedText)
      if (parsedModel) {
        console.log('🎬 [WIZARD] Step 2: Model selected:', parsedModel)
        
        // Валидируем и сохраняем
        const validatedModel = validateVideoModel(parsedModel)
        ctx.session.selectedModel = validatedModel.modelId
        ctx.session.aspect_ratio = validatedModel.aspectRatio
        ctx.session.selectedVideoCost = validatedModel.cost
        
        await ctx.reply(
          isRu 
            ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
            : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`
        )
        
        ctx.wizard.next()
        return
      }

      // Если не удалось распарсить модель
      console.log('🎬 [WIZARD] Step 2: Unknown input, asking to select model')
      await ctx.reply(
        isRu ? 'Пожалуйста, выберите модель из кнопок выше.' : 'Please select a model from the buttons above.'
      )
      
    } catch (error) {
      console.error('🎬 [WIZARD] Step 2 ERROR:', error)
      await ctx.reply('❌ Ошибка во втором шаге wizard')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 3: ОБРАБОТКА ПРОМПТА И ГЕНЕРАЦИЯ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] ⚡ STEP 3 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard.cursor)
    
    try {
      const isRu = isRussianFromState(ctx)
      const message = ctx.message

      if (!message || !('text' in message)) {
        await ctx.reply(
          isRu ? 'Опишите, что должно происходить в видео.' : 'Describe what should happen in the video.'
        )
        return
      }

      const prompt = message.text.trim()

      if (!prompt || prompt.length < TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH) {
        await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
        return
      }

      if (prompt.length > TEXT_TO_VIDEO_CONSTANTS.MAX_PROMPT_LENGTH) {
        await ctx.reply(isRu ? 'Описание слишком длинное.' : 'Description is too long.')
        return
      }

      // Получаем параметры
      const selectedModel = ctx.session.selectedModel || TEXT_TO_VIDEO_CONSTANTS.DEFAULT_MODEL
      const aspectRatio = ctx.session.aspect_ratio || TEXT_TO_VIDEO_CONSTANTS.DEFAULT_ASPECT_RATIO
      const cost = ctx.session.selectedVideoCost || 40

      console.log('🎬 [WIZARD] Step 3: Starting generation with params:', {
        selectedModel, aspectRatio, cost
      })

      // Генерируем видео
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
      )

      const videoModelId = selectedModel as VideoModelId
      await handleTextToVideoDirect(ctx, prompt, videoModelId, undefined, aspectRatio)
      console.log('🎬 [WIZARD] Video generation success!')

      return ctx.scene.leave()
      
    } catch (error) {
      console.error('🎬 [WIZARD] Step 3 ERROR:', error)
      await ctx.reply('❌ Ошибка в третьем шаге wizard')
      return ctx.scene.leave()
    }
  }
)

console.log('🔥 [DEBUG] textToVideoWizard CREATED! ID:', textToVideoWizard.id)
console.log('🔥 [DEBUG] textToVideoWizard steps count:', (textToVideoWizard as any).steps?.length)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// ИСПРАВЛЕНИЕ: удаляем executeFirstStep - пусть wizard обрабатывает шаги стандартным способом

// Обработчик входа в wizard
textToVideoWizard.enter(async ctx => {
  console.log('🎬 [WIZARD] ✅ WIZARD ENTERED! User:', ctx.from?.id)
  console.log('🎬 [WIZARD] Scene ID:', ctx.scene.current?.id)
  console.log('🎬 [WIZARD] Current step:', ctx.wizard?.cursor)

  try {
    // Инициализируем сессию с ZOD валидацией при входе в wizard
    const initialSession = validateTextToVideoSession({
      step: 'model_selection',
      startTime: Date.now(),
      wizardCursor: 0,
    })
    ctx.session = {
      ...ctx.session,
      ...initialSession
    }
    
    console.log('🎬 [WIZARD] Initial session validated and set:', initialSession)
    
    logger.info('[TextToVideoWizard] Wizard entered successfully', {
      telegramId: ctx.from?.id,
      sceneId: ctx.scene.current?.id,
      currentStep: ctx.wizard?.cursor,
      sessionStep: initialSession.step,
      timestamp: new Date().toISOString(),
    })

    // Let Telegraf handle the first step automatically - don't manually call it
    console.log('🎬 [WIZARD] Wizard entered, Telegraf will handle first step automatically')
  } catch (error) {
    console.error('🎬 [WIZARD] Error initializing wizard session:', error)
    logger.error('[TextToVideoWizard] Session initialization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработчик выхода из wizard
textToVideoWizard.leave(async ctx => {
  console.log('🎬 [WIZARD] 👋 WIZARD LEFT! User:', ctx.from?.id)

  logger.info('[TextToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
    timestamp: new Date().toISOString(),
  })

  // Очищаем данные сессии
  if (ctx.session) {
    delete ctx.session.selectedVideoModel
    delete ctx.session.selectedVideoCost
    delete ctx.session.selectedAspectRatio
    delete ctx.session.selectedDuration
  }
})

console.log('🎬 [WIZARD] CONFIG-BASED textToVideoWizard loaded successfully')