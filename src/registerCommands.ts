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
// Импортируем обработчик статуса видео
import { handleVideoStatusUpdate } from './handlers/handleTextToVideoDirect'
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
// Импортируем AutoFixer команды
import { setupAutoFixerCommands } from './commands/autofixer/autofixer.command'
// Импортируем админ middleware
import { requireAdmin } from './middleware/adminOnly'
// ✅ ИМПОРТИРУЕМ MULTI-PHOTO ACTION HANDLERS
import { registerMultiPhotoActions } from './handlers/multiPhotoActions'
import { handleHelpCommand } from './commands/helpCommand'
// Импортируем сцену handleTextMessage
// import { handleTextMessage } from './handlers/handleTextMessage' // ❌ ИСПРАВЛЕНО: не используется как сцена

// Возвращаем импорт всех сцен через index
import {
  avatarBrainWizard,
  textToVideoWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  imageToPromptWizard,
  imageUpscalerWizard,
  faceSwapWizard,
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
  veedFabricWizard,
  aiReelsWizard,
  aiReelsEntryWizard,
  aiReelsRenderWizard,
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
  aiPhotoshopScene,
  avatarTransformScene,
  instagramScrapingWizard,
  instagramParserScene,
  instagramParserWizard,
  morphingWizard,
} from './scenes'

import { defaultSession } from './store'
//
import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
import { handleBuy } from './handlers/handleBuy'
import { isRussian } from '@/helpers/language'
// ✅ ИМПОРТИРУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { registerPaymentActions } from './handlers/paymentActions'
// handleTextMessage и setupHearsHandlers теперь импортируются в bot.ts
// Убираем импорт handleMenu, так как он не используется здесь напрямую
// import { handleMenu } from './handlers/handleMenu'
//https://github.com/telegraf/telegraf/issues/705

// Проверяем что textToVideoWizard загружен
console.log('🚨 [SCENE_DEBUG] textToVideoWizard check:', {
  isImported: !!textToVideoWizard,
  hasId: textToVideoWizard?.id,
  wizardId: textToVideoWizard?.id,
  sceneType: typeof textToVideoWizard,
})

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
  faceSwapWizard,
  improvePromptWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  uploadVideoScene,
  sizeWizard,
  aiPhotoshopScene,
  morphingWizard,
  voiceAvatarWizard,
  textToSpeechWizard,
  videoTranscriptionWizard,
  lipSyncWizard,
  veedFabricWizard,
  aiReelsWizard,
  aiReelsEntryWizard,
  aiReelsRenderWizard,
  avatarTransformScene,
  avatarBrainWizard,
  chatWithAvatarWizard,
  selectModelWizard,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  getRuBillWizard,
  levelQuestWizard,
  createUserScene,
  neuroCoderScene,
  instagramScrapingWizard,
  instagramParserWizard,
])

// Проверяем зарегистрированные сцены
console.log('🚨 [SCENE_DEBUG] Stage created with scenes:', {
  totalScenes: stage.scenes.size,
  hasTextToVideoWizard: stage.scenes.has('text_to_video'),
  sceneNames: Array.from(stage.scenes.keys()),
})

