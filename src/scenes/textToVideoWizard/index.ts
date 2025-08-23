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
    
    console.log('🎬 [CALC] Model:', modelId, 'Price:', price, 'Duration:', duration, 'Stars:', stars)
    return stars
  } catch (error) {
    console.error('🎬 [CALC] Error calculating stars for model:', modelId, error)
    return 40 // fallback
  }
}

// Функция создания кнопки с правильной ценой и длительностью (БЕЗОПАСНАЯ)
function createModelButton(modelId: string, aspectRatio: string, isRu: boolean): string {
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
    
    switch(modelId) {
      case 'veo-3-fast':
        durationText = ' | 8s'
        stars = 40
        break
      case 'veo-3':
        durationText = ' | 8s'  
        stars = 202
        break
      case 'runway-aleph':
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
    console.error('🎬 [BUTTON] Error creating button for model:', modelId, error)
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
      return { modelId: 'veo-3-fast', aspectRatio, duration: 8, cost: 40 }
    }
    if (buttonText.includes('Veo 3')) {
      return { modelId: 'veo-3', aspectRatio, duration: 8, cost: 202 }
    }
    if (buttonText.includes('Runway Aleph')) {
      return {
        modelId: 'runway-aleph',
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
      return { modelId: 'hunyuan-video-fast', aspectRatio, duration: 5, cost: 25 }
    }
    if (buttonText.includes('Wan-2.1')) {
      return { modelId: 'wan-text-to-video', aspectRatio, duration: 5, cost: 20 }
    }
    
    console.warn('🎬 [PARSE] No match found for button text:', buttonText)
    return { modelId: 'veo-3-fast', aspectRatio, duration: 8, cost: 40 } // fallback
    
  } catch (error) {
    console.error('🎬 [PARSE] Error parsing button text:', buttonText, error)
    return { modelId: 'veo-3-fast', aspectRatio: '9:16', duration: 8, cost: 40 } // safe fallback
  }
}

