import { MyContext } from '@/interfaces/telegram-bot.interface'
import { levels, HAIM_GROUP_STAFF_IDS } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { ModeEnum } from '@/interfaces/modes'
import { ADMIN_IDS_ARRAY } from '@/config'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  logger.debug('CASE: handleMenuCommand')
  const isRu = isRussian(ctx)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || ''
    logger.debug('CASE: handleMenuCommand.text', text)

    // 🔍 ДИАГНОСТИКА ЯЗЫКА + ЗАЩИТА ОТ UNDEFINED
    logger.debug('🔍 [LANG DEBUG] handleMenu:', {
      isRu,
      userLanguage: ctx.from?.language_code,
      sessionLanguage: ctx.session?.userLanguage,
      levelsDefined: !!levels,
      levelsKeys: Object.keys(levels),
      levels2TitleRu: levels?.[2]?.title_ru || 'undefined',
      levels2TitleEn: levels?.[2]?.title_en || 'undefined',
      currentKey: isRu ? (levels?.[2]?.title_ru || 'undefined') : (levels?.[2]?.title_en || 'undefined'),
      receivedText: text,
    })

    // 🔍 ДИАГНОСТИКА ПЕРЕД СОЗДАНИЕМ ACTIONS
    logger.debug('🔍 [STEP DEBUG] About to create actions object')
    logger.debug('🔍 [STEP DEBUG] Session mode:', ctx.session?.mode)
    logger.debug('🔍 [STEP DEBUG] Current scene:', ctx.scene?.current?.id)
    logger.debug('🔍 [STEP DEBUG] levels object:', levels)
    logger.debug('🔍 [STEP DEBUG] levels length:', levels ? Object.keys(levels).length : 'undefined')
    logger.debug('🔍 [STEP DEBUG] levels[0]:', levels ? levels[0] : 'undefined')

    // Создаем объект для сопоставления текста с действиями
    const actions: Record<string, () => Promise<void>> = {}

    // Безопасное добавление action
    const addAction = (key: number, actionFn: () => Promise<void>) => {
      if (levels?.[key] && levels[key].title_ru && levels[key].title_en) {
        const actionKey = isRu ? levels[key].title_ru : levels[key].title_en
        actions[actionKey] = actionFn
        logger.debug(`✅ Added action for level ${key}: ${actionKey}`)
      } else {
        logger.warn(`⚠️ levels[${key}] is not defined properly`)
      }
    }

    addAction(105, async () => {
      logger.debug('CASE: 💫 Оформление подписки')
      ctx.session.mode = ModeEnum.Subscribe
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    })

    addAction(1, async () => {
      logger.debug('CASE: 🤖 Цифровое тело')
      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    actions['🤖 Цифровое тело 2'] = async () => {
      logger.debug('CASE: 🤖 Цифровое тело 2')
      ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }

    addAction(2, async () => {
      logger.debug('CASE handleMenu: 📸 Нейрофото')
      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    actions['📸 Нейрофото 2'] = async () => {
      logger.debug('CASE: 📸 Нейрофото 2')
      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }

    addAction(3, async () => {
      logger.debug('CASE: 🔍 Промпт из фото')
      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(4, async () => {
      logger.debug('CASE: 🧠 Мозг аватара')
      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(5, async () => {
      logger.debug('CASE: 💭 Чат с аватаром')
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(6, async () => {
      logger.debug('CASE: 🤖 Выбор модели ИИ')
      ctx.session.mode = ModeEnum.SelectModel
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(7, async () => {
      logger.debug('CASE: 🎤 Голос аватара')
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(8, async () => {
      logger.debug('CASE: 🎙️ Текст в голос')
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(9, async () => {
      logger.debug('CASE: 🎥 Фото в видео')
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(10, async () => {
      logger.debug('CASE:  Видео из текста')
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(11, async () => {
      logger.debug('CASE: 🖼️ Текст в фото')
      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(12, async () => {
      logger.debug('CASE: 🎨 ИИ Фотошоп')
      ctx.session.mode = ModeEnum.AiPhotoshop
      await ctx.scene.enter('aiPhotoshopScene')
    })

    addAction(13, async () => {
      logger.debug('CASE: 🌀 Infinity Морфинг')
      ctx.session.mode = ModeEnum.MorphingWizard
      await ctx.scene.enter('morphingWizard')
    })

    addAction(15, async () => {
      logger.debug('CASE: 🎭 Замена лица')
      ctx.session.mode = ModeEnum.FaceSwap
      await ctx.scene.enter('faceSwapWizard')
    })

    addAction(107, async () => {
      logger.debug('CASE: ⬆️ Увеличить качество фото')
      ctx.session.mode = ModeEnum.ImageUpscaler
      await ctx.scene.enter('imageUpscalerWizard')
    })

    addAction(108, async () => {
      logger.debug('CASE: 📺 Транскрибация Reels')
      ctx.session.mode = ModeEnum.VideoTranscription
      await ctx.scene.enter('videoTranscriptionWizard')
    })

    addAction(111, async () => {
      logger.debug('CASE: 🦸‍♂️ ИИ Герои')
      ctx.session.mode = ModeEnum.AIHeroes
      await ctx.scene.enter('avatarTransformScene')
    })

    addAction(100, async () => {
      logger.debug('CASE: 💎 Пополнить баланс')
      ctx.session.mode = ModeEnum.TopUpBalance
      await ctx.scene.enter('paymentScene')
    })

    addAction(101, async () => {
      logger.debug('CASE: 🤑 Баланс')
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter(ModeEnum.BalanceScene)
    })

    addAction(102, async () => {
      logger.debug('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter(ModeEnum.InviteScene)
    })

    addAction(103, async () => {
      logger.debug('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter(ModeEnum.HelpScene)
    })

    addAction(104, async () => {
      logger.debug('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    })

    addAction(106, async () => {
      logger.debug('CASE: 🌐 Смена языка')
      // Переключаем язык пользователя
      const currentLang = ctx.session?.userLanguage
      const newLang = currentLang === 'ru' ? 'en' : 'ru'
      ctx.session.userLanguage = newLang

      await ctx.reply(
        newLang === 'ru'
          ? '✅ Язык изменён на русский'
          : '✅ Language changed to English'
      )

      // Показываем главное меню на новом языке
      await ctx.scene.enter(ModeEnum.MainMenu)
    })

    // Competitor monitoring button handler (level 109)
    addAction(109, async () => {
      logger.debug('CASE: 🔍 Мониторинг конкурентов')

      // Проверяем права администратора или сотрудников Хаим Групп
      const userId = ctx.from?.id?.toString()
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        logger.debug('[handleMenu] Competitor monitoring access denied - not admin/staff', {
          userId,
          isMainAdmin,
          isHaimStaff,
        })
        await ctx.reply(
          isRu
            ? '❌ У вас нет доступа к мониторингу конкурентов. Функция доступна только администраторам.'
            : '❌ You do not have access to competitor monitoring. This feature is admin only.'
        )
        return
      }

      // Запускаем Instagram Parser Wizard
      logger.debug(`🔄 [handleMenu] Вход в сцену instagramParserWizard`)
      await ctx.scene.enter('instagramParserWizard')
      logger.debug(`✅ [handleMenu] Завершен вход в сцену instagramParserWizard`)
    })

    // AI Reels button handler (level 110)
    addAction(110, async () => {
      logger.debug('CASE: 🎬 ИИ Рилс - Entry Wizard')

      // Проверяем права администратора или сотрудников Хаим Групп
      const userId = ctx.from?.id?.toString()
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        logger.debug('[handleMenu] AI Reels access denied - not admin/staff', {
          userId,
          isMainAdmin,
          isHaimStaff,
        })
        await ctx.reply(
          isRu
            ? '❌ У вас нет доступа к ИИ Рилс. Функция доступна только администраторам.'
            : '❌ You do not have access to AI Reels. This feature is admin only.'
        )
        return
      }

      // Запускаем AI Reels entry wizard (выбор метода)
      logger.debug(`🔄 [handleMenu] Вход в сцену ai_reels_entry`)
      await ctx.scene.enter('ai_reels_entry')
      logger.debug(`✅ [handleMenu] Завершен вход в сцену ai_reels_entry`)
    })

    actions['/invite'] = async () => {
      logger.debug('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter(ModeEnum.InviteScene)
    }

    actions['/price'] = async () => {
      logger.debug('CASE: 💰 Цена')
      ctx.session.mode = ModeEnum.Price
      await priceCommand(ctx)
    }

    actions['/buy'] = async () => {
      logger.debug('CASE: 💰 Пополнить баланс')
      ctx.session.mode = ModeEnum.TopUpBalance
      await ctx.scene.enter('paymentScene')
    }

    actions['/balance'] = async () => {
      logger.debug('CASE: 💰 Баланс')
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter(ModeEnum.BalanceScene)
    }

    actions['/help'] = async () => {
      logger.debug('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter(ModeEnum.HelpScene)
    }

    actions['/menu'] = async () => {
      logger.debug('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    }

    actions['/start'] = async () => {
      logger.debug('CASE: 🚀 Начать обучение')
      await ctx.scene.enter(ModeEnum.StartScene)
    }

    logger.debug('🔍 [ACTIONS DEBUG] Actions created:', Object.keys(actions))

    // 🔍 ДИАГНОСТИКА ОБЪЕКТА ACTIONS
    logger.debug('🔍 [ACTIONS DEBUG] Available action keys:', Object.keys(actions))
    logger.debug('🔍 [ACTIONS DEBUG] Checking key existence:', {
      text,
      keyExists: text in actions,
      actionValue: actions[text]
    })

    // Выполняем действие, если оно существует, иначе переходим в главное меню
    if (actions[text]) {
      logger.debug('CASE: handleMenuCommand.if', text)
      await actions[text]()
      logger.debug('✅ Action executed. Checking scene...')
      logger.debug('🔍 Current scene after action:', ctx.scene.current?.id)
      logger.debug('🔍 Scene stack:', ctx.scene.session?.sceneStack)
    } else {
      logger.debug('CASE: handleMenuCommand.else', text)
      logger.debug('🔍 [MISSING ACTION] Available actions:', Object.keys(actions))
      // ctx.session.mode = 'main_menu'
      // await ctx.scene.enter('menuScene')
    }
  }
}

// Экспортируем функцию, если она будет использоваться в другом месте
export default handleMenu