// Function to send the promotional message
const sendGroupCommandReply = async (ctx: MyContext) => {
  try {
    const botUsername = ctx.botInfo.username
    const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨\n\nЯ часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}\n\n*Ом Шанти!* 🙏`
    await ctx.reply(message)
  } catch (e) {
    logger.error(
      `Error replying to command in group for ${
        ctx.botInfo?.username || 'unknown bot'
      }:`,
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
  logger.info('Registering bot commands and handlers')

  try {
    // 1. Логгер для ВСЕХ входящих обновлений
    bot.use((ctx, next) => {
      const messageText =
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined

      logger.info('>>> RAW UPDATE RECEIVED', {
        updateId: ctx.update.update_id,
        updateType: ctx.updateType,
        messageText,
        callbackData:
          ctx.callbackQuery && 'data' in ctx.callbackQuery
            ? ctx.callbackQuery.data
            : undefined,
        sceneInfo: ctx.scene?.current?.id,
      })

      // СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ /instagram
      if (messageText === '/instagram') {
        // Instagram command detected, proceeding to handler
      }

      return next()
    })

    // 3. Middleware сцен (ДОЛЖЕН БЫТЬ ПОСЛЕ СЕССИИ - сессия теперь регистрируется в bot.ts)
    bot.use(stage.middleware())

    // 4. РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПЛАТЕЖЕЙ
    registerPaymentActions(bot)

    // 5. ✅ РЕГИСТРАЦИЯ HELP КОМАНДЫ
    bot.command('help', handleHelpCommand)

    // 6. --- РЕГИСТРАЦИЯ ГЛОБАЛЬНЫХ КОМАНД ---
    // Команды должны быть зарегистрированы здесь, до hears и общего on('text')

    bot.command('start', async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }

      const telegramId = ctx.from?.id?.toString() || 'unknown'

      logger.info('[START] Starting with AI transformation demo first', {
        telegramId: ctx.from?.id,
        step: 'command_start',
        chatType: ctx.chat.type,
        username: ctx.from?.username,
      })

      console.log('🚀 [START COMMAND] Executing /start command', {
        telegramId,
        chatType: ctx.chat.type,
      })

      // Защита от спама команд /start
      const now = Date.now()
      const lastStartTime = (ctx.session as any).lastStartCommand || 0
      const timeDiff = now - lastStartTime
      const minInterval = 2000 // 2 секунды минимум между командами /start

      if (timeDiff < minInterval) {
        console.log('🚫 [START COMMAND] Start command spam detected, ignoring', {
          telegramId,
          timeDiff,
          lastStartTime: new Date(lastStartTime).toISOString(),
        })
        return
      }

      // Обновляем время последней команды /start
      (ctx.session as any).lastStartCommand = now

      try {
        // При старте всегда сбрасываем сессию
        ctx.session = { ...defaultSession }
        console.log('✅ [START COMMAND] Session reset')

        // ВАЖНО: Извлекаем реферальный код из команды /start
        if (ctx.message && 'text' in ctx.message) {
          const parts = ctx.message.text.split(' ')
          if (parts.length > 1) {
            const startParam = parts[1]
            console.log(
              '📝 [START COMMAND] Start parameter detected:',
              startParam
            )

            // Проверяем, не промо ли это
            const { extractPromoFromContext, extractInviteCodeFromContext } =
              await import('@/helpers/contextUtils')
            const promoInfo = extractPromoFromContext(ctx)

            if (!promoInfo?.isPromo && /^\d+$/.test(startParam)) {
              // Это реферальный код (только цифры)
              ctx.session.inviteCode = startParam
              console.log('🔗 [START COMMAND] Referral code set:', startParam)
            }
          }
        }

        await ctx.scene.leave() // Явно выходим из любой сцены
        console.log('✅ [START COMMAND] Left previous scene')

        // Проверяем, существует ли пользователь
        const { getUserDetailsSubscription } = await import('@/core/supabase')

        console.log('🔍 [START COMMAND] Checking user existence...', {
          telegramId,
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
          languageCode: ctx.from?.language_code,
        })

        const userDetails = await getUserDetailsSubscription(telegramId)

        console.log('📊 [START COMMAND] User check result:', {
          telegramId,
          userExists: userDetails.isExist,
          subscriptionType: userDetails.subscriptionType,
          userId: userDetails.id,
          inviteCode: ctx.session.inviteCode || 'none',
          rawUserDetails: JSON.stringify(userDetails),
        })

        if (!userDetails.isExist) {
          // Если пользователь не существует, сначала создаем его
          console.log(
            '🆕 [START COMMAND] User does not exist, entering CreateUserScene',
            {
              telegramId,
              inviteCode: ctx.session.inviteCode || 'none',
              username: ctx.from?.username,
            }
          )
          await ctx.scene.enter(ModeEnum.CreateUserScene)
        } else {
          // Если пользователь существует, переходим к AI Demo
          console.log(
            '✅ [START COMMAND] User exists, entering AvatarTransform scene',
            {
              telegramId,
              userId: userDetails.id,
              createdAt: userDetails.created_at,
            }
          )
          await ctx.scene.enter(ModeEnum.AvatarTransform)
        }
      } catch (error) {
        console.error('❌ [START COMMAND] Error:', error)
        logger.error('[START] Error in start command', { error, telegramId })
      }
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

        // 🚀 УПРОЩЕННАЯ ЛОГИКА: Всегда показываем меню, но тип зависит от подписки
        const telegramId = ctx.from?.id?.toString() || 'unknown'

        try {
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

          // Если нет подписки, показываем subscription scene, но не блокируем /menu
          if (!effectiveSubscription || effectiveSubscription === 'STARS') {
            logger.info(
              'COMMAND /menu: No subscription, showing subscription options',
              {
                telegramId,
                effectiveSubscription,
              }
            )
            ctx.session.mode = ModeEnum.SubscriptionScene
            await ctx.scene.enter(ModeEnum.SubscriptionScene)
            return
          }

          // Если подписка есть, входим в главное меню
          ctx.session.mode = ModeEnum.MainMenu
          await ctx.scene.enter(ModeEnum.MainMenu)
        } catch (subscriptionError) {
          // Если ошибка с проверкой подписки, всё равно показываем меню
          logger.warn(
            'COMMAND /menu: Subscription check failed, showing menu anyway',
            {
              telegramId,
              error:
                subscriptionError instanceof Error
                  ? subscriptionError.message
                  : String(subscriptionError),
            }
          )

          ctx.session.mode = ModeEnum.MainMenu
          await ctx.scene.enter(ModeEnum.MainMenu)
        }
      } catch (error) {
        logger.error('Error in /menu command:', {
          error,
          telegramId: ctx.from?.id,
        })
        try {
          // В случае критической ошибки, всё равно пытаемся показать что-то полезное
          await ctx.reply(
            '🏠 Главное меню временно недоступно. Попробуйте /start'
          )
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

      // ✅ ЗАЩИТА: Проверяем подписку перед использованием AI Photoshop
      const hasSubscription = await checkSubscriptionGuard(ctx, '/kontext')
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      logger.info('COMMAND /kontext: AI Photoshop (kontext alias) started', {
        telegramId: ctx.from?.id,
      })

      await ctx.scene.leave() // Выходим из текущей сцены
      await ctx.scene.enter('ai_photoshop_scene')
    })

    console.log('🔧 [DEBUG] REGISTERING /instagram command handler NOW!')
    logger.info('🔧 [DEBUG] REGISTERING /instagram command handler NOW!')
    bot.command('instagram', async ctx => {
      try {
        console.log('🔍 [DEBUG] Instagram command handler TRIGGERED!')
        console.log('🔍 [DEBUG] Instagram command received!', {
          telegramId: ctx.from?.id,
          chatType: ctx.chat?.type,
          timestamp: new Date().toISOString(),
        })
        logger.info('🔍 [DEBUG] Instagram command received!', {
          telegramId: ctx.from?.id,
          chatType: ctx.chat?.type,
          timestamp: new Date().toISOString(),
        })

        if (ctx.chat.type !== 'private') {
          logger.info('🔍 [DEBUG] Rejecting non-private chat')
          return sendGroupCommandReply(ctx)
        }

        console.log('🔍 [DEBUG] Starting Instagram parsing...')
        logger.info('🔍 [DEBUG] Starting Instagram parsing...')

        // Проверяем доступ к парсингу
        const userId = ctx.from?.id?.toString()
        const botToken = ctx.telegram.token

        if (!userId) {
          await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
          return
        }

        const { getParsingAccess } = await import('@/menu/mainMenu')
        const parsingAccess = getParsingAccess(userId, botToken)

        if (!parsingAccess.hasAccess) {
          logger.warn(
            'Instagram parsing access denied via /instagram command',
            {
              telegramId: ctx.from?.id,
              userId,
            }
          )
          await ctx.reply('❌ У вас нет доступа к функции парсинга Instagram.')
          return
        }

        console.log(
          '🔍 [DEBUG] Parsing access check PASSED! Proceeding with Instagram wizard...'
        )
        logger.info(
          'COMMAND /instagram: Instagram competitor analysis started',
          {
            telegramId: ctx.from?.id,
          }
        )

        console.log('🔍 [DEBUG] Entering Instagram scraping wizard...')
        logger.info('🔍 [DEBUG] Entering Instagram scraping wizard...')

        console.log('🔍 [DEBUG] Leaving current scene...')
        await ctx.scene.leave() // Выходим из текущей сцены

        console.log('🔍 [DEBUG] Setting session mode...')
        ctx.session.mode = ModeEnum.InstagramScrapingWizard

        console.log(
          '🔍 [DEBUG] About to enter InstagramScrapingWizard scene...'
        )
        await ctx.scene.enter(ModeEnum.InstagramScrapingWizard)

        console.log(
          '🔍 [DEBUG] Successfully entered Instagram scraping wizard!'
        )
        logger.info('🔍 [DEBUG] Successfully entered Instagram scraping wizard')
      } catch (error) {
        logger.error('🔍 [DEBUG] Instagram command ERROR:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegramId: ctx.from?.id,
        })

        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
      }
    })

    // 🎯 ИНТЕРАКТИВНАЯ КОМАНДА СТАТИСТИКИ
    setupInteractiveStats(bot)

    // 👑 АДМИНСКИЕ КОМАНДЫ
    bot.command('addbalance', requireAdmin(), handleAddBalanceCommand)
    bot.command('checkbalance', requireAdmin(), handleCheckBalanceCommand)

    // 🤖 АВТОФИКСЕР КОМАНДЫ
    setupAutoFixerCommands(bot)

    // 📊 КОМАНДА АНАЛИЗА РАСХОДОВ
    bot.use(expenseAnalysisCommand)

    // 🧪 ТЕСТОВАЯ КОМАНДА ДЛЯ ПРОВЕРКИ СООБЩЕНИЯ ПОСЛЕ ОПЛАТЫ (ТОЛЬКО ДЛЯ АДМИНОВ)
    bot.command('test_payment_message', requireAdmin(), async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
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
                      : channelId.startsWith('http')
                      ? channelId
                      : `https://t.me/${channelId}`,
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

    // 🧪 ТЕСТОВАЯ КОМАНДА ДЛЯ ПРОВЕРКИ АПСКЕЙЛЕРА (ТОЛЬКО ДЛЯ АДМИНОВ)
    bot.command('test_upscale', requireAdmin(), async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
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
    // Ловим все варианты кнопок подписки (и старые с 💳, и новые с 💫)
    bot.hears(
      [
        levels[105].title_ru,
        levels[105].title_en,
        '💳 Оформить подписку',
        '💳 Subscribe',
      ],
      async ctx => {
        console.log('🎯 URGENT DEBUG: GLOBAL SUBSCRIPTION HEARS TRIGGERED!')
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
          // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
          const isRu = isRussianFromState(ctx)
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
      }
    )

    // Обработчик для текстовой кнопки "🆕 Новый промпт"
    bot.hears(['🆕 Новый промпт', '🆕 New prompt'], async ctx => {
      logger.info('HEARS: new_neurophoto_prompt', {
        telegramId: ctx.from?.id,
      })
      try {
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового промпта.'
            : '❌ An error occurred while creating a new prompt.'
        )
      }
    })

    // Обработчики для кнопок "Создать еще" - Text-to-Video
    bot.hears(
      ['✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)'],
      async ctx => {
        logger.info('HEARS: create_more_text_to_video', {
          telegramId: ctx.from?.id,
        })
        try {
          const isRu = isRussianFromState(ctx)

          // ✅ ЗАЩИТА: Проверяем подписку перед использованием Text-to-Video
          const hasSubscription = await checkSubscriptionGuard(
            ctx,
            'Text-to-Video'
          )
          if (!hasSubscription) {
            return // Пользователь перенаправлен в subscriptionScene
          }

          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.TextToVideo
          await ctx.scene.enter(ModeEnum.TextToVideo)

          await ctx.reply(
            isRu
              ? '🎬 Создаем новое видео из текста! Выберите модель:'
              : '🎬 Creating a new video from text! Select a model:'
          )
        } catch (error) {
          logger.error('Error in create_more_text_to_video hears:', {
            error,
            telegramId: ctx.from?.id,
          })
          const isRuError = isRussianFromState(ctx)
          await ctx.reply(
            isRuError
              ? '❌ Произошла ошибка при создании нового видео.'
              : '❌ An error occurred while creating a new video.'
          )
        }
      }
    )

    // Обработчики для кнопок "Создать еще" - Image-to-Video
    bot.hears(
      [
        '✨ Создать еще (Изображение в Видео)',
        '✨ Create More (Image to Video)',
      ],
      async ctx => {
        logger.info('HEARS: create_more_image_to_video', {
          telegramId: ctx.from?.id,
        })
        try {
          const isRu = isRussianFromState(ctx)

          // ✅ ЗАЩИТА: Проверяем подписку перед использованием Image-to-Video
          const hasSubscription = await checkSubscriptionGuard(
            ctx,
            'Image-to-Video'
          )
          if (!hasSubscription) {
            return // Пользователь перенаправлен в subscriptionScene
          }

          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.ImageToVideo
          await ctx.scene.enter(ModeEnum.ImageToVideo)

          await ctx.reply(
            isRu
              ? '🖼️ Создаем новое видео из изображения! Выберите модель:'
              : '🖼️ Creating a new video from image! Select a model:'
          )
        } catch (error) {
          logger.error('Error in create_more_image_to_video hears:', {
            error,
            telegramId: ctx.from?.id,
          })
          const isRuError = isRussianFromState(ctx)
          await ctx.reply(
            isRuError
              ? '❌ Произошла ошибка при создании нового видео.'
              : '❌ An error occurred while creating a new video.'
          )
        }
      }
    )

    // Обработчик для кнопки "Выбрать другую модель (Видео)" - универсальный
    bot.hears(
      ['🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)'],
      async ctx => {
        logger.info('HEARS: select_another_video_model', {
          telegramId: ctx.from?.id,
        })
        try {
          const isRu = isRussianFromState(ctx)

          // ✅ ЗАЩИТА: Проверяем подписку перед выбором модели
          const hasSubscription = await checkSubscriptionGuard(
            ctx,
            'Video Generation'
          )
          if (!hasSubscription) {
            return // Пользователь перенаправлен в subscriptionScene
          }

          // Показываем пользователю выбор типа видео-генерации
          await ctx.scene.leave()

          await ctx.reply(
            isRu
              ? '🎬 Выберите тип генерации видео:'
              : '🎬 Choose video generation type:',
            Markup.keyboard([
              [
                isRu ? '📝 Текст в Видео' : '📝 Text to Video',
                isRu ? '🖼️ Изображение в Видео' : '🖼️ Image to Video',
              ],
              [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
            ]).resize()
          )
        } catch (error) {
          logger.error('Error in select_another_video_model hears:', {
            error,
            telegramId: ctx.from?.id,
          })
          const isRuError = isRussianFromState(ctx)
          await ctx.reply(
            isRuError
              ? '❌ Произошла ошибка при выборе модели.'
              : '❌ An error occurred while selecting a model.'
          )
        }
      }
    )

    // Обработчики для кнопок выбора типа видео-генерации
    bot.hears(['📝 Текст в Видео', '📝 Text to Video'], async ctx => {
      logger.info('HEARS: text_to_video_selection', {
        telegramId: ctx.from?.id,
      })
      try {
        const isRu = isRussianFromState(ctx)

        // ✅ ЗАЩИТА: Проверяем подписку перед использованием Text-to-Video
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          'Text-to-Video'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.TextToVideo)
      } catch (error) {
        logger.error('Error in text_to_video_selection hears:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при переходе к Text-to-Video.'
            : '❌ An error occurred while switching to Text-to-Video.'
        )
      }
    })

    bot.hears(['🖼️ Изображение в Видео', '🖼️ Image to Video'], async ctx => {
      logger.info('HEARS: image_to_video_selection', {
        telegramId: ctx.from?.id,
      })
      try {
        const isRu = isRussianFromState(ctx)

        // ✅ ЗАЩИТА: Проверяем подписку перед использованием Image-to-Video
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          'Image-to-Video'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)
      } catch (error) {
        logger.error('Error in image_to_video_selection hears:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при переходе к Image-to-Video.'
            : '❌ An error occurred while switching to Image-to-Video.'
        )
      }
    })

    // Обработчик для кнопки "Новый промт" после генерации видео (для text-to-video)
    bot.hears(['🎬 Новый промт', '🎬 New Prompt'], async ctx => {
      logger.info('HEARS: new_prompt_video', {
        telegramId: ctx.from?.id,
      })
      try {
        const isRu = isRussianFromState(ctx)
        
        // Проверяем, откуда пришел пользователь (из какого режима)
        const lastMode = ctx.session.mode
        
        if (lastMode === ModeEnum.ImageToVideo) {
          // Если был в режиме Image-to-Video, возвращаем туда
          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.ImageToVideo
          await ctx.scene.enter(ModeEnum.ImageToVideo)
        } else {
          // По умолчанию переходим в Text-to-Video
          await ctx.scene.leave()
          ctx.session.mode = ModeEnum.TextToVideo
          await ctx.scene.enter(ModeEnum.TextToVideo)
        }
      } catch (error) {
        logger.error('Error in new_prompt_video hears:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка. Попробуйте выбрать режим из главного меню.'
            : '❌ An error occurred. Please select a mode from the main menu.'
        )
      }
    })

    // Обработчик для кнопки "Новое видео" после генерации image-to-video
    bot.hears(['🎬 Новое видео', '🎬 New Video'], async ctx => {
      logger.info('HEARS: new_video_i2v', {
        telegramId: ctx.from?.id,
      })
      try {
        const isRu = isRussianFromState(ctx)

        // Переходим в режим Image-to-Video для создания нового видео
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)

      } catch (error: any) {
        logger.error('Error in new_video_i2v handler', {
          error: error?.message,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка. Попробуйте выбрать режим из главного меню.'
            : '❌ An error occurred. Please select a mode from the main menu.'
        )
      }
    })

    // ✅ ОБРАБОТЧИК ДЛЯ КНОПКИ МОРФИНГА
    bot.hears([levels[13].title_ru, levels[13].title_en], async ctx => {
      logger.info('HEARS: morphing_button', {
        telegramId: ctx.from?.id,
        messageText: ctx.message?.text,
      })
      try {
        const isRu = isRussianFromState(ctx)

        // ✅ ЗАЩИТА: Проверяем подписку перед использованием Morphing
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          levels[13].title_ru // "🌀 Infinity Морфинг"
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.MorphingWizard
        await ctx.scene.enter(ModeEnum.MorphingWizard)
      } catch (error) {
        logger.error('Error in morphing hears handler:', {
          error: error instanceof Error ? error.message : String(error),
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при переходе к созданию морфинга.'
            : '❌ An error occurred while switching to morphing creation.'
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
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
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

    // Обработчик для кнопки "Оформить подписку" перенесен в StartScene для лучшей организации кода
    // (удален дублирующийся GLOBAL обработчик)

    // Добавляем обработчик для кнопки "Я сам"
    bot.action('continue_solo', async ctx => {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
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
      logger.info('🎯 GLOBAL PHOTO HANDLER: Photo received', {
        telegramId: ctx.from?.id,
        currentScene: ctx.scene?.current?.id,
        awaitingFluxKontextImage: ctx.session?.awaitingFluxKontextImage,
        awaitingFluxKontextImageA: ctx.session?.awaitingFluxKontextImageA,
        awaitingFluxKontextImageB: ctx.session?.awaitingFluxKontextImageB,
        sessionExists: !!ctx.session,
        sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
      })

      // Проверяем, ожидает ли пользователь загрузку изображения для FLUX Kontext
      if (ctx.session?.awaitingFluxKontextImage) {
        const { handleFluxKontextImage } = await import(
          './commands/fluxKontextCommand'
        )
        await handleFluxKontextImage(ctx)
        return
      }

      // Если не ожидаем FLUX Kontext изображение, передаем дальше
      logger.info(
        '🎯 GLOBAL PHOTO HANDLER: Photo not for FLUX Kontext, skipping',
        {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          reason: 'not_awaiting_flux_image',
        }
      )
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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при увеличении качества изображения.'
            : '❌ An error occurred while upscaling the image.'
        )
      }
    })

    // ОБРАБОТЧИК ДЛЯ УВЕЛИЧЕНИЯ КАЧЕСТВА НЕЙРОФОТО
    bot.action('upscale_neurophoto_image', async ctx => {
      logger.info('GLOBAL ACTION: upscale_neurophoto_image', {
        telegramId: ctx.from?.id,
        sessionExists: !!ctx.session,
        lastNeuroPhotoImageUrl: ctx.session?.lastNeuroPhotoImageUrl?.substring(0, 50),
        lastNeuroPhotoPrompt: ctx.session?.lastNeuroPhotoPrompt?.substring(0, 50),
      })
      try {
        await ctx.answerCbQuery()

        const telegram_id = ctx.from?.id?.toString()
        const username = ctx.from?.username || ''
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

        if (!telegram_id) {
          logger.error('No telegram_id found in upscale_neurophoto_image action')
          await ctx.reply(
            is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        // Проверяем, есть ли сохраненное изображение для upscaling
        if (!ctx.session?.lastNeuroPhotoImageUrl) {
          logger.warn('No lastNeuroPhotoImageUrl in session', {
            telegramId: telegram_id,
            sessionData: JSON.stringify(ctx.session || {}),
          })
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
        logger.info('🔴 BEFORE UPSCALE_IMAGE CALL', {
          telegram_id,
          username,
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          prompt: ctx.session.lastNeuroPhotoPrompt,
          is_ru,
        })
        console.log('🔴 CALLING UPSCALE_IMAGE FOR:', telegram_id)
        
        const { upscaleImage } = await import('./services/imageUpscaler')
        const result = await upscaleImage({
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          telegram_id,
          username,
          is_ru,
          ctx,
          originalPrompt:
            ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
        })
        
        logger.info('🟢 AFTER UPSCALE_IMAGE CALL', {
          telegram_id,
          result: result ? 'Success' : 'No result',
        })
        console.log('🟢 UPSCALE_IMAGE COMPLETED FOR:', telegram_id)
      } catch (error) {
        logger.error('Error in upscale_neurophoto_image action:', {
          error,
          telegramId: ctx.from?.id,
        })
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError2 = isRussianFromState(ctx)
        await ctx.reply(
          isRuError2
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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuMore = isRussianFromState(ctx)
        await ctx.reply(
          isRuMore
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
        // Возвращаемся к AI Photoshop сцене
        await ctx.scene.leave()
        await ctx.scene.enter('ai_photoshop_scene')
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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError3 = isRussianFromState(ctx)
        await ctx.reply(
          isRuError3
            ? '❌ Произошла ошибка при создании нового промпта.'
            : '❌ An error occurred while creating a new prompt.'
        )
      }
    })

    // INLINE КНОПКИ ДЛЯ TEXT-TO-VIDEO
    bot.action('create_more_text_to_video', async ctx => {
      logger.info('GLOBAL ACTION: create_more_text_to_video', {
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        // ✅ ЗАЩИТА: Проверяем подписку
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          'Text-to-Video'
        )
        if (!hasSubscription) {
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.TextToVideo)

        await ctx.reply(
          isRu
            ? '🎬 Создаем новое видео из текста! Выберите модель:'
            : '🎬 Creating a new video from text! Select a model:'
        )
      } catch (error) {
        logger.error('Error in create_more_text_to_video action:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового видео.'
            : '❌ An error occurred while creating a new video.'
        )
      }
    })

    // INLINE КНОПКИ ДЛЯ IMAGE-TO-VIDEO
    bot.action('create_more_image_to_video', async ctx => {
      logger.info('GLOBAL ACTION: create_more_image_to_video', {
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        // ✅ ЗАЩИТА: Проверяем подписку
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          'Image-to-Video'
        )
        if (!hasSubscription) {
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)

        await ctx.reply(
          isRu
            ? '🖼️ Создаем новое видео из изображения! Выберите модель:'
            : '🖼️ Creating a new video from image! Select a model:'
        )
      } catch (error) {
        logger.error('Error in create_more_image_to_video action:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового видео.'
            : '❌ An error occurred while creating a new video.'
        )
      }
    })

    bot.action('change_size', async ctx => {
      logger.info('GLOBAL ACTION: change_size', {
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.answerCbQuery()
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

        // Переходим в сцену изменения размера
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.SizeWizard)
      } catch (error) {
        logger.error('Error in change_size action:', {
          error,
          telegramId: ctx.from?.id,
        })
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError4 = isRussianFromState(ctx)
        await ctx.reply(
          isRuError4
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
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const is_ru = isRussianFromState(ctx)

        // Переходим в сцену улучшения промпта
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      } catch (error) {
        logger.error('Error in improve_prompt action:', {
          error,
          telegramId: ctx.from?.id,
        })
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRuError5 = isRussianFromState(ctx)
        await ctx.reply(
          isRuError5
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

    // ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ ПЕРЕХОДА В ПОДПИСКУ
    bot.action('go_to_subscription_scene', async ctx => {
      logger.info('🚀 GLOBAL ACTION: go_to_subscription_scene', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        logger.info('Successfully entered subscription scene via global action')
      } catch (error) {
        logger.error('Error in go_to_subscription_scene action:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      }
    })

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
        logger.info(
          'Successfully entered subscription scene via inline callback'
        )
      } catch (error) {
        console.error(
          '❌ Error in subscription inline callback handler:',
          error
        )
        logger.error('Error in subscribe inline callback:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegramId: ctx.from?.id,
          subscriptionType: subscriptionType,
        })
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRu = isRussianFromState(ctx)
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

    // Callback handler для обновления статуса видео генерации
    bot.action('update_video_status', async ctx => {
      logger.info('🔄 GLOBAL ACTION: update_video_status', {
        telegramId: ctx.from?.id,
      })
      
      try {
        await handleVideoStatusUpdate(ctx)
      } catch (error) {
        logger.error('Error in update_video_status action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // ОБРАБОТЧИКИ ДЛЯ КНОПОК ПОПОЛНЕНИЯ БАЛАНСА
    bot.action('subscription_menu', async ctx => {
      logger.info('💫 GLOBAL ACTION: subscription_menu from top-up', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        // Удаляем сообщение с предложением купить подписку
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        // Переходим в сцену подписки
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      } catch (error) {
        logger.error('Error in subscription_menu action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    bot.action('main_menu', async ctx => {
      logger.info('🏠 GLOBAL ACTION: main_menu from top-up', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        // Удаляем сообщение с предложением купить подписку
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        // Переходим в главное меню
        await ctx.scene.enter(ModeEnum.MainMenu)
      } catch (error) {
        logger.error('Error in main_menu action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // 🎭 Обработчик выбора модели lip-sync
    bot.action(/^lip_sync_model_(.+)$/, async ctx => {
      const modelId = ctx.match[1]
      logger.info('🎭 GLOBAL ACTION: lip_sync_model selected', {
        telegramId: ctx.from?.id,
        modelId,
      })

      try {
        await ctx.answerCbQuery()

        // Определяем в какой wizard отправить пользователя
        const targetScene = modelId === 'veed_fabric' ? 'veed_fabric_lipsync' : 'lip_sync'

        // Сохраняем выбранную модель в сессии
        ctx.session.selectedLipSyncModel = modelId

        logger.info(`🔄 [LIP_SYNC] Routing to ${targetScene} for model ${modelId}`, {
          telegramId: ctx.from?.id,
        })

        // Переходим в соответствующий wizard
        await ctx.scene.enter(targetScene)
      } catch (error) {
        logger.error('Error in lip_sync_model action:', {
          error,
          telegramId: ctx.from?.id,
          modelId,
        })
        await ctx.reply(
          'Произошла ошибка при выборе модели. Попробуйте еще раз.'
        )
      }
    })

    // ВАЖНО: setupHearsHandlers и handleTextMessage теперь регистрируются в bot.ts
    // чтобы hears обработчики срабатывали до общего текстового обработчика

    // ✅ РЕГИСТРИРУЕМ MULTI-PHOTO ACTION HANDLERS
    logger.info('🔧 [MULTI-PHOTO] Registering multi-photo action handlers')
    registerMultiPhotoActions(bot)

    console.log('🔧 [DEBUG] registerCommands FUNCTION COMPLETED SUCCESSFULLY!')
    logger.info('🔧 [DEBUG] registerCommands FUNCTION COMPLETED SUCCESSFULLY!')
  } catch (error) {
    console.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', error)
    logger.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
