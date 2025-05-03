import { imageModelMenu } from './menu/imageModelMenu'
import { logger } from './utils/logger'
import { generateTextToImage } from '@/modules/generateTextToImage'
import { isRussian } from './helpers/language'
import { MyContext } from './interfaces/'
import { Telegraf, Context, Markup, NarrowedContext } from 'telegraf'

import { generateNeuroImage } from './services/generateNeuroImage'
import { handleSizeSelection } from './handlers'
import { levels, mainMenu } from './menu'
import { getReferalsCountAndUserData } from './core/supabase'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { handleRestartVideoGeneration } from './handlers/handleVideoRestart'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { bots } from '@/bot'
import { supabase } from '@/core/supabase'
import { replicate } from '@/core/replicate'
import fs from 'fs'
import path from 'path'
import { processServiceBalanceOperation as processBalance } from '@/price/helpers'
import { savePromptDirect as saveImagePrompt } from '@/core/supabase'
import { saveFileLocally as saveImageLocally } from '@/helpers/saveFileLocally'
import { getAspectRatio } from '@/core/supabase/getAspectRatio'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'
import { calculateFinalStarPrice } from '@/price/calculator'

// FIXME: Найти или создать processImageApiResponse
const processImageApiResponse = async (output: any): Promise<string> => {
  console.warn('Dummy processImageApiResponse used')
  return Array.isArray(output) ? output[0] : String(output)
}

