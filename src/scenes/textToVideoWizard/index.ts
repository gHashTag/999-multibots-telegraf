import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'

// 🎯 ИСПРАВЛЕНИЕ: Маппинг неправильных идентификаторов модели в правильные
const MODEL_ID_MAPPING: Record<string, string> = {
  'veo3_fast': 'kie-veo-3-fast',
  'veo3-fast': 'kie-veo-3-fast',
  'veo_3_fast': 'kie-veo-3-fast',
  'veo-3_fast': 'kie-veo-3-fast',
  'veo3': 'kie-veo-3',
  'veo_3': 'kie-veo-3',
  'runway_aleph': 'kie-runway-aleph',
  'runway-aleph': 'kie-runway-aleph',
}
// 🎯 Импортируем Zod схемы для безопасной валидации
import {
  safeParseContext,
  safeParseTextMessage,
  safeParseModelConfig,
  TextMessageContextSchema,
  SelectedModelSchema,
  PromptSchema,
  ModelButtonTextSchema,
  WizardSessionSchema,
  VideoGenerationParamsSchema,
  ParsedModelSelectionSchema,
  StarsCalculationInputSchema,
  StarsCalculationOutputSchema,
  ModelButtonInputSchema,
  ModelButtonOutputSchema,
  type SelectedModel,
  type VideoGenerationParams,
  type ParsedModelSelection,
} from './schemas'

console.log('🚀🚀🚀 [WIZARD] Loading FIXED CONFIG-BASED textToVideoWizard WITH NEW ZOD SCHEMA! 🚀🚀🚀')

// 🎯 ИСПРАВЛЕНИЕ: Функция для нормализации идентификатора модели
function normalizeModelId(modelId: string): string {
  const normalized = MODEL_ID_MAPPING[modelId] || modelId
  if (normalized !== modelId) {
    console.log(`🔧 [MODEL_FIX] Normalized model ID: ${modelId} -> ${normalized}`)
  }
  return normalized
}

