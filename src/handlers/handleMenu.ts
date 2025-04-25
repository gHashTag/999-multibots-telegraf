import { MyContext } from '@/interfaces'
import { ModeEnum, PlatformEnum } from '@/enums'
import { logger } from '@/logger'
import { levels } from '@/menu/mainMenu'
import { priceCommand } from '@/handlers/handlePriceCommand'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleMenu = async (ctx: MyContext) => {
  try {
    logger.info({
      message: '🔄 [handleMenu] Обработка меню',
      function: 'handleMenu',
    })

    // Получаем информацию о пользователе (если есть)
    const telegramId = ctx.from?.id ?? 'unknown'
    const username = ctx.from?.username ?? 'unknown'

    // Попробуем получить текст сообщения
    const message = ctx.message as { text?: string }
    const text = message?.text || ''

    logger.info({
      message: `📝 [handleMenu] Получена команда: "${text}"`,
      telegramId,
      username,
      function: 'handleMenu',
      command: text,
    })

    const isRu = ctx.session?.isRu ?? true
    console.log(`🔍 [handleMenu] Язык: ${isRu ? 'ru' : 'en'}`)

    // Создаем карту действий для каждой команды
    const actions: Record<string, () => Promise<void>> = {
      [isRu ? levels[11].ru : levels[11].en]: async () => {
        logger.info({
          message: '✨ [handleMenu] Переход к нейрофото',
          telegramId,
          function: 'handleMenu',
          action: 'neurophoto',
          nextScene: 'neurophotoWizard',
        })
        console.log('CASE: ✨ Нейрофото')
        ctx.session.mode = ModeEnum.Neurophoto
        console.log(`🔄 [handleMenu] Вход в сцену ${'neurophotoWizard'}`)
        await ctx.scene.enter('neurophotoWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'neurophotoWizard'}`)
      },
      [isRu ? levels[16].ru : levels[16].en]: async () => {
        logger.info({
          message: '🧩 [handleMenu] Переход к нейропазлам',
          telegramId,
          function: 'handleMenu',
          action: 'neuropuzzle',
          nextScene: 'neuropuzzleWizard',
        })
        console.log('CASE: 🧩 Нейропазлы')
        ctx.session.mode = ModeEnum.NeuroPuzzle
        console.log(`🔄 [handleMenu] Вход в сцену ${'neuropuzzleWizard'}`)
        await ctx.scene.enter('neuropuzzleWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'neuropuzzleWizard'}`)
      },
      [isRu ? levels[17].ru : levels[17].en]: async () => {
        logger.info({
          message: '🖼️ [handleMenu] Переход к распознаванию изображений',
          telegramId,
          function: 'handleMenu',
          action: 'image_to_prompt',
          nextScene: 'imageToPromptWizard',
        })
        console.log('CASE: 🖼️ Распознавание изображений')
        ctx.session.mode = ModeEnum.ImageToPrompt
        console.log(`🔄 [handleMenu] Вход в сцену ${'imageToPromptWizard'}`)
        await ctx.scene.enter('imageToPromptWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'imageToPromptWizard'}`)
      },
      [isRu ? levels[27].ru : levels[27].en]: async () => {
        logger.info({
          message: '🎭 [handleMenu] Переход к смене стиля',
          telegramId,
          function: 'handleMenu',
          action: 'style_transfer',
          nextScene: 'styleTransferWizard',
        })
        console.log('CASE: 🎭 Смена стиля')
        ctx.session.mode = ModeEnum.StyleTransfer
        console.log(`🔄 [handleMenu] Вход в сцену ${'styleTransferWizard'}`)
        await ctx.scene.enter('styleTransferWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'styleTransferWizard'}`)
      },
      [isRu ? levels[25].ru : levels[25].en]: async () => {
        logger.info({
          message: '🎬 [handleMenu] Переход к генерации видео',
          telegramId,
          function: 'handleMenu',
          action: 'video_generation',
          nextScene: 'videoGenerationWizard',
        })
        console.log('CASE: 🎬 Генерация видео')
        ctx.session.mode = ModeEnum.VideoGeneration
        console.log(`🔄 [handleMenu] Вход в сцену ${'videoGenerationWizard'}`)
        await ctx.scene.enter('videoGenerationWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'videoGenerationWizard'}`)
      },
      [isRu ? levels[24].ru : levels[24].en]: async () => {
        logger.info({
          message: '🎞️ [handleMenu] Переход к слайд-шоу',
          telegramId,
          function: 'handleMenu',
          action: 'slideshow',
          nextScene: 'slideshowWizard',
        })
        console.log('CASE: 🎞️ Слайд-шоу')
        ctx.session.mode = ModeEnum.SlideShow
        console.log(`🔄 [handleMenu] Вход в сцену ${'slideshowWizard'}`)
        await ctx.scene.enter('slideshowWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'slideshowWizard'}`)
      },
      [isRu ? levels[22].ru : levels[22].en]: async () => {
        logger.info({
          message: '🤖 [handleMenu] Переход к чату с аватаром',
          telegramId,
          function: 'handleMenu',
          action: 'chat_with_avatar',
          nextScene: 'chatWithAvatarWizard',
        })
        console.log('CASE: 🤖 Чат с аватаром')
        ctx.session.mode = ModeEnum.ChatWithAvatar
        console.log(`🔄 [handleMenu] Вход в сцену ${'chatWithAvatarWizard'}`)
        await ctx.scene.enter('chatWithAvatarWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'chatWithAvatarWizard'}`)
      },
      [isRu ? levels[26].ru : levels[26].en]: async () => {
        logger.info({
          message: '📊 [handleMenu] Переход к выполнению заданий',
          telegramId,
          function: 'handleMenu',
          action: 'level_quest',
          nextScene: 'levelQuestWizard',
        })
        console.log('CASE: 📊 Выполнение заданий')
        ctx.session.mode = ModeEnum.LevelQuest
        console.log(`🔄 [handleMenu] Вход в сцену ${'levelQuestWizard'}`)
        await ctx.scene.enter('levelQuestWizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'levelQuestWizard'}`)
      },
      [isRu ? levels[101].ru : levels[101].en]: async () => {
        logger.info({
          message: '💰 [handleMenu] Переход к пополнению баланса',
          telegramId,
          function: 'handleMenu',
          action: 'top_up_balance',
          nextScene: ModeEnum.PaymentScene,
        })
        console.log('CASE: 💰 Пополнить баланс')
        ctx.session.mode = ModeEnum.TopUpBalance
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.PaymentScene}`)
        await ctx.scene.enter(ModeEnum.PaymentScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.PaymentScene}`
        )
      },
      [isRu ? levels[102].ru : levels[102].en]: async () => {
        logger.info({
          message: '👥 [handleMenu] Переход к приглашению друга',
          telegramId,
          function: 'handleMenu',
          action: 'invite',
          nextScene: 'inviteScene',
        })
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        console.log(`🔄 [handleMenu] Вход в сцену ${'inviteScene'}`)
        await ctx.scene.enter('inviteScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'inviteScene'}`)
      },
      [isRu ? levels[103].ru : levels[103].en]: async () => {
        logger.info({
          message: '❓ [handleMenu] Переход к помощи',
          telegramId,
          function: 'handleMenu',
          action: 'help',
          nextScene: ModeEnum.HelpScene,
        })
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.HelpScene}`)
        await ctx.scene.enter(ModeEnum.HelpScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.HelpScene}`
        )
      },
      [isRu ? levels[104].ru : levels[104].en]: async () => {
        logger.info({
          message: '🏠 [handleMenu] Переход к главному меню',
          telegramId,
          function: 'handleMenu',
          action: 'main_menu',
          nextScene: ModeEnum.MainMenu,
        })
        console.log('CASE: 🏠 Главное меню')
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.MainMenu}`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(`✅ [handleMenu] Завершен вход в сцену ${ModeEnum.MainMenu}`)
      },
      '/invite': async () => {
        logger.info({
          message: '👥 [handleMenu] Переход к приглашению друга',
          telegramId,
          function: 'handleMenu',
          action: 'invite',
          nextScene: 'inviteScene',
        })
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        console.log(`🔄 [handleMenu] Вход в сцену ${'inviteScene'}`)
        await ctx.scene.enter('inviteScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'inviteScene'}`)
      },
      '/price': async () => {
        await priceCommand(ctx as MyContext)
      },
      '/start': async () => {
        logger.info({
          message: '🏠 [handleMenu] Переход к главному меню через /start',
          telegramId,
          function: 'handleMenu',
          action: 'main_menu',
          nextScene: ModeEnum.MainMenu,
        })
        console.log('CASE: 🏠 Главное меню (/start)')
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.MainMenu}`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(`✅ [handleMenu] Завершен вход в сцену ${ModeEnum.MainMenu}`)
      },
      '/menu': async () => {
        logger.info({
          message: '🏠 [handleMenu] Переход к главному меню через /menu',
          telegramId,
          function: 'handleMenu',
          action: 'main_menu',
          nextScene: ModeEnum.MainMenu,
        })
        console.log('CASE: 🏠 Главное меню (/menu)')
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.MainMenu}`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(`✅ [handleMenu] Завершен вход в сцену ${ModeEnum.MainMenu}`)
      },
      [isRu ? levels[106].title_ru : levels[106].title_en]: async () => {
        logger.info({
          message: '💰 [handleMenu] Просмотр цен',
          telegramId,
          function: 'handleMenu',
          action: 'view_prices',
        })
        console.log('CASE: 💰 Просмотр цен')
        await priceCommand(ctx)
      },
    }

    const platform =
      ctx.session?.platform ??
      (ctx.from?.username?.toLowerCase().includes('telegram')
        ? PlatformEnum.Telegram
        : PlatformEnum.Telegram)

    // Записываем платформу в сессию
    ctx.session.platform = platform

    logger.info({
      message: `📱 [handleMenu] Определена платформа: ${platform}`,
      telegramId,
      function: 'handleMenu',
      platform,
    })

    // Проверяем, есть ли текст сообщения в нашей карте действий
    if (text && actions[text]) {
      await actions[text]()
      return
    }

    // Проверяем команды, которые начинаются с "/"
    if (text.startsWith('/')) {
      const command = text.toLowerCase()
      if (actions[command]) {
        await actions[command]()
        return
      }
    }

    // По умолчанию просто показываем главное меню
    logger.info({
      message: '🏠 [handleMenu] Показываем главное меню по умолчанию',
      telegramId,
      function: 'handleMenu',
      action: 'main_menu',
      nextScene: ModeEnum.MainMenu,
    })
    console.log('DEFAULT CASE: 🏠 Главное меню')
    ctx.session.mode = ModeEnum.MainMenu
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error({
      message: `❌ [handleMenu] Ошибка при обработке меню: ${error.message}`,
      function: 'handleMenu',
      error,
    })
    console.error('❌ [handleMenu] Ошибка при обработке меню:', error)
  }
}

// Экспортируем обработчик меню
export default handleMenu
