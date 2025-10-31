import { MyContext } from '@/interfaces/telegram-bot.interface'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { ModeEnum } from '@/interfaces/modes'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  console.log('CASE: handleMenuCommand')
  const isRu = isRussian(ctx)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || ''
    console.log('CASE: handleMenuCommand.text', text)

    // 🔍 ДИАГНОСТИКА ЯЗЫКА + ЗАЩИТА ОТ UNDEFINED
    console.log('🔍 [LANG DEBUG] handleMenu:', {
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
    console.log('🔍 [STEP DEBUG] About to create actions object')
    console.log('🔍 [STEP DEBUG] Session mode:', ctx.session?.mode)
    console.log('🔍 [STEP DEBUG] Current scene:', ctx.scene?.current?.id)
    console.log('🔍 [STEP DEBUG] levels object:', levels)
    console.log('🔍 [STEP DEBUG] levels length:', levels ? Object.keys(levels).length : 'undefined')
    console.log('🔍 [STEP DEBUG] levels[0]:', levels ? levels[0] : 'undefined')

    // Создаем объект для сопоставления текста с действиями
    const actions: Record<string, () => Promise<void>> = {}

    // Безопасное добавление action
    const addAction = (key: number, actionFn: () => Promise<void>) => {
      if (levels?.[key] && levels[key].title_ru && levels[key].title_en) {
        const actionKey = isRu ? levels[key].title_ru : levels[key].title_en
        actions[actionKey] = actionFn
        console.log(`✅ Added action for level ${key}: ${actionKey}`)
      } else {
        console.warn(`⚠️ levels[${key}] is not defined properly`)
      }
    }

    addAction(105, async () => {
      console.log('CASE: 💫 Оформление подписки')
      ctx.session.mode = ModeEnum.Subscribe
      await ctx.scene.enter('subscriptionScene')
    })

    addAction(1, async () => {
      console.log('CASE: 🤖 Цифровое тело')
      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    actions['🤖 Цифровое тело 2'] = async () => {
      console.log('CASE: 🤖 Цифровое тело 2')
      ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }

    addAction(2, async () => {
      console.log('CASE handleMenu: 📸 Нейрофото')
      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    actions['📸 Нейрофото 2'] = async () => {
      console.log('CASE: 📸 Нейрофото 2')
      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }

    addAction(3, async () => {
      console.log('CASE: 🔍 Промпт из фото')
      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(4, async () => {
      console.log('CASE: 🧠 Мозг аватара')
      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(5, async () => {
      console.log('CASE: 💭 Чат с аватаром')
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(6, async () => {
      console.log('CASE: 🤖 Выбор модели ИИ')
      ctx.session.mode = ModeEnum.SelectModel
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(7, async () => {
      console.log('CASE: 🎤 Голос аватара')
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(8, async () => {
      console.log('CASE: 🎙️ Текст в голос')
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(9, async () => {
      console.log('CASE: 🎥 Фото в видео')
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(10, async () => {
      console.log('CASE:  Видео из текста')
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(11, async () => {
      console.log('CASE: 🖼️ Текст в фото')
      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })

    addAction(100, async () => {
      console.log('CASE: 💎 Пополнить баланс')
      ctx.session.mode = ModeEnum.TopUpBalance
      await ctx.scene.enter('paymentScene')
    })

    addAction(101, async () => {
      console.log('CASE: 🤑 Баланс')
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter('balanceScene')
    })

    addAction(102, async () => {
      console.log('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter('inviteScene')
    })

    addAction(103, async () => {
      console.log('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter('helpScene')
    })

    addAction(104, async () => {
      console.log('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter('menuScene')
    })

    actions['/invite'] = async () => {
      console.log('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter('inviteScene')
    }

    actions['/price'] = async () => {
      console.log('CASE: 💰 Цена')
      ctx.session.mode = ModeEnum.Price
      await priceCommand(ctx)
    }

    actions['/buy'] = async () => {
      console.log('CASE: 💰 Пополнить баланс')
      ctx.session.mode = ModeEnum.TopUpBalance
      await ctx.scene.enter('paymentScene')
    }

    actions['/balance'] = async () => {
      console.log('CASE: 💰 Баланс')
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter('balanceScene')
    }

    actions['/help'] = async () => {
      console.log('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter('helpScene')
    }

    actions['/menu'] = async () => {
      console.log('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter('menuScene')
    }

    actions['/start'] = async () => {
      console.log('CASE: 🚀 Начать обучение')
      await ctx.scene.enter('startScene')
    }

    console.log('🔍 [ACTIONS DEBUG] Actions created:', Object.keys(actions))

    // 🔍 ДИАГНОСТИКА ОБЪЕКТА ACTIONS
    console.log('🔍 [ACTIONS DEBUG] Available action keys:', Object.keys(actions))
    console.log('🔍 [ACTIONS DEBUG] Checking key existence:', {
      text,
      keyExists: text in actions,
      actionValue: actions[text]
    })

    // Выполняем действие, если оно существует, иначе переходим в главное меню
    if (actions[text]) {
      console.log('CASE: handleMenuCommand.if', text)
      await actions[text]()
      console.log('✅ Action executed. Checking scene...')
      console.log('🔍 Current scene after action:', ctx.scene.current?.id)
      console.log('🔍 Scene stack:', ctx.scene.session?.sceneStack)
    } else {
      console.log('CASE: handleMenuCommand.else', text)
      console.log('🔍 [MISSING ACTION] Available actions:', Object.keys(actions))
      // ctx.session.mode = 'main_menu'
      // await ctx.scene.enter('menuScene')
    }
  }
}

// Экспортируем функцию, если она будет использоваться в другом месте
export default handleMenu
