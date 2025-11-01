import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { getUserBalance, getAspectRatio } from '@/core/supabase'
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

    try {
      await ctx.reply(isRu ? '⏳ Загрузка информации о модели...' : '⏳ Loading model information...')

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

      // Сохраняем промпт в сессию для возможного улучшения
      ctx.session.prompt = prompt
      ctx.session.lastGeneratedModel = ctx.session.selectedImageModel

      // Получаем текущий баланс ПОСЛЕ операции
      const currentBalance = await getUserBalance(ctx.from.id.toString())

      // НЕ покидаем сцену, а переходим к следующему шагу для обработки кнопок
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
  // Шаг 4: Обработка кнопок после генерации
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

    const text = message.text

    // 🚨 ОБРАБОТКА КНОПОК 1️⃣,2️⃣,3️⃣,4️⃣ И ЧИСЕЛ 1,2,3,4
    if (
      ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text) ||
      ['1', '2', '3', '4'].includes(text)
    ) {
      console.log(`CASE: Генерация ${text} изображений`)
      let numImages: number
      if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
        numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
      } else {
        numImages = parseInt(text)
      }

      const prompt = ctx.session.prompt
      const model = ctx.session.lastGeneratedModel

      if (!prompt || !model) {
        console.error('Error: prompt or model not found in session')
        await ctx.reply(
          isRu
            ? '❌ Ошибка: данные для генерации не найдены. Попробуйте начать заново.'
            : '❌ Error: generation data not found. Please start over.'
        )
        await handleMenu(ctx, isRu)
        return ctx.scene.leave()
      }

      try {
        await ctx.reply(
          isRu
            ? `⏳ Генерирую ${numImages} изображение${numImages > 1 ? 'я' : 'е'}...`
            : `⏳ Generating ${numImages} image${numImages > 1 ? 's' : ''}...`
        )

        // 🔥 ВАЖНО: Для midjourney-v7 передаем aspectRatio, а НЕ width/height
        // Это нужно чтобы aspectRatio корректно обрабатывался в generateMidjourneyImage
        const userAspectRatio = await getAspectRatio(ctx.from.id)
        const aspectRatioToUse = userAspectRatio || '1:1'

        // Создаем inputParams для генерации
        const inputParams: {
          prompt: string
          size?: string
          aspect_ratio?: string
        } = {
          prompt,
        }

        if (model.toLowerCase().startsWith('recraft-ai/')) {
          // Recraft модели используют size
          const [widthRatio, heightRatio] = aspectRatioToUse.split(':').map(Number)
          const baseWidth = 1024
          const calculatedHeight = Math.round(
            (baseWidth / widthRatio) * heightRatio
          )
          const calculatedSize = `${baseWidth}x${calculatedHeight}`
          inputParams.size = ['1024x1024', '1365x1024', '1024x1365'].includes(calculatedSize)
            ? calculatedSize
            : '1024x1024'
        } else {
          // Остальные модели (включая midjourney-v7) используют aspect_ratio
          inputParams.aspect_ratio = aspectRatioToUse
        }

        logger.info('[textToImageWizard step 4] Input params for generation', inputParams)

        // Вызываем generateTextToImageDirect с новым количеством изображений
        await generateTextToImageDirect(
          prompt,
          model,
          numImages,
          ctx.from.id.toString(),
          ctx.from.username ?? 'unknown',
          isRu,
          ctx
        )

        // После генерации остаемся в этом же шаге для дальнейших действий
        return
      } catch (error) {
        console.error('Error generating additional images:', error)
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }
    } else if (text === (isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt')) {
      // Переход к мастеру улучшения промпта
      return ctx.scene.enter(improvePromptWizard.id)
    } else if (text === (isRu ? '📐 Изменить размер' : '📐 Change size')) {
      // Переход к мастеру изменения размера
      return ctx.scene.enter(sizeWizard.id)
    } else if (text === (isRu ? '🎨 Создать новое' : '🎨 Create new')) {
      // Очищаем только промпт, но сохраняем выбранную модель
      ctx.session.prompt = undefined

      // Просим ввести новый промпт для той же модели
      await ctx.reply(
        isRu
          ? `Пожалуйста, введите текст для генерации нового изображения с моделью "${ctx.session.lastGeneratedModel}".`
          : 'Please enter text to generate a new image.',
        createHelpCancelKeyboard(isRu)
      )
      // Переходим к шагу ввода промпта (step 3)
      ctx.wizard.selectStep(2)
      return
    } else if (text === (isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
      await handleMenu(ctx, isRu)
      return ctx.scene.leave()
    } else {
      // Неизвестная команда - возвращаем в главное меню
      logger.warn(
        `Unknown command in textToImageWizard step 4: ${text} for user ${ctx.from?.id}`
      )
      await handleMenu(ctx, isRu)
      return ctx.scene.leave()
    }
  }
)
