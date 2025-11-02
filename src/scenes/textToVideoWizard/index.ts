import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import {
  TEXT_TO_VIDEO_CONSTANTS,
} from '@/interfaces/zod/textToVideo.zod'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

console.log('🎬 [WIZARD] Loading CONFIG-BASED textToVideoWizard...')

// Функция для расчета стоимости в звездах из конфига
function calculateStarsFromConfig(modelId: string, duration?: number): number {
  try {
    const config = VIDEO_MODELS_CONFIG[modelId]
    if (!config || !config.basePrice || config.basePrice <= 0) {
      console.warn('🎬 [CALC] Invalid config for model:', modelId)
      return 40 // fallback
    }

    let price = config.basePrice

    // Для моделей с ценой за секунду
    if (modelId.includes('kling') && duration && duration > 0) {
      price = price * duration
    }

    // Конвертация в звезды: (price * 5 / 0.016) * 1.5
    const stars = Math.floor(((price * 5) / 0.016) * 1.5)

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

// Функция создания кнопки с правильной ценой из конфига
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

    // Используем договоренные цены вместо расчета по базовой цене
    let stars: number
    switch (modelId) {
      case 'veo3_fast':
        stars = 40
        break
      case 'veo3':
        stars = 120 // ✅ ИСПРАВЛЕНО: $1.92 / $0.016 = 120⭐ (было 202)
        break
      case 'runway-aleph':
        stars = 182
        break
      case 'sora-2':
        stars = 9 // ✅ ДОБАВЛЕНО: $0.15 за 10 сек / $0.016 = 9⭐ БЕЗ наценки
        break
      case 'sora-2-pro':
        stars = 28 // ✅ ДОБАВЛЕНО: $0.45 за 10 сек / $0.016 = 28⭐ БЕЗ наценки
        break
      default:
        // Для остальных моделей используем расчет из конфига
        let price = config.basePrice
        if (config.priceByResolution) {
          price = Math.min(...Object.values(config.priceByResolution))
        }
        stars = Math.floor(((price * 5) / 0.016) * 1.5)
        break
    }

    // Определяем длительность из описания или API конфига
    let durationText = ''
    if (config.description.includes('8 сек')) durationText = ' | 8s'
    else if (config.description.includes('6 сек')) durationText = ' | 6s'
    else if (config.description.includes('5 сек')) durationText = ' | 5s'
    else if (config.api.input.duration) durationText = ` | ${config.api.input.duration}s`

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

// Функция парсинга выбранной модели из кнопки
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

    // Парсим по названию модели из конфига
    const foundModel = Object.entries(VIDEO_MODELS_CONFIG).find(([_, config]) => 
      buttonText.includes(config.title)
    )

    if (foundModel) {
      const [modelId, config] = foundModel
      
      // Используем договоренные цены
      let stars: number
      switch (modelId) {
        case 'veo3_fast':
          stars = 40
          break
        case 'veo3':
          stars = 120 // ✅ ИСПРАВЛЕНО: $1.92 / $0.016 = 120⭐ (было 202)
          break
        case 'runway-aleph':
          stars = 182
          break
        case 'sora-2':
          stars = 9 // ✅ ДОБАВЛЕНО: $0.15 за 10 сек / $0.016 = 9⭐ БЕЗ наценки
          break
        case 'sora-2-pro':
          stars = 28 // ✅ ДОБАВЛЕНО: $0.45 за 10 сек / $0.016 = 28⭐ БЕЗ наценки
          break
        default:
          // Для остальных моделей используем расчет из конфига
          let price = config.basePrice
          if (config.priceByResolution) {
            price = Math.min(...Object.values(config.priceByResolution))
          }
          stars = Math.floor(((price * 5) / 0.016) * 1.5)
          break
      }
      
      // Определяем длительность
      let duration: number | undefined
      if (config.api.input.duration) duration = config.api.input.duration
      else if (config.description.includes('8 сек')) duration = 8
      else if (config.description.includes('6 сек')) duration = 6
      else if (config.description.includes('5 сек')) duration = 5

      return { modelId, aspectRatio, duration, cost: stars }
    }

    console.warn('🎬 [PARSE] No match found for button text:', buttonText)
    return { modelId: 'veo3_fast', aspectRatio, duration: 8, cost: 40 } // fallback
  } catch (error) {
    console.error('🎬 [PARSE] Error parsing button text:', buttonText, error)
    return {
      modelId: 'veo3_fast',
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

      // Инициализируем сессию для текст-в-видео
      
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

      // Создаем кнопки с горизонтальными слева, вертикальными справа
      const keyboardRows: string[][] = []
      
      // Собираем все кнопки по типам
      const horizontalButtons: string[] = [] // 16:9 кнопки (слева)
      const verticalButtons: string[] = []   // 9:16 кнопки (справа)
      
      textModels.forEach(([modelId, config]) => {
        horizontalButtons.push(createModelButton(modelId, '16:9', isRu))
        verticalButtons.push(createModelButton(modelId, '9:16', isRu))
      })
      
      // Создаем ряды: горизонтальные слева, вертикальные справа
      for (let i = 0; i < Math.max(horizontalButtons.length, verticalButtons.length); i++) {
        const row: string[] = []
        if (horizontalButtons[i]) row.push(horizontalButtons[i])
        if (verticalButtons[i]) row.push(verticalButtons[i])
        if (row.length > 0) keyboardRows.push(row)
      }

      // Кнопки назад и отмена
      keyboardRows.push([
        isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
        isRu ? '❌ Отмена' : '❌ Cancel'
      ])
      const keyboard = Markup.keyboard(keyboardRows).resize()

      await ctx.reply(
        isRu
          ? `🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
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

  // ========== ШАГ 2: ВЫБОР МОДЕЛИ + ПРОМПТ + ГЕНЕРАЦИЯ (ОБЪЕДИНЕННЫЙ ШАГ) ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard.cursor)
    
    try {
      const isRu = isRussianFromState(ctx)
      
      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      
      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [WIZARD] Step 2: No text message')
        await ctx.reply(
          isRu ? 'Выберите модель из кнопок выше или введите описание видео.' : 'Select a model from the buttons above or enter video description.'
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

      // Отмена
      if (selectedText.includes('Отмена') || selectedText.includes('Cancel')) {
        console.log('🎬 [WIZARD] Step 2: Cancelled')
        await ctx.reply(
          isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }

      // ЛОГИКА 1: Если это выбор модели
      const parsedModel = parseModelSelection(selectedText)
      if (parsedModel) {
        console.log('🎬 [WIZARD] Step 2: Model selected:', parsedModel)
        
        // Сохраняем выбранную модель
        ctx.session.selectedVideoModel = parsedModel.modelId
        ctx.session.selectedAspectRatio = parsedModel.aspectRatio
        ctx.session.selectedVideoCost = parsedModel.cost
        ctx.session.selectedDuration = parsedModel.duration
        
        await ctx.reply(
          isRu 
            ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
            : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`,
          Markup.removeKeyboard()
        )
        
        // Переходим к следующему шагу для ожидания промпта
        ctx.wizard.next()
        return
      }


      // ЛОГИКА 3: Если модель не выбрана - просим выбрать
      console.log('🎬 [WIZARD] Step 2: No model selected, asking to select')
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
    console.log('🎬 [WIZARD] 🔥 STEP 3 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard.cursor)
    
    try {
      const isRu = isRussianFromState(ctx)
      
      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      
      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [WIZARD] Step 3: No text message')
        await ctx.reply(
          isRu ? 'Введите описание видео.' : 'Enter video description.'
        )
        return
      }

      let prompt = message.text.trim()
      console.log('🎬 [WIZARD] Step 3: Received prompt:', prompt)
      // ОТПРАВЛЯЕМ КАК ЕСТЬ - модель Veo поддерживает JSON формат!

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [WIZARD] Step 3: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      if (!prompt || prompt.length < TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH) {
        await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
        return
      }

      // Убрано ограничение на длину промпта - отправляем полностью в Kie.ai
      // if (prompt.length > TEXT_TO_VIDEO_CONSTANTS.MAX_PROMPT_LENGTH) {
      //   await ctx.reply(isRu ? 'Описание слишком длинное.' : 'Description is too long.')
      //   return
      // }

      // Получаем параметры из сессии
      const selectedModel = ctx.session.selectedVideoModel
      const aspectRatio = ctx.session.selectedAspectRatio || TEXT_TO_VIDEO_CONSTANTS.DEFAULT_ASPECT_RATIO
      const cost = ctx.session.selectedVideoCost || 40
      const duration = ctx.session.selectedDuration

      if (!selectedModel) {
        console.log('🎬 [WIZARD] Step 3: No model selected - returning to step 1')
        await ctx.reply(isRu ? 'Модель не выбрана. Начинаем заново.' : 'No model selected. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      console.log('🎬 [WIZARD] Step 3: Starting generation with params:', {
        selectedModel, aspectRatio, cost, duration
      })

      // Генерируем видео - показываем ПОЛНЫЙ промпт пользователю
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
      )

      const videoModelId = selectedModel as VideoModelId
      await handleTextToVideoDirect(ctx, prompt, videoModelId, duration, aspectRatio)
      console.log('🎬 [WIZARD] Video generation success!')

      return ctx.scene.leave()
      
    } catch (error) {
      console.error('🎬 [WIZARD] Step 3 ERROR:', error)

      // ✅ FIX: Специальная обработка ошибок для Wan 2.2 модели
      const selectedModel = ctx.session.selectedVideoModel
      const isRu = isRussianFromState(ctx) // Определяем isRu в области видимости блока catch
      if (selectedModel === 'wan-2.2-t2v-fast') {
        logger.error('[WIZARD] Wan 2.2 error detected:', {
          modelId: selectedModel,
          error: error instanceof Error ? error.message : 'Unknown error'
        })

        // Определяем тип ошибки
        let errorMessage = '❌ Ошибка генерации видео'
        if (error instanceof Error) {
          const msg = error.message.toLowerCase()
          if (msg.includes('403') || msg.includes('authorization') || msg.includes('forbidden')) {
            errorMessage = isRu
              ? '🚫 Ошибка авторизации API для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.'
              : '🚫 API authorization error for WAN 2.2 model.\n\nTry later or choose another model.'
          } else if (msg.includes('timeout')) {
            errorMessage = isRu
              ? '⏱️ Превышено время ожидания для модели WAN 2.2.\n\nПопробуйте позже.'
              : '⏱️ Timeout exceeded for WAN 2.2 model.\n\nTry again later.'
          } else if (msg.includes('quota') || msg.includes('limit')) {
            errorMessage = isRu
              ? '📊 Превышена квота для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.'
              : '📊 Quota exceeded for WAN 2.2 model.\n\nTry later or choose another model.'
          }
        }

        await ctx.reply(errorMessage)

        // Предлагаем альтернативы
        const keyboard = Markup.keyboard([
          [
            isRu ? '🔄 Попробовать снова (другая модель)' : '🔄 Try Again (different model)',
          ],
          [
            isRu ? '🎬 WAN 2.2 T2V Fast (480p)' : '🎬 WAN 2.2 T2V Fast (480p)',
            isRu ? '🎬 WAN 2.2 T2V Fast (720p)' : '🎬 WAN 2.2 T2V Fast (720p)',
          ],
          [
            isRu ? '🎬 Veo 3 Fast' : '🎬 Veo 3 Fast',
            isRu ? '🎬 Sora 2' : '🎬 Sora 2',
          ],
          [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
        ]).resize()

        await ctx.reply(
          isRu
            ? '💡 Рекомендуем попробовать другие модели:\n• WAN 2.2 (другие разрешения)\n• Veo 3 Fast\n• Sora 2'
            : '💡 Try other models:\n• WAN 2.2 (different resolutions)\n• Veo 3 Fast\n• Sora 2',
          keyboard
        )

        return ctx.scene.leave()
      }

      await ctx.reply(
        isRu
          ? '❌ Ошибка генерации видео. Попробуйте позже.'
          : '❌ Video generation error. Try again later.'
      )
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
    // Инициализируем сессию при входе в wizard
    
    console.log('🎬 [WIZARD] Initial session initialized for textToVideoWizard')
    
    logger.info('[TextToVideoWizard] Wizard entered successfully', {
      telegramId: ctx.from?.id,
      sceneId: ctx.scene.current?.id,
      currentStep: ctx.wizard?.cursor,
      timestamp: new Date().toISOString(),
    })

    // Initialize cursor to step 0 (as expected by tests)
    console.log('🎬 [WIZARD] Setting wizard cursor to step 0')
    if (ctx.wizard && ctx.wizard.selectStep) {
      ctx.wizard.selectStep(0)
    } else {
      console.error('🎬 [WIZARD] ctx.wizard or selectStep is undefined!')
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Вызываем первый шаг вручную!
    console.log('🎬 [WIZARD] Manually calling first step...')
    const firstStep = textToVideoWizard.steps[0]
    if (typeof firstStep === 'function') {
      await firstStep(ctx, () => Promise.resolve())
    } else {
      console.error('🎬 [WIZARD] First step is not a function!')
    }
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