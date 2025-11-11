import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleImageToVideoDirect } from '../../handlers/handleImageToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { generateModelButton, parseModelButton, generateModelKeyboard } from '@/config/unified-video-models.config'

// ========== СОЗДАНИЕ WIZARD'A ПО АНАЛОГИИ С TEXT TO VIDEO ==========

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,

  // ========== ШАГ 1: ОЖИДАНИЕ ИЗОБРАЖЕНИЯ ==========
  // Начальное сообщение уже отправлено в .enter() handler
  // Этот шаг просто ожидает изображение от пользователя
  async (ctx) => {
    console.log('🎬 [I2V WIZARD] Step 1: Waiting for image, cursor:', ctx.wizard?.cursor ?? 'undefined')

    try {
      const isRu = isRussianFromState(ctx)

      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      // Обработка reply кнопок
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

      console.log('🎬 [I2V WIZARD] Step 1: Image received:', fileLink.href)

      // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ (автоматически берет все активные модели)
      const keyboardRows = generateModelKeyboard('image', isRu)

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

      console.log('🎬 [I2V WIZARD] Step 1: Moving to next step...')
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

  // ========== ШАГ 2: ВЫБОР МОДЕЛИ ==========
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

      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [I2V WIZARD] Step 2: No text message')
        await ctx.reply(
          isRu ? 'Выберите модель из кнопок выше.' : 'Select a model from the buttons above.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [I2V WIZARD] Step 2: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back') || selectedText === (isRu ? 'Отмена' : 'Cancel')) {
        console.log('🎬 [I2V WIZARD] Step 2: Going back to menu')
        await ctx.reply(
          isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }

      // ✅ Парсим выбранную модель через централизованную функцию
      const parsedModel = parseModelButton(selectedText)
      if (parsedModel) {
        console.log('🎬 [I2V WIZARD] Step 2: Model selected:', parsedModel)

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
      console.log('🎬 [I2V WIZARD] Step 2: No model selected, asking to select')
      await ctx.reply(
        isRu ? 'Пожалуйста, выберите модель из кнопок выше.' : 'Please select a model from the buttons above.'
      )

      // ✅ FIX: Остаёмся на текущем шаге, не двигаемся дальше
      return

    } catch (error) {
      console.error('🎬 [I2V WIZARD] 💥 STEP 2 ERROR:', error)
      await ctx.reply('❌ Ошибка при выборе модели')
      return ctx.scene.leave()
    }
  },


  // ========== ШАГ 3: ОБРАБОТКА ПРОМПТА И ГЕНЕРАЦИЯ ==========
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
          isRu ? 'Введите описание видео.' : 'Enter video description.'
        )
        return
      }

      let prompt = message.text.trim()
      console.log('🎬 [I2V WIZARD] Step 3: Received prompt:', prompt)

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [I2V WIZARD] Step 3: Going back to menu')
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
        console.log('🎬 [I2V WIZARD] Step 3: No model selected - returning to step 1')
        await ctx.reply(isRu ? 'Модель не выбрана. Начинаем заново.' : 'No model selected. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      if (!imageUrl) {
        console.log('🎬 [I2V WIZARD] Step 3: No image URL - returning to step 1')
        await ctx.reply(isRu ? 'Изображение не найдено. Начинаем заново.' : 'Image not found. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      console.log('🎬 [I2V WIZARD] Step 3: Starting generation with params:', {
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

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

// Обработчик входа в wizard
imageToVideoWizard.enter(async ctx => {
  try {
    logger.info('[ImageToVideoWizard] Wizard entered successfully', {
      telegramId: ctx.from?.id,
      sceneId: ctx.scene.current?.id,
      timestamp: new Date().toISOString(),
    })

    // ✅ FIX: Вызываем первый шаг вручную, чтобы отправить начальное сообщение
    // После .enter() нужно явно показать сообщение пользователю
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🖼️ Отправьте изображение для создания видео:'
        : '🖼️ Send an image to create video:',
      Markup.keyboard([
        [isRu ? 'Отмена' : 'Cancel'],
        [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
      ]).resize()
    )

    logger.info('[ImageToVideoWizard] Initial message sent to user', {
      telegramId: ctx.from?.id,
    })
  } catch (error) {
    logger.error('[ImageToVideoWizard] Session initialization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработчик выхода из wizard
imageToVideoWizard.leave(async ctx => {
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

export default imageToVideoWizard