import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleImageToVideoDirect } from '../../handlers/handleImageToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

console.log('🎬 [I2V WIZARD] Loading imageToVideoWizard...')

// Функция создания кнопки для Image to Video
function createImageToVideoButton(
  modelId: string,
  aspectRatio: string,
  isRu: boolean
): string {
  const aspectIcon = aspectRatio === '9:16' ? '📱' : '🖥️'

  // Договоренные цены для Image to Video
  let stars: number
  let durationText = ''
  
  switch (modelId) {
    case 'veo3_fast':
      stars = 40
      durationText = ' | 8s'
      break
    case 'veo3':
      stars = 120 // ✅ ИСПРАВЛЕНО: $1.92 / $0.016 = 120⭐ (было 80)
      durationText = ' | 8s'
      break
    case 'kling-v1.6-pro':
      stars = 60
      durationText = ' | 6s'
      break
    case 'minimax':
      stars = 50
      durationText = ' | 6s'
      break
    case 'seedance-1-pro':
      stars = aspectRatio === '9:16' ? 23 : 117 // 480p : 1080p
      durationText = ' | 4s'
      break
    case 'wan-2.2-i2v-fast':
      stars = 70
      durationText = ' | 4s'
      break
    case 'sora-2-i2v':
      stars = 9 // ✅ ДОБАВЛЕНО: $0.15 за 10 сек / $0.016 = 9⭐ БЕЗ наценки
      durationText = ' | 10s'
      break
    case 'sora-2-pro-i2v':
      stars = 28 // ✅ ДОБАВЛЕНО: $0.45 за 10 сек / $0.016 = 28⭐ БЕЗ наценки
      durationText = ' | 10s'
      break
    default:
      stars = 40
      durationText = ' | 8s'
      break
  }

  const modelNames: Record<string, string> = {
    'veo3_fast': 'Veo 3 Fast',
    'veo3': 'Veo 3',
    'kling-v1.6-pro': 'Kling v1.6 Pro',
    'minimax': 'Minimax',
    'seedance-1-pro': aspectRatio === '9:16' ? 'Seedance Pro 480p' : 'Seedance Pro 1080p',
    'wan-2.2-i2v-fast': 'WAN 2.2 I2V Fast',
    'sora-2-i2v': 'Sora 2 I2V', // ✅ ДОБАВЛЕНО
    'sora-2-pro-i2v': 'Sora 2 Pro I2V' // ✅ ДОБАВЛЕНО
  }

  const modelName = modelNames[modelId] || modelId
  return `${modelName}${durationText} | ${aspectIcon} (${stars}⭐)`
}

// Функция парсинга выбранной модели из кнопки
function parseImageToVideoSelection(buttonText: string): {
  modelId: string
  aspectRatio: string
  duration?: number
  cost: number
} | null {
  try {
    console.log('🎬 [I2V PARSE] Parsing button text:', buttonText)

    // Определяем соотношение сторон по иконке
    const aspectRatio = buttonText.includes('📱') ? '9:16' : '16:9'

    // Парсим по названию модели
    let modelId = 'veo3_fast' // default
    let cost = 40
    let duration = 8

    if (buttonText.includes('Veo 3 Fast')) {
      modelId = 'veo3_fast'
      cost = 40
      duration = 8
    } else if (buttonText.includes('Veo 3') && !buttonText.includes('Fast')) {
      modelId = 'veo3'
      cost = 120 // ✅ ИСПРАВЛЕНО: $1.92 / $0.016 = 120⭐ (было 80)
      duration = 8
    } else if (buttonText.includes('Kling')) {
      modelId = 'kling-v1.6-pro'
      cost = 60
      duration = 6
    } else if (buttonText.includes('Minimax')) {
      modelId = 'minimax'
      cost = 50
      duration = 6
    } else if (buttonText.includes('Seedance')) {
      modelId = 'seedance-1-pro'
      cost = aspectRatio === '9:16' ? 23 : 117
      duration = 4
    } else if (buttonText.includes('WAN')) {
      modelId = 'wan-2.2-i2v-fast'
      cost = 70
      duration = 4
    } else if (buttonText.includes('Sora 2 Pro I2V')) {
      modelId = 'sora-2-pro-i2v'
      cost = 28 // ✅ ДОБАВЛЕНО
      duration = 10
    } else if (buttonText.includes('Sora 2 I2V')) {
      modelId = 'sora-2-i2v'
      cost = 9 // ✅ ДОБАВЛЕНО
      duration = 10
    }

    return { modelId, aspectRatio, duration, cost }
  } catch (error) {
    console.error('🎬 [I2V PARSE] Error parsing button text:', buttonText, error)
    return {
      modelId: 'veo3_fast',
      aspectRatio: '9:16',
      duration: 8,
      cost: 40,
    } // safe fallback
  }
}

