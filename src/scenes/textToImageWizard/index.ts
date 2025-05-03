import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { IMAGES_MODELS, ModelInfo } from '@/price/models/IMAGES_MODELS' // Import new config and type
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImage } from '@/modules/generateTextToImage'
import { getUserBalance, getAspectRatio } from '@/core/supabase'
import { isRussian } from '@/helpers'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'
import { logger } from '@/utils/logger'
import { bots } from '@/bot'
import { supabase } from '@/core/supabase' // Импорт supabase
import { replicate } from '@/core/replicate' // Импорт replicate
import fs from 'fs' // Импорт fs
import path from 'path' // Импорт path
import { processServiceBalanceOperation as processBalance } from '@/price/helpers' // Правильный импорт
// Импортируем заглушку processImageApiResponse
// FIXME: Найти или создать processImageApiResponse
const processImageApiResponse = async (output: any): Promise<string> => {
  console.warn('Dummy processImageApiResponse used')
  return Array.isArray(output) ? output[0] : String(output)
}
import { savePromptDirect as saveImagePrompt } from '@/core/supabase' // Правильный путь и alias
import { saveFileLocally as saveImageLocally } from '@/helpers/saveFileLocally' // Используем нужный alias
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error' // Импорт error handlers
import { calculateFinalStarPrice } from '@/price/calculator' // Импорт калькулятора цен
import { ModeEnum } from '@/interfaces/modes' // Импорт ModeEnum

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
    const filteredModels = Object.values(IMAGES_MODELS).filter(
      (
        model: ModelInfo // Add type ModelInfo
      ) =>
        !model.inputType.includes('dev') &&
        (model.inputType.includes('text') ||
          (model.inputType.includes('text') &&
            model.inputType.includes('image')))
    )
    console.log('filteredModels', filteredModels)
    const modelButtons = filteredModels.map(
      (
        model: ModelInfo // Add type ModelInfo
      ) => Markup.button.text(model.shortName)
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
    const selectedModelEntry = Object.entries(IMAGES_MODELS).find(
      ([, modelInfo]: [string, ModelInfo]) =>
        modelInfo.shortName === modelShortName // Add type ModelInfo
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

    const availableModels = Object.keys(IMAGES_MODELS) // Changed imageModelPrices to IMAGES_MODELS
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
      // --- Адаптер для processBalance --- START
      const tempProcessBalanceAdapter = async (
        ctxAdapter: MyContext,
        modelAdapter: string,
        isRuAdapter: boolean
      ): Promise<{
        success: boolean
        newBalance?: number
        paymentAmount: number
        error?: string
      }> => {
        const costResult = calculateFinalStarPrice(ModeEnum.TextToImage, {
          modelId: modelAdapter,
        })
        if (!costResult) {
          logger.error('Could not calculate price in processBalanceAdapter', {
            modelAdapter,
          })
          return {
            success: false,
            paymentAmount: 0,
            error: 'Could not calculate price',
          }
        }
        const paymentAmount = costResult.stars

        const balanceResult = await processBalance({
          telegram_id: ctxAdapter.from.id.toString(),
          paymentAmount: paymentAmount,
          is_ru: isRuAdapter,
          bot: currentBotInstance, // currentBotInstance доступен в замыкании
          bot_name: ctxAdapter.botInfo.username,
          description: `Text to Image generation (${modelAdapter})`,
          service_type: ModeEnum.TextToImage, // Используем правильный enum
        })
        return { ...balanceResult, paymentAmount }
      }
      // --- Адаптер для processBalance --- END

      // --- Адаптер для saveImagePrompt --- START
      const tempSaveImagePromptAdapter = async (
        promptAdapter: string,
        modelKeyAdapter: string,
        imageLocalUrlAdapter: string,
        telegramIdAdapter: number
      ): Promise<number> => {
        const promptId = await saveImagePrompt(
          promptAdapter,
          modelKeyAdapter,
          ModeEnum.TextToImage,
          imageLocalUrlAdapter,
          telegramIdAdapter.toString(),
          'completed'
        )
        return promptId ?? -1
      }
      // --- Адаптер для saveImagePrompt --- END

      // Собираем данные запроса
      const requestData = {
        prompt,
        model_type: ctx.session.selectedModel,
        num_images: 1,
        telegram_id: ctx.from.id.toString(),
        username: ctx.from.username || 'UnknownUser',
        is_ru: isRu,
      }

      // Собираем зависимости
      const dependencies = {
        logger,
        supabase,
        replicate,
        telegram: currentBotInstance.telegram,
        fsCreateReadStream: fs.createReadStream,
        pathBasename: path.basename,
        processBalance: tempProcessBalanceAdapter, // Передаем адаптер
        processImageApiResponse: processImageApiResponse, // Возвращаем зависимость
        saveImagePrompt: tempSaveImagePromptAdapter, // Передаем адаптер
        saveImageLocally: saveImageLocally, // Используем правильное имя свойства
        getAspectRatio: getAspectRatio, // FIXME: Уточнить нужность
        sendErrorToUser: sendServiceErrorToUser,
        sendErrorToAdmin: sendServiceErrorToAdmin,
        imageModelsConfig: IMAGES_MODELS,
      }

      // Передаем найденный инстанс бота как последний аргумент
      const results = await generateTextToImage(requestData, dependencies)

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
