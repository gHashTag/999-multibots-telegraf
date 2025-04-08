import { MyContext } from '@/interfaces'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { mainMenuButton } from '@/menu/mainMenu'
import { get100Command } from '@/commands'
import { getStatsCommand } from '@/commands/stats'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { Message } from 'telegraf/typings/core/types/typegram'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id
  if (!telegramId) {
    logger.error('No telegram id found in context')
    return
  }

  const message = ctx.message as Message.TextMessage
  if (!message || !('text' in message)) {
    logger.error('No text in message', { telegram_id: telegramId })
    return
  }

  const text = message.text
  logger.info('Menu selection', { text, telegram_id: telegramId })

  try {
    if (text === levels[5].title_ru || text === levels[5].title_en) {
      logger.info('Chat with avatar selected', { telegram_id: telegramId })
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      return
    }

    // Создаем объект для сопоставления текста с действиями
    const actions = {
      [levels[105].title_ru]: async () => {
        console.log('CASE: 💫 Оформление подписки')
        ctx.session.mode = 'subscribe' as any
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      },
      [levels[1].title_ru]: async () => {
        console.log('CASE: 🤖 Цифровое тело')
        await ctx.scene.enter(ModeEnum.SelectModelWizard)
      },
      [levels[2].title_ru]: async () => {
        console.log('CASE handleMenu: 📸 Нейрофото')
        await ctx.scene.enter(ModeEnum.NeuroPhoto)
      },
      [levels[3].title_ru]: async () => {
        console.log('CASE: 🔍 Промпт из фото')
        ctx.session.mode = ModeEnum.ImageToPrompt
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[4].title_ru]: async () => {
        console.log('CASE: 🧠 Мозг аватара')
        ctx.session.mode = ModeEnum.Avatar
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[6].title_ru]: async () => {
        console.log('CASE: 🤖 Выбор модели ИИ')
        ctx.session.mode = ModeEnum.SelectModelWizard
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[7].title_ru]: async () => {
        console.log('CASE: 🎤 Голос аватара')
        ctx.session.mode = ModeEnum.Voice
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[8].title_ru]: async () => {
        console.log('CASE: 🎙️ Текст в голос')
        ctx.session.mode = ModeEnum.TextToSpeech
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[9].title_ru]: async () => {
        console.log('CASE: 🎥 Фото в видео')
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[10].title_ru]: async () => {
        console.log('CASE:  Видео из текста')
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [levels[11].title_ru]: async () => {
        console.log('CASE: 🖼️ Текст в фото')
        ctx.session.mode = ModeEnum.TextToImage
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      // [isRu ? levels[12].title_ru : levels[12].title_en]: async () => {
      //   console.log('CASE: 🎤 Синхронизация губ')
      //   ctx.session.mode = 'lip_sync'
      //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      // },
      // [isRu ? levels[13].title_ru : levels[13].title_en]: async () => {
      //   console.log('CASE: 🎥 Видео в URL')
      //   ctx.session.mode = 'video_in_url'
      //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      // },
      [levels[100].title_ru]: async () => {
        console.log('CASE: 💎 Пополнить баланс')
        ctx.session.mode = 'top_up_balance' as any
        await ctx.scene.enter('paymentScene')
      },
      [levels[101].title_ru]: async () => {
        console.log('CASE: 🤑 Баланс')
        ctx.session.mode = 'balance' as any
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      [levels[102].title_ru]: async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = 'invite' as any
        await ctx.scene.enter('inviteScene')
      },
      [levels[103].title_ru]: async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = 'help' as any
        await ctx.scene.enter('helpScene')
      },
      [levels[104].title_ru]: async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = 'tech' as any
        await handleTechSupport(ctx)
      },
      '/invite': async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = 'invite' as any
        await ctx.scene.enter('inviteScene')
      },
      '/price': async () => {
        console.log('CASE: 💰 Цена')
        ctx.session.mode = 'price' as any
        await priceCommand(ctx)
      },
      '/buy': async () => {
        console.log('CASE: 💰 Пополнить баланс')
        ctx.session.mode = 'top_up_balance' as any
        await ctx.scene.enter('paymentScene')
      },
      '/balance': async () => {
        console.log('CASE: 💰 Баланс')
        ctx.session.mode = 'balance' as any
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      '/help': async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = 'help' as any
        await ctx.scene.enter('helpScene')
      },
      '/menu': async () => {
        console.log('CASE: 🏠 Главное меню')
        ctx.session.mode = ModeEnum.MenuScene
        await ctx.scene.enter(ModeEnum.MenuScene)
      },
      [mainMenuButton.title_ru]: async () => {
        console.log('CASE: 🏠 Главное меню')
        ctx.session.mode = ModeEnum.MenuScene
        await ctx.scene.enter(ModeEnum.MenuScene)
      },
      '/tech': async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = 'tech' as any
        await handleTechSupport(ctx)
      },
      '/start': async () => {
        console.log('CASE: 🚀 Начать обучение')
        await ctx.scene.enter('startScene')
      },
      '/stats': async () => {
        console.log('CASE: 🔍 Получение информации о сервере Glama MCP')
        ctx.session.mode = 'stats' as any
        await getStatsCommand(ctx)
      },
    }

    // Выполняем действие, если оно существует, иначе переходим в главное меню
    if (actions[text]) {
      console.log('CASE: handleMenuCommand.if', text)
      await actions[text]()
    } else {
      if (text === '/get100') {
        console.log('CASE: handleMenuCommand.100', text)
        await get100Command(ctx)
      } else {
        console.log('CASE: handleMenuCommand.else', text)
      }
    }
  } catch (error) {
    logger.error('Error in handleMenu', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: telegramId,
      text
    })
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Пожалуйста, попробуйте снова.'
        : '❌ Error occurred. Please try again.'
    )
  }
}

export default handleMenu
