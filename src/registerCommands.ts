import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { message, callbackQuery } from 'telegraf/filters'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
import { getUserDetailsSubscription } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from './handlers/getUserInfo'
// Импортируем новую функцию
import { handleRestartVideoGeneration } from './handlers/handleVideoRestart'
import { sendMediaToPulse } from './helpers/pulse'
// Импортируем обработчик команды hello_world
import { handleHelloWorld } from './commands/handleHelloWorld'
import { priceCommand } from './commands/priceCommand'
import { checkSubscriptionGuard } from './helpers/subscriptionGuard'
import { setupInteractiveStats } from './commands/interactiveStatsCommand'
// Импортируем админские команды
import {
  handleAddBalanceCommand,
  handleCheckBalanceCommand,
} from './handlers/adminCommands'
// Импортируем команду анализа расходов
import expenseAnalysisCommand from './commands/expenseAnalysisCommand'
// Импортируем FLUX Kontext команду
import { handleFluxKontextCommand } from './commands/fluxKontextCommand'

// Возвращаем импорт всех сцен через index
import {
  avatarBrainWizard,
  textToVideoWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  imageToPromptWizard,
  imageUpscalerWizard,
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
  rublePaymentScene,
  starPaymentScene,
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
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  uploadVideoScene,
  videoTranscriptionWizard,
  fluxKontextScene,
} from './scenes'

import { defaultSession } from './store'
//
import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
import { handleBuy } from './handlers/handleBuy'
import { isRussian } from '@/helpers/language'
import { registerPaymentActions } from './handlers/paymentActions'
import { handleTextMessage } from './handlers/handleTextMessage'
// Убираем импорт handleMenu, так как он не используется здесь напрямую
// import { handleMenu } from './handlers/handleMenu'
//https://github.com/telegraf/telegraf/issues/705
export const stage = new Scenes.Stage<MyContext>([
  startScene,
  menuScene,
  helpScene,
  inviteScene,
  paymentScene,
  rublePaymentScene,
  starPaymentScene,
  subscriptionScene,
  subscriptionCheckScene,
  checkBalanceScene,
  balanceScene,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  textToImageWizard,
  textToVideoWizard,
  imageToVideoWizard,
  imageToPromptWizard,
  imageUpscalerWizard,
  improvePromptWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  uploadVideoScene,
  sizeWizard,
  fluxKontextScene,
  new Scenes.WizardScene(ModeEnum.Voice, ...(voiceAvatarWizard.steps as any)),
  new Scenes.WizardScene(
    ModeEnum.TextToSpeech,
    ...(textToSpeechWizard.steps as any)
  ),
  new Scenes.WizardScene(
    ModeEnum.VideoTranscription,
    ...(videoTranscriptionWizard.steps as any)
  ),
  lipSyncWizard,
  new Scenes.WizardScene(ModeEnum.Avatar, ...(avatarBrainWizard.steps as any)),
  new Scenes.WizardScene(
    ModeEnum.ChatWithAvatar,
    ...(chatWithAvatarWizard.steps as any)
  ),
  selectModelWizard,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  getRuBillWizard,
  levelQuestWizard,
  createUserScene,
  neuroCoderScene,
])

