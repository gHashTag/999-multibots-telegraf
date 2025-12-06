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

import { createHelpCancelKeyboard, getMainMenuText } from '@/navigation'
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
      [Markup.button.text(getMainMenuText(isRu))]
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
      // Сохраняем промпт в сессию для возможного улучшения
      ctx.session.prompt = prompt

      // ✅ ИСПРАВЛЕНО: После успешной генерации показываем клавиатуру для дополнительной генерации
      const additionalGenerationKeyboard = Markup.keyboard([
        [
          Markup.button.text('1️⃣'),
          Markup.button.text('2️⃣'),
          Markup.button.text('3️⃣'),
          Markup.button.text('4️⃣'),
        ],
        [
          Markup.button.text(isRu ? '🆕 Новый промпт' : '🆕 New prompt'),
          Markup.button.text(isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt'),
        ],
        [
          Markup.button.text(isRu ? '📐 Изменить размер' : '📐 Change size'),
          Markup.button.text(getMainMenuText(isRu)),
        ],
      ]).resize()

      await ctx.reply(
        isRu
          ? '✨ Изображение сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:'
          : '✨ Image generated! Choose the number of additional images or use other options:',
        additionalGenerationKeyboard
      )

      // Переходим к следующему шагу для обработки кнопок
      return ctx.wizard.next()
    } catch (error) {
      logger.error('Ошибка при генерации изображения в textToImageWizard:', {
        error,
        telegramId: ctx.from.id,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  // ШАГ 4: Обработка кнопок дополнительной генерации
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      // Нетекстовое сообщение - возвращаем в меню
      const { showMainMenu } = await import('@/navigation')
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return
    }

    const text = message.text

    // 🏠 ГЛАВНОЕ МЕНЮ
    if (text === getMainMenuText(isRu)) {
      const { showMainMenu } = await import('@/navigation')
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return
    }

    // 🆕 НОВЫЙ ПРОМПТ
    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      ctx.session.prompt = undefined
      ctx.session.selectedImageModel = undefined
      // Перезапускаем сцену с начала
      return ctx.scene.reenter()
    }

    // ⬆️ УЛУЧШИТЬ ПРОМПТ
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      return ctx.scene.enter(improvePromptWizard.id)
    }

    // 📐 ИЗМЕНИТЬ РАЗМЕР
    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      return ctx.scene.enter(sizeWizard.id)
    }

    // 1️⃣ 2️⃣ 3️⃣ 4️⃣ - ДОПОЛНИТЕЛЬНАЯ ГЕНЕРАЦИЯ
    const numImagesMap: Record<string, number> = {
      '1️⃣': 1,
      '2️⃣': 2,
      '3️⃣': 3,
      '4️⃣': 4,
      '1': 1,
      '2': 2,
      '3': 3,
      '4': 4,
    }

    const numImages = numImagesMap[text]
    if (numImages !== undefined) {
      const prompt = ctx.session.prompt
      const selectedModel = ctx.session.selectedImageModel

      if (!prompt || !selectedModel) {
        await ctx.reply(
          isRu
            ? '❌ Данные для генерации не найдены. Начните заново.'
            : '❌ Generation data not found. Please start over.'
        )
        const { showMainMenu } = await import('@/navigation')
        await ctx.scene.leave()
        await showMainMenu(ctx)
        return
      }

      try {
        await ctx.reply(
          isRu
            ? `⏳ Генерирую ${numImages} изображени${numImages === 1 ? 'е' : numImages < 5 ? 'я' : 'й'}...`
            : `⏳ Generating ${numImages} image${numImages > 1 ? 's' : ''}...`
        )

        await generateTextToImageDirect(
          prompt,
          selectedModel,
          numImages,
          ctx.from!.id.toString(),
          ctx.from!.username ?? 'unknown',
          isRu,
          ctx
        )

        // После генерации снова показываем клавиатуру
        const additionalGenerationKeyboard = Markup.keyboard([
          [
            Markup.button.text('1️⃣'),
            Markup.button.text('2️⃣'),
            Markup.button.text('3️⃣'),
            Markup.button.text('4️⃣'),
          ],
          [
            Markup.button.text(isRu ? '🆕 Новый промпт' : '🆕 New prompt'),
            Markup.button.text(getMainMenuText(isRu)),
          ],
        ]).resize()

        await ctx.reply(
          isRu
            ? '✨ Изображения сгенерированы! Выберите количество дополнительных изображений:'
            : '✨ Images generated! Choose the number of additional images:',
          additionalGenerationKeyboard
        )

        // Остаемся на этом же шаге для возможности повторной генерации
        return
      } catch (error) {
        logger.error('Ошибка при дополнительной генерации:', {
          error,
          telegramId: ctx.from?.id,
        })
        await sendGenericErrorMessage(ctx, isRu)
        return
      }
    }

    // Неизвестный ввод - показываем меню
    logger.warn(`Unknown input in textToImageWizard step 4: "${text}"`)
    const { showMainMenu } = await import('@/navigation')
    await ctx.scene.leave()
    await showMainMenu(ctx)
    return
  }
)
