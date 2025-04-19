import { Telegraf, Scenes, session, Composer } from 'telegraf'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
import { getUserDetails } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from './handlers/getUserInfo'
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
} from './scenes'

import { setupLevelHandlers } from './handlers/setupLevelHandlers'

import { defaultSession } from './store'

import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
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
  neuroCoderScene,
  lipSyncWizard,
  helpScene,
  inviteScene,
  levelQuestWizard,
  uploadVideoScene,
])

export function registerCommands({
  bot,
  composer,
}: {
  bot: Telegraf<MyContext>
  composer: Composer<MyContext>
}) {
  // Инициализируем сессию только один раз
  bot.use(session({ defaultSession: () => ({ ...defaultSession }) }))
  bot.use(stage.middleware())
  bot.use(composer.middleware())

  setupLevelHandlers(bot as Telegraf<MyContext>)

  // Регистрация команд
  bot.command('start', async ctx => {
    console.log('CASE bot.command: start')
    ctx.session = { ...defaultSession } // Reset session
    ctx.session.mode = ModeEnum.StartScene
    await ctx.scene.enter(ModeEnum.StartScene)
  })

  bot.command('support', async ctx => {
    console.log('CASE bot.command: support')
    await handleTechSupport(ctx)
  })

  // Обработчики для текстовых кнопок главного меню
  bot.hears([levels[103].title_ru, levels[103].title_en], async ctx => {
    console.log('CASE bot.hears: 💬 Техподдержка / Support')
    await handleTechSupport(ctx)
  })

  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    console.log('CASE bot.hears: 💫 Оформить подписку / Subscribe')
    // Возможно, стоит добавить проверку, есть ли уже активная подписка?
    // Пока просто переходим в сцену покупки
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
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
        return ctx.scene.enter('menuScene')
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
  composer.command('menu', async ctx => {
    console.log('CASE: myComposer.command menu')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  })

  composer.command('get100', async ctx => {
    console.log('CASE: get100')
    await get100Command(ctx)
  })

  composer.command('buy', async ctx => {
    console.log('CASE: buy')
    ctx.session.subscription = SubscriptionType.STARS
    await ctx.scene.enter('paymentScene')
  })

  composer.command('invite', async ctx => {
    console.log('CASE: invite')
    await ctx.scene.enter('inviteScene')
  })

  composer.command('balance', async ctx => {
    console.log('CASE: balance')
    await ctx.scene.enter('balanceScene')
  })

  composer.command('help', async ctx => {
    await ctx.scene.enter('step0')
  })

  composer.command('neuro_coder', async ctx => {
    await ctx.scene.enter('neuroCoderScene')
  })
}
