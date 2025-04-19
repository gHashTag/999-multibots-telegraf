import { MyContext } from '@/interfaces/telegram-bot.interface'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { ModeEnum } from '@/interfaces/modes'
// Import sendMenu to re-send the menu message
// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  console.log('CASE: handleMenuCommand')
  const isRu = isRussian(ctx)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || ''
    console.log('CASE: handleMenuCommand.text', text)

    // Создаем объект для сопоставления текста с действиями
    const actions = {
      [isRu ? levels[105].title_ru : levels[105].title_en]: async () => {
        console.log('CASE: 💫 Оформление подписки')
        ctx.session.mode = ModeEnum.Subscribe
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      },
      [isRu ? levels[1].title_ru : levels[1].title_en]: async () => {
        console.log('CASE: 🤖 Цифровое тело')
        ctx.session.mode = ModeEnum.DigitalAvatarBody
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? '🤖 Цифровое тело 2' : '🤖 Digital Body 2']: async () => {
        console.log('CASE: 🤖 Цифровое тело 2')
        ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[2].title_ru : levels[2].title_en]: async () => {
        console.log('CASE handleMenu: 📸 Нейрофото')
        ctx.session.mode = ModeEnum.NeuroPhoto
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? '📸 Нейрофото 2' : '📸 NeuroPhoto 2']: async () => {
        console.log('CASE: 📸 Нейрофото 2')
        ctx.session.mode = ModeEnum.NeuroPhotoV2
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[3].title_ru : levels[3].title_en]: async () => {
        console.log('CASE: 🔍 Промпт из фото')
        ctx.session.mode = ModeEnum.ImageToPrompt
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[4].title_ru : levels[4].title_en]: async () => {
        console.log('CASE: 🧠 Мозг аватара')
        ctx.session.mode = ModeEnum.Avatar
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[5].title_ru : levels[5].title_en]: async () => {
        console.log('CASE: 💭 Чат с аватаром')
        ctx.session.mode = ModeEnum.ChatWithAvatar
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[6].title_ru : levels[6].title_en]: async () => {
        console.log('CASE: 🤖 Выбор модели ИИ')
        ctx.session.mode = ModeEnum.SelectModel
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[7].title_ru : levels[7].title_en]: async () => {
        console.log('CASE: 🎤 Голос аватара')
        ctx.session.mode = ModeEnum.Voice
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[8].title_ru : levels[8].title_en]: async () => {
        console.log('CASE: 🎙️ Текст в голос')
        ctx.session.mode = ModeEnum.TextToSpeech
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[9].title_ru : levels[9].title_en]: async () => {
        console.log('CASE: 🎥 Фото в видео')
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[10].title_ru : levels[10].title_en]: async () => {
        console.log('CASE:  Видео из текста')
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[11].title_ru : levels[11].title_en]: async () => {
        console.log('CASE: 🖼️ Текст в фото')
        ctx.session.mode = ModeEnum.TextToImage
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      // [isRu ? levels[12].title_ru : levels[12].title_en]: async () => {
      //   console.log('CASE: 🎤 Синхронизация губ')
      //   ctx.session.mode = 'lip_sync'
      //   await ctx.scene.enter('checkBalanceScene')
      // },
      // [isRu ? levels[13].title_ru : levels[13].title_en]: async () => {
      //   console.log('CASE: 🎥 Видео в URL')
      //   ctx.session.mode = 'video_in_url'
      //   await ctx.scene.enter('checkBalanceScene')
      // },
      [isRu ? levels[100].title_ru : levels[100].title_en]: async () => {
        console.log('CASE: 💎 Пополнить баланс')
        ctx.session.mode = ModeEnum.TopUpBalance
        await ctx.scene.enter('paymentScene')
      },
      [isRu ? levels[101].title_ru : levels[101].title_en]: async () => {
        console.log('CASE: 🤑 Баланс')
        ctx.session.mode = ModeEnum.Balance
        await ctx.scene.enter('balanceScene')
      },
      [isRu ? levels[102].title_ru : levels[102].title_en]: async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter('inviteScene')
      },
      [isRu ? levels[103].title_ru : levels[103].title_en]: async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter(ModeEnum.HelpScene)
      },
      [isRu ? levels[104].title_ru : levels[104].title_en]: async () => {
        console.log('CASE: 🏠 Главное меню')
        // Re-enter the menu scene
        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.enter(ModeEnum.MainMenu)
      },
      '/invite': async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter('inviteScene')
      },
      '/price': async () => {
        console.log('CASE: 💰 Цена')
        ctx.session.mode = ModeEnum.Price
        await priceCommand(ctx)
      },
      '/buy': async () => {
        console.log('CASE: 💰 Пополнить баланс')
        ctx.session.mode = ModeEnum.TopUpBalance
        await ctx.scene.enter('paymentScene')
      },
      '/balance': async () => {
        console.log('CASE: 💰 Баланс')
        ctx.session.mode = ModeEnum.Balance
        await ctx.scene.enter('balanceScene')
      },
      '/help': async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter('helpScene')
      },
      '/menu': async () => {
        console.log('CASE: 🏠 Главное меню')
        // Re-enter the menu scene
        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.enter(ModeEnum.MainMenu)
      },
      '/start': async () => {
        console.log('CASE: 🚀 Начать обучение')
        ctx.session.mode = ModeEnum.StartScene
        await ctx.scene.enter(ModeEnum.StartScene)
      },
    }

    // Выполняем действие, если оно существует, иначе переходим в главное меню
    if (actions[text]) {
      console.log('CASE: handleMenuCommand.if', text)
      await actions[text]()
    } else {
      console.log('CASE: handleMenuCommand.else', text)
      // ctx.session.mode = 'main_menu'
      // await ctx.scene.enter('menuScene')
    }
  }
}

// Экспортируем функцию, если она будет использоваться в другом месте
export default handleMenu
