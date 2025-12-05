import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/navigation'
import { sendGenericErrorMessage } from '@/navigation'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'

import { createHelpCancelKeyboard } from '@/navigation'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { improvePromptWizard } from '../improvePromptWizard'
import { sizeWizard } from '../sizeWizard'

export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'text_to_image',
  async ctx => {
    const isRu = isRussianFromState(ctx)
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
    const isRu = isRussianFromState(ctx)
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
    console.log('price', price)

    if (price === null) {
      return ctx.scene.leave()
    }

    // Сохраняем цену в сессию для последующего списания
    ctx.session.imageGenerationPrice = price

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
    const isRu = isRussianFromState(ctx)
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
    if (ctx.session.selectedImageModel) {
      settings.imageModel = ctx.session.selectedImageModel
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

    try {
      // Используем новую сигнатуру generateTextToImageDirect
      // TODO: Определить, как получать num_images (пока захардкожено 1)
      const generationResult = await generateTextToImageDirect(
        prompt,
        ctx.session.selectedImageModel,
        1, // num_images
        ctx.from.id.toString(),
        ctx.from.username ?? 'unknown',
        isRu,
        ctx
      )

      // ✅ БАЛАНС УЖЕ СПИСАН внутри generateTextToImageDirect через processBalanceOperation
      // ❌ НЕ НУЖНО списывать повторно здесь!

      // Сохраняем промпт в сессию для возможного улучшения
      ctx.session.prompt = prompt

      // После успешной генерации (сообщение теперь отправляет generateTextToImageDirect),
      // мы просто покидаем сцену.
      return ctx.scene.leave() // Покидаем сцену
    } catch (error) {
      logger.error('Ошибка при генерации изображения в textToImageWizard:', {
        error,
        telegramId: ctx.from.id,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  // ЭТОТ ШАГ, СКОРЕЕ ВСЕГО, БОЛЬШЕ НЕ НУЖЕН ИЛИ ДОЛЖЕН БЫТЬ ПУСТЫМ,
  // ТАК КАК ПРЕДЫДУЩИЙ ШАГ ЗАВЕРШАЕТСЯ ctx.scene.leave()
  // ИЛИ ОБРАБОТКА ПЕРЕХОДИТ К HEARS HANDLERS
  async ctx => {
    // УДАЛЯЕМ СТРОКУ С "TODO" ОТСЮДА ИЛИ ВЕСЬ ЭТОТ ШАГ, ЕСЛИ ОН НЕ НУЖЕН
    // logger.info(
    //   `textToImageWizard step 4: User ${ctx.from?.id} ` +
    //     ` ${ctx.message && 'text' in ctx.message ? ctx.message.text : 'no text'}`
    // )
    // const message = ctx.message
    // if (message && 'text' in message) {
    //   const text = message.text
    //   const numImages = parseInt(text[0])
    //   if (!isNaN(numImages) && numImages >= 1 && numImages <= 4) {
    //     // TODO: Реализовать повторную генерацию с numImages
    //     // await ctx.reply(
    //     //   `Запущена повторная генерация ${numImages} изображений... (TODO)`
    //     // )
    //     // Здесь нужно вызвать generateTextToImageDirect или аналогичную логику,
    //     // а затем снова показать клавиатуру, как на предыдущем шаге.
    //     // Однако, это уже делается через hearsHandlers, поэтому этот шаг избыточен.
    //   } else if (text === (isRussian(ctx) ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt')) {
    //     return ctx.scene.enter(improvePromptWizard.id)
    //   } else if (text === (isRussian(ctx) ? '📐 Изменить размер' : '📐 Change size')) {
    //     // TODO: Передать ID изображения или другую инфу в sizeWizard, если нужно
    //     return ctx.scene.enter(sizeWizard.id)
    //   } else if (text === (isRussian(ctx) ? '🏠 Главное меню' : '🏠 Main menu')) {
    //     await УДАЛЁН(ctx, true) // Возвращаемся в главное меню
    //     return ctx.scene.leave()
    //   }
    // }
    // Этот шаг, скорее всего, не будет достигнут, если предыдущий завершается ctx.scene.leave()
    // или если пользователь нажимает кнопки, обрабатываемые hearsHandlers.
    // Оставляем его пустым или удаляем, чтобы избежать неожиданного поведения.
    logger.warn(
      `Reached an unexpected step in textToImageWizard for user ${ctx.from?.id}. Leaving scene.`
    )
    return ctx.scene.leave()
  }
)
