import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
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

      // Получаем текущий баланс ПОСЛЕ операции
      const currentBalance = await getUserBalance(ctx.from.id.toString())

      // Сохраняем промпт в сессию для возможного улучшения
      ctx.session.prompt = prompt

      // Отправляем сообщение с клавиатурой здесь
      await ctx.reply(
        isRu
          ? `Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, то выберите количество изображений в меню 1️⃣, 2️⃣, 3️⃣, 4️⃣.\n\nВаш новый баланс: ${currentBalance.toFixed(2)} ⭐️`
          : `Your images have been generated!\n\nGenerate more?\n\nYour new balance: ${currentBalance.toFixed(2)} ⭐️`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
              [
                { text: isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                { text: isRu ? '📐 Изменить размер' : '📐 Change size' },
              ],
              [{ text: isRu ? '🏠 Главное меню' : '🏠 Main menu' }],
            ],
            resize_keyboard: true,
            // one_time_keyboard: false, // Оставляем клавиатуру
          },
        }
      )

      // Переходим на следующий шаг для обработки кнопок
      return ctx.wizard.next()
    } catch (error) {
      logger.error('Ошибка при вызове generateTextToImageDirect', { error })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave() // Выходим при ошибке генерации
    }
  },
  // НОВЫЙ ЧЕТВЕРТЫЙ ШАГ
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      // Если пришло не текстовое сообщение, просто выходим или просим выбрать кнопку
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите действие с помощью кнопок.'
          : 'Please select an action using the buttons.'
      )
      // Не выходим, ждем нажатия кнопки
      return
    }

    const text = message.text

    // Проверяем отмену
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Обработка кнопок
    switch (text) {
      case '1️⃣':
      case '2️⃣':
      case '3️⃣':
      case '4️⃣': {
        const numImages = parseInt(text.replace('️⃣', ''))
        // TODO: Реализовать повторную генерацию с numImages
        // Пока просто выводим сообщение и выходим
        await ctx.reply(
          `Запущена повторная генерация ${numImages} изображений... (TODO)`
        )
        logger.info('Повторная генерация', {
          numImages,
          telegramId: ctx.from?.id,
        })
        return ctx.scene.leave() // Выходим после запуска (или пока нет реализации)
      }

      case isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt': {
        if (ctx.session.prompt) {
          logger.info('Переход в improvePromptWizard', {
            telegramId: ctx.from?.id,
          })
          return ctx.scene.enter(improvePromptWizard.id)
        } else {
          await ctx.reply(
            isRu
              ? 'Не найден предыдущий промпт для улучшения.'
              : 'Previous prompt not found for improvement.'
          )
          return ctx.scene.leave()
        }
      }

      case isRu ? '📐 Изменить размер' : '📐 Change size': {
        logger.info('Переход в sizeWizard', { telegramId: ctx.from?.id })
        // TODO: Передать ID изображения или другую инфу в sizeWizard, если нужно
        return ctx.scene.enter(sizeWizard.id)
      }

      case isRu ? '🏠 Главное меню' : '🏠 Main menu': {
        logger.info('Возврат в главное меню', { telegramId: ctx.from?.id })
        await handleMenu(ctx) // Используем хендлер главного меню
        return ctx.scene.leave()
      }

      default:
        await ctx.reply(
          isRu
            ? 'Пожалуйста, выберите действие с помощью кнопок.'
            : 'Please select an action using the buttons.'
        )
        // Не выходим, ждем нажатия кнопки
        return
    }
  }
)
