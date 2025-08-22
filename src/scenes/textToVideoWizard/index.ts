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
    console.log('🎬 [WIZARD] Step 1: Complete model + format selection for user:', ctx.from?.id)
    
    const isRu = isRussianFromState(ctx)
    
    // 🚀 ПОЛНАЯ клавиатура со всеми моделями, ценами и длительностью
    const keyboard = Markup.keyboard([
      // === VEO МОДЕЛИ (Google/Kie.ai) - ПРЕМИУМ ===
      ['🚀 Veo 3 Fast | 8s | 📱 (40⭐)', '🚀 Veo 3 Fast | 8s | 🖥️ (40⭐)'],
      ['⭐ Veo 3 Pro | 8s | 📱 (202⭐)', '⭐ Veo 3 Pro | 8s | 🖥️ (202⭐)'],
      ['🎬 Runway Aleph | 6s | 📱 (182⭐)', '🎬 Runway Aleph | 6s | 🖥️ (182⭐)'],
      
      // === KLING МОДЕЛИ - АНИМАЦИЯ ===
      ['🎯 Kling Pro | 📱 (9⭐/s)', '🎯 Kling Pro | 🖥️ (9⭐/s)'],
      
      // === WAN МОДЕЛИ - БЫСТРЫЕ ===
      ['💨 Wan T2V Fast | 📱 (12⭐)', '💨 Wan T2V Fast | 🖥️ (12⭐)'],
      ['💨 Wan I2V Fast | 📱 (11⭐)', '💨 Wan I2V Fast | 🖥️ (11⭐)'],
      
      // === ДРУГИЕ ДОСТУПНЫЕ МОДЕЛИ ===
      ['🔥 Minimax | 📱 (47⭐)', '🔥 Minimax | 🖥️ (47⭐)'],
      ['⚡ Ray v2 | 📱 (17⭐)', '⚡ Ray v2 | 🖥️ (17⭐)'],
      ['💫 Hunyuan Fast | 📱 (19⭐)', '💫 Hunyuan Fast | 🖥️ (19⭐)'],
      
      ['⬅️ Назад в меню']
    ]).resize()

    await ctx.reply(
      isRu 
        ? '🎥 Выберите модель и формат видео:\n\n🚀 Veo - премиум качество, фикс. время\n🎯 Kling - анимация, цена за секунду\n💨 Wan - быстрые, доступные\n⚡ Другие - базовые модели'
        : '🎥 Choose model and video format:\n\n🚀 Veo - premium quality, fixed time\n🎯 Kling - animation, price per second\n💨 Wan - fast, affordable\n⚡ Others - basic models',
      keyboard
    )

    return ctx.wizard.next()
  },

  // ========== ШАГ 2: ПРОМПТ И СРАЗУ ГЕНЕРАЦИЯ (УМНЫЙ ПАРСИНГ) ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] Step 2: Smart prompt + generation for user:', ctx.from?.id)
    
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

    // Если это промпт (второй раз в этом шаге) - НЕ содержит эмодзи моделей
    if (!selectedText.includes('🚀') && !selectedText.includes('⭐') && !selectedText.includes('🎯') && 
        !selectedText.includes('💨') && !selectedText.includes('🔥') && !selectedText.includes('⚡') && 
        !selectedText.includes('💫') && !selectedText.includes('🎬')) {
      
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

      // Сразу генерируем
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐${duration ? ` | ${duration}s` : ''}\n💭 ${prompt.substring(0, 100)}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐${duration ? ` | ${duration}s` : ''}\n💭 ${prompt.substring(0, 100)}`
      )

      try {
        const videoModelId = selectedModel as VideoModelId
        await handleTextToVideoDirect(ctx, prompt, videoModelId, duration, aspectRatio)
        console.log('🎬 [WIZARD] Video generation success!')
        
      } catch (error) {
        console.error('🎬 [WIZARD] Generation error:', error)
        await ctx.reply(isRu ? '❌ Ошибка генерации' : '❌ Generation error')
      }

      return ctx.scene.leave()
    }

    // 🔥 СУПЕР-УМНЫЙ парсинг всех моделей
    let selectedModel = 'kie-veo-3-fast'
    let cost = 40
    let duration = 8
    let aspectRatio = '9:16'

    // === VEO МОДЕЛИ ===
    if (selectedText.includes('Veo 3 Fast')) {
      selectedModel = 'kie-veo-3-fast'
      cost = 40
      duration = 8
    } else if (selectedText.includes('Veo 3 Pro')) {
      selectedModel = 'kie-veo-3'
      cost = 202
      duration = 8
    } else if (selectedText.includes('Runway Aleph')) {
      selectedModel = 'kie-runway-aleph'
      cost = 182
      duration = 6
    
    // === KLING МОДЕЛИ ===
    } else if (selectedText.includes('Kling Pro')) {
      selectedModel = 'kling-v1.6-pro'
      cost = 9 // за секунду
      duration = undefined // будет задана пользователем или по умолчанию
    
    // === WAN МОДЕЛИ ===
    } else if (selectedText.includes('Wan T2V Fast')) {
      selectedModel = 'wan-text-to-video'
      cost = 12 // минимальная цена 480p
    } else if (selectedText.includes('Wan I2V Fast')) {
      selectedModel = 'wan-image-to-video'
      cost = 11 // минимальная цена 480p
    
    // === ДРУГИЕ МОДЕЛИ ===
    } else if (selectedText.includes('Minimax')) {
      selectedModel = 'minimax'
      cost = 47
    } else if (selectedText.includes('Ray v2')) {
      selectedModel = 'ray-v2'
      cost = 17
    } else if (selectedText.includes('Hunyuan Fast')) {
      selectedModel = 'hunyuan-video-fast'
      cost = 19
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

    console.log('🎬 [WIZARD] All params saved:', { selectedModel, cost, aspectRatio, duration })

    // Просим промпт с детальной информацией
    await ctx.reply(
      isRu
        ? `✅ ${selectedText}\n\n💭 Введите описание видео:\n\nПримеры:\n"танцующий шаман у костра"\n"космический корабль летит к звездам"\n"кот играет с мячиком"`
        : `✅ ${selectedText}\n\n💭 Enter video description:\n\nExamples:\n"dancing shaman around fire"\n"spaceship flying to stars"\n"cat playing with ball"`,
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
    delete ctx.session.selectedDuration
  }
})

console.log('🎬 [WIZARD] ULTRA-SIMPLE textToVideoWizard loaded successfully')

export default textToVideoWizard