import { imageModelMenu } from './menu/imageModelMenu'
import { logger } from './utils/logger'
import { generateTextToImage } from './services/generateTextToImage'
import { isRussian } from './helpers/language'
import { MyContext } from './interfaces/'
import { Telegraf } from 'telegraf'

import { generateNeuroImage } from './services/generateNeuroImage'
import { handleSizeSelection } from './handlers'
import { levels, mainMenu } from './menu'
import { getReferalsCountAndUserData } from './core/supabase'
import { composer } from './bot'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'

composer.hears([levels[1].title_ru, levels[1].title_en], async ctx => {
  console.log('CASE: 🤖 Цифровое тело')
  ctx.session.mode = ModeEnum.DigitalAvatarBody
  await ctx.scene.enter('digitalAvatarBodyWizard')
})

composer.hears([levels[2].title_ru, levels[2].title_en], async ctx => {
  console.log('CASE hearsHandler: 📸 Нейрофото')
  ctx.session.mode = ModeEnum.NeuroPhoto
  await ctx.scene.enter(ModeEnum.NeuroPhoto)
})

composer.hears(['📸 Нейрофото 2', '📸 NeuroPhoto 2'], async ctx => {
  console.log('CASE hearsHandler: 📸 Нейрофото 2')
  ctx.session.mode = ModeEnum.NeuroPhoto
  await ctx.scene.enter('neuroPhotoWizard')
})

composer.hears([levels[3].title_ru, levels[3].title_en], async ctx => {
  console.log('CASE: 🔍 Промпт из фото')
  ctx.session.mode = ModeEnum.ImageToPrompt
  await ctx.scene.enter(ModeEnum.ImageToPrompt)
})

composer.hears([levels[4].title_ru, levels[4].title_en], async ctx => {
  console.log('CASE: 🧠 Мозг аватара')
  ctx.session.mode = ModeEnum.Avatar
  await ctx.scene.enter('avatarWizard')
})

composer.hears([levels[5].title_ru, levels[5].title_en], async ctx => {
  console.log('CASE: 💭 Чат с аватаром')
  ctx.session.mode = ModeEnum.ChatWithAvatar
  await ctx.scene.enter('chatWithAvatarWizard')
})

composer.hears([levels[6].title_ru, levels[6].title_en], async ctx => {
  console.log('CASE: 🤖 Выбор модели ИИ')
  ctx.session.mode = ModeEnum.SelectModel
  await ctx.scene.enter('selectModelWizard')
})

composer.hears([levels[7].title_ru, levels[7].title_en], async ctx => {
  console.log('CASE: 🎤 Голос аватара')
  ctx.session.mode = ModeEnum.Voice
  await ctx.scene.enter('voiceAvatarWizard')
})

composer.hears([levels[8].title_ru, levels[8].title_en], async ctx => {
  console.log('CASE: 🎙️ Текст в голос')
  ctx.session.mode = ModeEnum.TextToSpeech
  await ctx.scene.enter('textToSpeechWizard')
})

composer.hears([levels[9].title_ru, levels[9].title_en], async ctx => {
  console.log('CASE: 🎥 Фото в видео')
  ctx.session.mode = ModeEnum.ImageToVideo
  await ctx.scene.enter('imageToVideoWizard')
})

composer.hears([levels[10].title_ru, levels[10].title_en], async ctx => {
  console.log('CASE: 🎥 Видео из текста')
  ctx.session.mode = ModeEnum.TextToVideo
  await ctx.scene.enter('textToVideoWizard')
})

composer.hears([levels[11].title_ru, levels[11].title_en], async ctx => {
  console.log('CASE: 🖼️ Текст в фото')
  ctx.session.mode = ModeEnum.TextToImage
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
  await ctx.scene.enter('helpScene')
})

composer.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
  console.log('CASE: Пополнить баланс')
  ctx.session.mode = ModeEnum.TopUpBalance
  ctx.session.subscription = SubscriptionType.STARS
  await ctx.scene.enter('paymentScene')
})

composer.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
  console.log('CASE: Баланс')
  ctx.session.mode = ModeEnum.Balance
  await ctx.scene.enter('balanceScene')
})

composer.hears([levels[102].title_ru, levels[102].title_en], async ctx => {
  console.log('CASE: Пригласить друга')
  ctx.session.mode = ModeEnum.Invite
  await ctx.scene.enter('inviteScene')
})

composer.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('CASE: Главное меню')
  ctx.session.mode = ModeEnum.MainMenu
  await ctx.scene.enter('ModeEnum.SubscriptionScene')
})

