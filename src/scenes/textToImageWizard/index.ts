import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { imageModelPrices } from '@/price/models/imageModelPrices'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImage } from '@/services/generateTextToImage'
import {
  getUserBalance,
  setPayments,
  invalidateBalanceCache,
} from '@/core/supabase'
import {
  validateAndCalculateImageModelPrice,
  sendBalanceMessage,
} from '@/price/helpers'
import { createHelpButton } from '@/menu/buttons'
import { isRussian } from '@/helpers/language'
import {
  PaymentType,
  PaymentStatus,
  Currency,
} from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
// import { IMAGE_MODELS_CONFIG } from '@/config/models.config' // Неправильный конфиг

// Возвращаем экспорт
export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'text_to_image',
  async ctx => {
    const isRu = isRussian(ctx)
    console.log('CASE: text_to_image STEP 1', ctx.from?.id)

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

    if (!ctx.from?.id) {
      console.error('❌ Telegram ID не найден')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

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

    const availableModels = Object.keys(imageModelPrices)
    const userBalance = await getUserBalance(ctx.from.id.toString())
    const price = await validateAndCalculateImageModelPrice(
      fullModelId,
      availableModels,
      userBalance,
      isRu,
      ctx
    )
    console.log('price', price)

    if (price === null) {
      return ctx.scene.leave()
    }

    try {
      await ctx.reply(isRu ? 'Генерирую изображение...' : 'Generating image...')

      if (!ctx.botInfo?.username) {
        console.error('❌ Bot username не найден')
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
        Markup.inlineKeyboard([[createHelpButton()]])
      )

      return ctx.wizard.next()
    } catch (error) {
      console.error('Error generating image:', error)
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.from?.id) {
      console.error('❌ Telegram ID не найден')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.session.selectedModel) {
      console.error('❌ Модель не найдена')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.botInfo?.username) {
      console.error('❌ Bot username не найден')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const text = message.text
    ctx.session.prompt = text

    const userId = ctx.from.id.toString()
    const botName = ctx.botInfo.username || 'unknown_bot'

    const currentBalance = await getUserBalance(userId, botName)

    const price = await validateAndCalculateImageModelPrice(
      ctx.session.selectedModel,
      Object.keys(imageModelPrices),
      currentBalance,
      isRu,
      ctx
    )

    if (price === null) {
      return ctx.scene.leave()
    }

    try {
      await setPayments({
        telegram_id: userId,
        OutSum: '0',
        InvId: null,
        stars: price,
        currency: Currency.XTR,
        status: PaymentStatus.COMPLETED,
        type: PaymentType.MONEY_OUTCOME,
        payment_method: 'Internal',
        metadata: { prompt: text, model: ctx.session.selectedModel },
        bot_name: botName,
        language: isRu ? 'ru' : 'en',
        subscription_type: null,
      })

      await invalidateBalanceCache(userId)

      await generateTextToImage(
        text,
        ctx.session.selectedModel,
        1,
        userId,
        isRu,
        ctx,
        botName
      )

      return ctx.scene.leave()
    } catch (error) {
      console.error('Error generating image:', error)
      await sendGenericErrorMessage(ctx, isRu, error as Error)
      return ctx.scene.leave()
    }
  }
)

textToImageWizard.action(/select_image_model:(.+)/, async ctx => {
  const model_id = ctx.match[1] // model_id это ключ из imageModelPrices
  const model = imageModelPrices[model_id] // Получаем модель по ключу
  if (!model) {
    await ctx.answerCbQuery('Model not found!')
    return
  }
  ctx.session.selectedModel = model_id // Сохраняем ключ модели
  await ctx.answerCbQuery(`Selected model: ${model.shortName}`) // Используем shortName

  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu
      ? '✏️ Введите промпт для генерации изображения:'
      : '✏️ Enter the prompt for image generation:',
    Markup.inlineKeyboard([[createHelpButton()]])
  )

  ctx.wizard.selectStep(ctx.wizard.cursor + 1)
})

textToImageWizard.on('text', async ctx => {
  if (ctx.wizard.cursor === 2) {
    if (ctx.message && 'text' in ctx.message && ctx.from) {
      const promptText = ctx.message.text
      ctx.session.prompt = promptText
      const isRu = isRussian(ctx)
      const userId = ctx.from.id.toString()
      const botName = ctx.botInfo?.username || 'unknown_bot'

      if (!ctx.session.selectedModel) {
        await ctx.reply(
          isRu ? 'Ошибка: Модель не выбрана.' : 'Error: Model not selected.'
        )
        return ctx.scene.reenter()
      }

      const modelId = ctx.session.selectedModel
      const model = imageModelPrices[modelId]

      if (!model) {
        await ctx.reply(
          isRu
            ? 'Ошибка: Конфигурация модели не найдена.'
            : 'Error: Model configuration not found.'
        )
        return ctx.scene.reenter()
      }

      const currentBalance = await getUserBalance(userId, botName)

      const price = await validateAndCalculateImageModelPrice(
        modelId,
        Object.keys(imageModelPrices),
        currentBalance,
        isRu,
        ctx
      )

      if (price === null) {
        return ctx.scene.leave()
      }

      try {
        await setPayments({
          telegram_id: userId,
          OutSum: '0',
          InvId: null,
          stars: price,
          currency: Currency.XTR,
          status: PaymentStatus.COMPLETED,
          type: PaymentType.MONEY_OUTCOME,
          payment_method: 'Internal',
          metadata: { prompt: promptText, model: modelId },
          bot_name: botName,
          language: isRu ? 'ru' : 'en',
          subscription_type: null,
        })

        await invalidateBalanceCache(userId)

        await generateTextToImage(
          promptText,
          modelId,
          1,
          userId,
          isRu,
          ctx,
          botName
        )
      } catch (error) {
        console.error('Error generating image:', error)
        await sendGenericErrorMessage(ctx, isRu, error as Error)
      }

      return ctx.scene.leave()
    } else {
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите текстовый промпт.'
          : 'Please enter a text prompt.'
      )
    }
  } else {
    console.log('Ignoring text input on step:', ctx.wizard.cursor)
  }
})
