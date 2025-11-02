import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { message, callbackQuery } from 'telegraf/filters'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { MAIN_MENU } from './constants/sceneIds'
import { showSimpleSceneMenu } from './simpleSceneMenu'
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
import { autoFixerConfigScene } from './commands/autofixer/autofixer-config.scene'
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

// 🔍 DEBUG: Проверка всех сцен ПЕРЕД созданием Stage
const scenesToRegister = [
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
  new Scenes.WizardScene(ModeEnum.Voice, ...(voiceAvatarWizard.steps as any)),
  new Scenes.WizardScene(
    ModeEnum.TextToSpeech,
    ...(textToSpeechWizard.steps as any)
  ),
  videoTranscriptionWizard,
  lipSyncWizard,
  veedFabricWizard,
  aiReelsWizard,
  aiReelsEntryWizard,
  aiReelsRenderWizard,
  avatarTransformScene,
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
  instagramScrapingWizard,
  autoFixerConfigScene,
  instagramParserScene,
]

// 🔍 DEBUG: Print scene names from array definition
const sceneNames = [
  'startScene', 'menuScene', 'helpScene', 'inviteScene', 'paymentScene',
  'rublePaymentScene', 'starPaymentScene', 'subscriptionScene', 'subscriptionCheckScene',
  'checkBalanceScene', 'balanceScene', 'neuroPhotoWizard', 'neuroPhotoWizardV2',
  'textToImageWizard', 'textToVideoWizard', 'imageToVideoWizard', 'imageToPromptWizard',
  'imageUpscalerWizard', 'faceSwapWizard', 'improvePromptWizard', 'trainFluxModelWizard',
  'uploadTrainFluxModelScene', 'uploadVideoScene', 'sizeWizard', 'aiPhotoshopScene',
  'morphingWizard', 'voiceWizard_wrapped', 'textToSpeechWizard_wrapped',
  'videoTranscriptionWizard', 'lipSyncWizard', 'veedFabricWizard', 'aiReelsWizard',
  'aiReelsEntryWizard', 'aiReelsRenderWizard', 'avatarTransformScene',
  'avatarBrainWizard_wrapped', 'chatWithAvatarWizard_wrapped', 'selectModelWizard',
  'digitalAvatarBodyWizard', 'digitalAvatarBodyWizardV2', 'getRuBillWizard',
  'levelQuestWizard', 'createUserScene', 'neuroCoderScene', 'instagramScrapingWizard',
  'autoFixerConfigScene', 'instagramParserScene'
]

// 🔍 DEBUG: Validate each scene
scenesToRegister.forEach((scene, index) => {
  const hasId = scene?.id != null
  const hasMiddleware = typeof scene?.middleware === 'function'
  const isValid = hasId && hasMiddleware

  console.log(`🔍 [SCENE ${index}] ${sceneNames[index] || 'ARRAY_INDEX_' + index}: ${scene?.id || 'UNKNOWN'}`, {
    hasId,
    hasMiddleware,
    isValid,
    isUndefined: scene === undefined,
    isNull: scene === null,
  })

  if (!isValid || scene === undefined || scene === null) {
    console.error(`❌❌❌ [SCENE ${index}] CRITICAL: ${sceneNames[index]} is invalid/undefined!`)
    console.error(`   - Variable name: ${sceneNames[index]}`)
    console.error(`   - Actual value: ${scene}`)
    console.error(`   - Type: ${typeof scene}`)
    console.error(`   - Has ID: ${hasId}`)
    console.error(`   - Has middleware: ${hasMiddleware}`)
  }
})

export const stage = new Scenes.Stage<MyContext>(scenesToRegister as any)

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
        return // Просто игнорируем в группе
      }
      logger.info('COMMAND /menu: Переход к простому главному меню', {
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.scene.leave()
        await showSimpleSceneMenu(ctx)
      } catch (error) {
        logger.error('Error in /menu command:', {
          error,
          telegramId: ctx.from?.id,
        })
        await ctx.reply('🏠 Ошибка меню. Попробуйте /start')
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

    // ✅ ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ УДАЛЕНЫ!
    // Все кнопки теперь обрабатываются через simpleSceneMenu.ts

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
