/**
 * 🎯 РЕГИСТРАЦИЯ КОМАНД БОТА
 *
 * Центральная функция регистрации всех команд и обработчиков бота.
 * Создаёт полную архитектуру: middleware → navigation → commands → actions.
 */

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import { getBotNameByToken } from '@/core/bot'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { defaultSession } from '@/store'
import { extractPromoFromContext } from '@/helpers/contextUtils'
import { Scenes } from 'telegraf'
import { message } from 'telegraf/filters'

// Импорт всех сцен
import {
  startScene,
  menuScene,
  helpScene,
  inviteScene,
  changeLanguageScene,
  techSupportScene,
  paymentScene,
  rublePaymentScene,
  starPaymentScene,
  subscriptionScene,
  subscriptionCheckScene,
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
  hedraRenderWizard,
  heygenRenderWizard,
  falRenderWizard,
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
  instagramParserScene,
  instagramParserWizard,
  faceSwapWizard,
} from '@/scenes'

// Импорт обработчиков и команд
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { getUserData } from '@/core/supabase'
import {
  handleFluxKontextModelSelection,
  handleFluxKontextImage,
} from '@/commands/fluxKontextCommand'
import { SubscriptionType as SubscriptionTypeEnum } from '@/interfaces/subscription.interface'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { handleVideoStatusUpdate } from '@/handlers/handleTextToVideoDirect'
import { sendMediaToPulse } from '@/helpers/pulse'
import { handleHelloWorld } from '@/commands/handleHelloWorld'
import { priceCommand } from '@/commands/priceCommand'
import { setupInteractiveStats } from '@/commands/interactiveStatsCommand'
import {
  handleAddBalanceCommand,
  handleCheckBalanceCommand,
} from '@/handlers/adminCommands'
import expenseAnalysisCommand from '@/commands/expenseAnalysisCommand'
import { setupAutoFixerCommands } from '@/commands/autofixer/autofixer.command'
import { autoFixerConfigScene } from '@/commands/autofixer/autofixer-config.scene'
import { requireAdmin } from '@/middleware/adminOnly'
import { setupAutonomousMonitor } from '@/commands/autonomousMonitor'
import { registerMultiPhotoActions } from '@/handlers/multiPhotoActions'
import { handleHelpCommand } from '@/commands/helpCommand'
import { get100Command } from '@/commands/get100Command'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleBuy } from '@/handlers/handleBuy'
import { handleCancelButton } from '@/services/CancelButtonService'
import { registerPaymentActions } from '@/handlers/paymentActions'
import { categoryScenes } from '@/scenes/categoryScenes'

// Импорт из нового модуля навигации
import {
  CATEGORIES,
  showMainMenu as navShowMainMenu,
  showCategoryMenu as navShowCategoryMenu,
  getParsingAccess,
} from '@/navigation'

/**
 * ✅ ЕДИНАЯ ФУНКЦИЯ РЕГИСТРАЦИИ ВСЕХ КОМАНД И ОБРАБОТЧИКОВ
 * Перенесена из registerCommands.ts для централизации всей логики
 */
