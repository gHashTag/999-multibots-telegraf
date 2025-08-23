import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'

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

// КОНФИГ-БАЗИРОВАННЫЙ wizard - всего 2 шага
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ + ФОРМАТ СРАЗУ (ВСЕ МОДЕЛИ) ==========
  async ctx => {
    console.log('🎬 [WIZARD] 🚀 STEP 1 STARTED! User:', ctx.from?.id)
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
      // Отбираем только text-to-video модели
      const textModels = Object.entries(VIDEO_MODELS_CONFIG)
        .filter(([_, config]) => config.inputType.includes('text'))
        .filter(([modelId]) =>
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
        
      console.log('🎬 [WIZARD] Step 1: Text models filtering completed')

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

      console.log('🎬 [WIZARD] Step 1: ✅ REPLY SENT SUCCESSFULLY! Waiting for user choice...')
      console.log('🎬 [WIZARD] Step 1: Current wizard cursor:', ctx.wizard.cursor)
      console.log('🎬 [WIZARD] Step 1: Current scene:', ctx.scene.current?.id)
      console.log('🎬 [WIZARD] Step 1: 🏁 STEP 1 COMPLETED SUCCESSFULLY!')
      // НЕ переходим на следующий шаг - ждём выбора пользователя
      // return ctx.wizard.next() - УДАЛЕНО!
    } catch (error) {
      console.error('🎬 [WIZARD] 💥 STEP 1 CRASHED WITH ERROR:', error)
      console.error('🎬 [WIZARD] Error stack:', error instanceof Error ? error.stack : 'No stack')
      logger.error('TextToVideoWizard Step 1 error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 2: ПРОМПТ И СРАЗУ ГЕНЕРАЦИЯ (УПРОЩЕННЫЙ ПАРСИНГ) ==========
  async ctx => {
    try {
      console.log(
        '🎬 [WIZARD] Step 2: Processing message for user:',
        ctx.from?.id
      )

      const isRu = isRussianFromState(ctx)

      if (!ctx.message || !('text' in ctx.message)) {
        console.log('🎬 [WIZARD] Step 2: No text message')
        await ctx.reply(
          isRu
            ? 'Выберите модель из кнопок выше.'
            : 'Select a model from the buttons above.'
        )
        return
      }

      const selectedText = ctx.message.text
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: если это выбор модели, а не промпт
      const parsedModel = parseModelSelection(selectedText)
      if (parsedModel) {
        console.log('🎬 [WIZARD] Step 2: Model selected:', parsedModel)
        
        // Сохраняем выбранную модель в сессию
        ctx.session.selectedModel = parsedModel.modelId
        ctx.session.aspectRatio = parsedModel.aspectRatio
        ctx.session.videoCost = parsedModel.cost
        
        // Просим ввести промпт
        await ctx.reply(
          isRu 
            ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
            : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`
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
  },

  // ========== ШАГ 3: ОБРАБОТКА ПРОМПТА И ГЕНЕРАЦИЯ ==========
  async ctx => {
    try {
      console.log(
        '🎬 [WIZARD] Step 3: Processing prompt for user:',
        ctx.from?.id
      )

      const isRu = isRussianFromState(ctx)

      if (!ctx.message || !('text' in ctx.message)) {
        console.log('🎬 [WIZARD] Step 3: No text message')
        await ctx.reply(
          isRu
            ? 'Опишите, что должно происходить в видео.'
            : 'Describe what should happen in the video.'
        )
        return
      }

      const prompt = ctx.message.text.trim()

      if (!prompt || prompt.length < 3) {
        await ctx.reply(
          isRu ? 'Описание слишком короткое.' : 'Description is too short.'
        )
        return
      }

      // Получаем сохраненные параметры
      const selectedModel = ctx.session.selectedModel || 'kie-veo-3-fast'
      const aspectRatio = ctx.session.aspectRatio || '9:16'
      const cost = ctx.session.videoCost || 40

      console.log('🎬 [WIZARD] Step 3: Starting generation with params:', {
        selectedModel,
        aspectRatio,
        cost,
      })

      // Генерируем видео
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
      )

      const videoModelId = selectedModel as VideoModelId
      await handleTextToVideoDirect(
        ctx,
        prompt,
        videoModelId,
        undefined, // duration
        aspectRatio
      )
      console.log('🎬 [WIZARD] Video generation success!')

      return ctx.scene.leave()
    } catch (error) {
      console.error('🎬 [WIZARD] Step 3 ERROR:', error)
      await ctx.reply('❌ Ошибка в третьем шаге wizard')
      return ctx.scene.leave()
    }
  }
)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// ИСПРАВЛЕНИЕ: удаляем executeFirstStep - пусть wizard обрабатывает шаги стандартным способом

// Обработчик входа в wizard
textToVideoWizard.enter(async ctx => {
  console.log('🎬 [WIZARD] ✅ WIZARD ENTERED! User:', ctx.from?.id)
  console.log('🎬 [WIZARD] Scene ID:', ctx.scene.current?.id)
  console.log('🎬 [WIZARD] Current step:', ctx.wizard?.cursor)

  logger.info('[TextToVideoWizard] Wizard entered successfully', {
    telegramId: ctx.from?.id,
    sceneId: ctx.scene.current?.id,
    currentStep: ctx.wizard?.cursor,
    timestamp: new Date().toISOString(),
  })

  // ОКАЗЫВАЕТСЯ TELEGRAF НЕ ВЫЗЫВАЕТ ПЕРВЫЙ ШАГ АВТОМАТИЧЕСКИ!
  // НУЖНО ВЫЗЫВАТЬ ЕГО ВРУЧНУЮ, НО БЕЗ ДВОЙНОГО ВЫЗОВА
  console.log('🎬 [WIZARD] Manually executing first step since Telegraf doesnt do it automatically...')
  
  try {
    // Проверяем что это первый вход (cursor = undefined)
    if (ctx.wizard.cursor === undefined) {
      console.log('🎬 [WIZARD] Fresh wizard entry, executing first step...')
      const firstStepHandler = ctx.wizard.steps[0]
      if (typeof firstStepHandler === 'function') {
        console.log('🎬 [WIZARD] About to call firstStepHandler...')
        try {
          await firstStepHandler(ctx)
          console.log('🎬 [WIZARD] ✅ First step executed successfully from .enter()')
          console.log('🎬 [WIZARD] Current wizard cursor after first step:', ctx.wizard.cursor)
          console.log('🎬 [WIZARD] Current scene after first step:', ctx.scene.current?.id)
        } catch (stepError) {
          console.error('🎬 [WIZARD] ❌ ERROR inside first step execution:', stepError)
          throw stepError // Re-throw для внешнего catch
        }
      } else {
        console.error('🎬 [WIZARD] ❌ First step handler is not a function:', typeof firstStepHandler)
      }
    } else {
      console.log('🎬 [WIZARD] Wizard already has cursor:', ctx.wizard.cursor, '- NOT executing first step')
    }
  } catch (error) {
    console.error('🎬 [WIZARD] ❌ ERROR executing first step from .enter():', error)
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

export default textToVideoWizard
