import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers'
import { priceCommand } from '@/commands/priceCommand'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { mainMenuButton } from '@/menu/mainMenu'
import { get100Command } from '@/commands'
import { getStatsCommand } from '@/commands/stats'
import { logAction } from '@/utils/logger'

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
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      },
      [levels[1].title_ru]: async () => {
        logger.info('🤖 Автоматический выбор модели FLUX', {
          description: 'Auto-selecting FLUX model',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          new_mode: ModeEnum.DigitalAvatarBody,
          action: 'auto_select_flux',
        })
        console.log('CASE: 🤖 Цифровое тело (Auto FLUX)')

        // Автоматически устанавливаем FLUX
        ctx.session.selected_model = 'FLUX'
        ctx.session.mode = ModeEnum.DigitalAvatarBody

        logger.info('✅ Модель установлена автоматически', {
          description: 'Model set automatically',
          telegram_id: ctx.from?.id,
          selected_model: ctx.session?.selected_model,
          mode: ctx.session?.mode,
          action: 'model_auto_set',
        })

        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[2].title_ru : levels[2].title_en]: async () => {
        console.log('CASE handleMenu: 📸 Нейрофото')
        await ctx.scene.enter(ModeEnum.NeuroPhoto)
      },
      [isRu ? levels[3].title_ru : levels[3].title_en]: async () => {
        console.log('CASE: 🔍 Промпт из фото')
        ctx.session.mode = ModeEnum.ImageToPrompt
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      },
      [isRu ? levels[4].title_ru : levels[4].title_en]: async () => {
        console.log('CASE: 🧠 Мозг аватара')
        ctx.session.mode = ModeEnum.AvatarBrainWizard
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
        await ctx.scene.enter(ModeEnum.SelectModelWizard)
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
        logger.info('🏠 Переход в главное меню', {
          description: 'Entering main menu',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          new_mode: ModeEnum.MenuScene,
          action: 'enter_menu_scene',
          session_state: {
            mode: ctx.session?.mode,
            selected_model: ctx.session?.selected_model,
            targetScene: ctx.session?.targetScene,
          },
        })
        console.log('CASE: 🏠 Главное меню')

        // Если мы уже в меню, не делаем повторный переход
        if (ctx.scene?.current?.id === 'menu_scene') {
          logger.info('🚫 Пропуск повторного входа в меню', {
            description: 'Skipping repeated menu entry',
            telegram_id: ctx.from?.id,
            current_scene: ctx.scene?.current?.id,
            action: 'skip_menu_reentry',
          })
          return
        }

        // Сохраняем режим меню
        logAction('menu_mode_change', Number(ctx.from?.id), {
          old_mode: ctx.session.mode,
          new_mode: ModeEnum.MenuScene,
          bot_name: ctx.botInfo?.username || '',
        })
        ctx.session.mode = ModeEnum.MenuScene

        logger.info('🔄 Состояние перед входом в меню', {
          description: 'State before entering menu',
          telegram_id: ctx.from?.id,
          mode: ctx.session?.mode,
          selected_model: ctx.session?.selected_model,
          target_scene: ctx.session?.targetScene,
          action: 'pre_menu_enter',
        })

        await ctx.scene.enter(ModeEnum.MenuScene)

        logger.info('✅ Завершение перехода в меню', {
          description: 'Menu transition completed',
          telegram_id: ctx.from?.id,
          final_mode: ctx.session?.mode,
          final_model: ctx.session?.selected_model,
          final_scene: ctx.scene?.current?.id,
          action: 'menu_enter_complete',
        })
      },
      [isRu ? mainMenuButton.title_ru : mainMenuButton.title_en]: async () => {
        logger.info('🏠 Переход в главное меню по кнопке', {
          description: 'Entering main menu via button',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          new_mode: ModeEnum.MenuScene,
          action: 'enter_menu_scene_button',
        })
        console.log('CASE: 🏠 Главное меню')
        ctx.session.mode = ModeEnum.MenuScene
        await ctx.scene.enter(ModeEnum.MenuScene)
      },
      '/tech': async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = ModeEnum.Tech
        await handleTechSupport(ctx)
      },
      '/start': async () => {
        console.log('CASE: 🚀 Начать обучение')
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

export default handleMenu
