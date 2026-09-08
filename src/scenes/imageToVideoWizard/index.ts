import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleImageToVideoDirect } from '../../handlers/handleImageToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleHelpCancel } from '@/navigation'
import {
  generateModelButton,
  parseModelButton,
  generateModelKeyboard,
  getModelPriceStars,
} from '@/config/unified-video-models.config'

// ✅ ЦЕНТРАЛИЗОВАННАЯ СИСТЕМА ОТМЕНЫ
import { createCancelOnlyKeyboard } from '@/utils/cancelKeyboard'
import { reportDeadEnd } from '@/helpers/error/reportDeadEnd'

console.log('🎬 [I2V WIZARD] Loading imageToVideoWizard...')

// ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННЫЕ ФУНКЦИИ из unified-video-models.config.ts:
// - generateModelKeyboard('image', isRu) - создание клавиатуры
// - parseModelButton(buttonText) - парсинг выбора
// ❌ НЕ ДУБЛИРУЕМ ЛОГИКУ - все берем из единого источника правды!

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,

  async ctx => {
    console.log('🔥🔥🔥 [I2V WIZARD] STEP 0 (FIRST STEP) ACTUALLY CALLED!')
    console.log('🔥🔥🔥 [I2V WIZARD] User:', ctx.from?.id)
    console.log(
      '🔥🔥🔥 [I2V WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'undefined'
    )
    console.log('🔥🔥🔥 [I2V WIZARD] Scene ID:', ctx.scene?.current?.id)
    console.log(
      '🔥🔥🔥 [I2V WIZARD] Message type:',
      ctx.message ? Object.keys(ctx.message) : 'no message'
    )

    try {
      const isRu = isRussianFromState(ctx)
      console.log('🎬 [I2V WIZARD] Step 0: Language detected:', isRu)

      // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ (автоматически берет все активные модели)
      const keyboardRows = generateModelKeyboard('image', isRu)

      if (keyboardRows.length === 0) {
        console.error('🎬 [I2V WIZARD] Step 0: NO IMAGE MODELS FOUND!')
        await ctx.reply('❌ Модели не найдены. Попробуйте позже.')
        return ctx.scene.leave()
      }

      // Кнопки назад и отмена
      keyboardRows.push([
        isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
        isRu ? 'Отмена' : 'Cancel',
      ])
      const keyboard = Markup.keyboard(keyboardRows).resize()

      console.log('🎬 [I2V WIZARD] Step 0: About to send reply...')
      await ctx.reply(
        isRu
          ? `🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
        keyboard
      )

      console.log('🎬 [I2V WIZARD] Step 0: ✅ REPLY SENT SUCCESSFULLY!')
      console.log('🎬 [I2V WIZARD] Step 0: Moving to next step...')
      ctx.wizard.next()
      console.log('🎬 [I2V WIZARD] Step 0: ✅ ctx.wizard.next() CALLED')
      return
    } catch (error) {
      console.error('🎬 [I2V WIZARD] 💥 STEP 1 ERROR:', error)
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  async ctx => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 1 STARTED! User:', ctx.from?.id)
    console.log(
      '🎬 [I2V WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'undefined'
    )

    try {
      const isRu = isRussianFromState(ctx)

      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      const message = ctx.message

      if (!message || !('text' in message)) {
        console.log('🎬 [I2V WIZARD] Step 1: No text message')
        await ctx.reply(
          isRu
            ? 'Выберите модель из кнопок выше.'
            : 'Select a model from the buttons above.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [I2V WIZARD] Step 1: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [I2V WIZARD] Step 1: Going back to menu')
        await ctx.reply(
          isRu ? 'Возвращаемся в меню...' : 'Returning to menu...',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      }

      // Отмена
      if (selectedText.includes('Отмена') || selectedText.includes('Cancel')) {
        await ctx.reply(
          isRu
            ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
            : '❌ Process cancelled. Returning to main menu.',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      }

      // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ ПАРСИНГА
      const parsedModel = parseModelButton(selectedText)
      console.log('🎬 [I2V WIZARD] Step 1: Model selected:', parsedModel)

      // Unmatched text is NOT a model. parseModelButton used to fall back to
      // veo3_fast for anything, so typing a description here silently selected
      // (and later billed) a model the user never chose. Re-prompt instead.
      if (!parsedModel) {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, выберите модель из кнопок выше.'
            : '❌ Please select a model from the buttons above.'
        )
        return
      }

      // Сохраняем выбранную модель
      ctx.session.selectedVideoModel = parsedModel.modelId
      ctx.session.selectedAspectRatio = parsedModel.aspectRatio
      ctx.session.selectedVideoCost = parsedModel.cost
      ctx.session.selectedDuration = parsedModel.duration

      await ctx.reply(
        isRu
          ? `✅ Модель выбрана: ${selectedText}\n\n🖼️ Теперь отправьте изображение для создания видео:`
          : `✅ Model selected: ${selectedText}\n\n🖼️ Now send an image to create video:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? 'Отмена' : 'Cancel',
                  callback_data: 'cancel_video_generation',
                },
              ],
            ],
          },
        }
      )

      // Переходим к следующему шагу для ожидания изображения
      ctx.wizard.next()
      return
    } catch (error) {
      console.error('🎬 [I2V WIZARD] Step 1 ERROR:', error)
      await ctx.reply('❌ Ошибка в первом шаге wizard')
      return ctx.scene.leave()
    }
  },

  async ctx => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log(
      '🎬 [I2V WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'undefined'
    )

    try {
      const isRu = isRussianFromState(ctx)

      // Проверяем отмену/справку
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
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

      await ctx.reply(
        isRu
          ? `✅ Изображение получено!\n\n📝 Теперь опишите, что должно происходить в видео:`
          : `✅ Image received!\n\n📝 Now describe what should happen in the video:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? 'Отмена' : 'Cancel',
                  callback_data: 'cancel_video_generation',
                },
              ],
            ],
          },
        }
      )

      console.log(
        '🎬 [I2V WIZARD] Step 2: ✅ REPLY SENT! Moving to next step...'
      )
      ctx.wizard.next()
      return
    } catch (error) {
      console.error('🎬 [I2V WIZARD] 💥 STEP 2 ERROR:', error)
      await ctx.reply('❌ Ошибка при обработке изображения')
      return ctx.scene.leave()
    }
  },

  async ctx => {
    console.log('🎬 [I2V WIZARD] 🔥 STEP 3 STARTED! User:', ctx.from?.id)
    console.log(
      '🎬 [I2V WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'undefined'
    )

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

      const prompt = message.text.trim()
      console.log('🎬 [I2V WIZARD] Step 3: Received prompt:', prompt)

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [I2V WIZARD] Step 3: Going back to menu')
        await ctx.reply(
          isRu ? 'Возвращаемся в меню...' : 'Returning to menu...'
        )
        return ctx.scene.leave()
      }

      if (!prompt || prompt.length < 3) {
        await ctx.reply(
          isRu ? 'Описание слишком короткое.' : 'Description is too short.'
        )
        return
      }

      // Получаем параметры из сессии
      const selectedModel = ctx.session.selectedVideoModel
      const aspectRatio = ctx.session.selectedAspectRatio || '9:16'
      const cost =
        ctx.session.selectedVideoCost || getModelPriceStars(selectedModel) || 25 // ✅ УНИФИКАЦИЯ ЦЕН
      const duration = ctx.session.selectedDuration
      const imageUrl = ctx.session.imageUrl

      if (!selectedModel) {
        console.log(
          '🎬 [I2V WIZARD] Step 3: No model selected - returning to step 0'
        )
        await reportDeadEnd(ctx, 'imageToVideoWizard step 3', [
          'selectedVideoModel',
        ])
        await ctx.reply(
          isRu
            ? 'Модель не выбрана. Начинаем заново.'
            : 'No model selected. Starting over.'
        )
        ctx.wizard.selectStep(0)
        return
      }

      if (!imageUrl) {
        console.log(
          '🎬 [I2V WIZARD] Step 3: No image URL - returning to step 0'
        )
        await reportDeadEnd(ctx, 'imageToVideoWizard step 3', ['imageUrl'])
        await ctx.reply(
          isRu
            ? 'Изображение не найдено. Начинаем заново.'
            : 'Image not found. Starting over.'
        )
        ctx.wizard.selectStep(0)
        return
      }

      console.log('🎬 [I2V WIZARD] Step 3: Starting generation with params:', {
        selectedModel,
        aspectRatio,
        cost,
        duration,
        imageUrl,
      })

      // In-flight guard (mirror textToImageWizard): a second tap at this step
      // re-enters handleImageToVideoDirect (which charges) and generates a second
      // video off one balance. Reject-before-set, set synchronously, release in
      // finally.
      if (ctx.session.imageToVideoInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже генерирую видео, подождите немного...'
            : '⏳ Already generating a video, please wait a moment...'
        )
        return
      }
      ctx.session.imageToVideoInProgress = true
      try {
        // Generate the video -- show the user the full prompt
        await ctx.reply(
          isRu
            ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
            : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
        )

        const videoModelId = selectedModel as VideoModelId
        await handleImageToVideoDirect(
          ctx,
          imageUrl,
          prompt,
          videoModelId,
          duration,
          aspectRatio
        )
        console.log('🎬 [I2V WIZARD] Video generation success!')

        // Save the last scene for the "Repeat generation" button
        ctx.session.lastCompletedVideoScene = ModeEnum.ImageToVideo as any

        return ctx.scene.leave()
      } finally {
        ctx.session.imageToVideoInProgress = false
      }
    } catch (error) {
      console.error('🎬 [I2V WIZARD] Step 3 ERROR:', error)
      await ctx.reply('❌ Ошибка в третьем шаге wizard')
      return ctx.scene.leave()
    }
  }
)

console.log('🔥 [DEBUG] imageToVideoWizard CREATED! ID:', imageToVideoWizard.id)
console.log(
  '🔥 [DEBUG] imageToVideoWizard steps count:',
  (imageToVideoWizard as any).steps?.length,
  '(Step 0: Models, Step 1: Model selection, Step 2: Image, Step 3: Prompt+Generation)'
)

// Обработчик входа в wizard - НЕ ИСПОЛЬЗУЕТСЯ! Telegraf автоматически вызовет первый шаг
// Оставляем пустым, чтобы не было двойного вызова

// ✅ Обработчик кнопки отмены
imageToVideoWizard.action('cancel_video_generation', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)

  console.log('🎬 [I2V WIZARD] ❌ CANCEL button pressed! User:', ctx.from?.id)

  // Удаляем inline кнопку
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] })
  } catch {
    // Игнорируем ошибку если сообщение уже изменено
  }

  await ctx.reply(
    isRu ? '❌ Генерация видео отменена' : '❌ Video generation cancelled',
    Markup.removeKeyboard()
  )

  return ctx.scene.leave()
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