// КОНФИГ-БАЗИРОВАННЫЙ wizard - всего 2 шага
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ + ФОРМАТ СРАЗУ (ВСЕ МОДЕЛИ) ==========
  async (ctx) => {
    try {
      console.log('🎬 [WIZARD] Step 1: Complete model + format selection for user:', ctx.from?.id)
      
      const isRu = isRussianFromState(ctx)
        console.log('🎬 [WIZARD] Step 1: Language detected:', isRu)
      
      // 🚀 КОНФИГ-БАЗИРОВАННАЯ клавиатура из VIDEO_MODELS_CONFIG
      console.log('🎬 [WIZARD] Step 1: Creating CONFIG-based keyboard...')
      
      // Отбираем только text-to-video модели
      const textModels = Object.entries(VIDEO_MODELS_CONFIG)
        .filter(([_, config]) => config.inputType.includes('text'))
        .filter(([modelId]) => [
          'veo-3-fast', 'veo-3', 'runway-aleph',
          'kling-v1.6-pro', 'minimax', 'hunyuan-video-fast', 'wan-text-to-video'
        ].includes(modelId))
      
      console.log('🎬 [WIZARD] Step 1: Filtered text models:', textModels.map(([id, config]) => ({ id, title: config.title })))
      
      const keyboardRows: string[][] = []
      
      // Создаем кнопки по 2 в ряд (для каждого соотношения сторон)
      textModels.forEach(([modelId, config]) => {
        // Создаем кнопки для обоих форматов
        const button9x16 = createModelButton(modelId, '9:16', isRu)
        const button16x9 = createModelButton(modelId, '16:9', isRu)
        
        keyboardRows.push([button9x16, button16x9])
      })
      
      // Кнопка назад
      keyboardRows.push([isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'])
      
      const keyboard = Markup.keyboard(keyboardRows).resize()

      console.log('🎬 [WIZARD] Step 1: Keyboard created')

      await ctx.reply(
        isRu 
          ? `🎥 Выберите модель и формат видео:\n\n📱 — 9:16 (вертикально)\n🖥️ — 16:9 (горизонтально)\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n📱 — 9:16 (vertical)\n🖥️ — 16:9 (horizontal)\n\n⭐ Price in Telegram Stars`,
        keyboard
      )
      
      console.log('🎬 [WIZARD] Step 1: Reply sent, moving to next step')
      return ctx.wizard.next()
      
    } catch (error) {
      console.error('🎬 [WIZARD] Step 1 ERROR:', error)
      logger.error('TextToVideoWizard Step 1 error', { error: error instanceof Error ? error.message : 'Unknown error' })
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 2: ПРОМПТ И СРАЗУ ГЕНЕРАЦИЯ (УПРОЩЕННЫЙ ПАРСИНГ) ==========
  async (ctx) => {
    try {
      console.log('🎬 [WIZARD] Step 2: Processing message for user:', ctx.from?.id)
      
      const isRu = isRussianFromState(ctx)

      if (!ctx.message || !('text' in ctx.message)) {
        console.log('🎬 [WIZARD] Step 2: No text message')
        await ctx.reply(isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.')
        return
      }

      const selectedText = ctx.message.text
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: проверяем не является ли это кнопкой меню
      if (selectedText === '🎥 Видео из текста' || selectedText === '🎥 Video from text' || selectedText === '🎥 Text to Video') {
        console.log('🎬 [WIZARD] Step 2: Menu button clicked again - going back to main menu!')
        await ctx.reply(isRu ? 'Возвращаемся в главное меню...' : 'Going back to main menu...')
        return ctx.scene.leave()
      }

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [WIZARD] Step 2: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      // Если это промпт (НЕ содержит эмодзи моделей или кнопочный текст)
      if (!selectedText.includes('🚀') && !selectedText.includes('⭐') && !selectedText.includes('🎯') && !selectedText.includes('💨') && !selectedText.includes('Veo') && !selectedText.includes('Kling') && !selectedText.includes('Minimax')) {
        console.log('🎬 [WIZARD] Step 2: Processing as prompt')
        
        const prompt = selectedText.trim()
        
        if (!prompt || prompt.length < 3) {
          await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
          return
        }

        // Получаем сохраненные параметры
        const selectedModel = ctx.session.selectedVideoModel || 'veo-3-fast'
        const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
        const cost = ctx.session.selectedVideoCost || 40
        const duration = ctx.session.selectedDuration

        console.log('🎬 [WIZARD] Step 2: Starting generation with params:', { selectedModel, aspectRatio, cost, duration })

        // Сразу генерируем
        await ctx.reply(
          isRu
            ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐${duration ? ` | ${duration}s` : ''}\n💭 ${prompt.substring(0, 100)}`
            : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐${duration ? ` | ${duration}s` : ''}\n💭 ${prompt.substring(0, 100)}`
        )

        const videoModelId = selectedModel as VideoModelId
        await handleTextToVideoDirect(ctx, prompt, videoModelId, duration, aspectRatio)
        console.log('🎬 [WIZARD] Video generation success!')

        return ctx.scene.leave()
      }

      // КОНФИГ-БАЗИРОВАННЫЙ парсинг модели
      console.log('🎬 [WIZARD] Step 2: Processing as model selection')
      
      const parsedModel = parseModelSelection(selectedText)
      
      if (!parsedModel) {
        console.error('🎬 [WIZARD] Step 2: Failed to parse model from:', selectedText)
        await ctx.reply(isRu ? 'Ошибка выбора модели. Попробуйте еще раз.' : 'Model selection error. Try again.')
        return
      }

      const { modelId, aspectRatio, duration, cost } = parsedModel

      // Сохраняем в сессии
      ctx.session.selectedVideoModel = modelId
      ctx.session.selectedVideoCost = cost
      ctx.session.selectedAspectRatio = aspectRatio
      ctx.session.selectedDuration = duration

      console.log('🎬 [WIZARD] Step 2: CONFIG-based params saved:', { modelId, cost, aspectRatio, duration })

      // Просим промпт с детальной информацией из конфига
      const configInfo = VIDEO_MODELS_CONFIG[modelId]
      const durationInfo = duration ? `${duration}s` : 'переменная'
      
      await ctx.reply(
        isRu
          ? `✅ Выбрано: ${configInfo?.title}\n📋 ${aspectRatio} | ${durationInfo} | ${cost}⭐\n\n💭 Введите описание видео:\n\nПример: "танцующий шаман у костра"`
          : `✅ Selected: ${configInfo?.title}\n📋 ${aspectRatio} | ${durationInfo} | ${cost}⭐\n\n💭 Enter video description:\n\nExample: "dancing shaman around fire"`,
        Markup.removeKeyboard()
      )

      console.log('🎬 [WIZARD] Step 2: Prompt request sent')

    } catch (error) {
      console.error('🎬 [WIZARD] Step 2 ERROR:', error)
      logger.error('TextToVideoWizard Step 2 error', { error: error instanceof Error ? error.message : 'Unknown error' })
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  }
)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// ИСПРАВЛЕНИЕ: удаляем executeFirstStep - пусть wizard обрабатывает шаги стандартным способом

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

  
  // ИСПРАВЛЕНИЕ: ЯВНО устанавливаем шаг 0 - это критично для правильной работы wizard'а
  console.log('🎬 [WIZARD] Setting wizard step to 0...')
  try {
    ctx.wizard.selectStep(0)
    console.log('🎬 [WIZARD] Step set to 0, cursor now:', ctx.wizard?.cursor)
    
    // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ЗАПУСКАЕМ ПЕРВЫЙ ШАГ СРАЗУ ПОСЛЕ ВХОДА
    console.log('🎬 [WIZARD] EXECUTING FIRST STEP IMMEDIATELY...')
    return ctx.wizard.steps[0](ctx)
  } catch (error) {
    console.error('🎬 [WIZARD] ERROR setting wizard step or executing first step:', error)
    logger.error('[TextToVideoWizard] Error setting wizard step or executing first step', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id
    })
  }
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
    delete ctx.session.selectedDuration
  }
})

console.log('🎬 [WIZARD] CONFIG-BASED textToVideoWizard loaded successfully')

export default textToVideoWizard