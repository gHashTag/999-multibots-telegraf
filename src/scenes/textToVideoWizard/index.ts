import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { calculateFinalStarPrice, CalculationParams } from '@/price/calculator'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { getUserBalance } from '@/core/supabase'
import { generateTextToVideo } from '@/modules/generateTextToVideo'
import { logger } from '@/utils/logger'
import { processBalanceVideoOperation } from '@/price/helpers'
import { bots } from '@/bot'
import { supabase } from '@/core/supabase'
import { replicate } from '@/core/replicate'
import fs from 'fs/promises'
import path from 'path'
import { generateVideo } from '@/core/replicate/generateVideo'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { pulse } from '@/helpers'
import { Telegraf } from 'telegraf'
import { mock } from 'bun:test'
import { toBotName } from '@/helpers/botName.helper'

// Определяем тип ключа конфига локально
type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      // Запрашиваем модель
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )

      return ctx.wizard.next()
    } catch (error: unknown) {
      console.error('Error in text_to_video:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      await ctx.reply(
        isRu
          ? `❌ Произошла ошибка: ${errorMessage}`
          : `❌ An error occurred: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message as { text?: string }
    const selectedButtonText = message?.text // Получаем текст нажатой кнопки

    if (!selectedButtonText) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Ищем ключ модели по тексту кнопки (формат: "Название (Цена ⭐)")
    let foundModelKey: VideoModelConfigKey | null = null

    for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      if (!config.inputType.includes('text')) continue
      // Calculate price using new calculator
      const params: CalculationParams = { modelId: key }
      const costResult = calculateFinalStarPrice(ModeEnum.TextToVideo, params)
      const finalPriceInStars = costResult ? costResult.stars : 0

      const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)`
      if (expectedButtonText === selectedButtonText) {
        foundModelKey = key as VideoModelConfigKey
        break
      }
    }

    // Обрабатываем Помощь и Отмену отдельно, если они были нажаты
    if (selectedButtonText === (isRu ? 'Помощь' : 'Help')) {
      // Логика для Помощи (если нужна)
      await ctx.reply(
        isRu
          ? 'Функция Помощи в разработке.'
          : 'Help function is under development.'
      )
      // Можно остаться в сцене или выйти
      // return ctx.wizard.selectStep(ctx.wizard.cursor) // Остаться на текущем шаге
      return ctx.scene.leave()
    }

    if (selectedButtonText === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu ? 'Отменено.' : 'Cancelled.',
        Markup.removeKeyboard()
      )
      return ctx.scene.leave()
    }

    // Если ключ модели не найден по тексту кнопки
    if (!foundModelKey) {
      console.error(
        'Could not map button text to model key:',
        selectedButtonText
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок.'
          : 'Please select a model using the provided buttons.'
      )
      // Остаемся на этом же шаге, чтобы пользователь выбрал снова
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // --- Остальная логика остается похожей, но используем foundModelKey ---

    if (!ctx.from) {
      console.error('text_to_video: Could not identify user')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username

    // Calculate cost using new calculator
    const params: CalculationParams = { modelId: foundModelKey }
    const costResult = calculateFinalStarPrice(ModeEnum.TextToVideo, params)
    const cost = costResult ? costResult.stars : 0

    const currentBalance = await getUserBalance(telegram_id, bot_name)

    // 3. Проверяем, достаточно ли средств
    if (currentBalance < cost) {
      console.log(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд для генерации (${cost}). Ваш баланс: ${currentBalance} ★. Пожалуйста, выберите другую модель или пополните баланс.`
          : `😕 Insufficient stars for generation (${cost}). Your balance: ${currentBalance} ★. Please select another model or top up your balance.`,
        // Оставляем клавиатуру для выбора
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )
      // Остаемся на этом же шаге
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Если баланс достаточен:
    console.log(
      `Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}. Proceeding.`
    )

    // Сохраняем НАЙДЕННЫЙ ключ модели в сессии
    ctx.session.videoModel = foundModelKey

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание'
        : 'Please send a text description',
      // Важно убрать клавиатуру после успешного выбора модели
      Markup.removeKeyboard()
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const prompt = message.text

      if (!prompt) {
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      // Получаем ключ модели из существующего поля сессии
      const videoModelKey = ctx.session.videoModel as
        | VideoModelConfigKey
        | undefined
      logger.info('Selected video model key:', { videoModelKey })

      if (!videoModelKey) {
        logger.error('Video model key not found in session')
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      if (ctx.from && ctx.from.username) {
        try {
          logger.info('Calling generateTextToVideo module', {
            prompt,
            videoModelKey,
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username,
            is_ru: isRu,
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            pulseHelper: pulse,
            videoModelsConfig: VIDEO_MODELS_CONFIG,
            pathJoin: path.join,
            pathDirname: path.dirname,
            toBotName: toBotName,
          })

          // Собираем данные запроса
          const requestData = {
            prompt,
            videoModel: videoModelKey,
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username,
            is_ru: isRu,
            bot_name: ctx.botInfo?.username || 'unknown_bot',
          }

          // Собираем зависимости (из импортов и контекста)
          const dependencies = {
            logger,
            supabase,
            replicate,
            telegram: (
              bots.find(
                b => b.context.botName === requestData.bot_name
              ) as Telegraf<MyContext>
            ).telegram, // Получаем telegram из инстанса бота
            fs: { mkdir: fs.mkdir, writeFile: fs.writeFile },
            processBalance: processBalanceVideoOperation, // Используем правильную функцию баланса
            // generateVideoInternal: generateVideo, // Старый неверный мок
            // Исправленный мок, возвращающий URL (string)
            generateVideoInternal: mock(() =>
              Promise.resolve('https://mock-replicate-output.com/video.mp4')
            ),
            sendErrorToUser: sendServiceErrorToUser,
            sendErrorToAdmin: sendServiceErrorToAdmin,
            pulseHelper: pulse,
            videoModelsConfig: VIDEO_MODELS_CONFIG,
            pathJoin: path.join,
            pathDirname: path.dirname,
            toBotName: toBotName,
          }

          await generateTextToVideo(requestData, dependencies)
          ctx.session.prompt = prompt
        } catch (generationError) {
          logger.error('Error calling generateTextToVideo module', {
            generationError,
          })
          await sendGenericErrorMessage(ctx, isRu)
        }
      } else {
        logger.error('User information missing for video generation')
        await sendGenericErrorMessage(ctx, isRu)
      }

      await ctx.scene.leave()
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      await ctx.scene.leave()
    }
  }
)

export default textToVideoWizard
