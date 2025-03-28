import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImage } from '@/services/generateTextToImage'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'

import { createHelpCancelKeyboard } from '@/menu'
import { InngestService } from '@/services/inngest.service'

export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'text_to_image',
  async ctx => {
    const isRu = isRussian(ctx)
    console.log('CASE: text_to_image STEP 1', ctx.from?.id)

    if (!ctx.from || !ctx.from.id) {
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
    console.log('filteredModels', filteredModels)
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
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message
    console.log('CASE: text_to_image STEP 2', message)

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    } else {
      const modelShortName = message.text
      const selectedModelEntry = Object.entries(imageModelPrices).find(
        ([, modelInfo]) => modelInfo.shortName === modelShortName
      )

      if (!selectedModelEntry) {
        console.error('Model not found:', modelShortName)
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      const [fullModelId, selectedModelInfo] = selectedModelEntry
      ctx.session.selectedModel = fullModelId

      if (!selectedModelInfo) {
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      const availableModels = Object.keys(imageModelPrices) as string[]

      const price = await validateAndCalculateImageModelPrice(
        fullModelId,
        availableModels,
        await getUserBalance(ctx.from.id),
        isRu,
        ctx
      )
      console.log('price', price)

      if (price === null) {
        return ctx.scene.leave()
      }

      const balance = await getUserBalance(ctx.from.id)

      await sendBalanceMessage(ctx, balance, price, isRu)

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
      ctx.wizard.next()
      return
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const text = message.text

      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        ctx.scene.leave()
        return
      } else {
        ctx.session.prompt = text

        // Отправляем уведомление пользователю
        await ctx.reply(
          isRu
            ? '⏳ Запрос на генерацию изображения отправлен! Результат придёт в этот чат в ближайшее время.'
            : '⏳ Image generation request sent! The result will be sent to this chat shortly.'
        )

        // Отправляем событие в Inngest вместо прямого вызова API
        await InngestService.sendEvent('text-to-image.requested', {
          prompt: text,
          model: ctx.session.selectedModel,
          num_images: 1,
          telegram_id: ctx.from.id.toString(),
          username: ctx.from?.username,
          is_ru: isRu,
          bot_name: ctx.botInfo?.username,
        })

        ctx.scene.leave()
        return
      }
    }

    await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
    ctx.scene.leave()
    return
  }
)
