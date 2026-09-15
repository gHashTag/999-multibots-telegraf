/**
 * 🎯 РЕГИСТРАЦИЯ КОМАНД БОТА
 *
 * Центральная функция регистрации всех команд и обработчиков бота.
 * Создаёт полную архитектуру: middleware → navigation → commands → actions.
 */

import { Telegraf, Markup } from 'telegraf'
import { scrubCallbackSecrets } from '@/utils/scrubCallbackSecrets'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  replyWitness,
  silenceNet,
  deadPressNet,
} from '@/navigation/middleware/noSilence'
import { track } from '@/services/trackEvent'
import { checkFeatureAccess } from '@/helpers/featureGuard'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import {
  attachmentFromMessage,
  buildAgentTurn,
} from '@/services/agentAttachments'
import { createAlbumBuffer, albumCaption } from '@/services/albumBuffer'
import {
  mediaItemsFrom,
  rememberClientMediaQuietly,
} from '@/services/mediaLibrary'
import {
  ACTION_PREFIX,
  standardButtons,
  buttonsForAnswer,
} from '@/navigation/helpers/actionButtons'
import {
  CRM_ROOT_RE,
  CRM_LEAD_RE,
  CRM_SCOPE_RE,
  LEAD_ID_RE,
  crmCallback,
  hubRows,
  rootMenu,
  leadsKeyboard,
  emptyLeadsKeyboard,
  leadMenu,
  cardMenuRows,
  afterSentKeyboard,
  afterCancelKeyboard,
  afterTurnKeyboard,
  failKeyboard,
  summaryKeyboard,
  nextOf,
} from '@/navigation/helpers/crmMenu'
import {
  REWRITE_OPEN_RE,
  REWRITE_BACK_RE,
  REWRITE_STYLE_RE,
  rewriteNote,
  rewriteStyleById,
} from '@/navigation/helpers/rewriteMenu'
import { scopedPrompt } from '@/services/crmSweepScope'
import { getBotNameByToken } from '@/core/bot'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { defaultSession } from '@/store'
import { extractPromoFromContext } from '@/helpers/contextUtils'
import { handleClubCommand, registerClubActions } from '@/handlers/foundryClub'
import { handleFactoryCommand } from '@/handlers/factoryCommand'
import { Scenes } from 'telegraf'
import { message } from 'telegraf/filters'
import { SUPPORT_HANDLE } from '@/config/support'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { showStartGreeting } from '@/navigation/helpers/startGreeting'

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
  cryptoPaymentScene,
  subscriptionScene,
  subscriptionCheckScene,
  balanceScene,
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
  lipSyncModelSelectionScene,
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
  tonPaymentScene,
  tonNativePaymentScene,
  musicGenerationWizard,
  voiceTrainingWizard,
  aiCoverWizard,
  aiChatWizard,
  marketplaceWizard,
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
import appLoginCommand from '@/commands/appLoginCommand'
import sharePhoneCommand from '@/commands/sharePhoneCommand'
import expenseAnalysisCommand from '@/commands/expenseAnalysisCommand'
import { setupAutoFixerCommands } from '@/commands/autofixer/autofixer.command'
import { autoFixerConfigScene } from '@/commands/autofixer/autofixer-config.scene'
import { requireAdmin } from '@/middleware/adminOnly'
import { setupAutonomousMonitor } from '@/commands/autonomousMonitor'
import { setupInngestProbeCommand } from '@/commands/inngestProbeCommand'
import {
  createBusinessMiddleware,
  getBusinessStats,
} from '@/services/businessBotService'
import { registerMultiPhotoActions } from '@/handlers/multiPhotoActions'
import {
  registerInlineQuery,
  serviceFromStartParam,
  START_PARAM_PREFIX,
} from '@/handlers/inlineQuery'
import type { ServiceCard } from '@/handlers/inlineQuery'
import { handleHelpCommand } from '@/commands/helpCommand'
import { get100Command } from '@/commands/get100Command'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleBuy } from '@/handlers/handleBuy'
import { handleCancelButton } from './services/CancelButtonService'
import { registerPaymentActions } from '@/handlers/paymentActions'
import { categoryScenes } from '@/scenes/categoryScenes'

// Импорт из нового модуля навигации
import {
  CATEGORIES,
  showMainMenu as navShowMainMenu,
  showCategoryMenu as navShowCategoryMenu,
  getParsingAccess,
} from '@/navigation'

// ✅ Константы навигации теперь используются ТОЛЬКО в централизованном middleware:
// './middleware/registerGlobalNavigationMiddleware.ts'
// Импорты здесь удалены для упрощения и предотвращения дублирования

// Импорт глобального middleware навигации
import { registerGlobalNavigationMiddleware } from './middleware/registerGlobalNavigationMiddleware'

/**
 * ✅ ЕДИНАЯ ФУНКЦИЯ РЕГИСТРАЦИИ ВСЕХ КОМАНД И ОБРАБОТЧИКОВ
 * Перенесена из registerCommands.ts для централизации всей логики
 */