export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  console.log('🔴🔴🔴 DIAGNOSTIC: registerCommands STARTED! 🔴🔴🔴')
  console.log('🔴🔴🔴 DIAGNOSTIC: About to call logger.info')
  console.log('🎯 [Navigation] Registering all bot commands and handlers')
  logger.info(
    '🎯 [Navigation] Registering all bot commands and handlers'
  )
  console.log('🔴🔴🔴 DIAGNOSTIC: logger.info called')

  try {
    // 1. Логгер для ВСЕХ входящих обновлений
    bot.use((ctx, next) => {
      const messageText =
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined

      // ✅ СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ ОТЛАДКИ ПЛАТЕЖЕЙ
      if (messageText === '💳 Рублями' || messageText === '💳 Rubles') {
        logger.info('🔍 [PAYMENT DEBUG] Rubles button detected in raw update', {
          updateId: ctx.update.update_id,
          currentScene: ctx.scene?.current?.id,
          messageText,
          hasScene: !!ctx.scene?.current,
        })
      }

      logger.info('>>> RAW UPDATE RECEIVED', {
        updateId: ctx.update.update_id,
        updateType: ctx.updateType,
        messageText,
        messageLength: messageText?.length,
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

      // 🔍 СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ НАВИГАЦИИ
      if (messageText === '👤 Профиль') {
        logger.info('🔍 [NAVIGATION DEBUG] Profile button detected!', {
          updateId: ctx.update.update_id,
          messageText,
          messageCharCodes: Array.from(messageText || '').map(c => c.charCodeAt(0)),
          sceneInfo: ctx.scene?.current?.id,
        })
      }

      return next()
    })

    // 2. Middleware сцен (ДОЛЖЕН БЫТЬ ПОСЛЕ СЕССИИ - сессия теперь регистрируется в bot.ts)
    const stage = createStage()
    bot.use(stage.middleware())

    // 3. ✅ ИНИЦИАЛИЗАЦИЯ НАВИГАЦИИ ПОСЛЕ stage.middleware()
    // Теперь ctx.scene доступен для всех навигационных операций
    console.log('🟡 About to initialize navigation...')
    initializeNavigation(bot)
    console.log('🟢 Navigation initialized!')

    // 4. РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПЛАТЕЖЕЙ
    registerPaymentActions(bot)

    // 6. РЕГИСТРАЦИЯ ДРУГИХ КОМАНД (не навигация)

    // Фабрика для команд с проверкой приватного чата и подписки
    const createCommandHandler =
      (
        commandName: string,
        handler: (ctx: MyContext) => Promise<void>,
        options?: {
          requireSubscription?: boolean
          subscriptionFeature?: string
        }
      ) =>
      async (ctx: MyContext) => {
        if (!requirePrivateChat(ctx)) {
          return sendGroupCommandReply(ctx)
        }

        if (options?.requireSubscription) {
          const hasSubscription = await checkSubscriptionGuard(
            ctx,
            options.subscriptionFeature || commandName
          )
          if (!hasSubscription) {
            return
          }
        }

        await handler(ctx)
      }

    bot.command(
      'get100',
      createCommandHandler(
        'get100',
        async ctx => {
          if (!ctx.session.userModel) {
            ctx.session.userModel = {
              model_name: 'default',
              trigger_word: '',
              model_url: 'placeholder/placeholder:placeholder',
              finetune_id: '',
            }
          }
          await get100Command(ctx)
        },
        { requireSubscription: true, subscriptionFeature: '/get100' }
      )
    )

    bot.command(
      'support',
      createCommandHandler(
        'support',
        async ctx => {
          await ctx.scene.leave()
          await handleTechSupport(ctx as MyContext)
        },
        { requireSubscription: false }
      )
    )

    bot.command(
      'price',
      createCommandHandler(
        'price',
        async ctx => {
          return priceCommand(ctx)
        },
        { requireSubscription: true, subscriptionFeature: '/price' }
      )
    )

    bot.command(
      'kontext',
      createCommandHandler(
        'kontext',
        async ctx => {
          logger.info(
            'COMMAND /kontext: AI Photoshop (kontext alias) started',
            {
              telegramId: ctx.from?.id,
            }
          )
          await ctx.scene.leave()
          await ctx.scene.enter(ModeEnum.AiPhotoshop)
        },
        { requireSubscription: true, subscriptionFeature: '/kontext' }
      )
    )

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

    // 7. ✅ РЕГИСТРИРУЕМ MULTI-PHOTO ACTION HANDLERS
    logger.info('🔧 [MULTI-PHOTO] Registering multi-photo action handlers')
    registerMultiPhotoActions(bot)

    // 8. ✅ РЕГИСТРИРУЕМ AUTONOMOUS MONITOR КОМАНДЫ
    logger.info(
      '🤖 [AUTONOMOUS MONITOR] Registering autonomous monitor commands'
    )
    setupAutonomousMonitor(bot)

    // 9. ДОПОЛНИТЕЛЬНЫЕ ACTION-ОБРАБОТЧИКИ (не навигация)
    // ⚠️ ВАЖНО: Основные навигационные action-обработчики (go_main_menu, go_help, go_back)
    // уже зарегистрированы в registerNavigationActions() внутри initializeNavigation()
    // Здесь регистрируем только специфичные обработчики, не связанные с навигацией

    bot.action(
      'continue_solo',
      createMessageActionHandler('continue_solo', isRu =>
        isRu
          ? '👍 Отлично! Продолжайте пользоваться ботом самостоятельно. Если понадобится помощь - обращайтесь!'
          : '👍 Great! Continue using the bot on your own. If you need help - feel free to ask!'
      )
    )

    bot.action(
      'upscale_image',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()

        const { telegramId, username, isRu } = getUserInfoFromContext(ctx)

        if (!telegramId) {
          await ctx.reply(
            isRu ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        if (!ctx.session?.lastGeneratedImageUrl) {
          await ctx.reply(
            isRu
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте изображение с помощью FLUX Kontext.'
              : '❌ No image to upscale. Please generate an image with FLUX Kontext first.'
          )
          return
        }

        const { upscaleFluxKontextImage } = await import(
          '@/services/generateFluxKontext'
        )
        await upscaleFluxKontextImage({
          imageUrl: ctx.session.lastGeneratedImageUrl,
          telegram_id: telegramId,
          username,
          is_ru: isRu,
          ctx,
          originalPrompt: ctx.session.lastGeneratedPrompt,
        })
      }, 'upscale_image')
    )

    bot.action(
      'upscale_neurophoto_image',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()

        const { telegramId, username, isRu } = getUserInfoFromContext(ctx)

        if (!telegramId) {
          logger.error(
            'No telegram_id found in upscale_neurophoto_image action'
          )
          await ctx.reply(
            isRu ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        if (!ctx.session?.lastNeuroPhotoImageUrl) {
          logger.warn('No lastNeuroPhotoImageUrl in session', {
            telegramId,
            sessionData: JSON.stringify(ctx.session || {}),
          })
          await ctx.reply(
            isRu
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте нейрофото.'
              : '❌ No image to upscale. Please generate a neurophoto first.'
          )
          return
        }

        await ctx.reply(
          isRu
            ? '⌛ Увеличиваем качество нейрофото... Пожалуйста, подождите'
            : '⌛ Upscaling neurophoto quality... Please wait'
        )

        logger.info('🔴 BEFORE UPSCALE_IMAGE CALL', {
          telegram_id: telegramId,
          username,
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          prompt: ctx.session.lastNeuroPhotoPrompt,
          is_ru: isRu,
        })

        const { upscaleImage } = await import('@/services/imageUpscaler')
        const result = await upscaleImage({
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          telegram_id: telegramId,
          username,
          is_ru: isRu,
          ctx,
          originalPrompt:
            ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
        })

        logger.info('🟢 AFTER UPSCALE_IMAGE CALL', {
          telegram_id: telegramId,
          result: result ? 'Success' : 'No result',
        })
      }, 'upscale_neurophoto_image')
    )

    // Оптимизированные обработчики через фабрики
    bot.action(
      'more_editing',
      createMessageActionHandler(
        'more_editing',
        isRu =>
          isRu
            ? '📷 Отправьте новое изображение для редактирования:'
            : '📷 Send a new image for editing:',
        {
          afterReply: async ctx => {
            if (ctx.session) {
              ctx.session.awaitingFluxKontextImage = true
            }
          },
        }
      )
    )

    bot.action(
      'different_mode',
      createSceneActionHandler('different_mode', 'ai_photoshop_scene')
    )

    bot.action(
      'new_neurophoto_prompt',
      createSceneActionHandler(
        'new_neurophoto_prompt',
        ModeEnum.CheckBalanceScene,
        {
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.NeuroPhoto
          },
          afterEnter: async ctx => {
            const isRu = isRussianFromState(ctx)
            await ctx.reply(
              isRu
                ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
                : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
            )
          },
        }
      )
    )

    bot.action(
      'create_more_text_to_video',
      createSceneActionHandler(
        'create_more_text_to_video',
        ModeEnum.TextToVideo,
        {
          requireSubscription: true,
          subscriptionFeature: 'Text-to-Video',
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.TextToVideo
          },
        }
      )
    )

    bot.action(
      'create_more_image_to_video',
      createSceneActionHandler(
        'create_more_image_to_video',
        ModeEnum.ImageToVideo,
        {
          requireSubscription: true,
          subscriptionFeature: 'Image-to-Video',
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.ImageToVideo
          },
        }
      )
    )

    bot.action(
      'change_size',
      createSceneActionHandler('change_size', ModeEnum.SizeWizard)
    )

    bot.action(
      'improve_prompt',
      createSceneActionHandler('improve_prompt', ModeEnum.ImprovePromptWizard)
    )

    bot.action(
      'go_to_subscription_scene',
      createSceneActionHandler(
        'go_to_subscription_scene',
        ModeEnum.SubscriptionScene,
        {
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.SubscriptionScene
          },
          afterEnter: async () => {
            logger.info(
              'Successfully entered subscription scene via global action'
            )
          },
        }
      )
    )

    bot.action(
      /^subscribe_(.+)$/,
      withErrorHandling(async ctx => {
        const subscriptionType = ctx.match[1]
        logger.info('🚀 INLINE CALLBACK: Subscribe button pressed', {
          telegramId: ctx.from?.id,
          subscriptionType,
        })

        await ctx.answerCbQuery()
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        logger.info('About to enter subscription scene via inline callback')
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        logger.info(
          'Successfully entered subscription scene via inline callback'
        )
      }, 'subscribe_*')
    )

    bot.action(
      'update_video_status',
      withErrorHandling(async ctx => {
        await handleVideoStatusUpdate(ctx)
      }, 'update_video_status')
    )

    bot.action(
      'subscription_menu',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      }, 'subscription_menu')
    )

    bot.action(
      'main_menu',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        await navShowMainMenu(ctx)
      }, 'main_menu')
    )

    bot.action(
      /^lip_sync_model_(.+)$/,
      withErrorHandling(async ctx => {
        const modelId = ctx.match[1]
        logger.info('🎭 GLOBAL ACTION: lip_sync_model selected', {
          telegramId: ctx.from?.id,
          modelId,
        })

        await ctx.answerCbQuery()

        const targetScene =
          modelId === 'veed_fabric' ? 'veed_fabric_lipsync' : 'lip_sync'

        ctx.session.selectedLipSyncModel = modelId

        logger.info(
          `🔄 [LIP_SYNC] Routing to ${targetScene} for model ${modelId}`,
          {
            telegramId: ctx.from?.id,
          }
        )

        await ctx.scene.enter(targetScene)
      }, 'lip_sync_model_*')
    )

    // 9. Обработчик фото для FLUX Kontext
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

      // ВАЖНО: Проверяем, находится ли пользователь в AI Reels wizard
      const currentSceneId = ctx.scene?.current?.id
      if (
        currentSceneId === 'ai_reels_wizard' ||
        currentSceneId === 'ai_reels_entry' ||
        currentSceneId === 'ai_reels_render_wizard'
      ) {
        logger.info(
          '🎬 GLOBAL PHOTO HANDLER: Photo is for AI Reels wizard, skipping global handler',
          {
            telegramId: ctx.from?.id,
            currentScene: currentSceneId,
          }
        )
        // НЕ обрабатываем фото глобально, пусть wizard сам обработает
        return
      }

      // Проверяем, находится ли пользователь в других wizard'ах, которые обрабатывают фото
      const photoWizards = [
        'neuro_photo',
        'neuro_photo_v2',
        'face_swap',
        'image_to_video',
        'ai_photoshop_scene',
        'morphing_wizard',
        'avatar_transform',
        'digital_avatar_body',
        'digital_avatar_body_2',
        'veed_fabric_lipsync',
      ]

      if (currentSceneId && photoWizards.includes(currentSceneId)) {
        logger.info(
          '📸 GLOBAL PHOTO HANDLER: Photo is for wizard scene, skipping global handler',
          {
            telegramId: ctx.from?.id,
            currentScene: currentSceneId,
          }
        )
        return
      }

      // Проверяем, ожидает ли пользователь загрузку изображения для FLUX Kontext
      if (ctx.session?.awaitingFluxKontextImage) {
        const { handleFluxKontextImage } = await import(
          '@/commands/fluxKontextCommand'
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

    // Commands registered successfully
    logger.info(
      '✅ [Navigation] All commands and handlers registered successfully'
    )
  } catch (error) {
    console.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', error)
    logger.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// ========================================
// HELPER ФУНКЦИИ
// ========================================

/**
 * Создать Stage со всеми сценами
 */
export function createStage(): Scenes.Stage<MyContext> {
  // Проверка всех сцен перед созданием Stage
  const scenesToRegister = [
    startScene,
    menuScene,
    helpScene,
    inviteScene,
    changeLanguageScene,
    techSupportScene,
    paymentScene,
    rublePaymentScene,
    starPaymentScene,
    subscriptionScene,
    subscriptionCheckScene,
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
    hedraRenderWizard,
    heygenRenderWizard,
    falRenderWizard,
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
    autoFixerConfigScene,
    instagramParserScene,
    instagramParserWizard,
    faceSwapWizard,
    // ✅ ДОБАВЛЯЕМ СЦЕНЫ КАТЕГОРИЙ
    ...getCategoryScenes(),
  ]

  // 🔍 DEBUG: Print scene names from array definition
  const sceneNames = [
    'startScene',
    'menuScene',
    'helpScene',
    'inviteScene',
    'paymentScene',
    'rublePaymentScene',
    'starPaymentScene',
    'subscriptionScene',
    'subscriptionCheckScene',
    'checkBalanceScene',
    'balanceScene',
    'neuroPhotoWizard',
    'neuroPhotoWizardV2',
    'textToImageWizard',
    'textToVideoWizard',
    'imageToVideoWizard',
    'imageToPromptWizard',
    'imageUpscalerWizard',
    'improvePromptWizard',
    'trainFluxModelWizard',
    'uploadTrainFluxModelScene',
    'uploadVideoScene',
    'sizeWizard',
    'aiPhotoshopScene',
    'morphingWizard',
    'voiceAvatarWizard',
    'textToSpeechWizard',
    'videoTranscriptionWizard',
    'lipSyncWizard',
    'veedFabricWizard',
    'aiReelsWizard',
    'aiReelsEntryWizard',
    'aiReelsRenderWizard',
    'hedraRenderWizard',
    'heygenRenderWizard',
    'falRenderWizard',
    'avatarTransformScene',
    'avatarBrainWizard',
    'chatWithAvatarWizard',
    'selectModelWizard',
    'digitalAvatarBodyWizard',
    'digitalAvatarBodyWizardV2',
    'getRuBillWizard',
    'levelQuestWizard',
    'createUserScene',
    'neuroCoderScene',
    'instagramScrapingWizard',
    'autoFixerConfigScene',
    'instagramParserScene',
    'instagramParserWizard',
    'faceSwapWizard',
  ]

  // Validate scenes (critical errors only)
  scenesToRegister.forEach((scene, index) => {
    const hasId = scene?.id != null
    const hasMiddleware = typeof scene?.middleware === 'function'
    const isValid = hasId && hasMiddleware

    if (!isValid || scene === undefined || scene === null) {
      console.error(
        `❌ CRITICAL: Invalid scene at index ${index}: ${sceneNames[index]}`
      )
      throw new Error(
        `CRITICAL: Invalid scene at index ${index}: ${sceneNames[index]}`
      )
    }
  })

  return new Scenes.Stage<MyContext>(scenesToRegister as any)
}

/**
 * Получить сцены категорий для регистрации в Stage
 */
export function getCategoryScenes() {
  return categoryScenes
}

// Function to send the promotional message
const sendGroupCommandReply = async (ctx: MyContext) => {
  try {
    const botUsername = ctx.botInfo.username
    const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨

Я часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}

*Ом Шанти!* 🙏`
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
  }
}

/**
 * Обертка для обработки ошибок в action-обработчиках
 */
function withErrorHandling<T extends MyContext>(
  handler: (ctx: T) => Promise<void>,
  actionName: string
) {
  return async (ctx: T) => {
    try {
      await handler(ctx)
    } catch (error) {
      logger.error(`Error in ${actionName} action:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })
      const isRu = isRussianFromState(ctx)
      try {
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка. Попробуйте позже.'
            : '❌ An error occurred. Please try again later.'
        )
      } catch {
        // Игнорируем ошибки отправки сообщения
      }
    }
  }
}