composer.hears(
  ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
  async ctx => {
    console.log('CASE: Сгенерировать новое видео')
    const mode = ctx.session.mode
    console.log('mode', mode)
    if (mode === ModeEnum.TextToVideo) {
      await ctx.scene.enter('textToVideoWizard')
    } else if (mode === ModeEnum.ImageToVideo) {
      await ctx.scene.enter('imageToVideoWizard')
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
  const generate = async (num: number) => {
    if (ctx.session.mode === ModeEnum.NeuroPhoto) {
      await generateNeuroImage(
        prompt,
        ctx.session.userModel.model_url,
        num,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )
    } else {
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

  await ctx.scene.enter('improvePromptWizard')
})

composer.hears(['📐 Изменить размер', '📐 Change size'], async ctx => {
  console.log('CASE: Изменить размер')

  await ctx.scene.enter('sizeWizard')
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
  const { count, level, subscriptionType } = await getReferalsCountAndUserData(
    telegram_id
  )

  await mainMenu({
    isRu,
    inviteCount: count,
    subscription: subscriptionType,
    ctx,
    level,
  })
  return ctx.scene.leave()
})

composer.hears(['Справка по команде', 'Help for the command'], async ctx => {
  console.log('CASE: Справка по команде')
  await ctx.scene.enter('helpScene')
})

export const setupHearsHandlers = (bot: Telegraf<MyContext>) => {
  logger.info('Настройка обработчиков hears...')

  // Обработчик для "🏠 Главное меню"
  bot.hears(
    [levels[104].title_ru, levels[104].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для главного меню от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    }
  )

  // Обработчик для "🤖 Цифровое тело"
  bot.hears(
    [levels[1].title_ru, levels[1].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Цифровое тело от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter('digitalAvatarBodyWizard')
    }
  )

  // Обработчик для "📸 Нейрофото"
  bot.hears(
    [levels[2].title_ru, levels[2].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Нейрофото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter('neuroPhotoWizardV2')
    }
  )

  // Обработчик для "🤖 Цифровое тело 2" (только для админов)
  bot.hears(['🤖 Цифровое тело 2'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Цифровое тело 2 от ${ctx.from?.id}`)
    ctx.session.mode = ModeEnum.DigitalAvatarBody
    await ctx.scene.enter('digitalAvatarBodyWizard')
  })

  // Обработчик для "📸 Нейрофото 2" (только для админов)
  bot.hears(['📸 Нейрофото 2'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Нейрофото 2 от ${ctx.from?.id}`)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter('neuroPhotoWizard')
  })

  // Обработчик для "🔍 Промпт из фото"
  bot.hears(
    [levels[3].title_ru, levels[3].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Промпт из фото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.ImageToPrompt)
    }
  )

  // Обработчик для "🧠 Мозг аватара"
  bot.hears(
    [levels[4].title_ru, levels[4].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Мозг аватара от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter('avatarWizard')
    }
  )

  // Обработчик для "💭 Чат с аватаром"
  bot.hears(
    [levels[5].title_ru, levels[5].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Чат с аватаром от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter('chatWithAvatarWizard')
    }
  )

  // Обработчик для "🤖 Выбор модели ИИ"
  bot.hears(
    [levels[6].title_ru, levels[6].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Выбор модели ИИ от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.SelectModel
      await ctx.scene.enter('selectModelWizard')
    }
  )

  // Обработчик для "🎤 Голос аватара"
  bot.hears(
    [levels[7].title_ru, levels[7].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Голос аватара от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter('voiceAvatarWizard')
    }
  )

  // Обработчик для "🎙️ Текст в голос"
  bot.hears(
    [levels[8].title_ru, levels[8].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в голос от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter('textToSpeechWizard')
    }
  )

  // Обработчик для "🎥 Фото в видео"
  bot.hears(
    [levels[9].title_ru, levels[9].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Фото в видео от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter('imageToVideoWizard')
    }
  )

  // Обработчик для "🎥 Видео из текста"
  bot.hears(
    [levels[10].title_ru, levels[10].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Видео из текста от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter('textToVideoWizard')
    }
  )

  // Обработчик для "🖼️ Текст в фото"
  bot.hears(
    [levels[11].title_ru, levels[11].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в фото от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter('textToImageWizard')
    }
  )

  // Обработчик для "💫 Оформить подписку"
  bot.hears(
    [levels[0].title_ru, levels[0].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Оформить подписку от ${ctx.from?.id}`)
      await ctx.scene.enter('subscriptionScene')
    }
  )

  // Обработчик для "❓ Помощь"
  bot.hears(
    [levels[103].title_ru, levels[103].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Помощь от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter('helpScene')
    }
  )

  // Обработчик для "💎 Пополнить баланс"
  bot.hears(
    [levels[100].title_ru, levels[100].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пополнить баланс от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.TopUpBalance
      ctx.session.subscription = SubscriptionType.STARS
      await ctx.scene.enter('paymentScene')
    }
  )

  // Обработчик для "🤑 Баланс"
  bot.hears(
    [levels[101].title_ru, levels[101].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Баланс от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter('balanceScene')
    }
  )

  // Обработчик для "👥 Пригласить друга"
  bot.hears(
    [levels[102].title_ru, levels[102].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пригласить друга от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter('inviteScene')
    }
  )

  logger.info('Обработчики hears настроены.')
}