export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  console.log('🔴🔴🔴 DIAGNOSTIC: registerCommands STARTED! 🔴🔴🔴')
  console.log('🔴🔴🔴 DIAGNOSTIC: About to call logger.info')
  console.log('🎯 [Navigation] Registering all bot commands and handlers')
  logger.info('🎯 [Navigation] Registering all bot commands and handlers')
  console.log('🔴🔴🔴 DIAGNOSTIC: logger.info called')

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 ЦЕНТРАЛИЗОВАННАЯ ОБРАБОТКА ВСЕХ СООБЩЕНИЙ
    // ═══════════════════════════════════════════════════════════════════════

    /*
     * NO MESSAGE MAY BE MET WITH SILENCE. Two middlewares, and the pair only
     * works if they stay at the two ends of the chain: the witness must wrap
     * the reply methods before any handler can call them, and the net must be
     * the last thing registered, because reaching it is half of the evidence
     * that nobody answered. Why this hole exists at all is written down in
     * `middleware/noSilence.ts`.
     */
    bot.use(replyWitness)
    /*
     * THE NETS ARE REGISTERED EARLY AND DECIDE LATE.
     *
     * They await the whole rest of the chain and only then ask whether anybody
     * answered, so position and timing point in opposite directions: FIRST in
     * registration order, LAST in decision order.
     *
     * The previous version put them at the END of this function and got the
     * cheaper half of the property. Two cases were lost there. A handler that
     * answers and does not call next() terminates the chain, so a net standing
     * behind it never runs -- and that is exactly the case where a press was
     * handled but never ANSWERED, leaving the clock spinning under a perfectly
     * good reply. And `setupStatsCommand` is registered after registerCommands
     * in both bootstraps, so `/admin_sub` met the message net before its own
     * handler: an admin got the puzzled sentence first and the real answer
     * second.
     */
    bot.use(silenceNet)
    bot.use(deadPressNet)

    // 1. Логгер для ВСЕХ входящих обновлений (самый первый middleware)
    bot.use((ctx, next) => {
      const messageText =
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
      const callbackData =
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? ctx.callbackQuery.data
          : undefined

      // 🔥 ЕДИНЫЙ ЛОГ ДЛЯ ВСЕХ СООБЩЕНИЙ
      console.log('═══════════════════════════════════════════════════════')
      console.log('📨 INCOMING UPDATE:', {
        updateId: ctx.update.update_id,
        type: ctx.updateType,
        text: messageText || 'N/A',
        // Scrubbed: a confirmation secret rides in this field, and printing
        // it would let anybody who can read the logs authorise a send.
        callback: callbackData ? scrubCallbackSecrets(callbackData) : 'N/A',
        from: ctx.from?.id,
        scene: ctx.scene?.current?.id || 'none',
      })
      console.log('═══════════════════════════════════════════════════════')

      return next()
    })

    // 2. Создаём Stage со всеми сценами ПЕРВЫМ - нужен для ctx.scene
    console.log('🟡 Creating stage with all scenes...')
    const stage = createStage()

    /*
     * CONFIRMING A PREPARED MESSAGE RUNS BEFORE THE SCENES.
     *
     * Scene middleware is greedy. Verified against this repo's own telegraf,
     * in this exact registration order: a wizard step that handles
     * `callback_query` and does not call next() -- neuroPhotoWizard does
     * exactly that -- swallows the press, and the confirm handler below never
     * runs. The person taps "Отправить", nothing happens, and the draft
     * expires ten minutes later without a word.
     *
     * It is reachable: the agent's answer carries a "Пополнить баланс" button
     * that enters a scene, so a person can be inside one between seeing the
     * card and pressing it.
     *
     * These two handlers are registered BEFORE the stage for that reason.
     * They are safe there: they match one exact prefix, they touch no scene
     * state, and a press that is not theirs falls through untouched.
     */
    registerProposalButtons(bot)
    registerCrmCommands(bot)

    // 3. Добавляем Stage middleware - теперь ctx.scene доступен!
    bot.use(stage.middleware())
    console.log('🟢 Stage middleware added - ctx.scene now available!')

    // 4. ✅ ЕДИНСТВЕННЫЙ ЦЕНТРАЛИЗОВАННЫЙ НАВИГАЦИОННЫЙ MIDDLEWARE
    // Обрабатывает ВСЕ навигационные кнопки в ОДНОМ месте
    console.log('🟡 Registering CENTRALIZED navigation middleware...')
    registerGlobalNavigationMiddleware(bot)
    console.log('🟢 CENTRALIZED navigation middleware registered!')

    // 6. ✅ ИНИЦИАЛИЗАЦИЯ НАВИГАЦИИ ПОСЛЕ stage.middleware()
    // Теперь ctx.scene доступен для всех навигационных операций
    console.log('🟡 About to initialize navigation...')
    initializeNavigation(bot)
    console.log('🟢 Navigation initialized!')

    // 4. РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПЛАТЕЖЕЙ
    registerPaymentActions(bot)

    // 6. РЕГИСТРАЦИЯ ДРУГИХ КОМАНД (не навигация)

    // Фабрика для команд с проверкой приватного чата
    const createCommandHandler =
      (_commandName: string, handler: (ctx: MyContext) => Promise<void>) =>
      async (ctx: MyContext) => {
        if (!requirePrivateChat(ctx)) {
          return sendGroupCommandReply(ctx)
        }

        await handler(ctx)
      }

    bot.command(
      'get100',
      createCommandHandler('get100', async ctx => {
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
    )

    bot.command(
      'support',
      createCommandHandler('support', async ctx => {
        await ctx.scene.leave()
        await handleTechSupport(ctx as MyContext)
      })
    )

    bot.command(
      'price',
      createCommandHandler('price', async ctx => {
        return priceCommand(ctx)
      })
    )

    bot.command(
      'kontext',
      createCommandHandler('kontext', async ctx => {
        logger.info('COMMAND /kontext: AI Photoshop (kontext alias) started', {
          telegramId: ctx.from?.id,
        })
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.AiPhotoshop)
      })
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

    // 🏛 КЛУБ «ЗОЛОТАЯ ЛИТЕЙНАЯ» (Golden Foundry, @t27ai_bot)
    bot.command(['club', 'foundry'], async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }
      await handleClubCommand(ctx)
    })
    registerClubActions(bot)

    // 🏭 КОНТЕНТ-ЗАВОД: рилс из текста. Админская — прогон платный.
    bot.command('factory', requireAdmin(), handleFactoryCommand)

    // 👑 АДМИНСКИЕ КОМАНДЫ
    bot.command('addbalance', requireAdmin(), handleAddBalanceCommand)
    bot.command('checkbalance', requireAdmin(), handleCheckBalanceCommand)

    // 🤖 АВТОФИКСЕР КОМАНДЫ
    setupAutoFixerCommands(bot)

    // 📊 КОМАНДА АНАЛИЗА РАСХОДОВ
    bot.use(expenseAnalysisCommand)

    /**
     * /app — the sign-in button the iOS app points people at.
     *
     * Registered here beside the other composers rather than in a setup nobody
     * calls: this file is what actually runs. An exported handler that no one
     * imports is valid TypeScript and dead code, and this repository has been
     * bitten by exactly that more than once.
     */
    bot.use(appLoginCommand)
    /*
     * «Поделиться номером» — единственный способ узнать телефон человека.
     * Telegram не отдаёт его ботам ни при каком входе; он приходит ТОЛЬКО
     * контактом, который человек прислал сам. Обработчик здесь же, рядом с
     * входом в приложение: там номер и понадобится.
     */
    bot.use(sharePhoneCommand)

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

    // 7b. INLINE MODE: @bot <query> in any chat -> service cards with deep links
    registerInlineQuery(bot)

    // 8. ✅ РЕГИСТРИРУЕМ AUTONOMOUS MONITOR КОМАНДЫ
    logger.info(
      '🤖 [AUTONOMOUS MONITOR] Registering autonomous monitor commands'
    )
    setupAutonomousMonitor(bot)

    // 8b. /inngest_probe — admin-only safe probe of every served Inngest
    // function (spec: t27 specs/automation/inngest-probe-suite.t27)
    setupInngestProbeCommand(bot)

    // 9. TELEGRAM BUSINESS INTEGRATION (raw middleware — Telegraf 4.16 lacks native support)
    createBusinessMiddleware(bot as any)

    bot.command('business', requireAdmin(), async ctx => {
      const s = getBusinessStats()
      const connList =
        s.connections.length > 0
          ? s.connections
              .map(
                c =>
                  `  - ID: ${c.id.slice(0, 8)}... | User: ${c.userId} | Reply: ${c.canReply ? 'yes' : 'no'}`
              )
              .join('\n')
          : '  (none)'

      await ctx.reply(
        `📊 Telegram Business Stats\n\n` +
          `Active connections: ${s.activeConnections}\n` +
          `Messages today: ${s.todayMessages}\n` +
          `Unique users today: ${s.todayUniqueUsers}\n` +
          `Leads sent to owner today: ${s.todayLeads}\n` +
          `Non-text messages today: ${s.todayNonText}\n` +
          `Media relayed to owner today: ${s.todayMediaRelayed}\n` +
          `Skipped (owner replied): ${s.todayTakeoverSkipped}\n\n` +
          `Connections:\n${connList}`
      )
    })

    // 10. ДОПОЛНИТЕЛЬНЫЕ ACTION-ОБРАБОТЧИКИ (не навигация)
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

        // Consume-once guard. The ⬆️ Upscale button lives on a persistent photo
        // caption keyboard that is never stripped, and lastGeneratedImageUrl is
        // never cleared -- so re-tapping the old button later (or a double-tap)
        // would re-charge and re-run the paid upscale on the same image. Refuse
        // when THIS image was already upscaled, and mark it consumed BEFORE the
        // charge (check-then-set is synchronous). A newly generated image resets
        // lastGeneratedImageUrl, so its first upscale still proceeds.
        if (
          ctx.session.lastUpscaledImageUrl === ctx.session.lastGeneratedImageUrl
        ) {
          await ctx.reply(
            isRu
              ? '⏳ Это изображение уже улучшено. Сгенерируйте новое, чтобы улучшить его.'
              : '⏳ This image was already upscaled. Generate a new one to upscale.'
          )
          return
        }
        ctx.session.lastUpscaledImageUrl = ctx.session.lastGeneratedImageUrl

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

        // Consume-once guard (same class as upscale_image above, #1551). This
        // button rides the persistent neurophoto result keyboard that is never
        // stripped, lastNeuroPhotoImageUrl is set once at generation and never
        // cleared, and upscaleImage does not change it -- so re-tapping the old
        // button later re-charges for a deterministic (identical) upscale. Refuse
        // when this image was already upscaled, and mark it consumed BEFORE the
        // charge (synchronous check-then-set). A new neurophoto resets
        // lastNeuroPhotoImageUrl, so its first upscale still proceeds.
        if (
          ctx.session.lastUpscaledImageUrl ===
          ctx.session.lastNeuroPhotoImageUrl
        ) {
          await ctx.reply(
            isRu
              ? '⏳ Это нейрофото уже улучшено. Сгенерируйте новое, чтобы улучшить его.'
              : '⏳ This neurophoto was already upscaled. Generate a new one to upscale.'
          )
          return
        }
        ctx.session.lastUpscaledImageUrl = ctx.session.lastNeuroPhotoImageUrl

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
        ModeEnum.NeuroPhoto, // ✅ ИСПРАВЛЕНО: Прямой переход вместо CheckBalanceScene
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
          requireFeatureAccess: true,
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
          requireFeatureAccess: true,
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

    // 🆕 Обработчик кнопки "Пополнить баланс" из featureGuard
    bot.action(
      'go_to_balance_topup',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        logger.info('💳 [Navigation] Go to balance top-up', {
          telegramId: ctx.from?.id,
        })
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.PaymentScene)
      }, 'go_to_balance_topup')
    )

    /*
     * THE OTHER HALF OF THE SAME KEYBOARD.
     *
     * featureGuard's "not enough balance" refusal draws two buttons side by
     * side (helpers/featureGuard.ts:132-145): the top-up button ->
     * go_to_balance_topup, handled just above, and the main-menu button ->
     * go_to_main_menu, handled NOWHERE. The live spelling everywhere else is
     * `go_main_menu` (registerCommands.ts:2220), so this one was a typo that
     * killed half a money screen's keyboard and nothing noticed.
     *
     * Registered as its own trigger rather than fixed at the render site: the
     * refusal keyboards already sent are still live in people's chats.
     */
    bot.action(
      'go_to_main_menu',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.scene.leave().catch(() => {
          // Not in a scene is not an error here.
        })
        await navShowMainMenu(ctx)
      }, 'go_to_main_menu')
    )

    /*
     * A BUTTON OFFERED AFTER THE SCENE HAS ALREADY LEFT.
     *
     * ai-reels-wizard draws its create-a-voice button -> create_voice_avatar at
     * :589 and :832 and then calls `ctx.scene.leave()` on the very next
     * statement, so a scene-level handler could never fire even if one existed
     * -- and none does. This has to be bot-level for that reason.
     *
     * The message next to it also tells the person to use "/voice", a command
     * that does not exist in this bot. The button is the repair; the sentence
     * is left for whoever owns that copy.
     */
    bot.action(
      'create_voice_avatar',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.scene.leave().catch(() => {
          // Already outside a scene, which is the normal case here.
        })
        // 'voice' is the scene id of voiceAvatarWizard (scenes/voiceAvatarWizard/index.ts:18),
        // registered in the Stage at registerCommands.ts:1490.
        await ctx.scene.enter('voice')
      }, 'create_voice_avatar')
    )

    /*
     * A RETRY BUTTON DRAWN BY A SHARED SERVICE.
     *
     * generateAdvancedFluxKontext (services/generateFluxKontext.ts:608) sends
     * an error keyboard with "🔄 Try Again" -> flux_kontext_retry at :1116,
     * through ctx.telegram.sendMessage, so it arrives whatever the scene state
     * is. Its only handler is fluxKontextScene.action(...) -- and that scene is
     * not in the Stage at all: `fluxKontextScene` appears nowhere in
     * scenesToRegister, and checkBalanceScene reroutes the FluxKontext mode to
     * ai_photoshop_scene as legacy.
     *
     * So the button never retried on ANY of the four call paths. Three of them
     * are inside aiPhotoshopScene, where the person then receives a SECOND
     * error bubble carrying a visually identical retry that does work -- two
     * identical buttons, one live, no way to tell them apart.
     *
     * Bot level is the only place a service-sent message's press always lands.
     * ai_photoshop_scene is the live successor named by checkBalanceScene and
     * the scene three of the four callers are already in.
     */
    bot.action(
      'flux_kontext_retry',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.scene.leave().catch(() => {
          // Outside a scene is the normal case for a service-sent message.
        })
        await ctx.scene.enter('ai_photoshop_scene')
      }, 'flux_kontext_retry')
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

        // Strip the model-selection keyboard so a later stale tap on this
        // standalone ctx.reply message cannot re-fire this GLOBAL handler. It is
        // live from any scene, so a re-tap mid-flow would re-enter a wizard, swap
        // ctx.session.selectedLipSyncModel, and discard the user's in-progress
        // upload. Additive guard -- no charge here (answerCbQuery + scene.enter
        // only). .catch covers a message already edited/deleted.
        await ctx.editMessageReplyMarkup(undefined).catch(() => {})

        // 🎤 Маршрутизация на нужную сцену в зависимости от модели:
        // - veed_fabric (kie.ai) → veed_fabric_lipsync (image + text/audio)
        // - fal_veed_fabric (fal.ai) → veed_fabric_lipsync (image + audio)
        // - latentsync (fal.ai) → lip_sync (video + audio)
        // - hummingbird (fal.ai) → lip_sync (video + audio)
        let targetScene: string
        switch (modelId) {
          case 'veed_fabric':
          case 'fal_veed_fabric':
            // Image-based models → veed_fabric_lipsync
            targetScene = 'veed_fabric_lipsync'
            break
          case 'latentsync':
          case 'hummingbird':
            // Video-based models → lip_sync (video + audio wizard)
            targetScene = 'lip_sync'
            break
          default:
            // Fallback to old lip_sync wizard
            targetScene = 'lip_sync'
        }

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
    bot.on(message('photo'), async (ctx, next) => {
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
        'faceSwapWizard',
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

      /*
       * "PASSING IT ON" HERE PASSED NOTHING ON.
       *
       * The comment promised a hand-off and the handler simply ended. In
       * Telegraf that TERMINATES the chain, so the next middleware -- the one
       * that talks to the agent -- was never reached. A photo sent into the
       * agent chat therefore produced neither an answer nor an error: the
       * person saw the bot go quiet and could not tell that from a crash.
       *
       * `next()` puts the photo back into the chain, where the agent now
       * picks it up.
       */
      logger.info(
        '🎯 GLOBAL PHOTO HANDLER: not for FLUX Kontext, handing to the agent',
        {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        }
      )
      return next()
    })

    /*
     * Album parts gather here, in memory, for a second at a time.
     *
     * One buffer for the whole bot rather than one per chat: the key already
     * carries the chat id, and a per-chat map would be a second thing to clean
     * up after somebody leaves.
     */
    const albums = createAlbumBuffer()

    // 10. AI FALLBACK — последний handler, ловит необработанный текст
    bot.use(async (ctx: any, next: any) => {
      if (!ctx.message) return next()

      /*
       * A FILE IS A TURN IN THE CONVERSATION TOO.
       *
       * The first line used to be `if (!('text' in ctx.message)) return next()`
       * -- everything that was not text went past the agent and vanished
       * without a trace. Measured 2026-09-07: the agent path had NO handler at
       * all for `document`, `video`, `voice`, `audio`, `video_note` or
       * `animation`, and a photo was cut off by the global handler above.
       *
       * The agent's message type is text-only (`content: string | null`), so a
       * file moves to our own shelf and becomes a line of the form
       * `[attached image: ...; url=...]` -- exactly the one the mini app
       * writes. That way both surfaces speak one language to the model rather
       * than two.
       *
       * The caption IS the person's text: "make a reel out of this" arrives
       * there, not as a separate message.
       */
      const attachment = attachmentFromMessage(ctx.message)
      const written: string =
        ('text' in ctx.message ? ctx.message.text : ctx.message.caption) || ''

      if (!attachment) {
        if (!('text' in ctx.message)) return next()
        if (!written || written.startsWith('/')) return next()
        if (/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/u.test(written))
          return next()
      }
      if (ctx.scene?.current) return next()

      /*
       * The file reaches the shelf BEFORE the agent is asked, and a refusal is
       * spoken out loud.
       *
       * Silence is the thing being fixed here, so a failed upload ends in a
       * sentence rather than in nothing. If the file did not make it but the
       * person wrote something, the conversation still continues: the text goes
       * to the agent without the attachment, which is more honest than refusing
       * the whole turn.
       */
      if (attachment) {
        // The file travels over the network to us. Without this signal the
        // person stares at silence for several seconds with no idea whether
        // anything arrived.
        await ctx.sendChatAction('upload_document').catch(() => {})
      }
      /*
       * Did the question already reach the shared conversation?
       *
       * The server records the person's turn on its way into the agent, so
       * after a successful call it is stored. If the call never arrived, it is
       * not -- and the fallback below has to write both turns, or the answer
       * would appear in the conversation with nothing it answers.
       */
      let questionRecorded = false

      /*
       * SEVERAL PHOTOS SENT TOGETHER ARE ONE MESSAGE, NOT FIVE.
       *
       * Telegram delivers an album as separate updates sharing a
       * `media_group_id`, and only one of them carries the caption. Handled
       * one by one, five photos became five turns: five trips to the model and
       * five answers, four of them about a picture with no question attached.
       *
       * The FIRST part waits for its group and continues with all of them;
       * every later part gets `null` and stops here. A message that is not
       * part of an album passes straight through with itself as the only part.
       */
      const albumParts = await albums.collect(
        String(ctx.chat?.id ?? ctx.from?.id ?? ''),
        ctx.message
      )
      if (!albumParts) return

      const plan = await buildAgentTurn(ctx.telegram, albumParts)
      // The person's own files, indexed per person: in the bot the owner and
      // the sender are the same account. Fire and forget, shelf URLs only.
      if (plan.stored.length && ctx.from?.id) {
        const me = String(ctx.from.id)
        rememberClientMediaQuietly(
          me,
          me,
          'bot',
          mediaItemsFrom(plan, albumCaption(albumParts) || null)
        )
      }
      if (plan.refusal) await ctx.reply(plan.refusal)
      const text = plan.text
      if (!text.trim()) return next()

      /*
       * НАСТОЯЩИЙ АГЕНТ, А НЕ ПЕРЕПИСКА С МОДЕЛЬЮ.
       *
       * Здесь звался `chatWithAI` — голая модель без единого инструмента. Она
       * не могла посмотреть ленту, узнать баланс, выставить счёт или что-то
       * сгенерировать; на «создай видео из моей аватарки» она предлагала
       * набрать /start. Владелец назвал это точно: «он тупой, не подключен ко
       * всем инструментам».
       *
       * Теперь бот спрашивает того же агента, что и мини-апп: 47 инструментов
       * и ОБЩАЯ память разговора. Написанное здесь видно в приложении и
       * наоборот.
       *
       * Падение агента НЕ должно оставлять человека без ответа: ниже есть
       * запасной путь на старую модель, и он честно говорит, что инструменты
       * сейчас недоступны, — вместо молчания.
       */
      try {
        logger.info(`🤖 [Агент] "${text.substring(0, 50)}" от ${ctx.from?.id}`)
        /*
         * «Печатает…» ЖИВЁТ ПЯТЬ СЕКУНД, а виток агента — до трёх минут.
         *
         * Одного вызова не хватало: человек видел признак работы пять секунд,
         * а потом тишину, неотличимую от зависшего бота. Держим индикатор,
         * пока идёт работа, и гасим в finally — иначе он остался бы висеть
         * после ошибки.
         */
        const { держатьПечатает, разбитьДлинное } = await import(
          '@/helpers/telegramLongAnswer'
        )
        const стоп = держатьПечатает(ctx as any)
        let ответ
        try {
          const { спроситьАгента } = await import('@/services/trinityAgent')
          ответ = await спроситьАгента(String(ctx.from?.id ?? ''), text)
          /*
           * The request reached the server, so the server already stored the
           * question on its way into the agent. Only an ANSWER can be missing
           * from here on. A thrown call means it never arrived and neither
           * turn is on record -- see the fallback below.
           */
          questionRecorded = true
        } finally {
          стоп()
        }
        const isRuOtvet = isRussianFromState(ctx)
        /*
         * THE CARD IS SHOWN WHETHER OR NOT THE ANSWER CARRIED WORDS.
         *
         * It used to live inside `if (ответ.текст)`. A turn that called
         * tg_send and said nothing -- which the model does -- fell straight
         * through to the fallback path: the secret had already been issued and
         * burned, no card was ever drawn, and the prepared message sat in the
         * queue until it expired. The person was told nothing at all.
         *
         * Drawn BEFORE the answer text is handled, so the two orderings below
         * (reply-then-return, or fall through to the fallback model) both keep
         * it.
         */
        /*
         * A DRAFT WAITING FOR CONFIRMATION IS SHOWN, NOT LEFT IN A QUEUE.
         *
         * `tg_send` and its siblings never send -- they file a proposal. Up
         * to 2026-09-07 nothing anywhere read that queue, so the agent could
         * answer "I have prepared the message" and the message existed
         * nowhere a person could reach. The card below is what makes the
         * whole tool real: recipient, full text, and two buttons.
         *
         * Only after an ACTING tool. Asking for approval of something that
         * already happened teaches people to press the green button without
         * reading, which is the habit this card exists to prevent.
         */
        try {
          const { proposalCard, rememberCard, cardLeadOf } = await import(
            '@/services/telegramProposals'
          )
          /*
           * PRIVATE CHATS ONLY.
           *
           * The card carries the recipient and the full text of a message
           * from somebody's PERSONAL Telegram. The AI fallback that produced
           * this answer has no chat-type gate of its own, so in a group the
           * bot would print that draft -- and a "Send" button anybody
           * present could press -- in front of everyone.
           *
           * The draft is not lost: it waits in the queue and expires unsent.
           */
          const draft = ответ.proposal // cyrillic-ok: pre-existing local name
          if (ctx.chat?.type === 'private' && draft) {
            /*
             * THE DRAFT COMES FROM THE ANSWER, NOT FROM A SECOND REQUEST.
             *
             * It used to be fetched from GET /api/tg/proposal after the
             * reply. That route hands out no secret -- deliberately, since
             * anything holding the shared server key can call it -- so a
             * card built from it would carry a button that cannot confirm.
             * Taking it from this turn's own answer also removes the window
             * between "a draft exists" and "the client that caused it holds
             * the secret".
             */
            // The whole draft (a field list once dropped the name); a photo
            // card shows the service under the same two buttons.
            const isAdminHere = ADMIN_IDS_ARRAY.includes(Number(ctx.from?.id))
            const card = proposalCard(draft, isRuOtvet, {
              // The owner reads the person's history before approving, and
              // can send the words back to be written differently.
              extraRows: isAdminHere ? cardMenuRows(cardLeadOf(draft)) : [],
              rewrite: isAdminHere,
            })
            rememberCard(draft)
            if (!card.photo) {
              await ctx.reply(card.text, card.markup)
            } else {
              const { sendPhotoWithFallback } = await import(
                '@/helpers/sendPhotoWithFallback'
              )
              const shown = await sendPhotoWithFallback(ctx, card.photo, {
                caption: card.text,
                reply_markup: card.markup.reply_markup,
              })
              if (!shown)
                await ctx.reply(`${card.text}\n\n${card.photo}`, card.markup)
            }
          }
        } catch (e: any) {
          // The answer is already delivered. A failure here costs an unsent
          // draft, which expires by itself; it must not cost the reply.
          logger.warn('proposal card failed', { error: e?.message })
        }

        if (ответ.текст) {
          /*
           * Telegram ОТКАЗЫВАЕТ в отправке текста длиннее 4096 символов —
           * не обрезает, а отказывает. Развёрнутый ответ агента (разбор
           * ленты, план на неделю, список лидов) легко перешагивает предел,
           * и человек не получал НИЧЕГО: ни ответа, ни объяснения.
           */
          /*
           * BUTTONS UNDER THE AGENT'S ANSWER.
           *
           * Owner: "always send the answers with buttons so the user can react
           * without writing text". The agent may propose its own with
           * `[[Label|act:id]]` markers; unknown ids are dropped rather than
           * rendered, because a press that reaches nothing is worse than no
           * button. The standard set goes underneath, so there is always
           * something to tap.
           *
           * Only the LAST chunk carries the keyboard: Telegram attaches a
           * keyboard per message, and repeating it under every part of a long
           * answer would give the person the same three buttons four times.
           */
          const { text: ochishcheno, markup } = buttonsForAnswer(
            ответ.текст, // cyrillic-ok: field of ОтветАгента, defined in trinityAgent.ts
            isRuOtvet,
            // The seller's hub under every owner answer, one tap away.
            {
              app: ctx.chat?.type === 'private',
              ...(ADMIN_IDS_ARRAY.includes(Number(ctx.from?.id)) &&
              ctx.chat?.type === 'private'
                ? { tail: hubRows() }
                : {}),
            }
          )
          const chasti = разбитьДлинное(ochishcheno) // cyrillic-ok: helper from telegramLongAnswer.ts
          for (let i = 0; i < chasti.length; i++) {
            const posledniy = i === chasti.length - 1
            await ctx.reply(chasti[i], posledniy ? markup : undefined)
          }
          return
        }
        logger.warn('🤖 [Агент] пустой ответ — иду запасным путём', {
          telegram_id: ctx.from?.id,
        })
      } catch (err: any) {
        logger.error('🤖 [Агент] недоступен — иду запасным путём', {
          error: err?.message,
          telegram_id: ctx.from?.id,
        })
      }

      /*
       * THE FALLBACK MODEL MUST NOT PROMISE WHAT DOES NOT EXIST.
       *
       * Owner: "it talks complete nonsense and makes no assets". Half of that
       * is right here. When the agent is unreachable the answer comes from a
       * model with NO tools, and its prompt tells it to help "make photos,
       * video, voice" -- so it happily agrees to do what it cannot invoke, and
       * the person waits for a result that will never arrive.
       *
       * The prompt therefore carries a list of services that CANNOT be
       * performed right now (the provider key is unset). The model neither
       * invents that list nor softens it: it is computed from the environment.
       */
      const cannotDoNow = (): string => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const {
            unavailableWarning,
          } = require('@/services/capabilityPreflight')
          return unavailableWarning()
        } catch {
          // The check must never stop the reply: an empty string is the plain prompt.
          return ''
        }
      }

      try {
        const { chatWithAI } = await import('@/services/aiChatService')
        const reply = await chatWithAI(
          [
            {
              role: 'system',
              /*
               * ЗДЕСЬ БОТ ПРОДАВАЛ ТАРИФЫ, КОТОРЫХ НЕТ.
               *
               * Подсказка называла «Free (3/день), Basic (299₽), Pro (699₽),
               * Studio (1999₽)», и модель честно пересказывала это первым же
               * сообщением каждому новому человеку. Владелец: «у нас нет
               * тарифов, мы перепродаём токены с наценкой 200% и зарабатываем
               * на создании рилсов и контент-плана».
               *
               * То есть первый экран продукта звал платить за то, чего не
               * существует. Хуже обычной опечатки: человек уходит, не найдя
               * обещанного, и это выглядит обманом, а не ошибкой.
               *
               * ЦЕНЫ В ПОДСКАЗКЕ НЕ НАЗЫВАЮТСЯ НАМЕРЕННО. Они считаются из
               * себестоимости провайдеров и наценки (billing-shared.ts) и
               * меняются вместе с прайсами. Число, вписанное сюда руками,
               * разошлось бы с кассой молча — ровно так и появились тарифы,
               * которые пришлось убирать.
               */
              content:
                cannotDoNow() +
                'Ты — ассистент Trinity S³AI. Помогаешь делать фото, видео, ' +
                'озвучку и рилсы. Отвечай кратко (2-3 предложения). ' +
                'Как устроена оплата: тарифов и подписок НЕТ — есть токены, ' +
                'их покупают за звёзды Telegram и тратят на генерации. ' +
                'Точную цену конкретной операции и баланс не выдумывай: ' +
                'скажи, что покажешь их перед запуском, и предложи /start. ' +
                'Мы зарабатываем на создании рилсов и контент-плана. ' +
                'Если уместно, предложи кнопку в конце ответа маркером ' +
                '[[Подпись|act:id]], где id — одно из: topup, balance, can, human. ' +
                'Другие id не работают, не выдумывай их.',
            },
            { role: 'user', content: text },
          ],
          undefined,
          {
            telegramId: String(ctx.from?.id),
            botName: (ctx as any).botInfo?.username || '',
          }
        )
        /*
         * The fallback answer gets the same buttons. This is the path a person
         * meets when the agent is down, and it is exactly when they most need
         * something to press instead of a wall of apologetic text.
         */
        const isRuFb = isRussianFromState(ctx)
        const { text: replyClean, markup: replyMarkup } = buttonsForAnswer(
          reply,
          isRuFb,
          {
            app: ctx.chat?.type === 'private',
            ...(ADMIN_IDS_ARRAY.includes(Number(ctx.from?.id)) &&
            ctx.chat?.type === 'private'
              ? { tail: hubRows() }
              : {}),
          }
        )
        // Telegram refuses a text over 4096 characters outright; the fallback
        // answer is split like the agent's, keyboard on the last chunk.
        const { splitLongAnswer: splitLong } = await import(
          '@/helpers/telegramLongAnswer'
        )
        const fbParts = splitLong(replyClean)
        for (let i = 0; i < fbParts.length; i++) {
          await ctx.reply(
            fbParts[i],
            i === fbParts.length - 1 ? replyMarkup : undefined
          )
        }

        /*
         * THE FALLBACK ANSWER GOES INTO THE SHARED CONVERSATION TOO.
         *
         * It used to go nowhere. The question was already stored by the server
         * before `runAgent`, so the conversation ended on a question with no
         * answer -- and the next turn fed the model a transcript in which the
         * bot appeared to have ignored somebody. The mini app and the phone
         * showed the same hole.
         *
         * `void`, and the writer never throws: the person already has their
         * reply out loud, and failed bookkeeping must not turn an answered
         * question into an error.
         *
         * MERGE NOTE: the buttons and this record arrived from two different
         * branches and neither replaces the other -- one is what the person
         * sees, the other is what the next turn reads. `replyClean` is stored
         * rather than `reply`, because the conversation should hold what was
         * actually said, not the button markers stripped out of it.
         */
        const { recordTurns } = await import('@/services/trinityAgent')
        void recordTurns(
          String(ctx.from?.id ?? ''),
          questionRecorded
            ? [{ role: 'assistant', content: replyClean }]
            : [
                { role: 'user', content: text },
                { role: 'assistant', content: replyClean },
              ]
        )
      } catch (err: any) {
        logger.error('🤖 [AI Fallback] Error', { error: err?.message })

        /*
         * МОЛЧАНИЕ — ХУДШИЙ ИЗ ВОЗМОЖНЫХ ОТВЕТОВ.
         *
         * Здесь ошибка только логировалась, и человек не получал НИЧЕГО. Он
         * не знает, дошло ли сообщение, сломан ли бот, или его игнорируют.
         *
         * Проверено от лица владельца 06.09.2026: на вопрос «сколько у меня
         * контактов в телеграм?» бот промолчал. Его сообщение при этом
         * доехало и легло в общий разговор — молчал не приём, а ответ: ни
         * один провайдер модели не отозвался (у zai превышен лимит запросов,
         * ключ OpenAI недействителен).
         *
         * Причину называем ЧЕЛОВЕЧЕСКИМ языком, но без вранья: «перегружены»
         * и «ключ недействителен» чинятся по-разному, и владельцу нужно
         * знать, какой именно случай. Технический текст провайдера при этом
         * наружу не выносим — он ничего не говорит тому, кто просто хочет
         * сделать рилс.
         */
        const текстОшибки = String(err?.message ?? '')
        const этоЛимит = /лимит|rate.?limit|429/i.test(текстОшибки)
        const этоКлюч = /ключ|api.?key|unauthorized|401/i.test(текстОшибки)
        const причина = этоЛимит
          ? 'Модели сейчас перегружены — это временно.'
          : этоКлюч
            ? 'У одного из провайдеров недействителен ключ, владелец уже знает.'
            : 'Что-то сломалось на нашей стороне.'
        await ctx
          .reply(
            `${причина}\n\nПопробуйте через пару минут или откройте приложение — ` +
              'лента, файлы и профиль работают без модели.',
            standardButtons(isRussianFromState(ctx), {
              app: ctx.chat?.type === 'private',
            })
          )
          .catch(() => {
            // Если не отправляется даже это — писать больше некуда.
          })
      }
    })

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
    cryptoPaymentScene,
    subscriptionScene,
    subscriptionCheckScene,
    balanceScene,
    /*
     * neuroPhotoWizard НЕ регистрируется: он и V2 объявлены под ОДНИМ id
     * ('neuro_photo' — ModeEnum.NeuroPhoto). У Telegraf карта сцен
     * last-write-wins, поэтому V2, стоявший ниже, молча затенял V1, и в
     * работе всегда был только V2. Регистрация V1 ничего не давала и лишь
     * создавала впечатление, что обе версии живы.
     *
     * Поведение НЕ меняется: побеждал V2 и раньше. Убрана иллюзия выбора.
     */
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
    lipSyncModelSelectionScene,
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
    tonPaymentScene,
    tonNativePaymentScene,
    musicGenerationWizard,
    voiceTrainingWizard,
    aiCoverWizard,
    aiChatWizard,
    marketplaceWizard,
    // ✅ ДОБАВЛЯЕМ СЦЕНЫ КАТЕГОРИЙ
    ...getCategoryScenes(),
  ]

  // Validate scenes (critical errors only)
  scenesToRegister.forEach((scene, index) => {
    const hasId = scene?.id != null
    const hasMiddleware = typeof scene?.middleware === 'function'
    const isValid = hasId && hasMiddleware

    if (!isValid || scene === undefined || scene === null) {
      console.error(
        `❌ CRITICAL: Invalid scene at index ${index}: id=${scene?.id ?? 'undefined'}`
      )
      throw new Error(
        `CRITICAL: Invalid scene at index ${index}: id=${scene?.id ?? 'undefined'}`
      )
    }
  })

  const stage = new Scenes.Stage<MyContext>(scenesToRegister as any)

  // Global command interceptors — ensure /start, /menu, /help always work
  // even when user is inside a wizard scene (stage.middleware() runs before bot.command())
  stage.command('start', async (ctx, next) => {
    if (ctx.scene.current) {
      console.log(
        '🔴 [stage.command] /start intercepted, leaving scene:',
        ctx.scene.current.id
      )
      await ctx.scene.leave()
    }
    return next()
  })
  stage.command('menu', async (ctx, next) => {
    if (ctx.scene.current) {
      console.log(
        '🔴 [stage.command] /menu intercepted, leaving scene:',
        ctx.scene.current.id
      )
      await ctx.scene.leave()
    }
    return next()
  })
  stage.command('help', async (ctx, next) => {
    if (ctx.scene.current) {
      console.log(
        '🔴 [stage.command] /help intercepted, leaving scene:',
        ctx.scene.current.id
      )
      await ctx.scene.leave()
    }
    return next()
  })
  stage.command(['club', 'foundry'], async (ctx, next) => {
    if (ctx.scene.current) {
      console.log(
        '🔴 [stage.command] /club intercepted, leaving scene:',
        ctx.scene.current.id
      )
      await ctx.scene.leave()
    }
    return next()
  })

  return stage
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
    requireFeatureAccess?: boolean // Проверка баланса с справкой
  }
) {
  return withErrorHandling(async (ctx: MyContext) => {
    logger.info(`GLOBAL ACTION: ${actionName}`, {
      telegramId: ctx.from?.id,
    })

    await ctx.answerCbQuery()

    // Проверка доступа к функции (справка + баланс)
    if (options?.requireFeatureAccess && sceneId in ModeEnum) {
      const hasAccess = await checkFeatureAccess(ctx, sceneId as ModeEnum)
      if (!hasAccess) {
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
 * The two buttons under a prepared Telegram message.
 *
 * Registered BEFORE the scene middleware, because scene middleware is greedy:
 * a wizard step that handles `callback_query` without calling next() swallows
 * the press, and the person taps "Отправить" and watches nothing happen.
 */
export function registerProposalButtons(bot: Telegraf<MyContext>): void {
  /*
   * A card whose buttons survive their own press invites a second tap, and on
   * a phone the second tap is the normal case, not the rare one.
   */
  const stripButtons = async (ctx: any) =>
    ctx.editMessageReplyMarkup(undefined).catch(() => undefined)

  /*
   * The press carries the id AND the one-time secret.
   *
   * Telegram keeps callback data and returns it on the tap, so the bot holds
   * nothing between showing the card and the press -- a restart in between
   * strands nothing. The secret is what makes the press an authorisation: the
   * id alone is readable by anything holding the shared server key.
   */
  bot.action(/^tgp:ok:([^:]+):(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    await stripButtons(ctx)
    const isRu = isRussianFromState(ctx)
    const [, id, secret] = ctx.match as RegExpMatchArray
    const { confirmProposal, takeCardLead } = await import(
      '@/services/telegramProposals'
    )
    const lead = takeCardLead(id)
    const r = await confirmProposal(String(ctx.from?.id ?? ''), id, secret)
    // Either press frees the proactive sweep to prepare the next card, and
    // moves a scoped sweep on to the next person.
    void import('@/services/crmProactive').then(m =>
      m.noteResolved(String(ctx.from?.id ?? ''), id)
    )
    /*
     * THREE ANSWERS, BECAUSE THERE ARE THREE STATES.
     *
     * "Sent" and "not sent" are the easy two. The third is a request that left
     * and never came back: the route deletes the draft and only then sends, so
     * the message may already be sitting in somebody's chat. Reproduced --
     * against a server that sends and then drops the socket, the recipient got
     * the message and the owner read "not sent".
     *
     * Told "not sent", a person writes it again and it arrives twice. Told the
     * truth, they look at the chat. The truth is cheaper.
     */
    await ctx.reply(
      r.ok
        ? isRu
          ? '✅ Отправлено'
          : '✅ Sent'
        : r.unknown
          ? isRu
            ? '⚠️ Связь прервалась — не знаю, ушло сообщение или нет. ' +
              'Посмотрите чат, прежде чем отправлять снова.'
            : '⚠️ The connection dropped — I cannot tell whether it went. ' +
              'Check the chat before sending again.'
          : // A server ANSWER: this one really did not send. The reason is
            // shown as it came, because "something went wrong" would hide the
            // only thing that says whether to retry or to rewrite.
            (isRu ? '❌ Не отправлено: ' : '❌ Not sent: ') + (r.error ?? ''),
      afterSentKeyboard(lead)
    )
  })

  bot.action(/^tgp:no:([^:]+):(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    await stripButtons(ctx)
    const isRu = isRussianFromState(ctx)
    const [, id, secret] = ctx.match as RegExpMatchArray
    const { cancelProposal, takeCardLead } = await import(
      '@/services/telegramProposals'
    )
    const lead = takeCardLead(id)
    await cancelProposal(String(ctx.from?.id ?? ''), id, secret)
    // Either press frees the proactive sweep to prepare the next card, and
    // moves a scoped sweep on to the next person.
    void import('@/services/crmProactive').then(m =>
      m.noteResolved(String(ctx.from?.id ?? ''), id)
    )
    /*
     * Said plainly, and said even when the cancel call failed. The draft is
     * consumed by the same claim either way, and a proposal that expires
     * unsent is the same outcome as one cancelled -- telling somebody their
     * cancel "did not work" would invite them to hunt for a way to cancel it
     * harder.
     */
    await ctx.reply(
      isRu ? '✖️ Отменено, ничего не ушло' : '✖️ Cancelled, nothing was sent',
      afterCancelKeyboard(lead)
    )
  })

  /*
   * ── "NOT LIKE THAT" ────────────────────────────────────────────────────
   *
   * Three presses, and only the third one does anything: open the styles,
   * close them again, or rewrite. The first two edit the card's own markup
   * and decide nothing, which is why they neither consume the remembered
   * draft nor touch the sweep.
   *
   * Owner-only and private-chat-only: the rewrite runs a CRM turn over the
   * owner's correspondence. The card carries these buttons only for an
   * admin, but a callback is a string anybody can send back, so the gate is
   * here as well as on the keyboard.
   */
  const rewriteAllowed = (ctx: MyContext): boolean =>
    ADMIN_IDS_ARRAY.includes(Number(ctx.from?.id)) &&
    ctx.chat?.type === 'private'

  const redrawCard = async (ctx: any, expanded: boolean) => {
    const [, id, secret] = ctx.match as RegExpMatchArray
    const { cardKeyboard, peekCardLead } = await import(
      '@/services/telegramProposals'
    )
    const lead = peekCardLead(id)
    await ctx
      .editMessageReplyMarkup(
        cardKeyboard({ id, secret }, isRussianFromState(ctx), {
          rewrite: true,
          expanded,
          extraRows: cardMenuRows(lead),
        }).reply_markup
      )
      .catch(() => undefined)
  }

  bot.action(REWRITE_OPEN_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!rewriteAllowed(ctx)) return
    await redrawCard(ctx, true)
  })

  bot.action(REWRITE_BACK_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!rewriteAllowed(ctx)) return
    await redrawCard(ctx, false)
  })

  bot.action(REWRITE_STYLE_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!rewriteAllowed(ctx)) return
    const [, styleId, id, secret] = ctx.match as RegExpMatchArray
    const style = rewriteStyleById(styleId)
    if (!style) return
    /*
     * Ahead of the work, not after it. The remembered draft is handed out
     * once: a second tap that got as far as `takeCardDraft` would find it
     * gone and tell the person the card had gone cold -- a minute after they
     * pressed it, about a rewrite that is running.
     */
    if (!pressOnceGlobal(`re:${id}`)) return
    await stripButtons(ctx)
    const owner = String(ctx.from?.id ?? '')

    /*
     * THE OLD DRAFT DIES FIRST.
     *
     * A rewrite that left the previous words in the queue would mean two
     * sendable drafts for one person, and the card for the first one is
     * still scrolled up in this chat with a live secret in its buttons.
     * Cancel it before writing anything new -- and the cancel needs the
     * secret, which is why the styles carry it.
     */
    const { cancelProposal, takeCardDraft } = await import(
      '@/services/telegramProposals'
    )
    const card = takeCardDraft(id)
    await cancelProposal(owner, id, secret).catch(() => undefined)

    /*
     * A SCOPED SWEEP IS STOPPED, NOT ADVANCED.
     *
     * `noteResolved` is what the send and cancel buttons call, and for a
     * scoped sweep it moves the cursor to the NEXT person -- which here
     * would start a turn for somebody else while this rewrite is still
     * being written for this one. Stop the round trip instead and say so;
     * with the scope gone, `noteResolved` only frees the card hold, which
     * the new turn needs or it would answer "held".
     */
    const proactive = await import('@/services/crmProactive')
    const stopped = proactive.activeScope(owner)
      ? proactive.stopScope(owner)
      : ''
    proactive.noteResolved(owner, id)

    if (!card?.lead) {
      /*
       * Fifteen minutes passed, or the bot restarted between the card and
       * the press. The draft is cancelled either way; what is missing is
       * the person it was for, and guessing one would prepare a message
       * for the wrong human being.
       */
      await ctx.reply(
        'Старый вариант отменён — ничего не ушло. Но карточка уже остыла: не помню, для кого она была. Открой человека и нажми «Подготовить».',
        Markup.inlineKeyboard(hubRows())
      )
      return
    }
    if (!preparedForOwner) {
      await ctx.reply(
        'Старый вариант отменён, но переписать некому: раздел «Продавец» не подключён к этому боту.',
        Markup.inlineKeyboard(hubRows())
      )
      return
    }
    await preparedForOwner(ctx, card.lead, {
      note: rewriteNote(style, card.what),
      headline: [
        `✍️ Переписываю для ${card.lead}: ${style.label}.`,
        'Старый вариант отменён, ничего не ушло.',
        stopped,
        'Читаю переписку, спрашиваю агента (до 3 минут). Ничего не уйдёт без твоей кнопки.',
      ]
        .filter(Boolean)
        .join(' '),
    })
  })
}

