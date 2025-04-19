import { Telegraf, Scenes, session, Composer } from 'telegraf'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
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
    await ctx.scene.enter('startScene')
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
    await ctx.scene.enter('subscriptionScene')
  })

  bot.command('menu', async ctx => {
    console.log('CASE bot.command: menu')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter('subscriptionCheckScene')
  })
  composer.command('menu', async ctx => {
    console.log('CASE: myComposer.command menu')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter('subscriptionCheckScene')
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
