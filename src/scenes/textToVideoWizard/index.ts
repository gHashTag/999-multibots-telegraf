import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { VideoModelId } from '@/services/generateTextToVideo'
import { generateModelButton, parseModelButton, generateModelKeyboard } from '@/config/unified-video-models.config'
import {
  TEXT_TO_VIDEO_CONSTANTS,
} from '@/interfaces/zod/textToVideo.zod'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

// ========== INLINE WIZARD ФУНКЦИИ (КАК В РАБОЧИХ WIZARDS) ==========

// ========== СОЗДАНИЕ WIZARD'A С INLINE ФУНКЦИЯМИ (КАК В textToImageWizard) ==========

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',

  // ========== ШАГ 1: ВЫБОР МОДЕЛИ ==========
  async (ctx) => {
    try {
      const isRu = isRussianFromState(ctx)

      // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ ФУНКЦИЮ (автоматически берет все активные модели)
      const keyboardRows = generateModelKeyboard('text', isRu)

      if (keyboardRows.length === 0) {
        console.error('🎬 [WIZARD] Step 1: NO TEXT MODELS FOUND!')
        await ctx.reply('❌ Модели не найдены. Попробуйте позже.')
        return ctx.scene.leave()
      }

      // Кнопки назад и отмена
      keyboardRows.push([
        isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu',
        isRu ? '❌ Отмена' : '❌ Cancel'
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

  // ========== ШАГ 2: ВЫБОР МОДЕЛИ + ПРОМПТ + ГЕНЕРАЦИЯ (ОБЪЕДИНЕННЫЙ ШАГ) ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] 🔥 STEP 2 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'not initialized yet')
    
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
          isRu ? 'Выберите модель из кнопок выше или введите описание видео.' : 'Select a model from the buttons above or enter video description.'
        )
        return
      }

      const selectedText = message.text
      console.log('🎬 [WIZARD] Step 2: Received text:', selectedText)

      // Назад в меню
      if (selectedText.includes('Назад') || selectedText.includes('Back')) {
        console.log('🎬 [WIZARD] Step 2: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      // Отмена
      if (selectedText.includes('Отмена') || selectedText.includes('Cancel')) {
        console.log('🎬 [WIZARD] Step 2: Cancelled')
        await ctx.reply(
          isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }

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
          Markup.removeKeyboard()
        )

        // Переходим к следующему шагу для ожидания промпта
        ctx.wizard.next()
        return
      }


      // ЛОГИКА 3: Если модель не выбрана - просим выбрать
      console.log('🎬 [WIZARD] Step 2: No model selected, asking to select')
      await ctx.reply(
        isRu ? 'Пожалуйста, выберите модель из кнопок выше.' : 'Please select a model from the buttons above.'
      )

      // ✅ FIX: Остаёмся на текущем шаге, не двигаемся дальше
      return

    } catch (error) {
      console.error('🎬 [WIZARD] Step 2 ERROR:', error)
      await ctx.reply('❌ Ошибка во втором шаге wizard')
      return ctx.scene.leave()
    }
  },

  // ========== ШАГ 3: ОБРАБОТКА ПРОМПТА И ГЕНЕРАЦИЯ ==========
  async (ctx) => {
    console.log('🎬 [WIZARD] 🔥 STEP 3 STARTED! User:', ctx.from?.id)
    console.log('🎬 [WIZARD] Current cursor:', ctx.wizard?.cursor ?? 'not initialized yet')
    
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

      let prompt = message.text.trim()
      console.log('🎬 [WIZARD] Step 3: Received prompt:', prompt)
      // ОТПРАВЛЯЕМ КАК ЕСТЬ - модель Veo поддерживает JSON формат!

      // Назад в меню
      if (prompt.includes('Назад') || prompt.includes('Back')) {
        console.log('🎬 [WIZARD] Step 3: Going back to menu')
        await ctx.reply(isRu ? 'Возвращаемся в меню...' : 'Returning to menu...')
        return ctx.scene.leave()
      }

      if (!prompt || prompt.length < TEXT_TO_VIDEO_CONSTANTS.MIN_PROMPT_LENGTH) {
        await ctx.reply(isRu ? 'Описание слишком короткое.' : 'Description is too short.')
        return
      }

      // Убрано ограничение на длину промпта - отправляем полностью в Kie.ai
      // if (prompt.length > TEXT_TO_VIDEO_CONSTANTS.MAX_PROMPT_LENGTH) {
      //   await ctx.reply(isRu ? 'Описание слишком длинное.' : 'Description is too long.')
      //   return
      // }

      // Получаем параметры из сессии
      const selectedModel = ctx.session.selectedVideoModel
      const aspectRatio = ctx.session.selectedAspectRatio || TEXT_TO_VIDEO_CONSTANTS.DEFAULT_ASPECT_RATIO
      const cost = ctx.session.selectedVideoCost || 40
      const duration = ctx.session.selectedDuration

      if (!selectedModel) {
        console.log('🎬 [WIZARD] Step 3: No model selected - returning to step 1')
        await ctx.reply(isRu ? 'Модель не выбрана. Начинаем заново.' : 'No model selected. Starting over.')
        if (ctx.wizard && ctx.wizard.selectStep) {
          ctx.wizard.selectStep(0)
        }
        return
      }

      console.log('🎬 [WIZARD] Step 3: Starting generation with params:', {
        selectedModel, aspectRatio, cost, duration
      })

      // Генерируем видео - показываем ПОЛНЫЙ промпт пользователю
      await ctx.reply(
        isRu
          ? `🎬 Генерируем видео...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
          : `🎬 Generating video...\n📋 ${selectedModel} | ${aspectRatio} | ${cost}⭐\n💭 ${prompt}`
      )

      const videoModelId = selectedModel as VideoModelId
      await handleTextToVideoDirect(ctx, prompt, videoModelId, duration, aspectRatio)
      console.log('🎬 [WIZARD] Video generation success!')

      return ctx.scene.leave()
      
    } catch (error) {
      console.error('🎬 [WIZARD] Step 3 ERROR:', error)

      // ✅ FIX: Специальная обработка ошибок для Wan 2.2 модели
      const selectedModel = ctx.session.selectedVideoModel
      const isRu = isRussianFromState(ctx) // Определяем isRu в области видимости блока catch
      if (selectedModel === 'wan-2.2-t2v-fast') {
        logger.error('[WIZARD] Wan 2.2 error detected:', {
          modelId: selectedModel,
          error: error instanceof Error ? error.message : 'Unknown error'
        })

        // Определяем тип ошибки
        let errorMessage = '❌ Ошибка генерации видео'
        if (error instanceof Error) {
          const msg = error.message.toLowerCase()
          if (msg.includes('403') || msg.includes('authorization') || msg.includes('forbidden')) {
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
            isRu ? '🔄 Попробовать снова (другая модель)' : '🔄 Try Again (different model)',
          ],
          [
            isRu ? '🎬 WAN 2.2 T2V Fast (480p)' : '🎬 WAN 2.2 T2V Fast (480p)',
            isRu ? '🎬 WAN 2.2 T2V Fast (720p)' : '🎬 WAN 2.2 T2V Fast (720p)',
          ],
          [
            isRu ? '🎬 Veo 3 Fast' : '🎬 Veo 3 Fast',
            isRu ? '🎬 Sora 2' : '🎬 Sora 2',
          ],
          [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
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

// ========== ОБРАБОТЧИКИ WIZARD'A ==========

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