import { Telegraf, Scenes, session } from 'telegraf'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
import { getUserDetails } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from './handlers/getUserInfo'
import { setupErrorHandler } from './helpers/error/errorHandler'
import { handlePriceCommand } from './handlers/handlePriceCommand'

// Возвращаем импорт всех сцен через index
import {
  avatarBrainWizard,
  textToVideoWizard,
  emailWizard,
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

import { setupLevelHandlers } from './handlers/setupLevelHandlers'

import { defaultSession } from './store'

import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
import { handleBuy } from './handlers/handleBuy'
import { isRussian } from '@/helpers'
//https://github.com/telegraf/telegraf/issues/705
export const stage = new Scenes.Stage<MyContext>([
  startScene,
  subscriptionScene,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  chatWithAvatarWizard,
  menuScene,
  getRuBillWizard,
  balanceScene,
  avatarBrainWizard,
  imageToPromptWizard,
  emailWizard,
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
  rublePaymentScene,
  starPaymentScene,
  neuroCoderScene,
  lipSyncWizard,
  helpScene,
  inviteScene,
  levelQuestWizard,
  uploadVideoScene,
])

export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  // Активируем глобальный обработчик ошибок
  setupErrorHandler(bot)

  // Инициализируем сессию только один раз
  bot.use(session({ defaultSession: () => ({ ...defaultSession }) }))
  bot.use(stage.middleware())

  setupLevelHandlers(bot as Telegraf<MyContext>)

  // Регистрация команд
  bot.command('start', async ctx => {
    console.log('CASE bot.command: start')
    ctx.session = { ...defaultSession } // Reset session
    ctx.session.mode = ModeEnum.StartScene
    await ctx.scene.enter(ModeEnum.CreateUserScene)
  })

  bot.command('support', async ctx => {
    console.log('CASE bot.command: support')
    await handleTechSupport(ctx)
  })

  // Добавляем команду price
  bot.command('price', handlePriceCommand)

  // Обработчики для текстовых кнопок главного меню
  bot.hears([levels[103].title_ru, levels[103].title_en], async ctx => {
    console.log('CASE bot.hears: 💬 Техподдержка / Support')
    await handleTechSupport(ctx)
  })

  // ОБНОВЛЕННЫЙ обработчик - ведет в сцену выбора типа подписки
  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    console.log('CASE bot.hears: 💫 Оформить подписку / Subscribe')
    ctx.session.mode = ModeEnum.SubscriptionScene
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  })

  // НОВЫЙ обработчик - Пополнить баланс
  bot.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
    console.log('CASE bot.hears: 💎 Пополнить баланс / Top up balance')
    ctx.session.mode = ModeEnum.PaymentScene // Устанавливаем режим
    // Сохраняем намерение пользователя - пополнение баланса
    ctx.session.subscription = SubscriptionType.STARS // Используем 'stars' как маркер пополнения
    await ctx.scene.enter(ModeEnum.PaymentScene) // Переходим в сцену выбора способа оплаты
  })

  // НОВЫЙ обработчик - Баланс
  bot.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
    console.log('CASE bot.hears: 🤑 Баланс / Balance')
    ctx.session.mode = ModeEnum.Balance // Устанавливаем режим
    await ctx.scene.enter(ModeEnum.Balance) // Переходим в сцену баланса
  })

  // Добавляем обработчик для текстовых кнопок с ценами
  bot.hears(['💰 Цены / Prices'], async ctx => {
    console.log('CASE bot.hears: 💰 Цены / Prices')
    await handlePriceCommand(ctx)
  })

  bot.command('menu', async ctx => {
    const { telegramId } = getUserInfo(ctx) // Получаем ID
    logger.info({
      message: `[Command /menu START] User: ${telegramId}. Resetting session and checking subscription status...`,
      telegramId,
    })
    ctx.session = { ...defaultSession } // Reset session

    try {
      // Шаг 1: Получаем актуальный статус пользователя
      const userDetails = await getUserDetails(telegramId)
      logger.info({
        message: `[Command /menu DETAILS] User: ${telegramId}. Status received.`,
        telegramId,
        details: userDetails,
      })

      // Шаг 2: Принимаем решение на основе статуса подписки
      if (userDetails.isSubscriptionActive) {
        // --- ЕСЛИ ПОДПИСКА АКТИВНА ---
        logger.info({
          message: `[Command /menu DECISION] User: ${telegramId}. Subscription ACTIVE. Entering 'menuScene'.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu // Устанавливаем режим на всякий случай
        // Входим в сцену главного меню (убедись, что ID 'menuScene' верный)
        return ctx.scene.enter(ModeEnum.MainMenu)
      } else {
        // --- ЕСЛИ ПОДПИСКИ НЕТ ---
        logger.info({
          message: `[Command /menu DECISION] User: ${telegramId}. Subscription INACTIVE. Entering SubscriptionScene.`,
          telegramId,
        })
        ctx.session.mode = ModeEnum.MainMenu // Устанавливаем режим (чтобы после покупки вернуться в меню)
        // Входим в сцену покупки подписки
        return ctx.scene.enter(ModeEnum.SubscriptionScene) // Убедись, что ModeEnum.SubscriptionScene = 'subscription_scene'
      }
    } catch (error) {
      // Шаг 3: Обработка ошибок при получении статуса
      logger.error({
        message: `[Command /menu ERROR] Failed to get user details for User: ${telegramId}`,
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(
        '😔 Произошла ошибка при проверке вашего статуса. Попробуйте, пожалуйста, позже.'
      )
      // Можно просто выйти или попробовать отправить в меню как запасной вариант
      // return ctx.scene.enter('menuScene');
      return
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

  // --- РЕГИСТРАЦИЯ ГЛОБАЛЬНОГО ОБРАБОТЧИКА ДЛЯ ПОКУПКИ ЗВЕЗД ---
  bot.action(/top_up_(\d+)$/, async ctx => {
    // Проверяем, что callbackQuery и data существуют
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      const isRu = isRussian(ctx) // Определяем язык
      console.log(
        `[Global Action top_up_X] Received callback: ${data}. Calling handleBuy.`
      )
      try {
        await handleBuy({ ctx, data, isRu })
        // Отвечаем на колбэк только если handleBuy не вызвал ошибку
        await ctx.answerCbQuery()
      } catch (error) {
        console.error(
          `[Global Action top_up_X] Error calling handleBuy for ${data}:`,
          error
        )
        // Отвечаем на колбэк с сообщением об ошибке
        try {
          await ctx.answerCbQuery(
            isRu ? '⚠️ Ошибка при создании счета' : '⚠️ Error creating invoice'
          )
        } catch (e) {
          console.error('Failed to answer callback query with error')
        }
      }
    } else {
      console.error('[Global Action top_up_X] Invalid callback query received.')
      // Все равно пытаемся ответить на колбэк
      try {
        await ctx.answerCbQuery()
      } catch (e) {
        // Добавляем логирование ошибки
        console.error(
          '[Global Action top_up_X] Failed to answer callback query even after invalid query:',
          e
        )
      }
    }
  })
  // --- КОНЕЦ РЕГИСТРАЦИИ ГЛОБАЛЬНОГО ОБРАБОТЧИКА ---
}