/**
 * Фабрика для создания простых action-обработчиков (переход в сцену)
 */
function createSceneActionHandler(
  actionName: string,
  sceneId: string | ModeEnum,
  options?: {
    beforeEnter?: (ctx: MyContext) => Promise<void>
    afterEnter?: (ctx: MyContext) => Promise<void>
    requireSubscription?: boolean
    subscriptionFeature?: string
  }
) {
  return withErrorHandling(async (ctx: MyContext) => {
    logger.info(`GLOBAL ACTION: ${actionName}`, {
      telegramId: ctx.from?.id,
    })

    await ctx.answerCbQuery()

    // Проверка подписки, если требуется
    if (options?.requireSubscription) {
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        options.subscriptionFeature || actionName
      )
      if (!hasSubscription) {
        return
      }
    }

    // Выполняем beforeEnter, если есть
    if (options?.beforeEnter) {
      await options.beforeEnter(ctx)
    }

    await ctx.scene.leave()
    await ctx.scene.enter(sceneId as string)

    // Выполняем afterEnter, если есть
    if (options?.afterEnter) {
      await options.afterEnter(ctx)
    }
  }, actionName)
}

/**
 * Фабрика для создания action-обработчиков с сообщением
 */
function createMessageActionHandler(
  actionName: string,
  getMessage: (isRu: boolean) => string,
  options?: {
    beforeReply?: (ctx: MyContext) => Promise<void>
    afterReply?: (ctx: MyContext) => Promise<void>
  }
) {
  return withErrorHandling(async (ctx: MyContext) => {
    logger.info(`GLOBAL ACTION: ${actionName}`, {
      telegramId: ctx.from?.id,
    })

    await ctx.answerCbQuery()

    if (options?.beforeReply) {
      await options.beforeReply(ctx)
    }

    const isRu = isRussianFromState(ctx)
    await ctx.reply(getMessage(isRu))

    if (options?.afterReply) {
      await options.afterReply(ctx)
    }
  }, actionName)
}

