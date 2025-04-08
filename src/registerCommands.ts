import { Telegraf, Scenes, session, Composer } from 'telegraf'
import { MyContext } from './interfaces'
import fetch from 'node-fetch'
import {
  handleTechSupport,
  getStatsCommand,
  priceCommand,
  glamaMcpCommand,
  httpRequestCommand,
} from './commands'
import { privateChat } from './middlewares/privateChat'

import {
  avatarBrainWizard,
  textToVideoWizard,
  broadcastWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  imageToPromptWizard,
  improvePromptWizard,
  sizeWizard,
  textToImageWizard,
  imageToVideoWizard,
  cancelPredictionsWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  selectModelWizard,
  voiceAvatarWizard,
  textToSpeechWizard,
  paymentScene,
  levelQuestWizard,
  neuroCoderScene,
  lipSyncWizard,
  startScene,
  chatWithAvatarWizard,
  helpScene,
  balanceScene,
  menuScene,
  subscriptionScene,
  inviteScene,
  getRuBillWizard,
  getEmailWizard,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  uploadVideoScene,
  selectModelScene,
  selectNeuroPhotoScene,
} from './scenes'
import { imageModelMenu } from './menu/imageModelMenu'

import { generateTextToImage } from './services/generateTextToImage'
import { isRussian } from './helpers/language'

import { generateNeuroImage } from './services/generateNeuroImage'

import { handleSizeSelection } from './handlers'
import { levels, mainMenu } from './menu'
import { getReferalsCountAndUserData } from './core/supabase'

import { setupLevelHandlers } from './handlers/setupLevelHandlers'

import { defaultSession } from './store'
import { getTrainingCancelUrl } from './core/supabase'

// import { handleTextMessage } from './handlers'

import { get100Command } from './commands/get100Command'
import { composer as inngestCommand } from './commands/inngest'

import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'

//https://github.com/telegraf/telegraf/issues/705
export const stage = new Scenes.Stage<MyContext>([
  startScene,
  subscriptionScene,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  chatWithAvatarWizard,
  menuScene,
  getEmailWizard,
  getRuBillWizard,
  balanceScene,
  avatarBrainWizard,
  imageToPromptWizard,
  textToImageWizard,
  improvePromptWizard,
  sizeWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  textToVideoWizard,
  imageToVideoWizard,
  cancelPredictionsWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  selectModelWizard,
  voiceAvatarWizard,
  textToSpeechWizard,
  paymentScene,
  neuroCoderScene,
  lipSyncWizard,
  helpScene,
  inviteScene,
  selectModelScene,
  selectNeuroPhotoScene,
  broadcastWizard,
  ...levelQuestWizard,
  uploadVideoScene,
])