// Функция для расчета стоимости в звездах из конфига (С ZOD ВАЛИДАЦИЕЙ)
function calculateStarsFromConfig(modelId: string, duration?: number): number {
  try {
    console.log('🎬 [CALC] Calculating stars for model:', modelId, 'duration:', duration)
    
    // 🎯 ZOD: Валидация входных параметров
    console.log('🔍 [ZOD] Validating stars calculation input...')
    const inputValidation = StarsCalculationInputSchema.safeParse({ modelId, duration })
    
    if (!inputValidation.success) {
      console.error('🔍 [ZOD] ❌ STARS CALCULATION INPUT VALIDATION FAILED:', inputValidation.error.issues)
      console.warn('🎬 [CALC] Using fallback due to invalid input')
      return 40 // fallback
    }

    console.log('🔍 [ZOD] ✅ Input validation passed')
    const validatedInput = inputValidation.data

    const config = VIDEO_MODELS_CONFIG[validatedInput.modelId]
    if (!config || !config.basePrice || config.basePrice <= 0) {
      console.warn('🎬 [CALC] Invalid config for model:', validatedInput.modelId)
      return 40 // fallback
    }

    let price = config.basePrice

    // Для Kling модели - цена за секунду
    if (validatedInput.modelId.includes('kling') && validatedInput.duration && validatedInput.duration > 0) {
      price = price * validatedInput.duration
    }

    // Упрощенная конвертация в звезды: price * 100 (примерно)
    const rawStars = Math.max(1, Math.floor(price * 100))

    // 🎯 ZOD: Валидация результата
    console.log('🔍 [ZOD] Validating stars calculation output...')
    const outputValidation = StarsCalculationOutputSchema.safeParse(rawStars)
    
    if (!outputValidation.success) {
      console.error('🔍 [ZOD] ❌ STARS CALCULATION OUTPUT VALIDATION FAILED:', outputValidation.error.issues)
      console.warn('🎬 [CALC] Raw stars value was invalid:', rawStars)
      return 40 // safe fallback
    }

    console.log('🔍 [ZOD] ✅ Output validation passed')
    const validatedStars = outputValidation.data

    console.log(
      '🎬 [CALC] Model:',
      validatedInput.modelId,
      'Price:',
      price,
      'Duration:',
      validatedInput.duration,
      'Stars:',
      validatedStars
    )
    
    return validatedStars
  } catch (error) {
    console.error(
      '🎬 [CALC] 💥 Error calculating stars for model:',
      modelId,
      error
    )
    console.error('🎬 [CALC] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return 40 // safe fallback
  }
}

// Функция создания кнопки с правильной ценой и длительностью (С ZOD ВАЛИДАЦИЕЙ)
function createModelButton(
  modelId: string,
  aspectRatio: string,
  isRu: boolean
): string {
  try {
    console.log('🎬 [BUTTON] Creating button for model:', modelId, 'aspect:', aspectRatio, 'isRu:', isRu)
    
    // 🎯 ZOD: Валидация входных параметров
    console.log('🔍 [ZOD] Validating button input parameters...')
    const inputValidation = ModelButtonInputSchema.safeParse({ 
      modelId, 
      aspectRatio: aspectRatio as '9:16' | '16:9', 
      isRu 
    })
    
    if (!inputValidation.success) {
      console.error('🔍 [ZOD] ❌ BUTTON INPUT VALIDATION FAILED:', inputValidation.error.issues)
      console.warn('🎬 [BUTTON] Using fallback due to invalid input')
      return `${modelId} | ${aspectRatio} (40⭐)`
    }

    console.log('🔍 [ZOD] ✅ Input validation passed')
    const validatedInput = inputValidation.data

    const config = VIDEO_MODELS_CONFIG[validatedInput.modelId]
    if (!config || !config.title) {
      console.warn('🎬 [BUTTON] Invalid config for model:', validatedInput.modelId)
      return `${validatedInput.modelId} | ${validatedInput.aspectRatio} (40⭐)`
    }

    const aspectIcon = validatedInput.aspectRatio === '9:16' ? '📱' : '🖥️'

    // УПРОЩЕННЫЕ длительности и цены
    let durationText = ''
    let stars = 40 // по умолчанию

    switch (validatedInput.modelId) {
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
        stars = calculateStarsFromConfig(validatedInput.modelId)
        break
    }

    const rawButtonText = `${config.title}${durationText} | ${aspectIcon} (${stars}⭐)`

    // 🎯 ZOD: Валидация результата
    console.log('🔍 [ZOD] Validating button output...')
    const outputValidation = ModelButtonOutputSchema.safeParse(rawButtonText)
    
    if (!outputValidation.success) {
      console.error('🔍 [ZOD] ❌ BUTTON OUTPUT VALIDATION FAILED:', outputValidation.error.issues)
      console.warn('🎬 [BUTTON] Raw button text was invalid:', rawButtonText)
      return `${validatedInput.modelId} | ${validatedInput.aspectRatio} (40⭐)` // safe fallback
    }

    console.log('🔍 [ZOD] ✅ Output validation passed')
    const validatedButtonText = outputValidation.data

    console.log('🎬 [BUTTON] Created button:', validatedButtonText)
    return validatedButtonText
  } catch (error) {
    console.error(
      '🎬 [BUTTON] 💥 Error creating button for model:',
      modelId,
      error
    )
    console.error('🎬 [BUTTON] Error stack:', error instanceof Error ? error.stack : 'No stack')
    return `${modelId} | ${aspectRatio} (40⭐)` // safe fallback
  }
}

// Функция парсинга выбранной модели из кнопки (С ZOD ВАЛИДАЦИЕЙ)
function parseModelSelection(buttonText: string): ParsedModelSelection | null {
  try {
    console.log('🎬 [PARSE] Parsing button text:', buttonText)
    
    // 🎯 ZOD: Валидация входящего текста кнопки
    console.log('🔍 [ZOD] Validating button text format...')
    const buttonValidation = ModelButtonTextSchema.safeParse(buttonText)
    
    if (!buttonValidation.success) {
      console.error('🔍 [ZOD] ❌ BUTTON TEXT VALIDATION FAILED:', buttonValidation.error.issues)
      console.warn('🎬 [PARSE] Button text does not match expected format:', buttonText)
      // Не возвращаем ошибку, продолжаем парсинг для совместимости
    }

    console.log('🔍 [ZOD] Button text format check completed')

    // Определяем соотношение сторон по иконке
    const aspectRatio = buttonText.includes('📱') ? '9:16' : '16:9' as const

    let rawResult: any = null

    // УПРОЩЕННЫЙ парсинг по ключевым словам
    if (buttonText.includes('Veo 3 Fast')) {
      rawResult = { modelId: 'kie-veo-3-fast', aspectRatio, duration: 8, cost: 40 }
    } else if (buttonText.includes('Veo 3')) {
      rawResult = { modelId: 'kie-veo-3', aspectRatio, duration: 8, cost: 202 }
    } else if (buttonText.includes('Runway Aleph')) {
      rawResult = {
        modelId: 'kie-runway-aleph',
        aspectRatio,
        duration: 6,
        cost: 182,
      }
    } else if (buttonText.includes('Kling v1.6 Pro')) {
      rawResult = { modelId: 'kling-v1.6-pro', aspectRatio, duration: 10, cost: 60 }
    } else if (buttonText.includes('Minimax')) {
      rawResult = { modelId: 'minimax', aspectRatio, duration: 6, cost: 50 }
    } else if (buttonText.includes('Hunyuan Video Fast')) {
      rawResult = {
        modelId: 'hunyuan-video-fast',
        aspectRatio,
        duration: 5,
        cost: 25,
      }
    } else if (buttonText.includes('Wan-2.1')) {
      rawResult = {
        modelId: 'wan-text-to-video',
        aspectRatio,
        duration: 5,
        cost: 20,
      }
    } else {
      console.warn('🎬 [PARSE] No match found for button text:', buttonText)
      rawResult = { modelId: 'kie-veo-3-fast', aspectRatio, duration: 8, cost: 40 } // fallback
    }

    // 🎯 ZOD: Валидация результата парсинга
    console.log('🔍 [ZOD] Validating parsed model selection...')
    const selectionValidation = ParsedModelSelectionSchema.safeParse(rawResult)
    
    if (!selectionValidation.success) {
      console.error('🔍 [ZOD] ❌ PARSED MODEL VALIDATION FAILED:', selectionValidation.error.issues)
      console.error('🔍 [ZOD] Raw result was:', rawResult)
      
      // Fallback с валидными данными
      const fallbackResult = { modelId: 'kie-veo-3-fast', aspectRatio: '9:16' as const, duration: 8, cost: 40 }
      const fallbackValidation = ParsedModelSelectionSchema.safeParse(fallbackResult)
      
      if (fallbackValidation.success) {
        console.log('🔍 [ZOD] Using validated fallback result')
        return fallbackValidation.data
      } else {
        console.error('🔍 [ZOD] Even fallback validation failed!')
        return null
      }
    }

    console.log('🔍 [ZOD] ✅ Parsed model selection validation passed')
    console.log('🎬 [PARSE] Successfully parsed model:', selectionValidation.data)
    
    return selectionValidation.data
  } catch (error) {
    console.error('🎬 [PARSE] 💥 Error parsing button text:', buttonText, error)
    console.error('🎬 [PARSE] Error stack:', error instanceof Error ? error.stack : 'No stack')
    
    // Безопасный fallback с Zod валидацией
    try {
      const safeFallback = { modelId: 'kie-veo-3-fast', aspectRatio: '9:16' as const, duration: 8, cost: 40 }
      const fallbackValidation = ParsedModelSelectionSchema.safeParse(safeFallback)
      
      if (fallbackValidation.success) {
        console.log('🔍 [ZOD] Using emergency validated fallback')
        return fallbackValidation.data
      }
    } catch (fallbackError) {
      console.error('🎬 [PARSE] Even emergency fallback failed:', fallbackError)
    }
    
    return null
  }
}

// ========== ОТДЕЛЬНЫЕ ФУНКЦИИ ШАГОВ ==========

const textToVideoStep1 = async (ctx: MyContext) => {
  console.log('🎬 [WIZARD] 🚀 STEP 1 STARTED! User:', ctx.from?.id)
  console.log('🔥 [DEBUG] THIS IS THE REAL textToVideoWizard STEP 1, NOT menuCommandStep!')
  
  // 🎯 ZOD: Валидация контекста перед выполнением
  console.log('🔍 [ZOD] Validating wizard context...')
  const contextValidation = safeParseContext(ctx)
  
  if (!contextValidation.success) {
    console.error('🔍 [ZOD] ❌ CONTEXT VALIDATION FAILED:', contextValidation.error.issues)
    logger.error('[TextToVideoWizard] Context validation failed', {
      telegramId: ctx.from?.id,
      errors: contextValidation.error.issues,
    })
    
    await ctx.reply('❌ Системная ошибка. Попробуйте позже.')
    return ctx.scene.leave()
  }
  
  console.log('🔍 [ZOD] ✅ Context validation passed')
  console.log('🎬 [WIZARD] ✅ WIZARD ENTERED AUTOMATICALLY! User:', ctx.from?.id)
  console.log('🎬 [WIZARD] Scene ID:', ctx.scene.current?.id)
  console.log('🎬 [WIZARD] Current step:', ctx.wizard?.cursor)

  // 🎯 ZOD: Дополнительная проверка wizard состояния
  if (!ctx.wizard) {
    console.error('🔍 [ZOD] ❌ WIZARD CONTEXT MISSING!')
    await ctx.reply('❌ Ошибка wizard системы')
    return ctx.scene.leave()
  }

  if (!ctx.wizard.next || typeof ctx.wizard.next !== 'function') {
    console.error('🔍 [ZOD] ❌ WIZARD.NEXT FUNCTION MISSING!')
    await ctx.reply('❌ Ошибка навигации wizard')  
    return ctx.scene.leave()
  }

  logger.info('[TextToVideoWizard] Wizard entered and step 1 started', {
    telegramId: ctx.from?.id,
    sceneId: ctx.scene.current?.id,
    currentStep: ctx.wizard?.cursor,
    timestamp: new Date().toISOString(),
    validationPassed: true,
  })

    try {
      console.log(
        '🎬 [WIZARD] Step 1: Complete model + format selection for user:',
        ctx.from?.id
      )

      console.log('🎬 [WIZARD] Step 1: About to detect language...')
      const isRu = isRussianFromState(ctx)
      console.log('🎬 [WIZARD] Step 1: Language detected:', isRu)

      // 🚀 КОНФИГ-БАЗИРОВАННАЯ клавиатура из VIDEO_MODELS_CONFIG
      console.log('🎬 [WIZARD] Step 1: Creating CONFIG-based keyboard...')

      console.log('🎬 [WIZARD] Step 1: About to filter text models from VIDEO_MODELS_CONFIG...')
      console.log('🎬 [WIZARD] Step 1: VIDEO_MODELS_CONFIG keys:', Object.keys(VIDEO_MODELS_CONFIG))
      console.log('🎬 [WIZARD] Step 1: VIDEO_MODELS_CONFIG length:', Object.keys(VIDEO_MODELS_CONFIG).length)
      
      // Отбираем только text-to-video модели
      const allModels = Object.entries(VIDEO_MODELS_CONFIG)
      console.log('🎬 [WIZARD] Step 1: All models count:', allModels.length)
      
      const textInputModels = allModels.filter(([_, config]) => config.inputType.includes('text'))
      console.log('🎬 [WIZARD] Step 1: Text input models count:', textInputModels.length)
      
      const textModels = textInputModels.filter(([modelId]) =>
        [
          'kie-veo-3-fast',
          'kie-veo-3',
          'kie-runway-aleph',
          'kling-v1.6-pro',
          'minimax',
          'hunyuan-video-fast',
          'wan-text-to-video',
        ].includes(modelId)
      ) // Оставляем только основные модели
        
      console.log('🎬 [WIZARD] Step 1: Text models filtering completed, final count:', textModels.length)

      console.log(
        '🎬 [WIZARD] Step 1: Filtered text models:',
        textModels.map(([id, config]) => ({ id, title: config.title }))
      )
      
      if (textModels.length === 0) {
        console.error('🎬 [WIZARD] Step 1: NO TEXT MODELS FOUND!')
        await ctx.reply('❌ Модели не найдены. Попробуйте позже.')
        return ctx.scene.leave()
      }

      console.log('🎬 [WIZARD] Step 1: About to create keyboard rows...')
      const keyboardRows: string[][] = []

      // Создаем кнопки по 2 в ряд (для каждого соотношения сторон)
      textModels.forEach(([modelId, config]) => {
        console.log('🎬 [WIZARD] Step 1: Creating buttons for model:', modelId)
        // Создаем кнопки для обоих форматов
        const button9x16 = createModelButton(modelId, '9:16', isRu)
        const button16x9 = createModelButton(modelId, '16:9', isRu)

        keyboardRows.push([button9x16, button16x9])
      })

      // Кнопка назад
      keyboardRows.push([isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'])
      console.log('🎬 [WIZARD] Step 1: Keyboard rows created')

      console.log('🎬 [WIZARD] Step 1: About to create Markup.keyboard...')
      const keyboard = Markup.keyboard(keyboardRows).resize()

      console.log('🎬 [WIZARD] Step 1: Keyboard created with', keyboardRows.length, 'rows')
      console.log('🎬 [WIZARD] Step 1: Keyboard rows:', keyboardRows.map(row => row.map(btn => btn.substring(0, 30))))

      console.log('🎬 [WIZARD] Step 1: About to send reply with keyboard...')
      await ctx.reply(
        isRu
          ? `🎥 Выберите модель и формат видео:\n\n📱 — 9:16 (вертикально)\n🖥️ — 16:9 (горизонтально)\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n📱 — 9:16 (vertical)\n🖥️ — 16:9 (horizontal)\n\n⭐ Price in Telegram Stars`,
        keyboard
      )

      console.log('🎬 [WIZARD] Step 1: ✅ REPLY SENT SUCCESSFULLY! Moving to next step...')
      console.log('🎬 [WIZARD] Step 1: Current wizard cursor:', ctx.wizard.cursor)
      console.log('🎬 [WIZARD] Step 1: Current scene:', ctx.scene.current?.id)
      console.log('🎬 [WIZARD] Step 1: 🏁 STEP 1 COMPLETED SUCCESSFULLY!')
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ВОЗВРАЩАЕМ ctx.wizard.next()!
      return ctx.wizard.next()
    } catch (error) {
      console.error('🎬 [WIZARD] 💥 STEP 1 CRASHED WITH ERROR:', error)
      console.error('🎬 [WIZARD] Error stack:', error instanceof Error ? error.stack : 'No stack')
      logger.error('TextToVideoWizard Step 1 error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
}

const textToVideoStep2 = async (ctx: MyContext) => {
  try {
    console.log(
      '🎬 [WIZARD] Step 2: Processing message for user:',
      ctx.from?.id
    )

    const isRu = isRussianFromState(ctx)

    // 🎯 ZOD: Валидация что это текстовое сообщение
    console.log('🔍 [ZOD] Validating text message...')
    const textMessageValidation = safeParseTextMessage(ctx)
    
    if (!textMessageValidation.success) {
      console.error('🔍 [ZOD] ❌ TEXT MESSAGE VALIDATION FAILED:', textMessageValidation.error.issues)
      
      // Проверяем конкретную причину ошибки
      const hasMessage = !!ctx.message
      const hasText = ctx.message && 'text' in ctx.message && ctx.message.text
      
      console.log('🔍 [ZOD] Validation details:', {
        hasMessage,
        hasText,
        messageType: ctx.message ? Object.keys(ctx.message).filter(k => 
          ['text', 'photo', 'video', 'document', 'voice'].includes(k)
        ) : []
      })

      if (!hasMessage) {
        await ctx.reply(
          isRu
            ? '❌ Не получено сообщение. Выберите модель из кнопок.'
            : '❌ No message received. Select a model from the buttons.'
        )
      } else if (!hasText) {
        await ctx.reply(
          isRu
            ? '📝 Пожалуйста, выберите модель из текстовых кнопок выше (не отправляйте фото/файлы).'
            : '📝 Please select a model from the text buttons above (don\'t send photos/files).'
        )
      } else {
        await ctx.reply(
          isRu
            ? 'Выберите модель из кнопок выше.'
            : 'Select a model from the buttons above.'
        )
      }
      return
    }

    console.log('🔍 [ZOD] ✅ Text message validation passed')
    const selectedText = textMessageValidation.data.message.text
    console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)
    
    // 🎯 ZOD: Валидация текста кнопки модели  
    console.log('🔍 [ZOD] Validating button text format...')
    const buttonValidation = ModelButtonTextSchema.safeParse(selectedText)
    
    let isValidModelButton = buttonValidation.success
    console.log('🔍 [ZOD] Button format valid:', isValidModelButton)
    
    if (!isValidModelButton) {
      console.log('🔍 [ZOD] Button validation failed, details:', buttonValidation.error?.issues)
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: если это выбор модели, а не промпт
    const parsedModel = parseModelSelection(selectedText)
    if (parsedModel) {
      console.log('🎬 [WIZARD] Step 2: Model selected:', parsedModel)
      
      // 🎯 ИСПРАВЛЕНИЕ: Нормализуем и сохраняем выбранную модель в сессию
      const normalizedModelId = normalizeModelId(parsedModel.modelId)
      ctx.session.selectedModel = normalizedModelId
      ctx.session.aspect_ratio = parsedModel.aspectRatio
      ctx.session.selectedVideoCost = parsedModel.cost
      ctx.session.selectedVideoDuration = parsedModel.duration // ✅ Сохраняем duration
      
      console.log(`🔧 [SESSION_FIX] Saved normalized model to session: ${normalizedModelId}`)
      
      // Просим ввести промпт
      await ctx.reply(
        isRu 
          ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
          : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`,
        Markup.removeKeyboard() // ✅ Убираем клавиатуру когда модель выбрана
      )
      
      // Переходим к следующему шагу (ожидание промпта)
      return ctx.wizard.next()
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: проверяем не является ли это кнопкой меню
    if (
      selectedText === '🎥 Видео из текста' ||
      selectedText === '🎥 Video from text' ||
      selectedText === '🎥 Text to Video'
    ) {
      console.log(
        '🎬 [WIZARD] Step 2: Menu button clicked again - going back to main menu!'
      )
      await ctx.reply(
        isRu ? 'Возвращаемся в главное меню...' : 'Going back to main menu...'
      )
      return ctx.scene.leave()
    }

    // Назад в меню
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      console.log('🎬 [WIZARD] Step 2: Going back to menu')
      await ctx.reply(
        isRu ? 'Возвращаемся в меню...' : 'Returning to menu...'
      )
      return ctx.scene.leave()
    }

    // Если это НЕ модель и НЕ кнопка назад - это неизвестный ввод
    console.log('🎬 [WIZARD] Step 2: Unknown input, asking to select model')
    await ctx.reply(
      isRu
        ? 'Пожалуйста, выберите модель из кнопок выше.'
        : 'Please select a model from the buttons above.'
    )
  } catch (error) {
    console.error('🎬 [WIZARD] Step 2 ERROR:', error)
    await ctx.reply('❌ Ошибка во втором шаге wizard')
    return ctx.scene.leave()
  }
}

const textToVideoStep3 = async (ctx: MyContext) => {
  try {
    console.log(
      '🎬 [WIZARD] Step 3: Processing prompt for user:',
      ctx.from?.id
    )

    const isRu = isRussianFromState(ctx)

    // 🎯 ZOD: Валидация что это текстовое сообщение
    console.log('🔍 [ZOD] Validating text message for prompt...')
    const textMessageValidation = safeParseTextMessage(ctx)
    
    if (!textMessageValidation.success) {
      console.error('🔍 [ZOD] ❌ PROMPT TEXT MESSAGE VALIDATION FAILED:', textMessageValidation.error.issues)
      await ctx.reply(
        isRu
          ? '📝 Пожалуйста, отправьте текстовое описание для видео.'
          : '📝 Please send a text description for the video.'
      )
      return
    }

    console.log('🔍 [ZOD] ✅ Text message validation passed for prompt')
    const promptText = textMessageValidation.data.message.text.trim()

    // 🎯 ZOD: Валидация промпта
    console.log('🔍 [ZOD] Validating prompt content...')
    const promptValidation = PromptSchema.safeParse(promptText)
    
    if (!promptValidation.success) {
      console.error('🔍 [ZOD] ❌ PROMPT VALIDATION FAILED:', promptValidation.error.issues)
      
      const errorMessage = promptValidation.error.issues[0]?.message || 'Invalid prompt'
      await ctx.reply(
        isRu
          ? `❌ Ошибка в описании: ${errorMessage}`
          : `❌ Prompt error: ${errorMessage}`
      )
      return
    }

    console.log('🔍 [ZOD] ✅ Prompt validation passed')
    const validatedPrompt = promptValidation.data

    // 🎯 ZOD: Валидация данных сессии
    console.log('🔍 [ZOD] Validating wizard session data...')
    const sessionValidation = WizardSessionSchema.safeParse(ctx.session)
    
    if (!sessionValidation.success) {
      console.error('🔍 [ZOD] ❌ SESSION VALIDATION FAILED:', sessionValidation.error.issues)
      await ctx.reply(
        isRu 
          ? '❌ Ошибка данных сессии. Начните сначала.'
          : '❌ Session data error. Please start over.'
      )
      return ctx.scene.leave()
    }

    console.log('🔍 [ZOD] ✅ Session validation passed')

    // Получаем сохраненные параметры с fallback значениями
    const selectedModel = sessionValidation.data.selectedModel || 'kie-veo-3-fast'
    const aspectRatio = sessionValidation.data.aspect_ratio || '9:16'
    const cost = sessionValidation.data.selectedVideoCost || 40
    const duration = sessionValidation.data.selectedVideoDuration || 8 // ✅ Добавляем duration

    // 🎯 ZOD: Валидация параметров генерации видео
    console.log('🔍 [ZOD] Validating video generation params...')
    const generationParams = {
      prompt: validatedPrompt,
      modelId: selectedModel,
      aspectRatio: aspectRatio,
      cost: cost,
      duration: duration // ✅ Добавляем duration в параметры
    }
    
    const paramsValidation = VideoGenerationParamsSchema.safeParse(generationParams)
    
    if (!paramsValidation.success) {
      console.error('🔍 [ZOD] ❌ VIDEO GENERATION PARAMS VALIDATION FAILED:', paramsValidation.error.issues)
      await ctx.reply(
        isRu
          ? '❌ Ошибка параметров генерации. Проверьте выбранную модель.'
          : '❌ Generation parameters error. Check selected model.'
      )
      return ctx.scene.leave()
    }

    console.log('🔍 [ZOD] ✅ Video generation params validation passed')
    const validatedParams = paramsValidation.data

    console.log('🎬 [WIZARD] Step 3: Starting generation with validated params:', {
      selectedModel: validatedParams.modelId,
      aspectRatio: validatedParams.aspectRatio,
      cost: validatedParams.cost,
      promptLength: validatedParams.prompt.length
    })

    // Генерируем видео
    await ctx.reply(
      isRu
        ? `🎬 Генерируем видео...\n📋 ${validatedParams.modelId} | ${validatedParams.aspectRatio} | ${validatedParams.cost}⭐\n💭 ${validatedParams.prompt.substring(0, 100)}`
        : `🎬 Generating video...\n📋 ${validatedParams.modelId} | ${validatedParams.aspectRatio} | ${validatedParams.cost}⭐\n💭 ${validatedParams.prompt.substring(0, 100)}`
    )

    // 🎯 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Нормализуем modelId перед отправкой
    const normalizedModelId = normalizeModelId(validatedParams.modelId) as VideoModelId
    console.log(`🔧 [FINAL_FIX] Using normalized model ID: ${normalizedModelId}`)
    
    await handleTextToVideoDirect(
      ctx,
      validatedParams.prompt,
      normalizedModelId,
      validatedParams.duration, // now properly passed from validation
      validatedParams.aspectRatio
    )
    
    console.log('🎬 [WIZARD] ✅ Video generation completed successfully!')
    logger.info('[TextToVideoWizard] Video generation completed', {
      telegramId: ctx.from?.id,
      modelId: validatedParams.modelId,
      aspectRatio: validatedParams.aspectRatio,
      cost: validatedParams.cost,
      promptLength: validatedParams.prompt.length,
      validationPassed: true,
    })

    return ctx.scene.leave()
  } catch (error) {
    console.error('🎬 [WIZARD] 💥 STEP 3 CRASHED WITH ERROR:', error)
    console.error('🎬 [WIZARD] Error stack:', error instanceof Error ? error.stack : 'No stack')
    logger.error('TextToVideoWizard Step 3 error', {
      telegramId: ctx.from?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    await ctx.reply('❌ Ошибка в третьем шаге wizard')
    return ctx.scene.leave()
  }
}

// ========== СОЗДАНИЕ WIZARD'A С ОТДЕЛЬНЫМИ ФУНКЦИЯМИ ==========

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',
  textToVideoStep1,  // Используем отдельные функции!
  textToVideoStep2,
  textToVideoStep3
)

console.log('🔥 [DEBUG] textToVideoWizard CREATED! ID:', textToVideoWizard.id)
console.log('🔥 [DEBUG] textToVideoWizard steps count:', (textToVideoWizard as any).steps?.length)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// ИСПРАВЛЕНИЕ: удаляем executeFirstStep - пусть wizard обрабатывает шаги стандартным способом

// ИСПРАВЛЕНИЕ: Убираем кастомный enter handler - Telegraf WizardScene автоматически вызывает первый шаг!

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