/**
 * Получить информацию о пользователе из контекста
 */
function getUserInfoFromContext(ctx: MyContext) {
  return {
    telegramId: ctx.from?.id?.toString() || '',
    username: ctx.from?.username || '',
    isRu: isRussianFromState(ctx),
  }
}

/**
 * Проверить, что пользователь в приватном чате
 */
function requirePrivateChat(ctx: MyContext): boolean {
  return ctx.chat.type === 'private'
}

/**
 * Регистрация команд бота (/start, /help)
 */
function registerNavigationCommands(bot: Telegraf<MyContext>): void {
  // Команда /start - полная логика авторизации и показа главного меню
  bot.command('start', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }

    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('🚀 [Navigation] /start command', {
      telegramId,
      username: ctx.from?.username,
    })

    try {
      // Reset session
      const { defaultSession } = await import('@/store')
      ctx.session = { ...defaultSession }

      // Handle start parameters (invite code)
      if (ctx.message && 'text' in ctx.message) {
        const parts = ctx.message.text.split(' ')
        if (parts.length > 1) {
          const startParam = parts[1]

          const { extractPromoFromContext } = await import('@/helpers/contextUtils')
          const promoInfo = extractPromoFromContext(ctx)

          if (!promoInfo?.isPromo && /^\d+$/.test(startParam)) {
            ctx.session.inviteCode = startParam
            logger.info('Referral code set', { telegramId, startParam })
          }
        }
      }

      await ctx.scene.leave()

      // Check if user exists
      const { getUserDetailsSubscription } = await import('@/core/supabase')
      const userDetails = await getUserDetailsSubscription(telegramId)

      if (!userDetails.isExist) {
        await ctx.scene.enter(ModeEnum.CreateUserScene)
      } else {
        await ctx.scene.leave()
        await navShowMainMenu(ctx)
      }
    } catch (error) {
      logger.error('❌ [Navigation] Error in /start command:', {
        error,
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка. Попробуйте позже.'
          : '❌ An error occurred. Please try again later.'
      )
    }
  })

  // Команда /help
  bot.command('help', async ctx => {
    if (ctx.chat.type !== 'private') {
      return // Игнорируем в группах
    }

    logger.info('❓ [Navigation] /help command', {
      telegramId: ctx.from?.id,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('❌ [Navigation] Error in /help command:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  logger.info('✅ [Navigation] Registered navigation commands')
}

/**
 * Инициализация навигации (ПОСЛЕ stage.middleware())
 *
 * ⚠️ ВАЖНО: registerGlobalNavigationMiddleware больше НЕ вызывается здесь!
 * Он регистрируется ПОСЛЕДНИМ в registerCommands() ПОСЛЕ stage.middleware()
 */
function initializeNavigation(
  bot: Telegraf<MyContext>
): void {
  try {
    logger.info('🎯 [Navigation] Initializing navigation service (AFTER stage.middleware)...')

    // 1. Регистрируем команды бота (/start, /help и т.д.)
    registerNavigationCommands(bot)

    // 2. Регистрируем все обработчики навигации
    registerCategoryHandlers(bot)
    registerFunctionHandlers(bot)
    registerProfileHandlers(bot) // Специальные обработчики для профиля (включая реферальную систему)
    registerGlobalHandlers(bot)
    registerNavigationActions(bot) // Action-обработчики навигации
    registerSpecialHandlers(bot) // Специальные обработчики (Сгенерировать еще, Улучшить промт и т.д.)

    logger.info(
      '✅ [Navigation] Navigation service initialized successfully'
    )
  } catch (error) {
    logger.error('❌ [Navigation] Error during initialization:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}


// ========================================
// 6. HELPER FUNCTIONS FOR NAVIGATION
// ========================================

/**
 * Handle navigation to a specific function/item
 */
async function handleFunctionNavigation(
  ctx: MyContext,
  item: any
): Promise<void> {
  const userId = ctx.from?.id
  const isRu = isRussianFromState(ctx)

  // Check admin rights
  if (item.adminOnly && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) {
    await ctx.reply(
      isRu
        ? '🔒 Эта функция доступна только администраторам'
        : '🔒 This feature is only available to administrators'
    )
    return
  }

  // Check subscription
  if (item.requiresSubscription) {
    const hasSubscription = await checkSubscriptionGuard(ctx, item.ru)
    if (!hasSubscription) {
      return // User redirected to subscriptionScene
    }
  }

  // Leave current scene
  await ctx.scene.leave()

  // Set mode
  ctx.session.mode = item.mode as ModeEnum

  // Navigate to scene
  if (item.directScene) {
    // Direct transition (without CheckBalanceScene)
    await ctx.scene.enter(item.mode as string)
  } else {
    // Standard transition through CheckBalanceScene
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  }

  logger.info(`✅ [Navigation] Navigated to ${item.mode}`, {
    telegramId: ctx.from?.id,
  })
}

/**
 * Register category handlers
 */
export function registerCategoryHandlers(bot: Telegraf<MyContext>): void {
  logger.info(
    `🎯 [registerCategoryHandlers] Registering handlers for ${CATEGORIES.length} categories`
  )

  CATEGORIES.forEach(category => {
    logger.info(
      `🎯 [registerCategoryHandlers] Registering handler for category: ${category.id} (${category.ru})`,
      {
        ruText: category.ru,
        enText: category.en,
        textLength: category.ru.length,
        charCodes: Array.from(category.ru).map(c => c.charCodeAt(0))
      }
    )

    // Handler for entering category
    bot.hears([category.ru, category.en], async ctx => {
      const messageText = ctx.message?.text || ''

      logger.info(`🎯 [Navigation] Category selected: ${category.id}`, {
        telegramId: ctx.from?.id,
        categoryId: category.id,
        categoryRu: category.ru,
        categoryEn: category.en,
        receivedText: messageText,
        receivedTextLength: messageText.length,
        receivedTextCharCodes: Array.from(messageText).map(c => c.charCodeAt(0)),
        textMatch: messageText === category.ru || messageText === category.en
      })

      try {
        logger.info('🗺 [Navigation] Leaving current scene...', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })
        await ctx.scene.leave()

        logger.info('🗺 [Navigation] Showing category menu...', {
          telegramId: ctx.from?.id,
          categoryId: category.id,
        })
        await navShowCategoryMenu(ctx, category.id)

        logger.info('✅ [Navigation] Category menu shown successfully', {
          telegramId: ctx.from?.id,
          categoryId: category.id,
        })
      } catch (error) {
        logger.error(
          `❌ [Navigation] Error showing category ${category.id}:`,
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            telegramId: ctx.from?.id,
          }
        )
      }
    })
  })

  logger.info(
    `✅ [Navigation] Registered ${CATEGORIES.length} category handlers`
  )
}

/**
 * Register function handlers (level 2)
 */
export function registerFunctionHandlers(bot: Telegraf<MyContext>): void {
  let registeredCount = 0

  CATEGORIES.forEach(category => {
    category.items.forEach(item => {
      bot.hears([item.ru, item.en], async ctx => {
        logger.info(`🎯 [Navigation] Function selected: ${item.ru}`, {
          telegramId: ctx.from?.id,
          mode: item.mode,
        })

        try {
          await handleFunctionNavigation(ctx, item)
        } catch (error) {
          logger.error(
            `❌ [Navigation] Error navigating to ${item.mode}:`,
            {
              error,
              telegramId: ctx.from?.id,
            }
          )
        }
      })

      registeredCount++
    })
  })

  logger.info(
    `✅ [Navigation] Registered ${registeredCount} function handlers (excluding profile)`
  )
}

/**
 * Register handlers for special profile buttons
 */
export function registerProfileHandlers(bot: Telegraf<MyContext>): void {
  const profileCategory = CATEGORIES.find(cat => cat.id === 'profile')
  if (!profileCategory) {
    logger.warn('⚠️ [Navigation] Profile category not found')
    return
  }

  profileCategory.items.forEach(item => {
    // Специальный обработчик для баланса и топ-апа (есть логика проверки подписки)
    if (item.mode === ModeEnum.Balance || item.mode === ModeEnum.TopUpBalance) {
      bot.hears([item.ru, item.en], async ctx => {
        try {
          const telegramId = ctx.from?.id?.toString() || ''
          const { subscriptionType } =
            await getReferalsCountAndUserData(telegramId)
          const isRu = isRussianFromState(ctx)

          if (
            !subscriptionType ||
            subscriptionType === SubscriptionType.STARS
          ) {
            const message =
              item.mode === ModeEnum.TopUpBalance
                ? isRu
                  ? '❌ <b>Пополнение баланса недоступно без подписки</b>\n\n' +
                    '💳 Функция пополнения баланса доступна только для пользователей с активной подпиской.'
                  : '❌ <b>Balance top-up is not available without subscription</b>\n\n' +
                    '💳 The balance top-up feature is only available for users with an active subscription.'
                : isRu
                  ? '❌ <b>Просмотр баланса недоступен без подписки</b>\n\n' +
                    '💳 Функции баланса доступны только для пользователей с активной подпиской.'
                  : '❌ <b>Balance view is not available without subscription</b>\n\n' +
                    '💳 Balance features are only available for users with an active subscription.'

            await ctx.replyWithHTML(message)
            await navShowMainMenu(ctx)
            return
          }

          ctx.session.mode = item.mode as ModeEnum
          ctx.session.subscription = subscriptionType

          if (item.mode === ModeEnum.TopUpBalance) {
            if (ctx.scene?.current) {
              await ctx.scene.leave()
            }
            await ctx.scene.enter(ModeEnum.PaymentScene)
          } else if (item.mode === ModeEnum.Balance) {
            await ctx.scene.enter('balance_scene')
          } else {
            await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          }
        } catch (error) {
          logger.error(`❌ [Navigation] Error handling ${item.ru}:`, {
            error,
            telegramId: ctx.from?.id,
          })
        }
      })
      return
    }

    // Универсальная обработка для всех остальных кнопок (directScene: true)
    bot.hears([item.ru, item.en], async ctx => {
      logger.info(`🔗 [Navigation] Direct scene navigation for: ${item.ru}`, {
        telegramId: ctx.from?.id,
        mode: item.mode,
        directScene: item.directScene,
      })

      try {
        await ctx.scene.leave()
        await handleFunctionNavigation(ctx, item)
      } catch (error) {
        logger.error(`❌ [Navigation] Error handling ${item.ru}:`, {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })
  })

  logger.info(
    `✅ [Navigation] Registered ${profileCategory.items.length} profile handlers (2 special + ${profileCategory.items.length - 2} direct)`
  )
}

/**
 * Register global handlers
 */
function registerGlobalHandlers(bot: Telegraf<MyContext>): void {
  bot.hears(['◀️ Назад', '◀️ Back'], async ctx => {
    logger.info('◀️ [Navigation] Back button pressed', {
      telegramId: ctx.from?.id,
    })

    try {
      await ctx.scene.leave()
      await navShowMainMenu(ctx)
    } catch (error) {
      logger.error('❌ [Navigation] Error going back:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  logger.info('✅ [Navigation] Registered global handlers')
}

/**
 * Register navigation action handlers
 */
function registerNavigationActions(bot: Telegraf<MyContext>): void {
  bot.action(
    'go_main_menu',
    withErrorHandling(async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await navShowMainMenu(ctx)
    }, 'go_main_menu')
  )

  bot.action(
    'upscale_another_photo',
    createSceneActionHandler('upscale_another_photo', ModeEnum.ImageUpscaler)
  )

  bot.action('go_help', createSceneActionHandler('go_help', 'helpScene'))

  bot.action(
    'go_back',
    withErrorHandling(async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
    }, 'go_back')
  )

  logger.info('✅ [Navigation] Registered navigation action handlers')
}

/**
 * Register special handlers
 */
function registerSpecialHandlers(bot: Telegraf<MyContext>): void {
  bot.hears('🔄 Сгенерировать еще (Фото в Видео)', async ctx => {
    logger.info('🔄 [Navigation] Generate more (Image to Video)', {
      telegramId: ctx.from?.id,
    })
    try {
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    } catch (error) {
      logger.error('❌ [Navigation] Error entering ImageToVideo:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  bot.hears(
    ['✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)'],
    async ctx => {
      logger.info('✨ [Navigation] Create more (Text to Video)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error('❌ [Navigation] Error entering TextToVideo:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке начать новую генерацию. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to start a new generation. Please try returning to the main menu.'
        )
      }
    }
  )

  bot.hears(
    ['🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)'],
    async ctx => {
      logger.info('🖼 [Navigation] Select another model (Video)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error('❌ [Navigation] Error selecting model:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке выбора другой модели. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to select another model. Please try returning to the main menu.'
        )
      }
    }
  )

  logger.info('✅ [Navigation] Registered special handlers')
}
