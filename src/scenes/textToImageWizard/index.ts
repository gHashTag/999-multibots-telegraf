import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImage } from '@/services/generateTextToImage'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'
import { logger } from '@/utils/logger'
import { bots } from '@/bot'

import { createHelpCancelKeyboard } from '@/menu'
import { getUserProfileAndSettings } from '@/db/userSettings'

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

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
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
        createHelpCancelKeyboard(isRu)
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

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const prompt = message.text

    // Используем обновленный хелпер
    const { profile, settings } = await getUserProfileAndSettings(ctx.from.id)
    if (!profile || !settings) {
      logger.error(
        'Не удалось получить профиль или настройки в textToImageWizard',
        { telegramId: ctx.from.id }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось получить данные пользователя.'
          : 'Error: Could not retrieve user data.'
      )
      return ctx.scene.leave()
    }

    // Устанавливаем выбранную модель в настройки ПЕРЕД вызовом
    if (ctx.session.selectedModel) {
      settings.imageModel = ctx.session.selectedModel
    } else {
      logger.error('Не найдена выбранная модель в сессии в textToImageWizard', {
        telegramId: ctx.from.id,
      })
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось определить выбранную модель.'
          : 'Error: Could not determine the selected model.'
      )
      return ctx.scene.leave()
    }

    // Находим нужный инстанс бота
    const currentBotName = ctx.botInfo?.username
    const currentBotInstance = bots.find(
      b => b.context.botName === currentBotName
    )

    if (!currentBotInstance) {
      logger.error(
        'Не удалось найти инстанс Telegraf для бота в textToImageWizard',
        {
          botName: currentBotName,
          telegramId: ctx.from.id,
        }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось инициализировать бота.'
          : 'Error: Could not initialize the bot.'
      )
      return ctx.scene.leave()
    }

    try {
      // Передаем найденный инстанс бота как последний аргумент
      const results = await generateTextToImage(
        prompt,
        ctx.session.selectedModel,
        1,
        ctx.from.id.toString(),
        isRu,
        ctx,
        currentBotInstance // Передаем найденный инстанс
      )

      // Логируем результат (опционально)
      if (results.length === 0) {
        logger.warn(
          'generateTextToImage в textToImageWizard вернул пустой результат (вероятно, ошибка обработана внутри)',
          {
            telegramId: ctx.from.id,
            prompt,
            model: ctx.session.selectedModel,
          }
        )
      }
      // Сообщение об успехе/ошибке/балансе уже отправлено внутри generateTextToImage
    } catch (wizardError) {
      // Ловим ошибки, которые могли возникнуть *до* или *после* вызова generateTextToImage
      // Ошибки *внутри* generateTextToImage ловятся и логируются там же.
      logger.error('Ошибка в последнем шаге textToImageWizard:', {
        error: wizardError,
        telegramId: ctx.from?.id,
      })
      // Пытаемся отправить общее сообщение об ошибке, если еще не отправлено
      try {
        await ctx.reply(
          isRu
            ? 'Произошла непредвиденная ошибка. Попробуйте снова.'
            : 'An unexpected error occurred. Please try again.'
        )
      } catch (replyError) {
        logger.error(
          'Не удалось отправить сообщение об ошибке из textToImageWizard',
          { replyError }
        )
      }
    }

    // Выходим из сцены в любом случае после попытки генерации
    return ctx.scene.leave()
  }
)
