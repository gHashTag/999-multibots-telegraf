import { Scenes, Markup, Telegraf } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/interfaces'
import { generateTextToImage } from '@/modules/generateTextToImage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { isRussian } from '@/helpers'
import { imageModelPrices } from '@/price/models'
import { validateAndCalculateImageModelPrice } from '@/price/helpers'
import { bots } from '@/bot'
// import { improvePromptWithPlanB } from '@/services/improvePromptWithPlanB' // Файл не найден, удаляем импорт
import { supabase } from '@/core/supabase' // Импорт supabase
import { replicate } from '@/core/replicate' // Импорт replicate
import fs from 'fs' // Импорт fs
import path from 'path' // Импорт path
import { processServiceBalanceOperation as processBalance } from '@/price/helpers' // Правильный импорт
import { savePromptDirect as saveImagePrompt } from '@/core/supabase' // Правильный путь и alias
import { saveFileLocally as saveImageLocally } from '@/helpers/saveFileLocally' // Используем нужный alias
import { getAspectRatio } from '@/core/supabase/getAspectRatio' // Импорт getAspectRatio
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error' // Импорт error handlers
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS' // Импорт конфига моделей
import { calculateFinalStarPrice } from '@/price/calculator' // Импорт калькулятора цен

const MAX_ATTEMPTS = 10

// Импортируем заглушку processImageApiResponse
// FIXME: Найти или создать processImageApiResponse
const processImageApiResponse = async (output: any): Promise<string> => {
  console.warn('Dummy processImageApiResponse used')
  return Array.isArray(output) ? output[0] : String(output)
}

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  'improvePromptWizard',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    console.log(ctx.session, 'ctx.session')

    // Проверяем, был ли промпт передан через state
    if (
      !ctx.session.prompt &&
      ctx.scene.state &&
      'prompt' in ctx.scene.state &&
      typeof ctx.scene.state.prompt === 'string'
    ) {
      console.log('improvePromptWizard: Получен промпт из ctx.scene.state')
      ctx.session.prompt = ctx.scene.state.prompt
    } else if (ctx.session.prompt) {
      console.log('improvePromptWizard: Промпт уже есть в ctx.session')
    } else {
      console.log(
        'improvePromptWizard: Промпт не найден ни в session, ни в state'
      )
    }

    const prompt = ctx.session.prompt

    console.log(prompt, 'prompt')

    if (!ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      return ctx.scene.leave()
    }

    ctx.session.attempts = 0 // Инициализируем счетчик попыток

    await sendPromptImprovementMessage(ctx, isRu)

    if (!prompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const improvedPrompt = await upgradePrompt(prompt)
    if (!improvedPrompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    ctx.session.prompt = improvedPrompt

    await ctx.reply(
      isRu
        ? 'Улучшенный промпт:\n```\n' + improvedPrompt + '\n```'
        : 'Improved prompt:\n```\n' + improvedPrompt + '\n```',
      {
        reply_markup: Markup.keyboard([
          [
            Markup.button.text(
              isRu ? '✅ Да. Cгенерировать?' : '✅ Yes. Generate?'
            ),
          ],
          [
            Markup.button.text(
              isRu ? '🔄 Еще раз улучшить' : '🔄 Improve again'
            ),
          ],
          [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')],
        ]).resize().reply_markup,
        parse_mode: 'MarkdownV2',
      }
    )

    return ctx.wizard.next()
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

    const improvedPrompt = message.text

    // Используем улучшенный промпт для генерации изображения
    if (!ctx.session.selectedModel) {
      logger.error(
        'Не найдена выбранная модель в сессии в improvePromptWizard',
        {
          telegramId: ctx.from.id,
        }
      )
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
        'Не удалось найти инстанс Telegraf для бота в improvePromptWizard',
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
      await ctx.reply(
        isRu
          ? `⏳ Генерирую изображение с улучшенным промптом...`
          : `⏳ Generating image with improved prompt...`
      )

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
          description: `Text to Image generation (Improved Prompt: ${modelAdapter})`,
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
        prompt: improvedPrompt, // Используем улучшенный промпт
        model_type: ctx.session.selectedModel, // Модель из сессии
        num_images: 1, // Генерируем одно изображение
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

      // Передаем найденный инстанс бота и другие зависимости
      await generateTextToImage(requestData, dependencies)
      // Результат (GenerationResult[]) не обрабатываем, т.к. generateTextToImage сама отправляет сообщение
    } catch (error) {
      logger.error('Ошибка при генерации изображения в improvePromptWizard:', {
        error,
      })
      await sendGenericErrorMessage(ctx, isRu)
    }

    return ctx.scene.leave()
  }
)

export default improvePromptWizard