export function registerCommands({
  bot,
  composer,
}: {
  bot: Telegraf<MyContext>
  composer: Composer<MyContext>
}) {
  bot.use(session({ defaultSession }))
  bot.use(stage.middleware())
  bot.use(composer.middleware())
  bot.use(privateChat)
  // bot.use(subscriptionMiddleware as Middleware<MyContext>)
  // composer.use(subscriptionMiddleware as Middleware<MyContext>)
  setupLevelHandlers(bot as Telegraf<MyContext>)

  // Добавляем команды для работы с Glama MCP
  bot.use(glamaMcpCommand.middleware())
  composer.use(glamaMcpCommand.middleware())

  // Добавляем команду для HTTP-запросов
  bot.use(httpRequestCommand.middleware())
  composer.use(httpRequestCommand.middleware())

  // Регистрация команд
  bot.command('start', async ctx => {
    logger.info('🚀 Команда start:', {
      description: 'Start command received',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  bot.command('stats', async ctx => {
    logger.info('📊 Команда stats:', {
      description: 'Stats command received',
      telegramId: ctx.from?.id,
    })
    await getStatsCommand(ctx)
  })

  composer.command('stats', async ctx => {
    logger.info('📊 Команда stats (composer):', {
      description: 'Stats command received (composer)',
      telegramId: ctx.from?.id,
    })
    await getStatsCommand(ctx)
  })

  bot.command('price', async ctx => {
    logger.info('💰 Команда price:', {
      description: 'Price command received',
      telegramId: ctx.from?.id,
    })
    await priceCommand(ctx)
  })

  composer.command('price', async ctx => {
    logger.info('💰 Команда price (composer):', {
      description: 'Price command received (composer)',
      telegramId: ctx.from?.id,
    })
    await priceCommand(ctx)
  })

  // Команда для запуска рассылки
  bot.command('broadcast', async ctx => {
    logger.info('📢 Команда broadcast:', {
      description: 'Broadcast command received',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.BroadcastWizard)
  })

  composer.command('broadcast', async ctx => {
    logger.info('📢 Команда broadcast (composer):', {
      description: 'Broadcast command received (composer)',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.BroadcastWizard)
  })

  bot.command('menu', async ctx => {
    logger.info('📋 Команда menu:', {
      description: 'Menu command received',
      telegramId: ctx.from?.id,
    })
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  composer.command('menu', async ctx => {
    logger.info('📋 Команда menu (composer):', {
      description: 'Menu command received (composer)',
      telegramId: ctx.from?.id,
    })
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  bot.command('tech', async ctx => {
    logger.info('🛠️ Команда tech:', {
      description: 'Tech command received',
      telegramId: ctx.from?.id,
    })
    await handleTechSupport(ctx)
  })

  bot.hears(['⬆️ Улучшить промпт', '⬆️ Improve prompt'], async ctx => {
    logger.info('⬆️ Улучшение промпта:', {
      description: 'Improve prompt requested',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
  })

  bot.hears(['📐 Изменить размер', '📐 Change size'], async ctx => {
    logger.info('📐 Изменение размера:', {
      description: 'Change size requested',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.SizeWizard)
  })

  composer.command('tech', async ctx => {
    logger.info('🛠️ Команда tech (composer):', {
      description: 'Tech command received (composer)',
      telegramId: ctx.from?.id,
    })
    await handleTechSupport(ctx)
  })

  composer.hears(/^(🛠 Техподдержка|🛠 Tech Support)$/i, handleTechSupport)

  composer.command('get100', async ctx => {
    logger.info('👥 Команда get100:', {
      description: 'Get100 command received',
      telegramId: ctx.from?.id,
    })
    await get100Command(ctx)
  })

  bot.command('buy', async ctx => {
    logger.info('💸 Команда buy:', {
      description: 'Buy command received',
      telegramId: ctx.from?.id,
    })
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.command('buy', async ctx => {
    logger.info('💸 Команда buy (composer):', {
      description: 'Buy command received (composer)',
      telegramId: ctx.from?.id,
    })
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.command('invite', async ctx => {
    logger.info('👥 Команда invite:', {
      description: 'Invite command received',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.InviteScene)
  })

  composer.command('balance', async ctx => {
    logger.info('💰 Команда balance:', {
      description: 'Balance command received',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.BalanceScene)
  })

  composer.command('help', async ctx => {
    await ctx.scene.enter('step0')
  })

  composer.command('neuro_coder', async ctx => {
    await ctx.scene.enter(ModeEnum.NeuroCoderScene)
  })

  composer.hears([levels[1].title_ru, levels[1].title_en], async ctx => {
    logger.info('🤖 Цифровое тело:', {
      description: 'Digital avatar body selected',
      level: levels[1].title_ru,
    })
    ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
    await ctx.scene.enter(ModeEnum.SelectModelWizard)
  })

  composer.hears([levels[2].title_ru, levels[2].title_en], async ctx => {
    logger.info('📸 Нейрофото:', {
      description: 'Neurophoto selected',
      level: levels[2].title_ru,
    })
    await ctx.scene.enter(ModeEnum.SelectNeuroPhoto)
  })

  composer.hears([levels[3].title_ru, levels[3].title_en], async ctx => {
    logger.info('🔍 Промпт из фото:', {
      description: 'Image to prompt selected',
      level: levels[3].title_ru,
    })
    ctx.session.mode = ModeEnum.ImageToPrompt
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[4].title_ru, levels[4].title_en], async ctx => {
    logger.info('🧠 Мозг аватара:', {
      description: 'Avatar brain selected',
      level: levels[4].title_ru,
    })
    ctx.session.mode = ModeEnum.Avatar
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[5].title_ru, levels[5].title_en], async ctx => {
    logger.info('💭 Чат с аватаром:', {
      description: 'Chat with avatar selected',
      level: levels[5].title_ru,
    })
    ctx.session.mode = ModeEnum.ChatWithAvatar
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[6].title_ru, levels[6].title_en], async ctx => {
    logger.info('🤖 Выбор модели ИИ:', {
      description: 'Select model selected',
      level: levels[6].title_ru,
    })
    ctx.session.mode = ModeEnum.SelectModelWizard
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[7].title_ru, levels[7].title_en], async ctx => {
    logger.info('🎤 Голос аватара:', {
      description: 'Voice selected',
      level: levels[7].title_ru,
    })
    ctx.session.mode = ModeEnum.Voice
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[8].title_ru, levels[8].title_en], async ctx => {
    logger.info('🎙️ Текст в голос:', {
      description: 'Text to speech selected',
      level: levels[8].title_ru,
    })
    ctx.session.mode = ModeEnum.TextToSpeech
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[9].title_ru, levels[9].title_en], async ctx => {
    logger.info('🎥 Фото в видео:', {
      description: 'Image to video selected',
      level: levels[9].title_ru,
    })
    ctx.session.mode = ModeEnum.ImageToVideo
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[10].title_ru, levels[10].title_en], async ctx => {
    logger.info('🎥 Видео из текста:', {
      description: 'Text to video selected',
      level: levels[10].title_ru,
    })
    ctx.session.mode = ModeEnum.TextToVideo
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[11].title_ru, levels[11].title_en], async ctx => {
    logger.info('🖼️ Текст в фото:', {
      description: 'Text to image selected',
      level: levels[11].title_ru,
    })
    ctx.session.mode = ModeEnum.TextToImage
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    await imageModelMenu(ctx)
  })

  // composer.hears([levels[12].title_ru, levels[12].title_en], async ctx => {
  //   console.log('CASE: Синхронизация губ')
  //   ctx.session.mode = 'lip_sync'
  //   await ctx.scene.enter('checkBalanceScene')
  // })

  // composer.hears([levels[13].title_ru, levels[13].title_en], async ctx => {
  //   console.log('CASE: Видео в URL')
  //   ctx.session.mode = 'video_in_url'
  //   await ctx.scene.enter('uploadVideoScene')
  // })

  composer.hears(['❓ Помощь', '❓ Help'], async ctx => {
    logger.info('❓ Помощь:', {
      description: 'Help requested',
      telegramId: ctx.from?.id,
    })
    ctx.session.mode = ModeEnum.Help
    await ctx.scene.enter(ModeEnum.HelpScene)
  })

  composer.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
    logger.info('💸 Пополнить баланс:', {
      description: 'Top up balance requested',
      level: levels[100].title_ru,
    })
    ctx.session.mode = ModeEnum.TopUpBalance
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
    logger.info('💰 Баланс:', {
      description: 'Balance requested',
      level: levels[101].title_ru,
    })
    ctx.session.mode = ModeEnum.Balance
    await ctx.scene.enter(ModeEnum.BalanceScene)
  })

  composer.hears([levels[102].title_ru, levels[102].title_en], async ctx => {
    logger.info('👥 Пригласить друга:', {
      description: 'Invite friend requested',
      level: levels[102].title_ru,
    })
    ctx.session.mode = ModeEnum.Invite
    await ctx.scene.enter(ModeEnum.InviteScene)
  })

  composer.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
    logger.info('🏠 Главное меню:', {
      description: 'Main menu requested',
      telegramId: ctx.from?.id,
    })
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.MainMenu)
  })

  composer.hears(
    [levels[104].title_ru, levels[104].title_en],
    handleTechSupport
  )

  bot.hears(['/get100'], async ctx => {
    logger.info('/get100:', {
      description: 'Get100 command received',
      telegramId: ctx.from?.id,
    })
    await get100Command(ctx)
  })

  composer.hears(
    ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
    async ctx => {
      logger.info('🎥 Сгенерировать новое видео:', {
        description: 'Generate new video requested',
        telegramId: ctx.from?.id,
      })
      const mode = ctx.session.mode
      logger.info('mode:', { mode })
      if (mode === ModeEnum.TextToVideo) {
        await ctx.scene.enter(ModeEnum.TextToVideo)
      } else if (mode === ModeEnum.ImageToVideo) {
        await ctx.scene.enter(ModeEnum.ImageToVideo)
      } else {
        await ctx.reply(
          isRussian(ctx)
            ? 'Вы не можете сгенерировать новое видео в этом режиме'
            : 'You cannot generate a new video in this mode'
        )
      }
    }
  )

  composer.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async ctx => {
    const text = ctx.message.text
    logger.info(`CASE: Нажата кнопка ${text}:`, {
      description: 'Button pressed',
      text: text,
      telegramId: ctx.from?.id,
    })
    const isRu = isRussian(ctx)
    const prompt = ctx.session.prompt
    const userId = ctx.from.id
    const numImages = parseInt(text[0])

    logger.info('ctx.session.mode:', { mode: ctx.session.mode })
    logger.info('ctx.session.prompt:', { prompt })
    logger.info('ctx.session.userModel:', { userModel: ctx.session.userModel })
    logger.info('ctx.session.selectedModel:', {
      selectedModel: ctx.session.selectedModel,
    })

    // Проверяем наличие необходимых данных
    if (!prompt) {
      await ctx.reply(
        isRu
          ? '⚠️ Ошибка: промпт отсутствует. Пожалуйста, начните сначала.'
          : '⚠️ Error: prompt is missing. Please start over.'
      )
      return
    }

    const generate = async (num: number) => {
      if (ctx.session.mode === ModeEnum.NeuroPhoto) {
        if (!ctx.session.userModel?.model_url) {
          await ctx.reply(
            isRu
              ? '⚠️ Ошибка: модель не выбрана. Пожалуйста, начните сначала.'
              : '⚠️ Error: model not selected. Please start over.'
          )
          return
        }

        await generateNeuroImage(
          prompt,
          ctx.session.userModel.model_url,
          num,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )
      } else {
        if (!ctx.session.selectedModel) {
          await ctx.reply(
            isRu
              ? '⚠️ Ошибка: модель не выбрана. Пожалуйста, начните сначала.'
              : '⚠️ Error: model not selected. Please start over.'
          )
          return
        }

        logger.info('Вызов generateTextToImage с параметрами:', {
          prompt,
          model: ctx.session.selectedModel,
          numImages: num,
          userId: userId.toString(),
          isRu,
          botName: ctx.botInfo?.username,
        })

        await generateTextToImage(
          prompt,
          ctx.session.selectedModel || '',
          num,
          userId.toString(),
          isRu,
          ctx,
          ctx.botInfo?.username
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      await ctx.reply('Неизвестная кнопка')
    }
  })

  bot.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async ctx => {
    const text = ctx.message.text
    logger.info(`CASE: Нажата кнопка ${text}:`, {
      description: 'Button pressed',
      text: text,
      telegramId: ctx.from?.id,
    })
    const isRu = isRussian(ctx)
    const prompt = ctx.session.prompt
    const userId = ctx.from.id
    const numImages = parseInt(text[0])

    logger.info('ctx.session.mode:', { mode: ctx.session.mode })
    logger.info('ctx.session.prompt:', { prompt })
    logger.info('ctx.session.userModel:', { userModel: ctx.session.userModel })
    logger.info('ctx.session.selectedModel:', {
      selectedModel: ctx.session.selectedModel,
    })

    // Проверяем наличие необходимых данных
    if (!prompt) {
      await ctx.reply(
        isRu
          ? '⚠️ Ошибка: промпт отсутствует. Пожалуйста, начните сначала.'
          : '⚠️ Error: prompt is missing. Please start over.'
      )
      return
    }

    const generate = async (num: number) => {
      if (ctx.session.mode === ModeEnum.NeuroPhoto) {
        if (!ctx.session.userModel?.model_url) {
          await ctx.reply(
            isRu
              ? '⚠️ Ошибка: модель не выбрана. Пожалуйста, начните сначала.'
              : '⚠️ Error: model not selected. Please start over.'
          )
          return
        }

        await generateNeuroImage(
          prompt,
          ctx.session.userModel.model_url,
          num,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )
      } else {
        if (!ctx.session.selectedModel) {
          await ctx.reply(
            isRu
              ? '⚠️ Ошибка: модель не выбрана. Пожалуйста, начните сначала.'
              : '⚠️ Error: model not selected. Please start over.'
          )
          return
        }

        logger.info('Вызов generateTextToImage с параметрами:', {
          prompt,
          model: ctx.session.selectedModel,
          numImages: num,
          userId: userId.toString(),
          isRu,
          botName: ctx.botInfo?.username,
        })

        await generateTextToImage(
          prompt,
          ctx.session.selectedModel || '',
          num,
          userId.toString(),
          isRu,
          ctx,
          ctx.botInfo?.username
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      await ctx.reply('Неизвестная кнопка')
    }
  })

  composer.hears(['⬆️ Улучшить промпт', '⬆️ Improve prompt'], async ctx => {
    logger.info('⬆️ Улучшение промпта:', {
      description: 'Improve prompt requested',
      telegramId: ctx.from?.id,
    })

    await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
  })

  composer.hears(['📐 Изменить размер', '📐 Change size'], async ctx => {
    logger.info('📐 Изменение размера:', {
      description: 'Change size requested',
      telegramId: ctx.from?.id,
    })

    await ctx.scene.enter(ModeEnum.SizeWizard)
  })

  composer.hears(
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
    async ctx => {
      logger.info('📐 Изменение размера:', {
        description: 'Change size requested',
        telegramId: ctx.from?.id,
      })
      const size = ctx.message.text
      await handleSizeSelection(ctx, size)
    }
  )

  composer.hears(/^(Отмена|отмена|Cancel|cancel)$/i, async ctx => {
    logger.info('Отмена:', {
      description: 'Cancel requested',
      telegramId: ctx.from?.id,
    })
    const isRu = isRussian(ctx)
    const telegram_id = ctx.from?.id?.toString() || ''
    const { count, subscription, level } =
      await getReferalsCountAndUserData(telegram_id)
    if (!subscription) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке вашего профиля 😔'
          : 'An error occurred while processing your profile 😔'
      )
      return ctx.scene.leave()
    }
    await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
    return ctx.scene.leave()
  })

  composer.hears(['Справка по команде', 'Help for the command'], async ctx => {
    logger.info('Справка по команде:', {
      description: 'Help for the command requested',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.enter(ModeEnum.HelpScene)
  })

  bot.action(/^cancel_train:(.+)$/, async ctx => {
    const trainingId = ctx.match[1]

    try {
      // Получаем URL отмены из кэша/хранилища
      const cancelUrl = await getTrainingCancelUrl(trainingId)

      if (!cancelUrl) {
        await ctx.answerCbQuery(
          '❌ Невозможно отменить: информация об отмене недоступна'
        )
        return
      }

      // Отправляем запрос на отмену
      const response = await fetch(cancelUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        },
      })

      if (response.ok) {
        // Обновляем сообщение (заменяем кнопку)
        await ctx.editMessageText('🛑 Тренировка отменена по вашему запросу.', {
          reply_markup: { inline_keyboard: [] }, // Правильный формат - пустой массив кнопок
        })
        await ctx.answerCbQuery('✅ Тренировка успешно отменена')
      } else {
        await ctx.answerCbQuery('❌ Не удалось отменить тренировку')
      }
    } catch (error) {
      logger.error('❌ Ошибка отмены:', {
        description: 'Error cancelling training',
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.answerCbQuery('❌ Ошибка при отмене тренировки')
    }
  })

  composer.action(/^cancel_train:(.+)$/, async ctx => {
    const trainingId = ctx.match[1]

    try {
      // Получаем URL отмены из кэша/хранилища
      const cancelUrl = await getTrainingCancelUrl(trainingId)

      if (!cancelUrl) {
        await ctx.answerCbQuery(
          '❌ Невозможно отменить: информация об отмене недоступна'
        )
        return
      }

      // Отправляем запрос на отмену
      const response = await fetch(cancelUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        },
      })

      if (response.ok) {
        // Обновляем сообщение (заменяем кнопку)
        await ctx.editMessageText('🛑 Тренировка отменена по вашему запросу.', {
          reply_markup: { inline_keyboard: [] }, // Правильный формат - пустой массив кнопок
        })
        await ctx.answerCbQuery('✅ Тренировка успешно отменена')
      } else {
        await ctx.answerCbQuery('❌ Не удалось отменить тренировку')
      }
    } catch (error) {
      logger.error('❌ Ошибка отмены:', {
        description: 'Error cancelling training',
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.answerCbQuery('❌ Ошибка при отмене тренировки')
    }
  })

  // myComposer.on('text', (ctx: MyContext) => {
  //   console.log('CASE: text')
  //   handleTextMessage(ctx)
  // })

  composer.use(inngestCommand)
  bot.use(inngestCommand)
}
