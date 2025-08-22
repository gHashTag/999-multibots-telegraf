import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'

console.log('🎬 [WIZARD] Loading CONFIG-BASED textToVideoWizard...')

// Функция для расчета стоимости в звездах из конфига
function calculateStarsFromConfig(modelId: string, duration?: number): number {
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) return 40 // fallback
  
  let price = config.basePrice
  
  // Для Kling модели - цена за секунду
  if (modelId.includes('kling') && duration) {
    price = price * duration
  }
  
  // Конвертация в звезды: basePrice * 5 / 0.016 * 1.5
  return Math.floor(((price * 5) / 0.016) * 1.5)
}

// Функция создания кнопки с правильной ценой и длительностью
function createModelButton(modelId: string, aspectRatio: string, isRu: boolean): string {
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) return `${modelId} | ${aspectRatio}`
  
  const aspectIcon = aspectRatio === '9:16' ? '📱' : '🖥️'
  
  // Определяем длительность
  let durationText = ''
  let stars = 0
  
  if (modelId === 'kie-veo-3-fast') {
    durationText = ' | 8s'
    stars = calculateStarsFromConfig(modelId, 8)
  } else if (modelId === 'kie-veo-3') {
    durationText = ' | 8s'  
    stars = calculateStarsFromConfig(modelId, 8)
  } else if (modelId === 'kie-runway-aleph') {
    durationText = ' | 6s'
    stars = calculateStarsFromConfig(modelId, 6)
  } else if (modelId === 'kling-v1.6-pro') {
    durationText = ''
    stars = calculateStarsFromConfig(modelId, 10) // примерная длительность
  } else if (modelId === 'minimax') {
    durationText = ' | 6s'
    stars = calculateStarsFromConfig(modelId, 6)
  } else {
    stars = calculateStarsFromConfig(modelId)
  }
  
  return `${config.title}${durationText} | ${aspectIcon} (${stars}⭐)`
}

// Функция парсинга выбранной модели из кнопки
function parseModelSelection(buttonText: string): { modelId: string, aspectRatio: string, duration?: number, cost: number } | null {
  // Определяем соотношение сторон по иконке
  const aspectRatio = buttonText.includes('📱') ? '9:16' : '16:9'
  
  // Ищем модель по названию в конфиге
  for (const [modelId, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
    if (buttonText.includes(config.title)) {
      // Определяем длительность и стоимость на основе модели
      let duration: number | undefined
      let cost: number
      
      if (modelId === 'kie-veo-3-fast') {
        duration = 8
        cost = calculateStarsFromConfig(modelId, duration)
      } else if (modelId === 'kie-veo-3') {
        duration = 8
        cost = calculateStarsFromConfig(modelId, duration)
      } else if (modelId === 'kie-runway-aleph') {
        duration = 6
        cost = calculateStarsFromConfig(modelId, duration)
      } else if (modelId === 'kling-v1.6-pro') {
        duration = 10 // стандартная длительность для Kling
        cost = calculateStarsFromConfig(modelId, duration)
      } else if (modelId === 'minimax') {
        duration = 6
        cost = calculateStarsFromConfig(modelId, duration)
      } else {
        cost = calculateStarsFromConfig(modelId)
      }
      
      return { modelId, aspectRatio, duration, cost }
    }
  }
  
  return null
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
      
      // 🚀 КОНФИГ-БАЗИРОВАННАЯ клавиатура (правильные цены и длительности)
      const textToVideoModels = [
        'kie-veo-3-fast',    // Veo 3 Fast - 8s
        'kie-veo-3',         // Veo 3 - 8s  
        'kie-runway-aleph',  // Runway Aleph - 6s
        'kling-v1.6-pro',    // Kling Pro - переменная
        'minimax',           // Minimax - 6s
        'hunyuan-video-fast', // Hunyuan - быстрая
        'wan-text-to-video'   // Wan T2V - быстрая
      ]
      
      const keyboard = Markup.keyboard([
        // === VEO МОДЕЛИ (премиум) ===
        [
          createModelButton('kie-veo-3-fast', '9:16', isRu),
          createModelButton('kie-veo-3-fast', '16:9', isRu)
        ],
        [
          createModelButton('kie-veo-3', '9:16', isRu),
          createModelButton('kie-veo-3', '16:9', isRu)
        ],
        [
          createModelButton('kie-runway-aleph', '9:16', isRu),
          createModelButton('kie-runway-aleph', '16:9', isRu)
        ],
        
        // === KLING (анимация) ===
        [
          createModelButton('kling-v1.6-pro', '9:16', isRu),
          createModelButton('kling-v1.6-pro', '16:9', isRu)
        ],
        
        // === БЫСТРЫЕ МОДЕЛИ ===
        [
          createModelButton('minimax', '9:16', isRu),
          createModelButton('minimax', '16:9', isRu)
        ],
        [
          createModelButton('hunyuan-video-fast', '9:16', isRu),
          createModelButton('wan-text-to-video', '16:9', isRu)
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
    delete ctx.session.selectedDuration
  }
})

console.log('🎬 [WIZARD] CONFIG-BASED textToVideoWizard loaded successfully')

export default textToVideoWizard