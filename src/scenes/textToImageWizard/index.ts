import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'
import { logger } from '@/utils/logger'

import { createHelpCancelKeyboard } from '@/menu'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { handleMenu } from '@/handlers/handleMenu'
import { improvePromptWizard } from '../improvePromptWizard'
import { sizeWizard } from '../sizeWizard'

// ✅ НОВЫЙ ИМПОРТ - Inngest!
import { sendInngestEvent, INNGEST_EVENTS } from '@/inngest_app/inngestClient'

export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'text_to_image',

  // ШАГ 1: Выбор модели
  async ctx => {
    const isRu = isRussianFromState(ctx)
    logger.info('🎨 [TEXT-TO-IMAGE] Step 1: Model selection', {
      userId: ctx.from?.id,
    })

    if (!ctx.from?.id) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Фильтруем модели и создаем кнопки
    const filteredModels = Object.values(imageModelPrices).filter(
      model =>
        !model.inputType.includes('dev') &&
        (model.inputType.includes('text') ||
          (model.inputType.includes('text') &&
            model.inputType.includes('image')))
    )

    const modelButtons = filteredModels.map(model =>
      Markup.button.text(model.shortName)
    )

    const keyboardButtons = []
    for (let i = 0; i < modelButtons.length; i += 2) {
      keyboardButtons.push(modelButtons.slice(i, i + 2))
    }

    keyboardButtons.push(
      [
        Markup.button.text(
          isRu ? 'Справка по команде' : 'Help for the command'
        ),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ],
      [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')]
    )

    const keyboard = Markup.keyboard(keyboardButtons).resize().oneTime()

    await ctx.reply(
      isRu
        ? '🎨 Выберите модель для генерации:'
        : '🎨 Choose a model for generation:',
      {
        reply_markup: keyboard.reply_markup,
      }
    )

    ctx.wizard.next()
    return
  },

  // ШАГ 2: Подтверждение модели и показ промпта
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    logger.info('🎨 [TEXT-TO-IMAGE] Step 2: Model confirmation', {
      userId: ctx.from?.id,
      hasMessage: !!message,
    })

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.from?.id) {
      logger.error('❌ [TEXT-TO-IMAGE] Telegram ID not found')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const modelShortName = message.text
    const selectedModelEntry = Object.entries(imageModelPrices).find(
      ([, modelInfo]) => modelInfo.shortName === modelShortName
    )

    if (!selectedModelEntry) {
      logger.error('❌ [TEXT-TO-IMAGE] Model not found:', modelShortName)
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const [fullModelId, selectedModelInfo] = selectedModelEntry
    ctx.session.selectedImageModel = fullModelId

    if (!selectedModelInfo) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const availableModels = Object.keys(imageModelPrices)
    const userBalance = await getUserBalance(ctx.from.id.toString())
    const price = await validateAndCalculateImageModelPrice(
      fullModelId,
      availableModels,
      userBalance,
      isRu,
      ctx
    )

    if (price === null) {
      return ctx.scene.leave()
    }

    try {
      // ✅ БЫСТРЫЙ ОТВЕТ - модель выбрана
      await ctx.reply(
        isRu
          ? '✅ Модель выбрана! Теперь введите промпт...'
          : '✅ Model selected! Now enter a prompt...'
      )

      if (!ctx.botInfo?.username) {
        logger.error('❌ [TEXT-TO-IMAGE] Bot username not found')
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      await sendBalanceMessage(
        ctx,
        userBalance,
        price,
        isRu,
        ctx.botInfo.username
      )

      await ctx.replyWithPhoto(selectedModelInfo.previewImage, {
        caption: isRu
          ? `<b>Модель: ${selectedModelInfo.shortName}</b>\n\n<b>Описание:</b> ${selectedModelInfo.description_ru}`
          : `<b>Model: ${selectedModelInfo.shortName}</b>\n\n<b>Description:</b> ${selectedModelInfo.description_en}`,
        parse_mode: 'HTML',
      })

      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите текст для генерации изображения.'
          : 'Please enter text to generate an image.',
        createHelpCancelKeyboard(isRu)
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [TEXT-TO-IMAGE] Error in model confirmation:', {
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.from?.id,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },

  // ШАГ 3: Получение промпта и запуск генерации
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    logger.info('🎨 [TEXT-TO-IMAGE] Step 3: Prompt received', {
      userId: ctx.from?.id,
      hasMessage: !!message,
    })

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.from?.id) {
      logger.error('❌ [TEXT-TO-IMAGE] Telegram ID not found')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const prompt = message.text

    try {
      // Используем обновленный хелпер для профиля
      const { profile, settings } = await getUserProfileAndSettings(ctx.from.id)
      if (!profile || !settings) {
        logger.error(
          '❌ [TEXT-TO-IMAGE] Failed to get profile or settings',
          { telegramId: ctx.from.id }
        )
        await ctx.reply(
          isRu
            ? 'Ошибка: Не удалось получить данные пользователя.'
            : 'Error: Could not retrieve user data.'
        )
        return ctx.scene.leave()
      }

      // Устанавливаем выбранную модель в настройки
      if (ctx.session.selectedImageModel) {
        settings.imageModel = ctx.session.selectedImageModel
      } else {
        logger.error('❌ [TEXT-TO-IMAGE] Selected model not found in session', {
          telegramId: ctx.from.id,
        })
        await ctx.reply(
          isRu
            ? 'Ошибка: Не удалось определить выбранную модель.'
            : 'Error: Could not determine the selected model.'
        )
        return ctx.scene.leave()
      }

      // ✅ НОВАЯ ЛОГИКА С INNGEST - вместо прямого вызова API!
      try {
        logger.info('🎨 [TEXT-TO-IMAGE] Sending generation request to Inngest', {
          userId: ctx.from.id,
          model: ctx.session.selectedImageModel,
          promptLength: prompt.length,
        })

        // ✅ Отправляем событие в Inngest
        const eventId = await sendInngestEvent(
          INNGEST_EVENTS.NEURO_IMAGE_GENERATION,
          {
            prompt,
            modelId: ctx.session.selectedImageModel,
            modelName: imageModelPrices[ctx.session.selectedImageModel]?.shortName || 'unknown',
            numImages: 1,
            userId: ctx.from.id.toString(),
            telegramId: ctx.from.id.toString(),
            username: ctx.from.username ?? 'unknown',
            isRu,
            metadata: {
              type: 'text-to-image',
              wizard: 'text_to_image',
              modelId: ctx.session.selectedImageModel,
            },
          }
        )

        // ✅ Мгновенно отвечаем пользователю
        await ctx.reply(
          isRu
            ? `⏳ Генерирую изображение...\n\nID задачи: ${eventId.substring(0, 8)}...\n\nВы получите уведомление когда будет готово! 🎉`
            : `⏳ Generating image...\n\nTask ID: ${eventId.substring(0, 8)}...\n\nYou'll receive a notification when ready! 🎉`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? '🔄 Проверить статус' : '🔄 Check status',
                    callback_data: `status_${eventId}`,
                  },
                ],
                [
                  {
                    text: isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
                    callback_data: 'improve_prompt',
                  },
                  {
                    text: isRu ? '📐 Изменить размер' : '📐 Change size',
                    callback_data: 'change_size',
                  },
                ],
                [
                  {
                    text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
                    callback_data: 'go_main_menu',
                  },
                ],
              ],
            },
          }
        )

        // Сохраняем промпт в сессию для возможного улучшения
        ctx.session.prompt = prompt

        logger.info('✅ [TEXT-TO-IMAGE] Generation started successfully', {
          userId: ctx.from.id,
          eventId,
        })

        // ✅ Выходим из сцены - генерация работает в фоне
        return ctx.scene.leave()
      } catch (error) {
        logger.error('❌ [TEXT-TO-IMAGE] Failed to send Inngest event', {
          error: error instanceof Error ? error.message : String(error),
          userId: ctx.from.id,
          prompt: prompt.substring(0, 50),
        })

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при запуске генерации. Попробуйте позже.'
            : '❌ An error occurred while starting generation. Please try again later.'
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('❌ [TEXT-TO-IMAGE] Error in prompt processing:', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from.id,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },

  // ШАГ 4: Обработка кнопок (fallback для случаев, когда не покинули сцену)
  async ctx => {
    logger.warn(
      `⚠️ [TEXT-TO-IMAGE] Reached unexpected step for user ${ctx.from?.id}. Leaving scene.`
    )
    return ctx.scene.leave()
  }
)

export default textToImageWizard