// Function to send the promotional message
const sendGroupCommandReply = async (ctx: MyContext) => {
  try {
    const botUsername = ctx.botInfo.username
    const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨\n\nЯ часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}\n\n*Ом Шанти!* 🙏`
    await ctx.reply(message)
  } catch (e) {
    logger.error(
      `Error replying to command in group for ${ctx.botInfo?.username || 'unknown bot'}:`,
      {
        error: e instanceof Error ? e.message : String(e),
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
      }
    )
    // console.error(`Error replying to command in group for ${ctx.botInfo?.username}:`, e); // Fallback if logger fails
  }
}

export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  // 1. Логгер для ВСЕХ входящих обновлений
  bot.use((ctx, next) => {
    logger.info('>>> RAW UPDATE RECEIVED', {
      updateId: ctx.update.update_id,
      updateType: ctx.updateType,
      // Безопасный доступ к текстовым полям
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined,
      callbackData:
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? ctx.callbackQuery.data
          : undefined,
      // Безопасный доступ к информации о сцене
      sceneInfo: ctx.scene?.current?.id,
    })
    return next()
  })

  // 3. Middleware сцен (ДОЛЖЕН БЫТЬ ПОСЛЕ СЕССИИ - сессия теперь регистрируется в bot.ts)
  bot.use(stage.middleware())

  // 4. РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПЛАТЕЖЕЙ
  registerPaymentActions(bot)

  // 6. --- РЕГИСТРАЦИЯ ГЛОБАЛЬНЫХ КОМАНД ---
  // Команды должны быть зарегистрированы здесь, до hears и общего on('text')

  bot.command('start', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }
    console.log('CASE bot.command: start')
    // При старте всегда сбрасываем сессию и входим в createUserScene
    ctx.session = { ...defaultSession }
    await ctx.scene.leave() // Явно выходим из любой сцены
    await ctx.scene.enter(ModeEnum.CreateUserScene)
  })

  bot.command('get100', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед выдачей бонуса
    const hasSubscription = await checkSubscriptionGuard(ctx, '/get100')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    // Первый экземпляр get100
    if (!ctx.session.userModel) {
      ctx.session.userModel = {
        model_name: 'default',
        trigger_word: '',
        model_url: 'placeholder/placeholder:placeholder',
        finetune_id: '',
      }
    }
    await get100Command(ctx)
  })

  bot.command('support', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }
    console.log('CASE bot.command: support')
    await ctx.scene.leave() // Выходим из сцены перед показом контактов
    await handleTechSupport(ctx as MyContext)
  })

  bot.command('menu', async ctx => {
    if (ctx.chat.type !== 'private') {
      // В группах команда /menu не должна работать так же, как /start
      // Можно либо ничего не делать, либо отправить другое сообщение
      return // Просто игнорируем в группе
    }
    logger.info('COMMAND /menu: Переход к главному меню', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave() // Выходим из текущей, если есть

      // ✅ ИСПРАВЛЕНИЕ: Проверяем подписку перед входом в меню
      const telegramId = ctx.from?.id?.toString() || 'unknown'
      const { getUserDetailsSubscription } = await import('@/core/supabase')
      const { simulateSubscriptionForDev } = await import(
        '@/scenes/menuScene/helpers/simulateSubscription'
      )
      const { isDev } = await import('@/config')

      const userDetails = await getUserDetailsSubscription(telegramId)
      const effectiveSubscription = simulateSubscriptionForDev(
        userDetails?.subscriptionType || null,
        isDev
      )

      logger.info('COMMAND /menu: Checking subscription', {
        telegramId,
        originalSubscription: userDetails?.subscriptionType,
        effectiveSubscription,
        isDev,
      })

      // Если нет подписки (включая симуляцию), направляем в subscriptionScene
      if (!effectiveSubscription || effectiveSubscription === 'STARS') {
        logger.info(
          'COMMAND /menu: No subscription, redirecting to subscription scene',
          {
            telegramId,
            effectiveSubscription,
          }
        )
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        return
      }

      // Если подписка есть, входим в меню
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in /menu command:', {
        error,
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.reply('Ошибка при переходе в меню.')
      } catch {
        /* ignore */
      }
    }
  })

  bot.command('price', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед показом цен
    const hasSubscription = await checkSubscriptionGuard(ctx, '/price')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    return priceCommand(ctx)
  })

  bot.command('kontext', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед использованием FLUX Kontext
    const hasSubscription = await checkSubscriptionGuard(ctx, '/kontext')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    logger.info('COMMAND /kontext: FLUX Kontext image editing started', {
      telegramId: ctx.from?.id,
    })

    await ctx.scene.leave() // Выходим из текущей сцены
    await handleFluxKontextCommand(ctx)
  })

  // 🎯 ИНТЕРАКТИВНАЯ КОМАНДА СТАТИСТИКИ
  setupInteractiveStats(bot)

  // 👑 АДМИНСКИЕ КОМАНДЫ
  bot.command('addbalance', handleAddBalanceCommand)
  bot.command('checkbalance', handleCheckBalanceCommand)

  // 📊 КОМАНДА АНАЛИЗА РАСХОДОВ
  bot.use(expenseAnalysisCommand)

  // 🧪 ТЕСТОВАЯ КОМАНДА ДЛЯ ПРОВЕРКИ СООБЩЕНИЯ ПОСЛЕ ОПЛАТЫ
  bot.command('test_payment_message', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    const isRu = ctx.from?.language_code === 'ru'
    logger.info('TEST COMMAND: test_payment_message', {
      telegramId: ctx.from?.id,
    })

    try {
      // Сначала отправляем сообщение об активации подписки
      await ctx.reply(
        isRu
          ? `🎉 Ваша подписка "NEUROVIDEO" успешно оформлена и активна! Пользуйтесь ботом.`
          : `🎉 Your subscription "NEUROVIDEO" has been successfully activated! Enjoy the bot.`
      )

      // Получаем канал для вступления
      const { getSubScribeChannel } = await import(
        '@/handlers/getSubScribeChannel'
      )
      const channelId = await getSubScribeChannel(ctx)

      if (channelId) {
        const chatInviteMessage = isRu
          ? `Нейро путник, твоя подписка активирована ✨

Хочешь вступить в чат для общения и стать частью креативного сообщества?

В этом чате ты: 
🔹 можешь задавать вопросы и получать ответы (да, лично от меня)
🔹 делиться своими работами и быть в сотворчестве с другими нейро путниками  
🔹станешь частью тёплого, креативного комьюнити

Если да, нажимай на кнопку «Я с вами» и добро пожаловать 🤗 

А если нет, продолжай самостоятельно и нажми кнопку «Я сам»`
          : `Neuro traveler, your subscription is activated ✨

Want to join the chat for communication and become part of the creative community?

In this chat you:
🔹 can ask questions and get answers (yes, personally from me)
🔹 share your work and be in co-creation with other neuro travelers
🔹 become part of a warm, creative community

If yes, click the "I'm with you" button and welcome 🤗

If not, continue on your own and click the "I myself" button`

        await ctx.reply(chatInviteMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '👋 ☺️ Я с вами' : "👋 ☺️ I'm with you",
                  url: channelId.startsWith('@')
                    ? `https://t.me/${channelId.slice(1)}`
                    : channelId,
                },
              ],
              [
                {
                  text: isRu ? '🙅🙅‍♀️ Я сам' : '🙅🙅‍♀️ I myself',
                  callback_data: 'continue_solo',
                },
              ],
            ],
          },
        })
      } else {
        await ctx.reply(
          isRu
            ? '⚠️ Канал для вступления не настроен'
            : '⚠️ Channel for joining is not configured'
        )
      }
    } catch (error) {
      logger.error('Error in test_payment_message command:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка при тестировании сообщения'
          : '❌ Error testing message'
      )
    }
  })

  // 🧪 ТЕСТОВАЯ КОМАНДА ДЛЯ ПРОВЕРКИ АПСКЕЙЛЕРА
  bot.command('test_upscale', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    const isRu = ctx.from?.language_code === 'ru'
    logger.info('TEST COMMAND: test_upscale', {
      telegramId: ctx.from?.id,
    })

    try {
      // Используем тестовое изображение
      const testImageUrl =
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'

      const { upscaleFluxKontextImage } = await import(
        '@/services/generateFluxKontext'
      )

      await upscaleFluxKontextImage({
        imageUrl: testImageUrl,
        telegram_id: ctx.from?.id?.toString() || '',
        username: ctx.from?.username || 'test_user',
        is_ru: isRu,
        ctx: ctx,
        originalPrompt: 'Test upscale',
      })
    } catch (error) {
      logger.error('Error in test_upscale command:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })

      await ctx.reply(
        isRu
          ? '❌ Ошибка при тестировании апскейлера.'
          : '❌ Error testing upscaler.'
      )
    }
  })

  // 5. ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ ДЛЯ КНОПОК (КРОМЕ НАВИГАЦИИ) (теперь ПОСЛЕ stage)
  bot.hears([levels[103].title_ru, levels[103].title_en], async ctx => {
    console.log('CASE bot.hears: 💬 Техподдержка / Support')
    await ctx.scene.leave() // Теперь ctx.scene должен быть доступен
    await handleTechSupport(ctx)
  })

  // ПРОСТОЙ GLOBAL HEARS для кнопки подписки - ВСЕГДА работает!
  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    logger.info('🚀 GLOBAL HEARS: Оформить подписку / Subscribe', {
      telegramId: ctx.from?.id,
      messageText: ctx.message?.text,
      currentScene: ctx.scene?.current?.id,
    })
    console.log('🚀 GLOBAL HEARS: Оформить подписку triggered!')

    try {
      logger.info(
        'Attempting to leave current scene and enter subscription scene'
      )
      await ctx.scene.leave() // Выходим из любой текущей сцены
      ctx.session.mode = ModeEnum.SubscriptionScene // Устанавливаем режим
      logger.info('About to enter subscription scene')
      await ctx.scene.enter(ModeEnum.SubscriptionScene) // Входим в сцену подписки
      logger.info('Successfully entered subscription scene')
    } catch (error) {
      console.error('❌ Error in subscription hears handler:', error)
      logger.error('Error in Оформить подписку hears:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })
      const isRu = ctx.from?.language_code === 'ru'
      try {
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      } catch (replyError) {
        console.error('❌ Failed to send error message:', replyError)
      }
    }
  })

  // Обработчик для текстовой кнопки "🆕 Новый промпт"
  bot.hears(['🆕 Новый промпт', '🆕 New prompt'], async ctx => {
    logger.info('HEARS: new_neurophoto_prompt', {
      telegramId: ctx.from?.id,
    })
    try {
      const is_ru = ctx.from?.language_code === 'ru'

      // Переходим в сцену нейрофото
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)

      await ctx.reply(
        is_ru
          ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
          : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
      )
    } catch (error) {
      logger.error('Error in new_neurophoto_prompt hears:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при создании нового промпта.'
          : '❌ An error occurred while creating a new prompt.'
      )
    }
  })

  // ВСЕ ОСТАЛЬНЫЕ HEARS ОБРАБОТЧИКИ ПЕРЕНЕСЕНЫ В hearsHandlers.ts

  // 6. ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ НАВИГАЦИИ (ACTION) (теперь ПОСЛЕ stage)
  bot.action('go_main_menu', async ctx => {
    logger.info('GLOBAL ACTION: go_main_menu', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in go_main_menu action:', {
        error,
        telegramId: ctx.from?.id,
      })
      // Попытка уведомить пользователя об ошибке
      try {
        await ctx.reply('Ошибка при переходе в меню.')
      } catch {
        /* ignore */
      }
    }
  })

  // Обработчик кнопки "Ещё одно фото" для upscaler'а
  bot.action('upscale_another_photo', async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    logger.info('GLOBAL ACTION: upscale_another_photo', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.ImageUpscaler)
    } catch (error) {
      logger.error('Error in upscale_another_photo action:', {
        error,
        telegramId: ctx.from?.id,
      })
      // Попытка уведомить пользователя об ошибке
      try {
        await ctx.reply(
          isRu
            ? 'Ошибка при переходе к upscaler.'
            : 'Error switching to upscaler.'
        )
      } catch {
        /* ignore */
      }
    }
  })

  bot.action('go_help', async ctx => {
    logger.info('GLOBAL ACTION: go_help', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      // Вход в helpScene. Контекст (ctx.session.mode) должен быть установлен ВЫЗЫВАЮЩЕЙ стороной/сценой.
      // Если ctx.session.mode не установлен, helpScene покажет общую справку.
      await ctx.scene.enter('helpScene')
    } catch (error) {
      logger.error('Error in go_help action:', {
        error,
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.reply('Ошибка при открытии справки.')
      } catch {
        /* ignore */
      }
    }
  })

  bot.action('go_back', async ctx => {
    logger.info('GLOBAL ACTION: go_back', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      // Просто выходим из текущей сцены. Если это helpScene, она сама удалит сообщение.
      // Если другая сцена, пользователь вернется к предыдущему шагу или выйдет.
      await ctx.scene.leave()
      // Опционально: можно удалять сообщение, к которому была привязана кнопка
      // try { await ctx.deleteMessage(); } catch { /* ignore */ }
    } catch (error) {
      logger.error('Error in go_back action:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Добавляем глобальный обработчик для кнопки "Оформить подписку"
  bot.action('go_to_subscription_scene', async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    logger.info('GLOBAL ACTION: go_to_subscription_scene', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    } catch (error) {
      logger.error('Error in go_to_subscription_scene action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Попробуйте позже.'
          : 'An error occurred. Please try again later.'
      )
    }
  })

  // Добавляем обработчик для кнопки "Я сам"
  bot.action('continue_solo', async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    logger.info('GLOBAL ACTION: continue_solo', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      await ctx.reply(
        isRu
          ? '👍 Отлично! Продолжайте пользоваться ботом самостоятельно. Если понадобится помощь - обращайтесь!'
          : '👍 Great! Continue using the bot on your own. If you need help - feel free to ask!'
      )
    } catch (error) {
      logger.error('Error in continue_solo action:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик фото для FLUX Kontext
  bot.on(message('photo'), async ctx => {
    logger.info('GLOBAL PHOTO HANDLER: Photo received', {
      telegramId: ctx.from?.id,
      awaitingFluxKontextImage: ctx.session?.awaitingFluxKontextImage,
    })

    // Проверяем, ожидает ли пользователь загрузку изображения для FLUX Kontext
    if (ctx.session?.awaitingFluxKontextImage) {
      const { handleFluxKontextImageUpload } = await import(
        './commands/fluxKontextCommand'
      )
      await handleFluxKontextImageUpload(ctx)
      return
    }

    // Если не ожидаем FLUX Kontext изображение, передаем дальше
    logger.info('GLOBAL PHOTO HANDLER: Photo not for FLUX Kontext, skipping', {
      telegramId: ctx.from?.id,
    })
  })

  // НОВЫЕ ОБРАБОТЧИКИ ДЛЯ INLINE КНОПОК FLUX KONTEXT
  bot.action('upscale_image', async ctx => {
    logger.info('GLOBAL ACTION: upscale_image', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()

      const telegram_id = ctx.from?.id?.toString()
      const username = ctx.from?.username || ''
      const is_ru = ctx.from?.language_code === 'ru'

      if (!telegram_id) {
        await ctx.reply(
          is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
        )
        return
      }

      // Проверяем, есть ли сохраненное изображение для upscaling
      if (!ctx.session?.lastGeneratedImageUrl) {
        await ctx.reply(
          is_ru
            ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте изображение с помощью FLUX Kontext.'
            : '❌ No image to upscale. Please generate an image with FLUX Kontext first.'
        )
        return
      }

      // Импортируем и запускаем upscaling
      const { upscaleFluxKontextImage } = await import(
        './services/generateFluxKontext'
      )
      await upscaleFluxKontextImage({
        imageUrl: ctx.session.lastGeneratedImageUrl,
        telegram_id,
        username,
        is_ru,
        ctx,
        originalPrompt: ctx.session.lastGeneratedPrompt,
      })
    } catch (error) {
      logger.error('Error in upscale_image action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при увеличении качества изображения.'
          : '❌ An error occurred while upscaling the image.'
      )
    }
  })

  // ОБРАБОТЧИК ДЛЯ УВЕЛИЧЕНИЯ КАЧЕСТВА НЕЙРОФОТО
  bot.action('upscale_neurophoto_image', async ctx => {
    logger.info('GLOBAL ACTION: upscale_neurophoto_image', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()

      const telegram_id = ctx.from?.id?.toString()
      const username = ctx.from?.username || ''
      const is_ru = ctx.from?.language_code === 'ru'

      if (!telegram_id) {
        await ctx.reply(
          is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
        )
        return
      }

      // Проверяем, есть ли сохраненное изображение для upscaling
      if (!ctx.session?.lastNeuroPhotoImageUrl) {
        await ctx.reply(
          is_ru
            ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте нейрофото.'
            : '❌ No image to upscale. Please generate a neurophoto first.'
        )
        return
      }

      // Отправляем сообщение о начале обработки
      await ctx.reply(
        is_ru
          ? '⌛ Увеличиваем качество нейрофото... Пожалуйста, подождите'
          : '⌛ Upscaling neurophoto quality... Please wait'
      )

      // Импортируем и запускаем локальный upscaler (тот же что и для отдельного upscaler'а)
      const { upscaleImage } = await import('./services/imageUpscaler')
      await upscaleImage({
        imageUrl: ctx.session.lastNeuroPhotoImageUrl,
        telegram_id,
        username,
        is_ru,
        ctx,
        originalPrompt:
          ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
      })
    } catch (error) {
      logger.error('Error in upscale_neurophoto_image action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при увеличении качества нейрофото.'
          : '❌ An error occurred while upscaling the neurophoto.'
      )
    }
  })

  bot.action('more_editing', async ctx => {
    logger.info('GLOBAL ACTION: more_editing', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '📷 Отправьте новое изображение для редактирования:'
          : '📷 Send a new image for editing:'
      )

      if (ctx.session) {
        ctx.session.awaitingFluxKontextImage = true
      }
    } catch (error) {
      logger.error('Error in more_editing action:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  bot.action('different_mode', async ctx => {
    logger.info('GLOBAL ACTION: different_mode', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      // Возвращаемся к продвинутой сцене FLUX Kontext
      await ctx.scene.leave()
      await ctx.scene.enter('flux_kontext_scene')
    } catch (error) {
      logger.error('Error in different_mode action:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // НОВЫЕ ОБРАБОТЧИКИ ДЛЯ INLINE КНОПОК НЕЙРОФОТО
  bot.action('new_neurophoto_prompt', async ctx => {
    logger.info('GLOBAL ACTION: new_neurophoto_prompt', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      const is_ru = ctx.from?.language_code === 'ru'

      // Переходим в сцену нейрофото
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)

      await ctx.reply(
        is_ru
          ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
          : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
      )
    } catch (error) {
      logger.error('Error in new_neurophoto_prompt action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при создании нового промпта.'
          : '❌ An error occurred while creating a new prompt.'
      )
    }
  })

  bot.action('change_size', async ctx => {
    logger.info('GLOBAL ACTION: change_size', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      const is_ru = ctx.from?.language_code === 'ru'

      // Переходим в сцену изменения размера
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.SizeWizard)
    } catch (error) {
      logger.error('Error in change_size action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при изменении размера.'
          : '❌ An error occurred while changing size.'
      )
    }
  })

  bot.action('improve_prompt', async ctx => {
    logger.info('GLOBAL ACTION: improve_prompt', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.answerCbQuery()
      const is_ru = ctx.from?.language_code === 'ru'

      // Переходим в сцену улучшения промпта
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
    } catch (error) {
      logger.error('Error in improve_prompt action:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        ctx.from?.language_code === 'ru'
          ? '❌ Произошла ошибка при улучшении промпта.'
          : '❌ An error occurred while improving prompt.'
      )
    }
  })

  console.log('✅ [SCENE_DEBUG] Stage импортирован успешно')
  console.log(
    '📊 [SCENE_DEBUG] Количество обработчиков сцен:',
    stage.scenes.size
  )

  // INLINE CALLBACK ОБРАБОТЧИКИ ДЛЯ КНОПОК ПОДПИСКИ
  bot.action(/^subscribe_(.+)$/, async ctx => {
    const subscriptionType = ctx.match[1] // neurophoto или neurovideo
    logger.info('🚀 INLINE CALLBACK: Subscribe button pressed', {
      telegramId: ctx.from?.id,
      subscriptionType: subscriptionType,
    })

    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave() // Выходим из любой текущей сцены
      ctx.session.mode = ModeEnum.SubscriptionScene // Устанавливаем режим
      logger.info('About to enter subscription scene via inline callback')
      await ctx.scene.enter(ModeEnum.SubscriptionScene) // Входим в сцену подписки
      logger.info('Successfully entered subscription scene via inline callback')
    } catch (error) {
      console.error('❌ Error in subscription inline callback handler:', error)
      logger.error('Error in subscribe inline callback:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
        subscriptionType: subscriptionType,
      })
      const isRu = ctx.from?.language_code === 'ru'
      try {
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      } catch (replyError) {
        console.error('❌ Failed to send error message:', replyError)
      }
    }
  })

  // ДУБЛИРОВАНИЕ GLOBAL HEARS В КОНЦЕ ФАЙЛА ДЛЯ ГАРАНТИИ КОМПИЛЯЦИИ (BACKUP)
  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    logger.info('🚀 GLOBAL HEARS (DUPLICATE): Оформить подписку / Subscribe', {
      telegramId: ctx.from?.id,
      messageText: ctx.message?.text,
      currentScene: ctx.scene?.current?.id,
    })
    console.log('🚀 GLOBAL HEARS (DUPLICATE): Оформить подписку triggered!')

    try {
      logger.info(
        'Attempting to leave current scene and enter subscription scene'
      )
      await ctx.scene.leave() // Выходим из любой текущей сцены
      ctx.session.mode = ModeEnum.SubscriptionScene // Устанавливаем режим
      logger.info('About to enter subscription scene')
      await ctx.scene.enter(ModeEnum.SubscriptionScene) // Входим в сцену подписки
      logger.info('Successfully entered subscription scene')
    } catch (error) {
      console.error('❌ Error in subscription hears handler:', error)
      logger.error('Error in Оформить подписку hears:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })
      const isRu = ctx.from?.language_code === 'ru'
      try {
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      } catch (replyError) {
        console.error('❌ Failed to send error message:', replyError)
      }
    }
  })
  // ВАЖНО: Этот обработчик должен быть последним, чтобы не перехватывать команды и кнопки
  bot.on(message('text'), handleTextMessage)
}
