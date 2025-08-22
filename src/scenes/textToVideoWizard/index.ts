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
    console.error('🎬 [BUTTON] Error creating button for model:', modelId, error)
    return `${modelId} | ${aspectRatio} (40⭐)`
  }
}

// Функция парсинга выбранной модели из кнопки (УПРОЩЕННАЯ И БЕЗОПАСНАЯ)
function parseModelSelection(buttonText: string): { modelId: string, aspectRatio: string, duration?: number, cost: number } | null {
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
      return { modelId: 'kie-runway-aleph', aspectRatio, duration: 6, cost: 182 }
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
    return { modelId: 'kie-veo-3-fast', aspectRatio, duration: 8, cost: 40 } // fallback
    
  } catch (error) {
    console.error('🎬 [PARSE] Error parsing button text:', buttonText, error)
    return { modelId: 'kie-veo-3-fast', aspectRatio: '9:16', duration: 8, cost: 40 } // safe fallback
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
      
      // 🚀 УПРОЩЕННАЯ и БЕЗОПАСНАЯ клавиатура (TOP-4 модели)
      console.log('🎬 [WIZARD] Step 1: Creating simplified keyboard...')
      
      const keyboard = Markup.keyboard([
        // === VEO МОДЕЛИ (премиум) ===
        [
          'Veo 3 Fast | 8s | 📱 (40⭐)',
          'Veo 3 Fast | 8s | 🖥️ (40⭐)'
        ],
        [
          'Veo 3 | 8s | 📱 (202⭐)',
          'Veo 3 | 8s | 🖥️ (202⭐)'
        ],
        
        // === ДОСТУПНЫЕ МОДЕЛИ ===
        [
          'Kling v1.6 Pro | ~10s | 📱 (60⭐)',
          'Kling v1.6 Pro | ~10s | 🖥️ (60⭐)'
        ],
        [
          'Minimax | 6s | 📱 (50⭐)',
          'Minimax | 6s | 🖥️ (50⭐)'
        ],
        
        [isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu']
      ]).resize()

      console.log('🎬 [WIZARD] Step 1: Keyboard created')

      await ctx.reply(
        isRu 
          ? '🎥 Выберите модель и формат видео:\n\n🚀 Veo - премиум качество, фиксированное время\n🎯 Kling - анимация, гибкая длительность\n💨 Быстрые модели - доступные цены'
          : '🎥 Choose model and video format:\n\n🚀 Veo - premium quality, fixed duration\n🎯 Kling - animation, flexible duration\n💨 Fast models - affordable prices',
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
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText.substring(0, 50))

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [WIZARD] Step 2: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      // Если это промпт (НЕ содержит эмодзи моделей)
      if (!selectedText.includes('🚀') && !selectedText.includes('⭐') && !selectedText.includes('🎯') && !selectedText.includes('💨')) {
        console.log('🎬 [WIZARD] Step 2: Processing as prompt')
        
        const prompt = selectedText.trim()
        
        if (!prompt || prompt.length < 3) {
          await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
          return
        }

        // Получаем сохраненные параметры
        const selectedModel = ctx.session.selectedVideoModel || 'kie-veo-3-fast'
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

// ПРЯМАЯ функция первого шага (для вызова из enter)
async function executeFirstStep(ctx: any) {
  try {
    console.log('🎬 [WIZARD] DIRECT Step 1: Model selection for user:', ctx.from?.id)
    
    const isRu = true // упрощенно
    
    console.log('🎬 [WIZARD] DIRECT Step 1: Creating keyboard...')
    
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['Veo 3 Fast | 8s | 📱 (40⭐)', 'Veo 3 Fast | 8s | 🖥️ (40⭐)'],
          ['Veo 3 | 8s | 📱 (202⭐)', 'Veo 3 | 8s | 🖥️ (202⭐)'],
          ['Kling v1.6 Pro | ~10s | 📱 (60⭐)', 'Kling v1.6 Pro | ~10s | 🖥️ (60⭐)'],
          ['Minimax | 6s | 📱 (50⭐)', 'Minimax | 6s | 🖥️ (50⭐)'],
          ['⬅️ Назад в меню']
        ],
        resize_keyboard: true
      }
    }

    await ctx.reply(
      '🎥 Выберите модель и формат видео:\n\n🚀 Veo - премиум качество\n🎯 Kling - анимация\n💨 Minimax - быстро и доступно',
      keyboard
    )
    
    console.log('🎬 [WIZARD] DIRECT Step 1: Reply sent, setting cursor to 1')
    ctx.wizard.cursor = 1
    
  } catch (error) {
    console.error('🎬 [WIZARD] DIRECT Step 1 ERROR:', error)
    await ctx.reply('❌ Ошибка в мастере генерации видео')
    await ctx.scene.leave()
  }
}

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
  
  // 🔥 ПРЯМО вызываем первый шаг
  console.log('🎬 [WIZARD] Calling DIRECT first step...')
  await executeFirstStep(ctx)
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