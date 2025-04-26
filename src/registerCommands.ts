import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { type MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
import { getUserDetailsSubscription } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from './handlers/getUserInfo'
// Импортируем новую функцию
import { handleRestartVideoGeneration } from './handlers/handleVideoRestart'

// Возвращаем импорт всех сцен через index
import {
  avatarBrainWizard,
  textToVideoWizard,
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
} from './scenes'

import { defaultSession } from './store'

import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
import { handleBuy } from './handlers/handleBuy'
import { isRussian } from '@/helpers'
import { registerPaymentActions } from './handlers/paymentActions'
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
  improvePromptWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  uploadVideoScene,
  voiceAvatarWizard,
  textToSpeechWizard,
  lipSyncWizard,
  avatarBrainWizard,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  getRuBillWizard,
  levelQuestWizard,
  createUserScene,
])

export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  bot.use(session({ defaultSession: () => ({ ...defaultSession }) }))
  bot.use(stage.middleware())

  // --- НАЧАЛО: ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ НАВИГАЦИИ (ACTION) ---

  // Обработчик для КНОПКИ "Главное меню" (Callback Query)
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

  // Обработчик для КНОПКИ "Справка" (Callback Query)
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

  // ДОБАВИТЬ: Обработчик для КНОПКИ "Назад" (Callback Query)
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

  // --- КОНЕЦ: ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ НАВИГАЦИИ (ACTION) ---

  // Регистрация команд /start, /support
  bot.command('start', async ctx => {
    console.log('CASE bot.command: start')
    // При старте всегда сбрасываем сессию и входим в createUserScene
    ctx.session = { ...defaultSession }
    await ctx.scene.leave() // Явно выходим из любой сцены
    await ctx.scene.enter(ModeEnum.CreateUserScene)
  })

  bot.command('support', async ctx => {
    console.log('CASE bot.command: support')
    await ctx.scene.leave() // Выходим из сцены перед показом контактов
    await handleTechSupport(ctx)
  })

  // --- НАЧАЛО: ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ ДЛЯ КНОПОК ---

  // Обработчик для КНОПКИ "Главное меню" (ReplyKeyboard)
  bot.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
    logger.info('GLOBAL HEARS: Главное меню', { telegramId: ctx.from?.id })
    try {
      await ctx.scene.leave() // Выходим из текущей сцены
      await ctx.scene.enter(ModeEnum.MainMenu) // Входим в сцену меню
    } catch (error) {
      logger.error('Error in Главное меню hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик для КНОПКИ "Справка" (ReplyKeyboard)
  bot.hears(['❓ Справка', '❓ Help'], async ctx => {
    logger.info('GLOBAL HEARS: Справка', { telegramId: ctx.from?.id })
    try {
      // Устанавливаем режим, чтобы справка знала контекст (если мы не вышли из сцены)
      // ctx.session.mode = ctx.session.__scenes?.current ?? ModeEnum.Help;
      await ctx.scene.leave() // Выходим из текущей сцены
      await ctx.scene.enter(ModeEnum.Help) // Входим в сцену справки (Убедись, что ModeEnum.Help = 'helpScene')
    } catch (error) {
      logger.error('Error in Справка hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // --- КОНЕЦ: ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ ДЛЯ КНОПОК ---

  // Обработчики для других текстовых кнопок главного меню
  bot.hears([levels[103].title_ru, levels[103].title_en], async ctx => {
    console.log('CASE bot.hears: 💬 Техподдержка / Support')
    await ctx.scene.leave()
    await handleTechSupport(ctx)
  })

  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    console.log('CASE bot.hears: 💫 Оформить подписку / Subscribe')
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.SubscriptionScene
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  })

  bot.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
    console.log('CASE bot.hears: 💎 Пополнить баланс / Top up balance')
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.PaymentScene
    ctx.session.subscription = SubscriptionType.STARS
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  bot.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
    console.log('CASE bot.hears: 🤑 Баланс / Balance')
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.Balance
    await ctx.scene.enter(ModeEnum.Balance)
  })

  // --- ИСПРАВЛЕНИЕ: Обработчик команды /menu ---
  bot.command('menu', async ctx => {
    const { telegramId } = getUserInfo(ctx)
    logger.info({
      message: `[Command /menu START] User: ${telegramId}. Leaving scene, resetting session and checking subscription...`,
      telegramId,
    })

    await ctx.scene.leave() // <-- ЯВНЫЙ ВЫХОД ИЗ СЦЕНЫ
    ctx.session = { ...defaultSession } // Reset session ПОСЛЕ выхода

    try {
      const userDetails = await getUserDetailsSubscription(telegramId)
      logger.info({
        message: `[Command /menu DETAILS] User: ${telegramId}. Status received.`,
        telegramId,
        details: userDetails,
      })

      if (userDetails.isSubscriptionActive) {
        logger.info({
          message: `[Command /menu DECISION] User: ${telegramId}. Subscription ACTIVE. Entering 'menuScene'.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu
        return ctx.scene.enter(ModeEnum.MainMenu)
      } else {
        logger.info({
          message: `[Command /menu DECISION] User: ${telegramId}. Subscription INACTIVE. Entering SubscriptionScene.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu
        return ctx.scene.enter(ModeEnum.SubscriptionScene)
      }
    } catch (error) {
      logger.error({
        message: `[Command /menu ERROR] Failed to get user details for User: ${telegramId}`,
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(
        '😔 Произошла ошибка при проверке вашего статуса. Попробуйте, пожалуйста, позже.'
      )
    }
  })

  bot.command('get100', async ctx => {
    console.log('CASE: get100')
    await get100Command(ctx)
  })

  // Переносим команду /buy из composer в bot
  bot.command('buy', async ctx => {
    // Добавляем лог перед входом в сцену
    console.log('[Command /buy] Entering payment scene...')
    logger.info(`[Command /buy] User: ${ctx.from?.id}. Entering payment scene.`)
    ctx.session.subscription = SubscriptionType.STARS
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })

  bot.command('invite', async ctx => {
    console.log('CASE: invite')
    await ctx.scene.enter('inviteScene')
  })

  bot.command('balance', async ctx => {
    console.log('CASE: balance')
    await ctx.scene.enter('balanceScene')
  })

  bot.command('help', async ctx => {
    await ctx.scene.enter('step0')
  })

  bot.command('neuro_coder', async ctx => {
    await ctx.scene.enter('neuroCoderScene')
  })

  // Register payment handlers (pre_checkout_query, successful_payment, etc.)
  registerPaymentActions(bot)

  // <<< НАЧАЛО: ДОБАВЛЕННЫЕ ОБРАБОТЧИКИ HEARS >>>
  bot.hears([levels[106].title_ru, levels[106].title_en], async ctx => {
    console.log('CASE bot.hears: ❓ Справка / Help')
    if (!ctx.session?.currentScene) {
      ctx.session.mode = ModeEnum.Help // Общий режим справки
    } // Если currentScene установлен, helpScene использует его
    await ctx.scene.enter(ModeEnum.Help) // HelpScene ID = 'helpScene'
  })

  bot.hears([levels[104].title_ru, levels[104].title_en], async ctx => {
    console.log('CASE bot.hears: 🏠 Главное меню / Main menu')
    // Логика аналогична /menu
    const { telegramId } = getUserInfo(ctx)
    logger.info({
      message: `[HEARS Главное меню START] User: ${telegramId}. Resetting session and checking subscription status...`,
      telegramId,
    })
    ctx.session = { ...defaultSession } // Reset session

    try {
      const userDetails = await getUserDetailsSubscription(telegramId)
      logger.info({
        message: `[HEARS Главное меню DETAILS] User: ${telegramId}. Status received.`,
        telegramId,
        details: userDetails,
      })

      if (userDetails.isSubscriptionActive) {
        logger.info({
          message: `[HEARS Главное меню DECISION] User: ${telegramId}. Subscription ACTIVE. Entering 'menuScene'.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.enter(ModeEnum.MainMenu) // MenuScene ID = 'menuScene'
      } else {
        logger.info({
          message: `[HEARS Главное меню DECISION] User: ${telegramId}. Subscription INACTIVE. Entering SubscriptionScene.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu // Чтобы вернуться в меню после покупки
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      }
    } catch (error) {
      logger.error({
        message: `[HEARS Главное меню ERROR] Failed to get user details for User: ${telegramId}`,
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(
        '😔 Произошла ошибка при проверке вашего статуса. Попробуйте, пожалуйста, позже.'
      )
    }
  })

  bot.hears([levels[102].title_ru, levels[102].title_en], async ctx => {
    console.log('CASE bot.hears: 👥 Пригласить друга / Invite a friend')
    ctx.session.mode = ModeEnum.Invite // Устанавливаем режим
    await ctx.scene.enter(ModeEnum.Invite) // InviteScene ID = 'inviteScene'
  })
  // <<< КОНЕЦ: ДОБАВЛЕННЫЕ ОБРАБОТЧИКИ HEARS >>>

  bot.command('info', async ctx => {
    // ... обработчик /info ...
  })

  // ... остальные команды и обработчики ...

  // Обработка колбэков для кнопок покупки
  bot.action(/buy_(\d+)_days/, handleBuy)

  // Пример обработки pre_checkout_query для Telegram Payments (если используется)
  bot.on('pre_checkout_query', ctx => ctx.answerPreCheckoutQuery(true))

  // Обработка successful_payment
  bot.on('successful_payment', async ctx => {
    // ... обработчик successful_payment ...
  })

  // --- Регистрация специфичных для оплаты действий ---
  registerPaymentActions(bot)

  // --- Обработка перезапуска видео ---
  bot.action(/^restart_video:(.+)$/, handleRestartVideoGeneration)

  // --- ОБРАБОТКА НЕИЗВЕСТНЫХ КОМАНД/ТЕКСТА ---
  // Ловим любой текст, который не был обработан выше
  bot.on('text', async ctx => {
    console.log('CASE bot.on: text')
    if (ctx.scene.current) {
      console.log(
        ` -> Text in scene: ${ctx.scene.current.id}. Ignoring global handler.`
      )
      return // Важно! Не обрабатываем текст глобально, если активна сцена.
    }

    // Если не в сцене, отправляем сообщение о неизвестной команде и главное меню
    console.log(
      ` -> Text outside scene: ${ctx.message.text}. Sending unknown command message.`
    )
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? '🫤 Неизвестная команда. Пожалуйста, используйте кнопки меню.'
        : '🫤 Unknown command. Please use the menu buttons.'
    )
    // Принудительно входим в главное меню
    await ctx.scene.enter(ModeEnum.MainMenu)
  })

  // Обработчик неизвестных колбэков
  bot.on('callback_query', async ctx => {
    await ctx.answerCbQuery('Неизвестное действие')
    console.warn('Unhandled callback_query:', ctx.callbackQuery)
  })

  console.log('✅ [SCENE_DEBUG] Stage импортирован успешно')
  console.log(
    '📊 [SCENE_DEBUG] Количество обработчиков сцен:',
    stage.scenes.size
  )
}
