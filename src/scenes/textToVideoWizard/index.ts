import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import {
  generateModelButton,
  parseModelButton,
  generateModelKeyboard,
  getModelPriceStars,
} from '@/config/unified-video-models.config'
import { TEXT_TO_VIDEO_CONSTANTS } from '@/interfaces/zod/textToVideo.zod'
import { handleHelpCancel, getMainMenuText } from '@/navigation'

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  async ctx => {
    try {
      const isRu = isRussianFromState(ctx)

      // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ (автоматически берет все активные модели)
      const keyboardRows = generateModelKeyboard('text', isRu)

      if (keyboardRows.length === 0) {
        // Same outage on the text side, and it was equally invisible: see the
        // comment in imageToVideoWizard.
        logger.error(
          '[T2V] model catalog is EMPTY — text-to-video is down for every user',
          { scene: 'textToVideoWizard', step: 0 }
        )
        await ctx.reply('❌ Модели не найдены. Попробуйте позже.')
        return ctx.scene.leave()
      }

      // Кнопки назад и отмена
      keyboardRows.push([
        isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
        isRu ? 'Отмена' : 'Cancel',
      ])
      const keyboard = Markup.keyboard(keyboardRows).resize()

      await ctx.reply(
        isRu
          ? `🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars`
          : `🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars`,
        keyboard
      )

      console.log('🎬 [WIZARD] Step 1: ✅ REPLY SENT! Moving to next step...')
      ctx.wizard.next()
      return
    } catch (error) {
      console.error('🎬 [WIZARD] 💥 STEP 1 ERROR:', error)
      await ctx.reply('❌ Ошибка в мастере генерации видео')
      return ctx.scene.leave()
    }
  },

  async ctx => {
    console.log('🎬 [WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log(
      '🎬 [WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'not initialized yet'
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
        console.log('🎬 [WIZARD] Step 2: No text message')
        await ctx.reply(
          isRu
            ? 'Выберите модель из кнопок выше или введите описание видео.'
            : 'Select a model from the buttons above or enter video description.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [WIZARD] Step 2: Going back to menu')
        await ctx.reply(
          isRu ? 'Возвращаемся в меню...' : 'Returning to menu...'
        )
        return ctx.scene.leave()
      }

      // Отмена - НЕ отправляем сообщение, handleHelpCancel уже обработал
      // if (selectedText.includes('Отмена') || selectedText.includes('Cancel')) {
      //   console.log('🎬 [WIZARD] Step 2: Cancelled')
      //   await ctx.reply(
      //     isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
      //     { reply_markup: { remove_keyboard: true } }
      //   )
      //   return ctx.scene.leave()
      // }

      // ЛОГИКА 1: Если это выбор модели
      const parsedModel = parseModelButton(selectedText)
      if (parsedModel) {
        console.log('🎬 [WIZARD] Step 2: Model selected:', parsedModel)

        // Сохраняем выбранную модель
        ctx.session.selectedVideoModel = parsedModel.modelId
        ctx.session.selectedAspectRatio = parsedModel.aspectRatio
        ctx.session.selectedVideoCost = parsedModel.cost
        ctx.session.selectedDuration = parsedModel.duration

        await ctx.reply(
          isRu
            ? `✅ Модель выбрана: ${selectedText}\n\n📝 Теперь опишите, что должно происходить в видео:`
            : `✅ Model selected: ${selectedText}\n\n📝 Now describe what should happen in the video:`,
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

        // Переходим к следующему шагу для ожидания промпта
        ctx.wizard.next()
        return
      }

      // ЛОГИКА 3: Если модель не выбрана - просим выбрать
      console.log('🎬 [WIZARD] Step 2: No model selected, asking to select')
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из кнопок выше.'
          : 'Please select a model from the buttons above.'
      )

      // ✅ FIX: Остаёмся на текущем шаге, не двигаемся дальше
      return
    } catch (error) {
      console.error('🎬 [WIZARD] Step 2 ERROR:', error)
      await ctx.reply('❌ Ошибка во втором шаге wizard')
      return ctx.scene.leave()
    }
  },

  async ctx => {
    console.log('🎬 [WIZARD] 🔥 STEP 3 STARTED! User:', ctx.from?.id)
    console.log(
      '🎬 [WIZARD] Current cursor:',
      ctx.wizard?.cursor ?? 'not initialized yet'
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
        console.log('🎬 [WIZARD] Step 3: No text message')
        await ctx.reply(
          isRu ? 'Введите описание видео.' : 'Enter video description.'
        )
        return
      }

      const prompt = message.text.trim()
      console.log('🎬 [WIZARD] Step 3: Received prompt:', prompt)
      // ОТПРАВЛЯЕМ КАК ЕСТЬ - модель Veo поддерживает JSON формат!

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [WIZARD] Step 3: Going back to menu')
        await ctx.reply(
          isRu ? 'Возвращаемся в меню...' : 'Returning to menu...'
        )
        return ctx.scene.leave()
      }

      if (
        !prompt ||
        prompt.length < TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH
      ) {
        await ctx.reply(
          isRu ? 'Описание слишком короткое.' : 'Description is too short.'
        )
        return
      }

      // Убрано ограничение на длину промпта - отправляем полностью в Kie.ai
      // if (prompt.length > TEXT_TO_VIDEO_CONSTANTS.MAX_PROMPT_LENGTH) {
      //   await ctx.reply(isRu ? 'Описание слишком длинное.' : 'Description is too long.')
      //   return
      // }

      // Получаем параметры из сессии
      const selectedModel = ctx.session.selectedVideoModel
      const aspectRatio =
        ctx.session.selectedAspectRatio ||
        TEXT_TO_VIDEO_CONSTANTS.DEFAULT_ASPECT_RATIO
      const cost =
        ctx.session.selectedVideoCost || getModelPriceStars(selectedModel) || 25 // ✅ УНИФИКАЦИЯ ЦЕН
      const duration = ctx.session.selectedDuration

      if (!selectedModel) {
        console.log(
          '🎬 [WIZARD] Step 3: No model selected - returning to step 1'
        )
        await ctx.reply(
          isRu
            ? 'Модель не выбрана. Начинаем заново.'
            : 'No model selected. Starting over.'
        )
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      console.log('🎬 [WIZARD] Step 3: Starting generation with params:', {
        selectedModel,
        aspectRatio,
        cost,
        duration,
      })

      // In-flight guard (mirror textToImageWizard): a second tap at this step
      // re-enters handleTextToVideoDirect (which charges) and generates a second
      // video off one balance. Reject-before-set, set synchronously, release in
      // finally.
      if (ctx.session.textToVideoInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже генерирую видео, подождите немного...'
            : '⏳ Already generating a video, please wait a moment...'
        )
        return
      }
      ctx.session.textToVideoInProgress = true
      try {
        // Generate the video -- show the user the full prompt
        await ctx.reply(
          isRu
            ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
            : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
        )

        const videoModelId = selectedModel as VideoModelId
        await handleTextToVideoDirect(
          ctx,
          prompt,
          videoModelId,
          duration,
          aspectRatio
        )
        console.log('🎬 [WIZARD] Video generation success!')

        // Save the last scene for the "Repeat generation" button
        ctx.session.lastCompletedVideoScene = 'text_to_video' as any

        return ctx.scene.leave()
      } finally {
        ctx.session.textToVideoInProgress = false
      }
    } catch (error) {
      console.error('🎬 [WIZARD] Step 3 ERROR:', error)

      // ✅ FIX: Специальная обработка ошибок для Wan 2.2 модели
      const selectedModel = ctx.session.selectedVideoModel
      const isRu = isRussianFromState(ctx) // Определяем isRu в области видимости блока catch
      if (selectedModel === 'wan-2.2-t2v-fast') {
        logger.error('[WIZARD] Wan 2.2 error detected:', {
          modelId: selectedModel,
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        // Определяем тип ошибки
        let errorMessage = '❌ Ошибка генерации видео'
        if (error instanceof Error) {
          const msg = error.message.toLowerCase()
          if (
            msg.includes('403') ||
            msg.includes('authorization') ||
            msg.includes('forbidden')
          ) {
            errorMessage = isRu
              ? '🚫 Ошибка авторизации API для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.'
              : '🚫 API authorization error for WAN 2.2 model.\n\nTry later or choose another model.'
          } else if (msg.includes('timeout')) {
            errorMessage = isRu
              ? '⏱️ Превышено время ожидания для модели WAN 2.2.\n\nПопробуйте позже.'
              : '⏱️ Timeout exceeded for WAN 2.2 model.\n\nTry again later.'
          } else if (msg.includes('quota') || msg.includes('limit')) {
            errorMessage = isRu
              ? '📊 Превышена квота для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.'
              : '📊 Quota exceeded for WAN 2.2 model.\n\nTry later or choose another model.'
          }
        }

        await ctx.reply(errorMessage)

        // Предлагаем альтернативы
        const keyboard = Markup.keyboard([
          [
            isRu
              ? '🔄 Попробовать снова (другая модель)'
              : '🔄 Try Again (different model)',
          ],
          [
            isRu ? '🎬 WAN 2.2 T2V Fast (480p)' : '🎬 WAN 2.2 T2V Fast (480p)',
            isRu ? '🎬 WAN 2.2 T2V Fast (720p)' : '🎬 WAN 2.2 T2V Fast (720p)',
          ],
          [
            isRu ? '🎬 Veo 3 Fast' : '🎬 Veo 3 Fast',
            isRu ? '🎬 Sora 2' : '🎬 Sora 2',
          ],
          [getMainMenuText(isRu)],
        ]).resize()

        await ctx.reply(
          isRu
            ? '💡 Рекомендуем попробовать другие модели:\n• WAN 2.2 (другие разрешения)\n• Veo 3 Fast\n• Sora 2'
            : '💡 Try other models:\n• WAN 2.2 (different resolutions)\n• Veo 3 Fast\n• Sora 2',
          keyboard
        )

        return ctx.scene.leave()
      }

      await ctx.reply(
        isRu
          ? '❌ Ошибка генерации видео. Попробуйте позже.'
          : '❌ Video generation error. Try again later.'
      )
      return ctx.scene.leave()
    }
  }
)

// ✅ Обработчик кнопки отмены
textToVideoWizard.action('cancel_video_generation', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)

  console.log('🎬 [T2V WIZARD] ❌ CANCEL button pressed! User:', ctx.from?.id)

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
textToVideoWizard.leave(async ctx => {
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
