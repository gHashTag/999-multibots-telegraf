/**
 * ⚠️⚠️⚠️ ВНИМАНИЕ! КРИТИЧЕСКИ ВАЖНЫЙ ФАЙЛ! ⚠️⚠️⚠️
 *
 * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО МЕНЯТЬ МАРШРУТИЗАЦИЮ
 * БЕЗ СОГЛАСОВАНИЯ С ВЕДУЩИМ РАЗРАБОТЧИКОМ!
 *
 * Данный файл содержит корректную маршрутизацию всех
 * команд меню, нарушение которой может привести к
 * некорректной работе бота.
 */

import { MyContext } from '@/interfaces'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { mainMenuButton } from '@/menu/mainMenu'
import { get100Command } from '@/commands'
import { getStatsCommand } from '@/commands/stats'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  console.log('CASE: handleMenuCommand')
  const isRu = isRussian(ctx)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || ''
    console.log('CASE: handleMenuCommand.text', text)

    // Создаем объект для сопоставления текста с действиями
    const actions = {
      [isRu ? levels[0].title_ru : levels[0].title_en]: async () => {
        console.log('CASE: 💫 Оформление подписки')
        ctx.session.mode = ModeEnum.Subscribe
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      },
      [isRu ? levels[1].title_ru : levels[1].title_en]: async () => {
        console.log('CASE: 🤖 Цифровое тело')
        ctx.session.mode = ModeEnum.DigitalAvatarBody
        await ctx.scene.enter(ModeEnum.DigitalAvatarBody)
      },
      [isRu ? levels[2].title_ru : levels[2].title_en]: async () => {
        console.log('CASE handleMenu: 📸 Нейрофото')
        logger.info({
          message: '📸 Выбрана команда Нейрофото из меню',
          description: 'NeuroPhoto command selected from menu',
          telegram_id: ctx.from?.id,
          should_enter: ModeEnum.SelectNeuroPhoto,
          action: 'Entering selection scene',
        })
        await ctx.scene.enter(ModeEnum.SelectNeuroPhoto)
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
        ctx.session.mode = ModeEnum.SelectAiTextModel
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
      //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      // },
      // [isRu ? levels[13].title_ru : levels[13].title_en]: async () => {
      //   console.log('CASE: 🎥 Видео в URL')
      //   ctx.session.mode = 'video_in_url'
      //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      // },
      [isRu ? levels[100].title_ru : levels[100].title_en]: async () => {
        console.log('CASE: 💎 Пополнить баланс')
        ctx.session.mode = ModeEnum.TopUpBalance
        await ctx.scene.enter(ModeEnum.PaymentScene)
      },
      [isRu ? levels[101].title_ru : levels[101].title_en]: async () => {
        console.log('CASE: 🤑 Баланс')
        ctx.session.mode = ModeEnum.Balance
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      [isRu ? levels[102].title_ru : levels[102].title_en]: async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter(ModeEnum.InviteScene)
      },
      [isRu ? levels[103].title_ru : levels[103].title_en]: async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter(ModeEnum.HelpScene)
      },
      [isRu ? levels[104].title_ru : levels[104].title_en]: async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = ModeEnum.Tech
        await handleTechSupport(ctx)
      },
      '/invite': async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter(ModeEnum.InviteScene)
      },
      '/price': async () => {
        console.log('CASE: 💰 Цена')
        await priceCommand(ctx)
      },
      '/buy': async () => {
        console.log('CASE: 💰 Пополнить баланс')
        ctx.session.mode = ModeEnum.TopUpBalance
        await ctx.scene.enter(ModeEnum.PaymentScene)
      },
      '/balance': async () => {
        console.log('CASE: 💰 Баланс')
        ctx.session.mode = ModeEnum.Balance
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      '/help': async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter(ModeEnum.HelpScene)
      },
      '/menu': async () => {
        console.log('CASE: 🏠 Главное меню (command handler)')
        // Сбрасываем сессию перед входом в меню
        resetSessionForMenu(ctx.session)
        logger.info(
          '➡️ [HandleMenu /menu] Intending to enter MainMenu scene...'
        )
        await ctx.scene.enter(ModeEnum.MainMenu)
      },
      [isRu ? mainMenuButton.title_ru : mainMenuButton.title_en]: async () => {
        console.log('CASE: 🏠 Главное меню (text handler)')
        // Сбрасываем сессию перед входом в меню
        resetSessionForMenu(ctx.session)
        logger.info('➡️ [HandleMenu text] Intending to enter MainMenu scene...')
        await ctx.scene.enter(ModeEnum.MainMenu)
      },
      '/tech': async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = ModeEnum.Tech
        await handleTechSupport(ctx)
      },
      '/start': async () => {
        console.log('CASE: 🚀 Start')
        await ctx.scene.enter(ModeEnum.StartScene)
      },
      '/stats': async () => {
        console.log('CASE: 🔍 Получение информации о сервере Glama MCP')
        ctx.session.mode = ModeEnum.Stats
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
  }
}

function resetSessionForMenu(session: MyContext['session']) {
  logger.info(
    '🔄 [resetSessionForMenu HandleMenu] Resetting session before entering menu...'
  )
  session.mode = ModeEnum.MainMenu // Устанавливаем режим меню
  session.prompt = ''
  session.userModel = {
    model_name: '',
    trigger_word: '',
    model_url: '' as `${string}/${string}:${string}`,
    model_key: '' as `${string}/${string}:${string}`,
  }
  session.selectedModel = undefined
  session.audioUrl = undefined
  // Добавьте сюда другие поля, если они влияют на меню
}

export default handleMenu