// ========== СОЗДАНИЕ WIZARD'A ПО АНАЛОГИИ С TEXT TO VIDEO ==========

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,
  
  // ========== ШАГ 1: ЗАГРУЗКА ИЗОБРАЖЕНИЯ ==========
  async (ctx) => {
    console.log('🎬 [I2V WIZARD] 🚀 STEP 1 STARTED! User:', ctx.from?.id)
    console.log('🎬 [I2V WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'undefined')
    
    try {
      const isRu = isRussianFromState(ctx)
      console.log('🎬 [I2V WIZARD] Step 1: Language detected:', isRu)

      await ctx.reply(
        isRu
          ? '🖼️ Отправьте изображение для создания видео:'
          : '🖼️ Send an image to create video:',
        Markup.keyboard([
          [isRu ? 'Отмена' : 'Cancel'],
          [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
        ]).resize()
      )

      console.log('🎬 [I2V WIZARD] Step 1: ✅ REPLY SENT! Moving to next step...')
      if (ctx.wizard && ctx.wizard.next) {
        ctx.wizard.next()
      }
      return
      
    } catch (error) {
      console.error('🎬 [I2V WIZARD] 💥 STEP 1 ERROR:', error)
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 2: ОБРАБОТКА ИЗОБРАЖЕНИЯ И ВЫБОР МОДЕЛИ ==========
  async (ctx) => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log('🎬 [I2V WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'undefined')
    
    try {
      const isRu = isRussianFromState(ctx)

      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      // Обработка reply кнопок из шага 1
      if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text

        // Отмена
        if (text === (isRu ? 'Отмена' : 'Cancel')) {
          await ctx.reply(
            isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
            { reply_markup: { remove_keyboard: true } }
          )
          return ctx.scene.leave()
        }

        // Главное меню
        if (text === (isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
          await ctx.reply(
            isRu ? '👋 Возвращаемся в главное меню' : '👋 Returning to main menu',
            { reply_markup: { remove_keyboard: true } }
          )
          return ctx.scene.leave()
        }
      }

      // Проверяем, что это фото
      if (!ctx.message || !('photo' in ctx.message)) {
        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте изображение (фото).'
            : 'Please send an image (photo).'
        )
        return
      }

      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      if (!photo) {
        await ctx.reply(
          isRu
            ? 'Не удалось получить изображение. Попробуйте еще раз.'
            : 'Failed to get the image. Please try again.'
        )
        return
      }

      // Получаем ссылку на файл
      const fileLink = await ctx.telegram.getFileLink(photo.file_id)
      ctx.session.imageUrl = fileLink.href

      console.log('🎬 [I2V WIZARD] Step 2: Image received:', fileLink.href)

      // Создаем кнопки выбора модели (аналогично Text to Video)
      const supportedModels = [
        'veo3_fast',
        'veo3',
        'kling-v1.6-pro',
        'minimax',
        'seedance-1-pro',
        'wan-2.2-i2v-fast',
        'sora-2-i2v', // ✅ ДОБАВЛЕНО
        'sora-2-pro-i2v' // ✅ ДОБАВЛЕНО
      ]

      const keyboardRows: string[][] = []
      
      // Собираем все кнопки по типам
      const horizontalButtons: string[] = [] // 16:9 кнопки (слева)
      const verticalButtons: string[] = []   // 9:16 кнопки (справа)
      
      supportedModels.forEach((modelId) => {
        horizontalButtons.push(createImageToVideoButton(modelId, '16:9', isRu))
        verticalButtons.push(createImageToVideoButton(modelId, '9:16', isRu))
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
        isRu ? 'Отмена' : 'Cancel'
      ])
      const keyboard = Markup.keyboard(keyboardRows).resize()

      await ctx.reply(
        isRu
          ? `✅ Изображение получено!\n\n🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
          : `✅ Image received!\n\n🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
        keyboard
      )

      console.log('🎬 [I2V WIZARD] Step 2: ✅ REPLY SENT! Moving to next step...')
      if (ctx.wizard && ctx.wizard.next) {
        ctx.wizard.next()
      }
      return
      
    } catch (error) {
      console.error('🎬 [I2V WIZARD] 💥 STEP 2 ERROR:', error)
      await ctx.reply('❌ Ошибка при обработке изображения')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 3: ВЫБОР МОДЕЛИ И ЗАПРОС ПРОМПТА ==========
  async (ctx) => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 3 STARTED! User:', ctx.from?.id)
    console.log('🎬 [I2V WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'undefined')
    
    try {
      const isRu = isRussianFromState(ctx)
      
      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      
      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [I2V WIZARD] Step 3: No text message')
        await ctx.reply(
          isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [I2V WIZARD] Step 3: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [I2V WIZARD] Step 3: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      // Парсим выбранную модель
      const parsedModel = parseImageToVideoSelection(selectedText)
      if (parsedModel) {
        console.log('🎬 [I2V WIZARD] Step 3: Model selected:', parsedModel)
        
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
        if (ctx.wizard && ctx.wizard.next) {
          ctx.wizard.next()
        }
        return
      }

      // Если модель не выбрана - просим выбрать
      console.log('🎬 [I2V WIZARD] Step 3: No model selected, asking to select')
      await ctx.reply(
        isRu ? 'Пожалуйста, выберите модель из кнопок выше.' : 'Please select a model from the buttons above.'
      )
      
    } catch (error) {
      console.error('🎬 [I2V WIZARD] Step 3 ERROR:', error)
      await ctx.reply('❌ Ошибка в третьем шаге wizard')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 4: ОБРАБОТКА ПРОМПТА И ГЕНЕРАЦИЯ ==========
  async (ctx) => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 4 STARTED! User:', ctx.from?.id)
    console.log('🎬 [I2V WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'undefined')
    
    try {
      const isRu = isRussianFromState(ctx)
      
      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      
      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [I2V WIZARD] Step 4: No text message')
        await ctx.reply(
          isRu ? 'Введите описание видео.' : 'Enter video description.'
        )
        return
      }

      let prompt = message.text.trim()
      console.log('🎬 [I2V WIZARD] Step 4: Received prompt:', prompt)

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [I2V WIZARD] Step 4: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      if (!prompt || prompt.length < 3) {
        await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
        return
      }

      // Получаем параметры из сессии
      const selectedModel = ctx.session.selectedVideoModel
      const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
      const cost = ctx.session.selectedVideoCost || 40
      const duration = ctx.session.selectedDuration
      const imageUrl = ctx.session.imageUrl

      if (!selectedModel) {
        console.log('🎬 [I2V WIZARD] Step 4: No model selected - returning to step 1')
        await ctx.reply(isRu ? 'Модель не выбрана. Начинаем заново.' : 'No model selected. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      if (!imageUrl) {
        console.log('🎬 [I2V WIZARD] Step 4: No image URL - returning to step 1')
        await ctx.reply(isRu ? 'Изображение не найдено. Начинаем заново.' : 'Image not found. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      console.log('🎬 [I2V WIZARD] Step 4: Starting generation with params:', {
        selectedModel, aspectRatio, cost, duration, imageUrl
      })

      // Генерируем видео - показываем ПОЛНЫЙ промпт пользователю
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
      )

      const videoModelId = selectedModel as VideoModelId
      await handleImageToVideoDirect(ctx, imageUrl, prompt, videoModelId, duration, aspectRatio)
      console.log('🎬 [I2V WIZARD] Video generation success!')

      return ctx.scene.leave()
      
    } catch (error) {
      console.error('🎬 [I2V WIZARD] Step 4 ERROR:', error)
      await ctx.reply('❌ Ошибка в четвертом шаге wizard')
      return ctx.scene.leave()
    }
  }
)

console.log('🔥 [DEBUG] imageToVideoWizard CREATED! ID:', imageToVideoWizard.id)
console.log('🔥 [DEBUG] imageToVideoWizard steps count:', (imageToVideoWizard as any).steps?.length)

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// Обработчик входа в wizard
imageToVideoWizard.enter(async ctx => {
  console.log('🎬 [I2V WIZARD] ✅ WIZARD ENTERED! User:', ctx.from?.id)
  console.log('🎬 [I2V WIZARD] Scene ID:', ctx.scene.current?.id)
  console.log('🎬 [I2V WIZARD] Current step:', ctx.wizard?.cursor)

  try {
    console.log('🎬 [I2V WIZARD] Initial session initialized for imageToVideoWizard')
    
    logger.info('[ImageToVideoWizard] Wizard entered successfully', {
      telegramId: ctx.from?.id,
      sceneId: ctx.scene.current?.id,
      currentStep: ctx.wizard?.cursor,
      timestamp: new Date().toISOString(),
    })

    // Initialize cursor to step 0 (with safety check)
    console.log('🎬 [I2V WIZARD] Setting wizard cursor to step 0')
    if (ctx.wizard && ctx.wizard.selectStep) {
      ctx.wizard.selectStep(0)
      
      // КРИТИЧЕСКИ ВАЖНО: Вызываем первый шаг вручную!
      console.log('🎬 [I2V WIZARD] Manually calling first step...')
      const firstStep = imageToVideoWizard.steps[0]
      if (typeof firstStep === 'function') {
        await firstStep(ctx, () => Promise.resolve())
      } else {
        console.error('🎬 [I2V WIZARD] First step is not a function!')
      }
    } else {
      console.error('🎬 [I2V WIZARD] ctx.wizard or selectStep is undefined! Attempting manual step call...')
      // Try to call the first step directly even without wizard context
      const firstStep = imageToVideoWizard.steps[0]
      if (typeof firstStep === 'function') {
        await firstStep(ctx, () => Promise.resolve())
      }
    }
  } catch (error) {
    console.error('🎬 [I2V WIZARD] Error initializing wizard session:', error)
    logger.error('[ImageToVideoWizard] Session initialization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработчик выхода из wizard
imageToVideoWizard.leave(async ctx => {
  console.log('🎬 [I2V WIZARD] 👋 WIZARD LEFT! User:', ctx.from?.id)

  logger.info('[ImageToVideoWizard] Wizard left', {
    telegramId: ctx.from?.id,
    timestamp: new Date().toISOString(),
  })

  // Очищаем данные сессии
  if (ctx.session) {
    delete ctx.session.selectedVideoModel
    delete ctx.session.selectedVideoCost
    delete ctx.session.selectedAspectRatio
    delete ctx.session.selectedDuration
    delete ctx.session.imageUrl
  }
})

console.log('🎬 [I2V WIZARD] imageToVideoWizard loaded successfully')

export default imageToVideoWizard