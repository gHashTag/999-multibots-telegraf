import { Telegraf, Scenes, session, Composer } from 'telegraf'
import { MyContext } from './interfaces'
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
import fetch from 'node-fetch'
// import { handleTextMessage } from './handlers'

import { get100Command } from './commands/get100Command'
import { composer as inngestCommand } from './commands/inngest'

import { ModeEnum } from '@/price/helpers/modelsCost'

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
    console.log('CASE bot.command: start')
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  bot.command('stats', async ctx => {
    console.log('CASE bot.command: stats')
    await getStatsCommand(ctx)
  })

  composer.command('stats', async ctx => {
    console.log('CASE composer.command: stats')
    await getStatsCommand(ctx)
  })

  bot.command('price', async ctx => {
    console.log('CASE bot.command: price')
    await priceCommand(ctx)
  })

  composer.command('price', async ctx => {
    await priceCommand(ctx)
  })

  // Команда для запуска рассылки
  bot.command('broadcast', async ctx => {
    console.log('CASE bot.command: broadcast')
    await ctx.scene.enter(ModeEnum.BroadcastWizard)
  })

  composer.command('broadcast', async ctx => {
    console.log('CASE bot.command: broadcast')
    await ctx.scene.enter(ModeEnum.BroadcastWizard)
  })

  bot.command('menu', async ctx => {
    console.log('CASE bot.command: menu')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  composer.command('menu', async ctx => {
    console.log('CASE: myComposer.command menu')
    // ctx.session = defaultSession()
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  })

  bot.command('tech', async ctx => {
    console.log('CASE bot.command: tech')
    await handleTechSupport(ctx)
  })

  bot.hears(['⬆️ Улучшить промпт', '⬆️ Improve prompt'], async ctx => {
    console.log('CASE: Улучшить промпт')
    // ctx.session.mode = ModeEnum.ImprovePrompt
    await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
  })

  bot.hears(['📐 Изменить размер', '📐 Change size'], async ctx => {
    console.log('CASE: Изменить размер')
    // ctx.session.mode = ModeEnum.ChangeSize
    await ctx.scene.enter(ModeEnum.SizeWizard)
  })

  composer.command('tech', async ctx => {
    console.log('CASE bot.command: tech')
    await handleTechSupport(ctx)
  })

  composer.hears(/^(🛠 Техподдержка|🛠 Tech Support)$/i, handleTechSupport)

  composer.command('get100', async ctx => {
    console.log('CASE: get100')
    await get100Command(ctx)
  })

  bot.command('buy', async ctx => {
    console.log('CASE: buy')
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.command('buy', async ctx => {
    console.log('CASE: buy')
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.command('invite', async ctx => {
    console.log('CASE: invite')
    await ctx.scene.enter(ModeEnum.InviteScene)
  })

  composer.command('balance', async ctx => {
    console.log('CASE: balance')
    await ctx.scene.enter(ModeEnum.BalanceScene)
  })

  composer.command('help', async ctx => {
    await ctx.scene.enter('step0')
  })

  composer.command('neuro_coder', async ctx => {
    await ctx.scene.enter(ModeEnum.NeuroCoderScene)
  })

  composer.hears([levels[1].title_ru, levels[1].title_en], async ctx => {
    console.log('CASE: 🤖 Цифровое тело')
    ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
    await ctx.scene.enter(ModeEnum.SelectModelWizard)
  })

  composer.hears([levels[2].title_ru, levels[2].title_en], async ctx => {
    console.log('CASE hearsHandler: 📸 Нейрофото')
    await ctx.scene.enter(ModeEnum.SelectNeuroPhoto)
  })

  composer.hears([levels[3].title_ru, levels[3].title_en], async ctx => {
    console.log('CASE: 🔍 Промпт из фото')
    ctx.session.mode = ModeEnum.ImageToPrompt
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[4].title_ru, levels[4].title_en], async ctx => {
    console.log('CASE: 🧠 Мозг аватара')
    ctx.session.mode = ModeEnum.Avatar
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[5].title_ru, levels[5].title_en], async ctx => {
    console.log('CASE: 💭 Чат с аватаром')
    ctx.session.mode = ModeEnum.ChatWithAvatar
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[6].title_ru, levels[6].title_en], async ctx => {
    console.log('CASE: 🤖 Выбор модели ИИ')
    ctx.session.mode = ModeEnum.SelectModelWizard
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[7].title_ru, levels[7].title_en], async ctx => {
    console.log('CASE: 🎤 Голос аватара')
    ctx.session.mode = ModeEnum.Voice
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[8].title_ru, levels[8].title_en], async ctx => {
    console.log('CASE: 🎙️ Текст в голос')
    ctx.session.mode = ModeEnum.TextToSpeech
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[9].title_ru, levels[9].title_en], async ctx => {
    console.log('CASE: 🎥 Фото в видео')
    ctx.session.mode = ModeEnum.ImageToVideo
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[10].title_ru, levels[10].title_en], async ctx => {
    console.log('CASE: 🎥 Видео из текста')
    ctx.session.mode = ModeEnum.TextToVideo
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  composer.hears([levels[11].title_ru, levels[11].title_en], async ctx => {
    console.log('CASE: 🖼️ Текст в фото')
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
    console.log('CASE: Помощь')
    ctx.session.mode = ModeEnum.Help
    await ctx.scene.enter(ModeEnum.HelpScene)
  })

  composer.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
    console.log('CASE: Пополнить баланс')
    ctx.session.mode = ModeEnum.TopUpBalance
    ctx.session.subscription = 'stars'
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  composer.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
    console.log('CASE: Баланс')
    ctx.session.mode = ModeEnum.Balance
    await ctx.scene.enter(ModeEnum.BalanceScene)
  })

  composer.hears([levels[102].title_ru, levels[102].title_en], async ctx => {
    console.log('CASE: Пригласить друга')
    ctx.session.mode = ModeEnum.Invite
    await ctx.scene.enter(ModeEnum.InviteScene)
  })

  composer.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
    console.log('CASE: Главное меню')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.MainMenu)
  })

  composer.hears(
    [levels[104].title_ru, levels[104].title_en],
    handleTechSupport
  )

  bot.hears(['/get100'], async ctx => {
    console.log('CASE: get100')
    await get100Command(ctx)
  })

  composer.hears(
    ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
    async ctx => {
      console.log('CASE: Сгенерировать новое видео')
      const mode = ctx.session.mode
      console.log('mode', mode)
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
    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = isRussian(ctx)
    const prompt = ctx.session.prompt
    const userId = ctx.from.id
    const numImages = parseInt(text[0])

    console.log('ctx.session.mode', ctx.session.mode)
    console.log('ctx.session.prompt', ctx.session.prompt)
    console.log('ctx.session.userModel', ctx.session.userModel)
    console.log('ctx.session.selectedModel', ctx.session.selectedModel)

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

        console.log('Вызов generateTextToImage с параметрами:', {
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
    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = isRussian(ctx)
    const prompt = ctx.session.prompt
    const userId = ctx.from.id
    const numImages = parseInt(text[0])

    console.log('ctx.session.mode', ctx.session.mode)
    console.log('ctx.session.prompt', ctx.session.prompt)
    console.log('ctx.session.userModel', ctx.session.userModel)
    console.log('ctx.session.selectedModel', ctx.session.selectedModel)

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

        console.log('Вызов generateTextToImage с параметрами:', {
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
    console.log('CASE: Улучшить промпт')

    await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
  })

  composer.hears(['📐 Изменить размер', '📐 Change size'], async ctx => {
    console.log('CASE: Изменить размер')

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
      console.log('CASE: Изменить размер')
      const size = ctx.message.text
      await handleSizeSelection(ctx, size)
    }
  )

  composer.hears(/^(Отмена|отмена|Cancel|cancel)$/i, async ctx => {
    console.log('CASE: Отмена')
    const isRu = isRussian(ctx)
    const telegram_id = ctx.from?.id?.toString() || ''
    const { count, subscription, level } = await getReferalsCountAndUserData(
      telegram_id
    )
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
    console.log('CASE: Справка по команде')
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
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
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
      console.error('❌ Ошибка отмены:', error)
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
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
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
      console.error('❌ Ошибка отмены:', error)
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
