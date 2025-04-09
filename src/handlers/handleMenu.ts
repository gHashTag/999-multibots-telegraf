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
import { Telegraf } from 'telegraf'

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
      [isRu ? levels[1].title_ru : levels[1].title_en]: async () => {
        logger.info('🎯 Начало обработки цифрового тела', {
          description: 'Starting digital body handler',
          telegram_id: ctx.from?.id,
          current_mode: ctx.session?.mode,
          current_scene: ctx.scene?.current?.id,
          action: 'digital_body_start'
        })

        console.log('CASE: 🤖 Цифровое тело')
        
        // Сохраняем состояние до очистки для логов
        logger.info('📊 Состояние до очистки', {
          description: 'Session state before cleanup',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          previous_model: ctx.session?.selectedModel,
          previous_scene: ctx.scene?.current?.id,
          action: 'pre_cleanup_state'
        })
        
        // Очищаем контекст сессии
        logger.info('🧹 Очистка контекста сессии', {
          description: 'Clearing session context',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          previous_model: ctx.session?.selectedModel
        })
        
        // Сохраняем только важные данные и сбрасываем остальное
        const { subscription } = ctx.session
        ctx.session = {
          subscription,
          mode: ModeEnum.SelectModel,
          selectedModel: '',
          // Добавляем обязательные поля из MySession с пустыми значениями
          memory: undefined,
          email: '',
          prompt: '',
          selectedSize: '',
          userModel: {
            model_name: '',
            trigger_word: '',
            model_url: 'default/model:latest'
          },
          numImages: 0,
          telegram_id: ctx.from?.id?.toString() || '',
          attempts: 0,
          videoModel: '',
          imageUrl: '',
          videoUrl: '',
          audioUrl: '',
          amount: 0,
          images: [],
          modelName: '',
          targetUserId: 0,
          username: '',
          triggerWord: '',
          steps: 0,
          inviter: '',
          inviteCode: '',
          invoiceURL: '',
          buttons: [],
          language_code: '',
          targetScene: ModeEnum.SelectModel,
          selectedPayment: {
            amount: 0,
            stars: 0
          }
        }
        
        logger.info('📊 Состояние после очистки', {
          description: 'Session state after cleanup',
          telegram_id: ctx.from?.id,
          new_mode: ctx.session.mode,
          new_model: ctx.session.selectedModel,
          new_target_scene: ctx.session.targetScene,
          action: 'post_cleanup_state'
        })

        logger.info('🔄 Подготовка к переходу в select_model', {
          description: 'Preparing to enter select_model scene',
          telegram_id: ctx.from?.id,
          current_mode: ctx.session.mode,
          selected_model: ctx.session.selectedModel,
          current_scene: ctx.scene?.current?.id,
          target_scene: 'select_model',
          action: 'pre_enter_model_selection'
        })

        await ctx.scene.enter('select_model')

        logger.info('✅ Завершение обработки цифрового тела', {
          description: 'Completed digital body handler',
          telegram_id: ctx.from?.id,
          final_mode: ctx.session.mode,
          final_model: ctx.session.selectedModel,
          final_scene: ctx.scene?.current?.id,
          action: 'digital_body_complete'
        })
        
        return
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
        await ctx.scene.enter('paymentScene')
      },
      [isRu ? levels[101].title_ru : levels[101].title_en]: async () => {
        console.log('CASE: 🤑 Баланс')
        ctx.session.mode = ModeEnum.Balance
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      [isRu ? levels[102].title_ru : levels[102].title_en]: async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter('inviteScene')
      },
      [isRu ? levels[103].title_ru : levels[103].title_en]: async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter('helpScene')
      },
      [isRu ? levels[104].title_ru : levels[104].title_en]: async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = ModeEnum.Tech
        await handleTechSupport(ctx)
      },
      '/invite': async () => {
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        await ctx.scene.enter('inviteScene')
      },
      '/price': async () => {
        console.log('CASE: 💰 Цена')
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
        await ctx.scene.enter(ModeEnum.BalanceScene)
      },
      '/help': async () => {
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        await ctx.scene.enter('helpScene')
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
            selectedModel: ctx.session?.selectedModel,
            targetScene: ctx.session?.targetScene
          }
        })
        console.log('CASE: 🏠 Главное меню')
        
        // Сохраняем режим меню
        ctx.session.mode = ModeEnum.MenuScene
        
        logger.info('🔄 Состояние перед входом в меню', {
          description: 'State before entering menu',
          telegram_id: ctx.from?.id,
          mode: ctx.session?.mode,
          selected_model: ctx.session?.selectedModel,
          target_scene: ctx.session?.targetScene,
          action: 'pre_menu_enter'
        })
        
        await ctx.scene.enter('menu_scene')
        
        logger.info('✅ Завершение перехода в меню', {
          description: 'Menu transition completed',
          telegram_id: ctx.from?.id,
          final_mode: ctx.session?.mode,
          final_model: ctx.session?.selectedModel,
          final_scene: ctx.scene?.current?.id,
          action: 'menu_enter_complete'
        })
      },
      [isRu ? mainMenuButton.title_ru : mainMenuButton.title_en]: async () => {
        logger.info('🏠 Переход в главное меню по кнопке', {
          description: 'Entering main menu via button',
          telegram_id: ctx.from?.id,
          previous_mode: ctx.session?.mode,
          new_mode: ModeEnum.MenuScene,
          action: 'enter_menu_scene_button'
        })
        console.log('CASE: 🏠 Главное меню')
        ctx.session.mode = ModeEnum.MenuScene
        await ctx.scene.enter('menu_scene')
      },
      '/tech': async () => {
        console.log('CASE: 🛠 Техподдержка')
        ctx.session.mode = ModeEnum.Tech
        await handleTechSupport(ctx)
      },
      '/start': async () => {
        console.log('CASE: 🚀 Начать обучение')
        await ctx.scene.enter('startScene')
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