/**
 * A costly button pressed twice within a breath acts once.
 *
 * The CRM menu has its own copy of this, closed over its own map; this one
 * serves the proposal buttons, which are registered in a different place and
 * earlier. Same rule, same five seconds.
 */
const pressedGlobally = new Map<string, number>()
function pressOnceGlobal(key: string): boolean {
  const now = Date.now()
  for (const [k, at] of pressedGlobally)
    if (now - at > 5_000) pressedGlobally.delete(k)
  if (pressedGlobally.has(key)) return false
  pressedGlobally.set(key, now)
  return true
}

/** Is this a one-to-one chat rather than a group? */
function requirePrivateChat(ctx: MyContext): boolean {
  return ctx.chat.type === 'private'
}

/** Registers the bot's own commands: /start, /help. */
function registerNavigationCommands(bot: Telegraf<MyContext>): void {
  /*
   * BUTTONS UNDER EVERY ANSWER, AND A PRESS THAT ACTUALLY LANDS SOMEWHERE.
   *
   * Owner: "the bot must proactively offer to pay, right after /start, so it
   * is clear what to do", and "always send the answers with buttons so the
   * user can react without writing text".
   *
   * These handlers sit on the BOT, not inside a scene, so a press works
   * wherever the person is -- including in the middle of a conversation with
   * the agent, which is exactly where a scene-level handler would not fire.
   *
   * Every action rendered by actionButtons.ts is answered here. That pairing
   * is the point: a button whose press reaches nothing is the same broken
   * promise as a service with no provider key, one interaction later.
   */
  bot.action(`${ACTION_PREFIX}topup`, async ctx => {
    // Fire-and-forget: the funnel step is recorded, the person is not made to
    // wait for it, and a failed write cannot cost them the screen.
    void track(ctx as any, 'topup_opened')
    // answerCbQuery first: Telegram shows a spinner on the button until it is
    // answered, and a scene transition can take a moment.
    await ctx.answerCbQuery().catch(() => undefined)
    // "Top up" means the balance, never the plan somebody selected earlier and
    // abandoned: a stale selectedPayment would hijack this press.
    ctx.session.selectedPayment = undefined
    // The chooser, not Stars alone. Owner, 2026-09-09: "add payment in rubles,
    // by choice, or in crypto". PaymentScene offers every method that exists:
    // Stars, crypto (TON USDT / TON / USDC on Base when it can be credited),
    // and rubles where the bot allows them (shouldShowRubles).
    await ctx.scene.enter(ModeEnum.PaymentScene, {})
  })

  bot.action(`${ACTION_PREFIX}pay_rub`, async ctx => {
    void track(ctx as any, 'topup_opened')
    await ctx.answerCbQuery().catch(() => undefined)
    ctx.session.selectedPayment = undefined
    // A bot that hides rubles gets the chooser instead of a door it does not
    // have: the same press must never dead-end.
    if (!shouldShowRubles(ctx)) {
      await ctx.scene.enter(ModeEnum.PaymentScene, {})
      return
    }
    await ctx.scene.enter(ModeEnum.RublePaymentScene)
  })

  bot.action(`${ACTION_PREFIX}pay_crypto`, async ctx => {
    void track(ctx as any, 'topup_opened')
    await ctx.answerCbQuery().catch(() => undefined)
    ctx.session.selectedPayment = undefined
    // Into the payment scene, straight onto its crypto menu: the
    // crypto_select_* presses are handled inside that scene only.
    await ctx.scene.enter(ModeEnum.PaymentScene, { crypto: true })
  })

  bot.action(`${ACTION_PREFIX}balance`, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    await ctx.scene.enter(ModeEnum.BalanceScene)
  })

  /*
   * CONFIRMING OR CANCELLING A PREPARED TELEGRAM MESSAGE.
   *
   * The press IS the decision -- nothing before it sends anything. The id
   * travels in the callback data, so it is a claim and not a credential: the
   * server checks that the draft belongs to whoever pressed, and consumes it
   * in the same step, because on a phone a slow reply and a missed press look
   * identical and the second tap is the normal case, not the rare one.
   *
   * The buttons are removed either way. A card whose buttons survive their own
   * press invites exactly that second tap.
   */
  bot.action(`${ACTION_PREFIX}can`, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    const isRu = isRussianFromState(ctx)
    /*
     * Answered from the preflight rather than from a written list: a menu
     * typed by hand drifts, and this one would drift towards promising more
     * than the keys allow -- the failure the preflight exists to stop.
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { checkAll } = require('@/services/capabilityPreflight')
    const all = checkAll()
    const ready = all.filter((v: any) => v.available && v.capability.paid)
    const head = isRu
      ? ready.length
        ? 'Сейчас доступно:'
        : 'Сейчас платные услуги недоступны — владелец уже знает.'
      : ready.length
        ? 'Available right now:'
        : 'Paid services are unavailable right now.'
    const body = ready.map((v: any) => `• ${v.capability.name}`).join('\n')
    await ctx.reply(
      [head, body].filter(Boolean).join('\n'),
      standardButtons(isRu, { app: ctx.chat?.type === 'private' })
    )
  })

  bot.action(`${ACTION_PREFIX}human`, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    const isRu = isRussianFromState(ctx)
    // The support handle: the bot's avatar names one, else the house default.
    let support: string = SUPPORT_HANDLE
    try {
      const { avatarService } = await import('@/services/plan_b/avatar.service')
      const avatar = await avatarService.getAvatarByTelegramId(
        String(ctx.from?.id ?? '')
      )
      if (avatar?.support) support = String(avatar.support)
    } catch {
      // The default handle answers when the avatar cannot be read.
    }
    const handle = support.replace(/^@/, '')
    const rows = [
      [
        Markup.button.url(
          isRu ? `✉️ Написать @${handle}` : `✉️ Message @${handle}`,
          `https://t.me/${handle}`
        ),
      ],
      ...standardButtons(isRu, { app: ctx.chat?.type === 'private' })
        .reply_markup.inline_keyboard,
    ]
    await ctx.reply(
      isRu
        ? `🙋 Живой человек — @${handle}. Напишите, что случилось, и вам ответят.`
        : `🙋 A person: @${handle}. Write what happened and you will get an answer.`,
      Markup.inlineKeyboard(rows)
    )
  })

  // Команда /start - полная логика авторизации и показа главного меню
  bot.command('start', async ctx => {
    void track(ctx as any, 'start')
    console.log('🔴 [DEBUG /start] ========== /start COMMAND FIRED ==========')
    console.log('🔴 [DEBUG /start] chatType:', ctx.chat.type)
    console.log('🔴 [DEBUG /start] telegramId:', ctx.from?.id)
    console.log(
      '🔴 [DEBUG /start] currentScene BEFORE reset:',
      ctx.scene?.current?.id || 'none'
    )
    console.log(
      '🔴 [DEBUG /start] session BEFORE reset:',
      JSON.stringify({
        mode: ctx.session?.mode,
        wizardData: ctx.session?.wizardData
          ? Object.keys(ctx.session.wizardData)
          : 'none',
      })
    )

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
      console.log('🔴 [DEBUG /start] Session RESET done')

      // Handle start parameters (invite code / клуб)
      let wantsFoundryClub = false
      let inlineService: ServiceCard | undefined
      if (ctx.message && 'text' in ctx.message) {
        const parts = ctx.message.text.split(' ')
        if (parts.length > 1) {
          const startParam = parts[1]

          /*
           * The CRM deep link is read FIRST and consumed whole.
           *
           * It has to run before the referral branch: that one accepts any bare
           * number, and a payload it does not recognise falls through to it
           * silently. It also has to be admin-only -- `prepare` reads the
           * owner's correspondence -- and private-chat-only, which the guard
           * above has already established by this point.
           */
          const prepLead = crmPrepLead(startParam)
          if (prepLead) {
            if (
              ADMIN_IDS_ARRAY.includes(Number(ctx.from?.id)) &&
              preparedForOwner
            ) {
              logger.info('CRM prepare deep-link', { telegramId, prepLead })
              await preparedForOwner(ctx, prepLead)
              return
            }
            // Not the owner: say nothing about what the payload meant and let
            // /start behave exactly as it does for everybody else.
            logger.info('CRM prepare deep-link refused', { telegramId })
          }

          const { extractPromoFromContext } = await import(
            '@/helpers/contextUtils'
          )
          const promoInfo = extractPromoFromContext(ctx)

          if (!promoInfo?.isPromo && /^\d+$/.test(startParam)) {
            ctx.session.inviteCode = startParam
            logger.info('Referral code set', { telegramId, startParam })
          } else if (/^(club|foundry)$/i.test(startParam)) {
            // Ссылка с лендинга t27.ai/foundry: t.me/t27ai_bot?start=foundry.
            // В сессию тоже: новый пользователь сперва уходит в CreateUserScene,
            // и локальная переменная до показа клуба не доживает.
            wantsFoundryClub = true
            ctx.session.foundryDeepLink = true
            logger.info('Foundry deep-link', { telegramId, startParam })
          } else if (startParam.startsWith(START_PARAM_PREFIX)) {
            // Inline card "open in the bot" (src/handlers/inlineQuery.ts):
            // an existing user lands straight in that service's scene.
            inlineService = serviceFromStartParam(startParam)
            logger.info('Inline deep-link', {
              telegramId,
              startParam,
              found: !!inlineService,
            })
          }
        }
      }

      console.log('🔴 [DEBUG /start] About to leave scene...')
      await ctx.scene.leave()
      console.log('🔴 [DEBUG /start] Scene left. Checking user...')

      // Check if user exists
      const { getUserDetailsSubscription } = await import('@/core/supabase')
      const userDetails = await getUserDetailsSubscription(telegramId)

      console.log('🔴 [DEBUG /start] userExists:', userDetails.isExist)

      if (!userDetails.isExist) {
        console.log('🔴 [DEBUG /start] Entering CreateUserScene...')
        await ctx.scene.enter(ModeEnum.CreateUserScene)
        console.log('🔴 [DEBUG /start] CreateUserScene entered')
      } else if (inlineService?.mode) {
        ctx.session.mode = inlineService.mode
        await ctx.scene.enter(inlineService.mode)
      } else if (wantsFoundryClub) {
        console.log('🔴 [DEBUG /start] Foundry deep-link, showing club...')
        await handleClubCommand(ctx)
      } else {
        console.log('🔴 [DEBUG /start] User exists, showing start greeting...')
        // The project greeting with a door for every thing and every one,
        // instead of the bare main menu. Every other path still ends at
        // navShowMainMenu(ctx); /start is the one place a person arrives
        // knowing nothing, so it is the one place that explains.
        await showStartGreeting(ctx)
        console.log('🔴 [DEBUG /start] Start greeting shown OK')
      }
    } catch (error) {
      console.log(
        '🔴 [DEBUG /start] ERROR:',
        error instanceof Error ? error.message : String(error)
      )
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
function initializeNavigation(bot: Telegraf<MyContext>): void {
  try {
    logger.info(
      '🎯 [Navigation] Initializing navigation service (AFTER stage.middleware)...'
    )

    // 1. Регистрируем команды бота (/start, /help и т.д.)
    registerNavigationCommands(bot)

    // 2. Регистрируем обработчики КАТЕГОРИЙ и ФУНКЦИЙ
    // (📸 Фото, 🎥 Видео и их подменю - НЕ обрабатываются в centralized middleware)
    registerCategoryHandlers(bot)
    registerFunctionHandlers(bot)

    // ⚠️ УДАЛЕНО: registerProfileHandlers и registerGlobalHandlers
    // Причина: Их логика теперь в centralized middleware (registerGlobalNavigationMiddleware)
    // - Главное меню, Назад, Отмена → обрабатываются middleware
    // - Профиль, Баланс, Подписка → обрабатываются middleware
    // - Пригласить друга, Техподдержка, Язык → обрабатываются middleware

    registerNavigationActions(bot) // Action-обработчики (inline кнопки)
    registerSpecialHandlers(bot) // Специальные обработчики (Сгенерировать еще, Улучшить промт)

    logger.info('✅ [Navigation] Navigation service initialized successfully')
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
 *
 * ✅ ИСПРАВЛЕНО: Убрана зависимость от CheckBalanceScene (удалён)
 * 🆕 ДОБАВЛЕНО: Проверка доступа к платным функциям через checkFeatureAccess
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

  // 🆕 Проверка доступа к платной функции (справка + баланс)
  const mode = item.mode as ModeEnum
  const hasAccess = await checkFeatureAccess(ctx, mode)
  if (!hasAccess) {
    return // Пользователю показано сообщение о недостатке средств
  }

  // Leave current scene
  await ctx.scene.leave()

  // Set mode
  ctx.session.mode = mode

  // Переходим напрямую в целевую сцену
  await ctx.scene.enter(item.mode as string)

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
        charCodes: Array.from(category.ru).map(c => c.charCodeAt(0)),
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
        receivedTextCharCodes: Array.from(messageText).map(c =>
          c.charCodeAt(0)
        ),
        textMatch: messageText === category.ru || messageText === category.en,
      })

      try {
        logger.info('🗺 [Navigation] Leaving current scene...', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })
        await ctx.scene.leave()

        // ✅ СПЕЦИАЛЬНАЯ ОБРАБОТКА: Если у категории нет items (это кнопка быстрого доступа)
        // Переходим напрямую в sceneId вместо показа пустого подменю
        if (category.items.length === 0 && category.sceneId) {
          logger.info(
            '💎 [Navigation] Quick access button - direct scene entry',
            {
              telegramId: ctx.from?.id,
              categoryId: category.id,
              sceneId: category.sceneId,
            }
          )
          await ctx.scene.enter(category.sceneId)
          return
        }

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
        logger.error(`❌ [Navigation] Error showing category ${category.id}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegramId: ctx.from?.id,
        })
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
          logger.error(`❌ [Navigation] Error navigating to ${item.mode}:`, {
            error,
            telegramId: ctx.from?.id,
          })
        }
      })

      registeredCount++
    })
  })

  logger.info(
    `✅ [Navigation] Registered ${registeredCount} function handlers (excluding profile)`
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 🗑️ УДАЛЕНО МЁРТВЫЙ КОД:
// - registerProfileHandlers (логика перемещена в registerGlobalNavigationMiddleware)
// - registerGlobalHandlers (логика перемещена в registerGlobalNavigationMiddleware)
// - registerGlobalNavigationBeforeStage
// - registerGlobalNavigationAfterStage
//
// Причина: Вся навигация теперь обрабатывается ЕДИНЫМ централизованным middleware:
// registerGlobalNavigationMiddleware() из './middleware/registerGlobalNavigationMiddleware.ts'
//
// Это упрощает отладку и позволяет легко видеть весь flow обработки сообщений.
// ═══════════════════════════════════════════════════════════════════════════

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
      // ✅ ИСПРАВЛЕНО: Прямой переход вместо CheckBalanceScene (удалён)
      await ctx.scene.enter(ModeEnum.ImageToVideo)
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
        // ✅ ИСПРАВЛЕНО: Прямой переход вместо CheckBalanceScene (удалён)
        await ctx.scene.enter(ModeEnum.TextToVideo)
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
        // ✅ ИСПРАВЛЕНО: Прямой переход вместо CheckBalanceScene (удалён)
        await ctx.scene.enter(ModeEnum.TextToVideo)
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

  // ✅ Повторить генерацию - использует lastCompletedVideoScene
  bot.hears(['🔄 Повторить генерацию', '🔄 Repeat generation'], async ctx => {
    logger.info('🔄 [Navigation] Repeat video generation', {
      telegramId: ctx.from?.id,
      lastCompletedVideoScene: ctx.session.lastCompletedVideoScene,
    })
    try {
      const { handleRestartVideoGeneration } = await import(
        '@/handlers/handleVideoRestart'
      )
      await handleRestartVideoGeneration(ctx)
    } catch (error) {
      logger.error('❌ [Navigation] Error repeating video generation:', {
        error,
        telegramId: ctx.from?.id,
      })
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Попробуйте вернуться в главное меню.'
          : 'An error occurred. Please try returning to the main menu.'
      )
    }
  })

  // ✅ Новое видео - показываем меню выбора типа видео
  bot.hears(['🎬 Новое видео', '🎬 New video'], async ctx => {
    logger.info('🎬 [Navigation] New video', {
      telegramId: ctx.from?.id,
    })
    try {
      const isRu = isRussianFromState(ctx)
      const { Markup } = await import('telegraf')

      // Показываем клавиатуру с выбором типа видео
      const keyboard = Markup.keyboard([
        [isRu ? '🎥 Видео из текста' : '🎥 Text to Video'],
        [isRu ? '🎥 Фото в видео' : '🎥 Photo to Video'],
        [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
      ]).resize()

      await ctx.reply(
        isRu ? 'Выберите тип видео:' : 'Choose video type:',
        keyboard
      )
    } catch (error) {
      logger.error('❌ [Navigation] Error showing video menu:', {
        error,
        telegramId: ctx.from?.id,
      })
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Попробуйте вернуться в главное меню.'
          : 'An error occurred. Please try returning to the main menu.'
      )
    }
  })

  logger.info('✅ [Navigation] Registered special handlers')
}

/**
 * THE MODEL AND THE SELLER, FROM THE BOT. Owner only.
 *
 * /model  -- which provider answers now, and buttons to put another first
 * /leads  -- who to write to next, from the correspondence memory
 * /lead   -- one person in depth: name, waiting, signals, touches, dialog
 * /sweep  -- one proactive sweep right now; a card follows if there is one
 */
/**
 * THE ONE WAY IN FROM OUTSIDE: a deep link that PREPARES, and never sends.
 *
 * The owner's console on the website can show who is waiting, but it must not
 * be able to write to anybody: the browser holds no secret, and every outward
 * action in this farm is confirmed by a press on a card inside Telegram. So the
 * console's only action is a link -- t.me/<bot>?start=crm-prep-<id> -- and this
 * is what it lands on: the same `prepare` the CRM menu's own button runs.
 *
 * A module-level slot rather than an exported function, because `prepare`
 * closes over the bot, the sweep and the keyboards it answers with. Lifting it
 * out would mean threading four collaborators through a new module for no gain;
 * assigning it here keeps ONE implementation, which is the property that
 * matters -- a second "prepare" would eventually stop matching the first.
 */
export interface PrepareOpts {
  /** One extra line of brief: what to change about the last attempt. */
  note?: string
  /** What the owner is told while it runs; the default names the person. */
  headline?: string
}

let preparedForOwner:
  | ((ctx: MyContext, lead: string, opts?: PrepareOpts) => Promise<void>)
  | null = null

/** `crm-prep-<numeric id>` and nothing else; a malformed payload never matches. */
export const CRM_PREP_PAYLOAD = /^crm-prep-(\d{5,15})$/

/**
 * The lead a /start payload names, when it names one for an admin in a private
 * chat. Exported for the test: the guard is the interesting part, not the reply.
 */
export function crmPrepLead(payload: string | undefined): string | null {
  if (!payload) return null
  const m = CRM_PREP_PAYLOAD.exec(payload)
  return m ? m[1] : null
}

export function registerCrmCommands(bot: Telegraf<MyContext>): void {
  const ownerOnly = (ctx: MyContext) =>
    Boolean(ctx.from?.id && ADMIN_IDS_ARRAY.includes(ctx.from.id))
  const ownerId = (ctx: MyContext) => String(ctx.from?.id ?? '')
  const isPrivate = (ctx: MyContext) => ctx.chat?.type === 'private'
  const hub = () => Markup.inlineKeyboard(hubRows())
  const modelKeyboard = (current: string | null) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          (current === 'ollama' ? '✅ ' : '') + 'Наша',
          'mdl:ollama'
        ),
        Markup.button.callback(
          (current === 'zai' ? '✅ ' : '') + 'Платная',
          'mdl:zai'
        ),
      ],
      [
        Markup.button.callback(
          (current === 'nemotron' ? '✅ ' : '') + 'Nemotron',
          'mdl:nemotron'
        ),
        Markup.button.callback(
          (current === 'zai-lite' ? '✅ ' : '') + 'GLM lite',
          'mdl:zai-lite'
        ),
      ],
      ...hubRows(),
    ])

  /*
   * EVERY OWNER MESSAGE CARRIES A MENU.
   *
   * Owner: send a menu with every message, so something can be done with
   * the information right there. So nothing below is a bare reply: a
   * list has a button per person, a brief has its actions, an outcome has a
   * way forward, a failure has a retry. Long texts are split and the
   * keyboard rides on the LAST chunk -- Telegram attaches one per message.
   */
  const sendLong = async (
    ctx: MyContext,
    text: string,
    keyboard?: ReturnType<typeof Markup.inlineKeyboard>
  ) => {
    const { разбитьДлинное } = await import('@/helpers/telegramLongAnswer') // cyrillic-ok: pre-existing helper name
    const parts = разбитьДлинное(text) // cyrillic-ok: pre-existing helper name
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1
      await ctx.reply(parts[i], last && keyboard ? keyboard : undefined)
    }
  }
  const NO_TOOLS_SIGN = 'не вызвав ни одного инструмента'
  const noTools = { test: (m: string) => m.includes(NO_TOOLS_SIGN) }
  const crmFail = (
    ctx: MyContext,
    prefix: string,
    err: unknown,
    retry?: string | null
  ) => {
    const msg = err instanceof Error ? err.message : String(err)
    return sendLong(
      ctx,
      `${prefix}: ${msg}`,
      failKeyboard(retry, noTools.test(msg))
    )
  }
  /** A costly button pressed twice within a breath acts once. */
  const pressed = new Map<string, number>()
  const pressOnce = (key: string): boolean => {
    const now = Date.now()
    for (const [k, at] of pressed) if (now - at > 5_000) pressed.delete(k)
    if (pressed.has(key)) return false
    pressed.set(key, now)
    return true
  }

  const showHome = async (ctx: MyContext) => {
    const { scopeLine } = await import('@/services/crmProactive')
    const line = scopeLine(ownerId(ctx))
    await sendLong(
      ctx,
      'Продавец. Что делать?' + (line ? `\n\n${line}` : ''),
      rootMenu()
    )
  }
  const showLeads = async (ctx: MyContext) => {
    try {
      const { fetchLeads } = await import('@/services/modelSwitch')
      const r = await fetchLeads(ownerId(ctx))
      await sendLong(
        ctx,
        r.text,
        r.rows.length ? leadsKeyboard(r.rows) : emptyLeadsKeyboard()
      )
    } catch (e) {
      await crmFail(ctx, 'Не получилось', e, crmCallback('leads'))
    }
  }
  const showLead = async (ctx: MyContext, who: string) => {
    try {
      const { fetchLead } = await import('@/services/modelSwitch')
      const r = await fetchLead(ownerId(ctx), who)
      const kb = r.lead
        ? leadMenu(r.lead, {
            next: nextOf({ waiting: r.waiting, signals: r.signals }),
          })
        : hub()
      await sendLong(ctx, r.text, kb)
    } catch (e) {
      await crmFail(
        ctx,
        'Не получилось',
        e,
        LEAD_ID_RE.test(who) ? crmCallback('lead', who) : null
      )
    }
  }
  const showSummary = async (ctx: MyContext, days?: number) => {
    try {
      const { fetchSummary, formatSummary } = await import(
        '@/services/crmSummary'
      )
      const { scopeLine, activeScope } = await import('@/services/crmProactive')
      const s = await fetchSummary(ownerId(ctx), days)
      const line = scopeLine(ownerId(ctx))
      await sendLong(
        ctx,
        formatSummary(s, line),
        summaryKeyboard(s, Boolean(activeScope(ownerId(ctx))))
      )
    } catch (e) {
      await crmFail(ctx, 'Не получилось', e, crmCallback('summary'))
    }
  }
  const showModel = async (ctx: MyContext) => {
    try {
      const { getProviderStatus, describeProvider } = await import(
        '@/services/modelSwitch'
      )
      const s = await getProviderStatus(ownerId(ctx))
      await ctx.reply(describeProvider(s), modelKeyboard(s.current?.id ?? null))
    } catch (e) {
      await crmFail(ctx, 'Не получилось узнать модель', e, crmCallback('model'))
    }
  }

  /*
   * A TURN FROM A BUTTON. The agent prepares; the card, if any, arrives by
   * itself through the sweep's own push, so here only the outcome is said,
   * with the buttons that fit it. Nothing sends without the card's button.
   */
  const runTurn = async (
    ctx: MyContext,
    opts: import('@/services/crmProactive').SweepOpts,
    lead: string | null,
    retry: string
  ) => {
    const { runSweepNow, MENU_HOLD_MS } = await import(
      '@/services/crmProactive'
    )
    const r = await runSweepNow(bot, ownerId(ctx), {
      holdMs: MENU_HOLD_MS,
      ...opts,
    })
    if (r.did === 'card')
      await sendLong(
        ctx,
        'Готово — карточка выше, кнопки твои.',
        afterTurnKeyboard(lead)
      )
    else if (r.did === 'idle')
      await sendLong(ctx, `Тихо: ${r.why}`, afterTurnKeyboard(lead))
    else if (r.did === 'held')
      await sendLong(
        ctx,
        'Карточка ещё ждёт нажатия — нажми на ней «Отправить» или «Отмена».',
        hub()
      )
    else if (r.did === 'busy')
      await sendLong(
        ctx,
        'Уже готовлю, подожди минуту.',
        failKeyboard(retry, false)
      )
    else
      await sendLong(
        ctx,
        `Не вышло: ${r.why}`,
        failKeyboard(retry, noTools.test(r.why))
      )
  }
  const menuOnly = () =>
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Меню', crmCallback('menu'))],
    ])
  const prepare = async (
    ctx: MyContext,
    lead: string,
    opts: PrepareOpts = {}
  ) => {
    await sendLong(
      ctx,
      opts.headline ??
        `⏳ Готовлю для ${lead}: читаю переписку, спрашиваю агента (до 3 минут). Ничего не уйдёт без твоей кнопки.`,
      menuOnly()
    )
    await runTurn(
      ctx,
      {
        // `note` is the rewrite: the brief the agent gets carries the line the
        // owner pressed, and the words it is meant to replace.
        prompt: scopedPrompt({
          chat: lead,
          display: null,
          next: null,
          note: opts.note,
        }),
        ingest: false,
        label: `[кнопка: подготовить для ${lead}]`,
      },
      lead,
      crmCallback('prep', lead)
    )
  }
  preparedForOwner = prepare
  const sweep = async (ctx: MyContext) => {
    await sendLong(
      ctx,
      'Обход пошёл: загружаю переписку, спрашиваю агента. Если есть что предложить — карточка придёт сюда.',
      menuOnly()
    )
    await runTurn(ctx, { label: '[кнопка: обход]' }, null, crmCallback('sweep'))
  }
  const ingest = async (ctx: MyContext) => {
    await sendLong(ctx, '📥 Загружаю переписку (до 3 минут)…', menuOnly())
    try {
      const { ingestChats } = await import('@/services/modelSwitch')
      const r = await ingestChats(ownerId(ctx), { limit: 30, depth: 50 })
      await sendLong(
        ctx,
        `📥 Готово: ${Number(r.people ?? 0)} людей, ${Number(r.messages_new ?? 0)} новых сообщений` +
          (r.stopped ? `, остановился: ${String(r.stopped)}` : ''),
        hub()
      )
    } catch (e) {
      await crmFail(ctx, 'Не вышло', e, crmCallback('ingest'))
    }
  }
  const scoped = async (ctx: MyContext, args: string[]) => {
    try {
      const { startScopedSweep } = await import('@/services/crmProactive')
      await sendLong(
        ctx,
        await startScopedSweep(bot, ownerId(ctx), args),
        hub()
      )
    } catch (e) {
      await crmFail(ctx, 'Не вышло', e, null)
    }
  }
  const textOf = (ctx: MyContext) =>
    (ctx.message as { text?: string } | undefined)?.text ?? ''

  const showPlan = async (ctx: MyContext) => {
    try {
      const { buildPlan } = await import('@/services/crmProactive')
      const plan = await buildPlan(ownerId(ctx))
      await sendLong(ctx, plan.text, plan.keyboard)
    } catch (e) {
      await crmFail(ctx, 'Не получилось собрать план', e, crmCallback('plan'))
    }
  }

  bot.command('plan', requireAdmin(), async ctx => {
    await showPlan(ctx)
  })

  bot.command('crm', requireAdmin(), async ctx => {
    const arg = textOf(ctx).split(/\s+/)[1] ?? ''
    await showSummary(ctx, /^\d{1,3}$/.test(arg) ? Number(arg) : undefined)
  })

  bot.command('model', requireAdmin(), async ctx => {
    await showModel(ctx)
  })

  bot.action(/^mdl:(zai|zai-lite|nemotron|ollama)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!ownerOnly(ctx)) return
    const id = ctx.match[1] as 'zai' | 'zai-lite' | 'nemotron' | 'ollama'
    try {
      const { chooseProvider, describeProvider } = await import(
        '@/services/modelSwitch'
      )
      const s = await chooseProvider(ownerId(ctx), id)
      await ctx
        .editMessageText(
          describeProvider(s),
          modelKeyboard(s.current?.id ?? null)
        )
        .catch(() =>
          ctx.reply(describeProvider(s), modelKeyboard(s.current?.id ?? null))
        )
    } catch (e) {
      await crmFail(ctx, 'Не переключилось', e, crmCallback('model'))
    }
  })

  bot.command('leads', requireAdmin(), async ctx => {
    await showLeads(ctx)
  })

  bot.command('lead', requireAdmin(), async ctx => {
    const who = textOf(ctx).split(/\s+/).slice(1)[0] ?? ''
    if (!who) {
      await sendLong(
        ctx,
        'Кого показать? /lead 900000001 или /lead @username',
        hub()
      )
      return
    }
    await showLead(ctx, who)
  })

  bot.command('sweep', requireAdmin(), async ctx => {
    const args = textOf(ctx).split(/\s+/).slice(1).filter(Boolean)
    if (!args.length) await sweep(ctx)
    else await scoped(ctx, args)
  })

  /*
   * THE DISPATCHERS. answerCbQuery first, the owner and a private chat
   * second, then the verb. The id in a lead callback is numeric by the
   * regex; nothing else is ever read from callback data.
   */
  bot.action(CRM_ROOT_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!ownerOnly(ctx) || !isPrivate(ctx)) return
    const verb = (ctx.match as RegExpMatchArray)[1]
    if (verb === 'menu') await showHome(ctx)
    else if (verb === 'leads') await showLeads(ctx)
    else if (verb === 'summary') await showSummary(ctx)
    else if (verb === 'sweep') await sweep(ctx)
    else if (verb === 'model') await showModel(ctx)
    else if (verb === 'ingest') await ingest(ctx)
    else if (verb === 'plan') await showPlan(ctx)
  })

  bot.action(CRM_SCOPE_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!ownerOnly(ctx) || !isPrivate(ctx)) return
    await scoped(ctx, [(ctx.match as RegExpMatchArray)[1]])
  })

  bot.action(CRM_LEAD_RE, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!ownerOnly(ctx) || !isPrivate(ctx)) return
    const [, verb, id] = ctx.match as RegExpMatchArray
    if (verb === 'lead') return showLead(ctx, id)
    if (verb === 'prep') {
      if (!pressOnce(`prep:${id}`)) return
      return prepare(ctx, id)
    }
    if (verb === 'refuse') {
      // The second press is the deliberate one.
      await ctx
        .editMessageReplyMarkup(
          leadMenu(id, { confirmRefuse: true }).reply_markup
        )
        .catch(() => undefined)
      return
    }
    if (verb === 'back') {
      await ctx
        .editMessageReplyMarkup(leadMenu(id).reply_markup)
        .catch(() => undefined)
      return
    }
    if (verb === 'mute') {
      const { pauseAiFor } = await import('@/services/businessBotService')
      const n = pauseAiFor(id, undefined, Number(ctx.from?.id))
      await sendLong(
        ctx,
        n
          ? `🤫 Молчу в этом чате 30 минут — отвечаешь ты.`
          : '🤫 Бизнес-подключения нет — в этом чате бот и так не отвечает.',
        afterTurnKeyboard(id)
      )
      return
    }
    if (verb === 'later' || verb === 'refuse!') {
      if (!pressOnce(`${verb}:${id}`)) return
      const kind = verb === 'later' ? 'later' : 'refused'
      try {
        const { touchLead } = await import('@/services/modelSwitch')
        const r = await touchLead(ownerId(ctx), id, kind)
        if (!r.saved) {
          await crmFail(
            ctx,
            'Не записал',
            r.why ?? 'без причины',
            crmCallback(verb, id)
          )
          return
        }
        await sendLong(
          ctx,
          kind === 'later'
            ? `⏰ Записал: ${id} — позже. Вернётся в список через две недели.`
            : `🚫 Записал отказ: ${id}. 30 дней не трогаем.`,
          kind === 'later' ? leadMenu(id) : hub()
        )
      } catch (e) {
        await crmFail(ctx, 'Не записал', e, crmCallback(verb, id))
      }
    }
  })
}
