import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'

console.log('🎬 [WIZARD] Loading ULTRA-SIMPLE textToVideoWizard...')

// СУПЕР-ПРОСТОЙ wizard - всего 2 шага
export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ + ФОРМАТ СРАЗУ (ВСЕ МОДЕЛИ) ==========
  async (ctx) => {
    try {
      console.log('🎬 [WIZARD] Step 1: Complete model + format selection for user:', ctx.from?.id)
      
      const isRu = isRussianFromState(ctx)
        console.log('🎬 [WIZARD] Step 1: Language detected:', isRu)
      
      // 🚀 УПРОЩЕННАЯ клавиатура (меньше кнопок)
      const keyboard = Markup.keyboard([
        // === TOP 3 МОДЕЛИ ===
        ['🚀 Veo Fast | 8s | 📱 (40⭐)', '🚀 Veo Fast | 8s | 🖥️ (40⭐)'],
        ['⭐ Veo Pro | 8s | 📱 (202⭐)', '⭐ Veo Pro | 8s | 🖥️ (202⭐)'],
        ['🎯 Kling Pro | 📱 (60⭐)', '🎯 Kling Pro | 🖥️ (60⭐)'],
        
        // === БЫСТРЫЕ МОДЕЛИ ===
        ['💨 Minimax | 📱 (50⭐)', '💨 Minimax | 🖥️ (50⭐)'],
        
        ['⬅️ Назад в меню']
      ]).resize()

      console.log('🎬 [WIZARD] Step 1: Keyboard created')

      await ctx.reply(
        isRu 
          ? '🎥 Выберите модель и формат видео:\n\n🚀 Veo - премиум качество\n🎯 Kling - анимация\n💨 Minimax - быстро и доступно'
          : '🎥 Choose model and video format:\n\n🚀 Veo - premium quality\n🎯 Kling - animation\n💨 Minimax - fast and affordable',
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

      // Парсинг модели (УПРОЩЕННЫЙ)
      console.log('🎬 [WIZARD] Step 2: Processing as model selection')
      
      let selectedModel = 'kie-veo-3-fast'
      let cost = 40
      let duration = 8
      let aspectRatio = '9:16'

      // === УПРОЩЕННЫЙ парсинг ===
      if (selectedText.includes('Veo Fast')) {
        selectedModel = 'kie-veo-3-fast'
        cost = 40
        duration = 8
      } else if (selectedText.includes('Veo Pro')) {
        selectedModel = 'kie-veo-3'
        cost = 202
        duration = 8
      } else if (selectedText.includes('Kling Pro')) {
        selectedModel = 'kling-v1.6-pro'
        cost = 60 // фиксированная цена
        duration = 10 // стандартная длительность
      } else if (selectedText.includes('Minimax')) {
        selectedModel = 'minimax'
        cost = 50
        duration = 6
      }

      // Определяем соотношение сторон
      if (selectedText.includes('🖥️')) {
        aspectRatio = '16:9'
      } else if (selectedText.includes('📱')) {
        aspectRatio = '9:16'
      }

      // Сохраняем в сессии
      ctx.session.selectedVideoModel = selectedModel
      ctx.session.selectedVideoCost = cost
      ctx.session.selectedAspectRatio = aspectRatio
      ctx.session.selectedDuration = duration

      console.log('🎬 [WIZARD] Step 2: Params saved:', { selectedModel, cost, aspectRatio, duration })

      // Просим промпт
      await ctx.reply(
        isRu
          ? `✅ ${selectedText}\n\n💭 Введите описание видео:\n\nПример: "танцующий шаман у костра"`
          : `✅ ${selectedText}\n\n💭 Enter video description:\n\nExample: "dancing shaman around fire"`,
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

console.log('🎬 [WIZARD] ULTRA-SIMPLE textToVideoWizard loaded successfully')

export default textToVideoWizard