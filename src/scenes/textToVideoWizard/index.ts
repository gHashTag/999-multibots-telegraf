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

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ + ПАРАМЕТРЫ СРАЗУ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 1: Model + params selection for user:', ctx.from?.id)
    
    const isRu = isRussianFromState(ctx)
    
    // Комбинированная клавиатура: модель + соотношение сторон
    const keyboard = Markup.keyboard([
      ['🎥 Veo Fast | 📱 9:16 (40⭐)', '🎥 Veo Fast | 🖥️ 16:9 (40⭐)'],
      ['🎥 Veo Pro | 📱 9:16 (80⭐)', '🎥 Veo Pro | 🖥️ 16:9 (80⭐)'],
      ['🎥 Kling | 📱 9:16 (60⭐)', '🎥 Kling | 🖥️ 16:9 (60⭐)'],
      ['⬅️ Назад в меню']
    ]).resize()

    await ctx.reply(
      isRu 
        ? '🎥 Выберите модель и формат видео:'
        : '🎥 Choose model and video format:',
      keyboard
    )

    return ctx.wizard.next()
  },

  // ========== ШАГ 2: ПРОМПТ И СРАЗУ ГЕНЕРАЦИЯ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 2: Prompt + generation for user:', ctx.from?.id)
    
    const isRu = isRussianFromState(ctx)

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.')
      return
    }

    const selectedText = ctx.message.text

    // Назад в меню
    if (selectedText.includes('Назад') || selectedText.includes('Back')) {
      await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
      return ctx.scene.leave()
    }

    // Если это промпт (второй раз в этом шаге)
    if (!selectedText.includes('🎥') && !selectedText.includes('Veo') && !selectedText.includes('Kling')) {
      const prompt = selectedText.trim()
      
      if (!prompt || prompt.length < 3) {
        await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
        return
      }

      // Получаем сохраненные параметры
      const selectedModel = ctx.session.selectedVideoModel || 'kie-veo-3-fast'
      const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
      const cost = ctx.session.selectedVideoCost || 40

      // Сразу генерируем
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt.substring(0, 100)}`
      )

      try {
        const videoModelId = selectedModel as VideoModelId
        const duration = selectedModel.includes('veo') ? 5 : undefined
        
        await handleTextToVideoDirect(ctx, prompt, videoModelId, duration, aspectRatio)
        console.log('🎬 [WIZARD] Video generation success!')
        
      } catch (error) {
        console.error('🎬 [WIZARD] Generation error:', error)
        await ctx.reply(isRu ? '❌ Ошибка генерации' : '❌ Generation error')
      }

      return ctx.scene.leave()
    }

    // Первый раз - парсим выбор модели
    let selectedModel = 'kie-veo-3-fast'
    let cost = 40
    let aspectRatio = '9:16'

    if (selectedText.includes('Veo Fast')) {
      selectedModel = 'kie-veo-3-fast'
      cost = 40
    } else if (selectedText.includes('Veo Pro')) {
      selectedModel = 'kie-veo-3'
      cost = 80
    } else if (selectedText.includes('Kling')) {
      selectedModel = 'kling-v1.6-pro'
      cost = 60
    }

    if (selectedText.includes('16:9')) {
      aspectRatio = '16:9'
    }

    // Сохраняем в сессии
    ctx.session.selectedVideoModel = selectedModel
    ctx.session.selectedVideoCost = cost
    ctx.session.selectedAspectRatio = aspectRatio

    console.log('🎬 [WIZARD] Params saved:', { selectedModel, cost, aspectRatio })

    // Просим промпт
    await ctx.reply(
      isRu
        ? `✅ ${selectedText}\n\n💭 Введите описание видео:\n\nПример: "танцующий шаман у костра"`
        : `✅ ${selectedText}\n\n💭 Enter video description:\n\nExample: "dancing shaman around fire"`,
      Markup.removeKeyboard()
    )

    // Остаемся в том же шаге для получения промпта
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

console.log('🎬 [WIZARD] ULTRA-SIMPLE textToVideoWizard loaded successfully')

export default textToVideoWizard