export const setupHearsHandlers = (bot: Telegraf<MyContext>) => {
  logger.info('Настройка обработчиков hears...')

  bot.hears(
    [levels[1].title_ru, levels[1].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Цифровое тело от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter('digitalAvatarBodyWizard')
    }
  )

  bot.hears(
    [levels[2].title_ru, levels[2].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Нейрофото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter('neuroPhotoWizardV2')
    }
  )

  bot.hears(['📸 Нейрофото 2', '📸 NeuroPhoto 2'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Нейрофото 2 от ${ctx.from?.id}`)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter('neuroPhotoWizard')
  })

  bot.hears(
    [levels[3].title_ru, levels[3].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Промпт из фото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.ImageToPrompt)
    }
  )

  bot.hears(
    [levels[4].title_ru, levels[4].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Мозг аватара от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter('avatarWizard')
    }
  )

  bot.hears(
    [levels[5].title_ru, levels[5].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Чат с аватаром от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter('chatWithAvatarWizard')
    }
  )

  bot.hears(
    [levels[6].title_ru, levels[6].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Выбор модели ИИ от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.SelectModel
      await ctx.scene.enter('selectModelWizard')
    }
  )

  bot.hears(
    [levels[7].title_ru, levels[7].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Голос аватара от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter('voiceAvatarWizard')
    }
  )

  bot.hears(
    [levels[8].title_ru, levels[8].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в голос от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter('textToSpeechWizard')
    }
  )

  bot.hears(
    [levels[9].title_ru, levels[9].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Фото в видео от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter('imageToVideoWizard')
    }
  )

  bot.hears(
    [levels[10].title_ru, levels[10].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Видео из текста от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter('textToVideoWizard')
    }
  )

  bot.hears(
    [levels[11].title_ru, levels[11].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в фото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter('textToImageWizard')
    }
  )

  bot.hears(
    ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
    async (ctx: MyContext) => {
      await handleRestartVideoGeneration(ctx)
    }
  )

  bot.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async (ctx: MyContext) => {
    if (!('text' in ctx.message)) {
      logger.warn('Получено нетекстовое сообщение для числового hears')
      return
    }
    const text = ctx.message.text
    logger.debug(`Получен hears для кнопки ${text} от ${ctx.from?.id}`)
    const isRu = isRussian(ctx)
    const prompt = ctx.session.prompt
    const telegramId = ctx.from.id
    const numImages = parseInt(text[0])

    const { profile, settings } = await getUserProfileAndSettings(telegramId)

    if (!profile || !settings) {
      logger.error(
        'Не удалось получить профиль или настройки для hears handler',
        { telegramId }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось получить данные пользователя.'
          : 'Error: Could not retrieve user data.'
      )
      return
    }

    if (!prompt) {
      logger.error('Промпт отсутствует в сессии для hears handler', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? 'Ошибка: Не найден текст для генерации. Попробуйте снова.'
          : 'Error: Prompt not found. Please try again.'
      )
      return
    }

    const generate = async (num: number) => {
      if (ctx.session.mode === ModeEnum.NeuroPhotoV2) {
        await generateNeuroImage(
          prompt,
          ctx.session.userModel.model_url,
          num,
          telegramId.toString(),
          ctx,
          ctx.botInfo?.username
        )
      } else {
        const currentBotName = ctx.botInfo?.username
        const currentBotInstance = bots.find(
          b => b.context.botName === currentBotName
        )

        if (!currentBotInstance) {
          logger.error(
            'Не удалось найти инстанс Telegraf для бота в hearsHandlers (1-4)',
            {
              botName: currentBotName,
              telegramId: ctx.from?.id,
            }
          )
          await ctx.reply(
            isRu
              ? 'Ошибка: Не удалось инициализировать бота.'
              : 'Error: Could not initialize the bot.'
          )
          return
        }

        const requestData = {
          prompt,
          model_type: settings.imageModel,
          num_images: num,
          telegram_id: telegramId.toString(),
          username: ctx.from?.username || 'UnknownUser',
          is_ru: isRu,
        }

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
            bot: currentBotInstance,
            bot_name: ctxAdapter.botInfo.username,
            description: `Text to Image generation (${modelAdapter})`,
            service_type: ModeEnum.TextToImage,
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
            ModeEnum.TextToImage, // Указываем правильный режим
            imageLocalUrlAdapter,
            telegramIdAdapter.toString(), // Преобразуем ID в строку
            'completed' // Пример статуса
          )
          return promptId ?? -1 // Возвращаем ID или -1 в случае ошибки
        }
        // --- Адаптер для saveImagePrompt --- END

        const dependencies = {
          logger,
          supabase,
          replicate,
          telegram: currentBotInstance.telegram,
          fsCreateReadStream: fs.createReadStream,
          pathBasename: path.basename,
          processBalance: tempProcessBalanceAdapter,
          processImageApiResponse: processImageApiResponse,
          saveImagePrompt: tempSaveImagePromptAdapter,
          saveImageLocally: saveImageLocally,
          getAspectRatio: getAspectRatio,
          sendErrorToUser: sendServiceErrorToUser,
          sendErrorToAdmin: sendServiceErrorToAdmin,
          imageModelsConfig: IMAGES_MODELS,
        }

        await generateTextToImage(requestData, dependencies)
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      await ctx.reply('Неизвестная кнопка')
    }
  })

  bot.hears(
    ['⬆️ Улучшить промпт', '⬆️ Improve prompt'],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Улучшить промпт от ${ctx.from?.id}`)
      await ctx.scene.enter('improvePromptWizard')
    }
  )

  bot.hears(
    ['📐 Изменить размер', '📐 Change size'],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Изменить размер от ${ctx.from?.id}`)
      await ctx.scene.enter('sizeWizard')
    }
  )

  bot.hears(
    [
      '21:9',
      '16:9',
      '3:2',
      '4:3',
      '5:4',
      '1:1',
      '4:5',
      '3:4',
      '2:3',
      '9:16',
      '9:21',
    ],
    async (ctx: MyContext) => {
      if (!('text' in ctx.message)) {
        logger.warn(
          'Получено нетекстовое сообщение для hears изменения размера'
        )
        return
      }
      const size = ctx.message.text
      logger.debug(
        `Получен hears для изменения размера на ${size} от ${ctx.from?.id}`
      )
      await handleSizeSelection(ctx, size)
    }
  )

  bot.hears(/^(Отмена|отмена|Cancel|cancel)$/i, async (ctx: MyContext) => {
    logger.debug(`Получен hears для Отмена от ${ctx.from?.id}`)
    const isRu = isRussian(ctx)
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscriptionType } = await getReferalsCountAndUserData(telegram_id)

    await mainMenu({
      isRu,
      subscription: subscriptionType,
      ctx,
    })
    await ctx.scene.leave()
  })

  bot.hears(
    [levels[103].title_ru, levels[103].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Помощь от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter('helpScene')
    }
  )

  bot.hears(
    [levels[100].title_ru, levels[100].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пополнить баланс от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TopUpBalance
      ctx.session.subscription = SubscriptionType.STARS
      await ctx.scene.enter(ModeEnum.PaymentScene)
    }
  )

  bot.hears(
    [levels[101].title_ru, levels[101].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Баланс от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter('balanceScene')
    }
  )

  bot.hears(
    [levels[102].title_ru, levels[102].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пригласить друга от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter('inviteScene')
    }
  )

  bot.hears(
    [levels[104].title_ru, levels[104].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Помощь от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter('helpScene')
    }
  )
}
