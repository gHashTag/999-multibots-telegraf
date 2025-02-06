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

export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'textToImageWizard',
  async ctx => {
    const isRu = isRussian(ctx)
    console.log('CASE: textToImageWizard STEP 1', ctx.from?.id)

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

    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message
    console.log('CASE: textToImageWizard STEP 2', message)

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

      await sendBalanceMessage(ctx.from.id, balance, price, isRu)

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
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const text = message.text

      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        ctx.session.prompt = text
        await generateTextToImage(
          text,
          ctx.session.selectedModel,
          1,
          ctx.from.id,
          isRu,
          ctx
        )
        return ctx.scene.leave()
      }
    }

    await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
    return ctx.scene.leave()
  }
)
