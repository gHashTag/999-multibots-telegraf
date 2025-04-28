import { imageModelMenu } from './menu/imageModelMenu'
import { logger } from './utils/logger'
import { generateTextToImage } from './services/generateTextToImage'
import { isRussian } from './helpers/language'
import { MyContext } from './interfaces/'
import { Telegraf, Context } from 'telegraf'

import { generateNeuroImage } from './services/generateNeuroImage'
import { handleSizeSelection } from './handlers'
import { levels, mainMenu } from './menu'
import { getReferalsCountAndUserData } from './core/supabase'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { handleRestartVideoGeneration } from './handlers/handleVideoRestart'
import { getUserProfileAndSettings } from '@/db/userSettings'

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
        await generateTextToImage(
          prompt,
          settings.imageModel,
          numImages,
          telegramId.toString(),
          isRu,
          ctx,
          ctx.botInfo?.username || 'unknown_bot'
        )
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
      ctx.session.mode = ModeEnum.HelpScene
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
      ctx.session.mode = ModeEnum.HelpScene
      await ctx.scene.enter('helpScene')
    }
  )

  bot.hears([isRu ? '💬 Техподдержка' : '💬 Support'], async ctx => {
    logger.info('Обработчик Техподдержка')
    ctx.session.mode = ModeEnum.HelpScene
    await ctx.scene.enter('helpScene')
  })

  bot.hears([isRu ? '❓ Помощь' : '❓ Help'], async ctx => {
    logger.info('Обработчик Помощь')
    ctx.session.mode = ModeEnum.HelpScene
    await ctx.scene.enter('helpScene')
  })
}
