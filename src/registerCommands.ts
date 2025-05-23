import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { message, callbackQuery } from 'telegraf/filters'
import { MyContext } from './interfaces'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
import { levels } from './menu/mainMenu'
import { getUserDetailsSubscription } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from './handlers/getUserInfo'
// Импортируем новую функцию
import { handleRestartVideoGeneration } from './handlers/handleVideoRestart'
import { sendMediaToPulse } from './helpers/pulse'
// Импортируем обработчик команды hello_world
import { handleHelloWorld } from './commands/handleHelloWorld'
import { priceCommand } from './commands/priceCommand'

// Возвращаем импорт всех сцен через index
import {
  avatarBrainWizard,
  textToVideoWizard,
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
  rublePaymentScene,
  starPaymentScene,
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
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  uploadVideoScene,
} from './scenes'

import { defaultSession } from './store'
//
import { get100Command } from './commands/get100Command'
import { handleTechSupport } from './commands/handleTechSupport'
import { handleBuy } from './handlers/handleBuy'
import { isRussian } from '@/helpers'
import { registerPaymentActions } from './handlers/paymentActions'
import { handleTextMessage } from './handlers/handleTextMessage'
// Убираем импорт handleMenu, так как он не используется здесь напрямую
// import { handleMenu } from './handlers/handleMenu'
//https://github.com/telegraf/telegraf/issues/705
export const stage = new Scenes.Stage<MyContext>([
  startScene,
  menuScene,
  helpScene,
  inviteScene,
  paymentScene,
  rublePaymentScene,
  starPaymentScene,
  subscriptionScene,
  subscriptionCheckScene,
  checkBalanceScene,
  balanceScene,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  textToImageWizard,
  textToVideoWizard,
  imageToVideoWizard,
  imageToPromptWizard,
  improvePromptWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  uploadVideoScene,
  sizeWizard,
  new Scenes.WizardScene(ModeEnum.Voice, ...(voiceAvatarWizard.steps as any)),
  new Scenes.WizardScene(
    ModeEnum.TextToSpeech,
    ...(textToSpeechWizard.steps as any)
  ),
  lipSyncWizard,
  new Scenes.WizardScene(ModeEnum.Avatar, ...(avatarBrainWizard.steps as any)),
  new Scenes.WizardScene(
    ModeEnum.ChatWithAvatar,
    ...(chatWithAvatarWizard.steps as any)
  ),
  selectModelWizard,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  getRuBillWizard,
  levelQuestWizard,
  createUserScene,
  neuroCoderScene,
])

// Function to send the promotional message
const sendGroupCommandReply = async (ctx: MyContext) => {
  try {
    const botUsername = ctx.botInfo.username
    const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨\n\nЯ часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}\n\n*Ом Шанти!* 🙏`
    await ctx.reply(message)
  } catch (e) {
    logger.error(
      `Error replying to command in group for ${ctx.botInfo?.username || 'unknown bot'}:`,
      {
        error: e instanceof Error ? e.message : String(e),
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
      }
    )
    // console.error(`Error replying to command in group for ${ctx.botInfo?.username}:`, e); // Fallback if logger fails
  }
}

export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  // 1. Логгер для ВСЕХ входящих обновлений
  bot.use((ctx, next) => {
    logger.info('>>> RAW UPDATE RECEIVED', {
      updateId: ctx.update.update_id,
      updateType: ctx.updateType,
      // Безопасный доступ к текстовым полям
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined,
      callbackData:
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? ctx.callbackQuery.data
          : undefined,
      // Безопасный доступ к информации о сцене
      sceneInfo: ctx.scene?.current?.id,
    })
    return next()
  })

  // 3. Middleware сцен (ДОЛЖЕН БЫТЬ ПОСЛЕ СЕССИИ - сессия теперь регистрируется в bot.ts)
  bot.use(stage.middleware())

  // --- ТЕСТОВАЯ КОМАНДА ---
  bot.command('testpulse', async ctx => {
    logger.info('COMMAND: /testpulse called', { telegramId: ctx.from?.id })
    if (ctx.from?.id !== 144022504) {
      // Ограничиваем вызов (замените на нужный ID админа)
      return ctx.reply('Эта команда только для админа.')
    }
    try {
      const testPrompt = `This is a *test prompt* with some special characters:\n_italic_\n~strikethrough~\n||spoiler||\n[inline URL](http://www.example.com/)\n\`inline fixed-width code\`\n\`\`\`\npre-formatted fixed-width code block\n\`\`\`\nLine with a . period and ! exclamation.\nAnd symbols + - = | { }`

      await ctx.reply('Отправляю тестовое сообщение в @neuro_blogger_pulse...')

      await sendMediaToPulse({
        mediaType: 'photo',
        mediaSource: 'https://picsum.photos/200/300/', // Просто случайное фото
        telegramId: ctx.from.id,
        username: ctx.from.username || 'test_user',
        language: isRussian(ctx) ? 'ru' : 'en',
        serviceType: 'Test Service',
        prompt: testPrompt,
        botName: ctx.botInfo.username,
        additionalInfo: { TestKey: 'TestValue' },
      })

      await ctx.reply(
        'Тестовое сообщение отправлено. Проверь @neuro_blogger_pulse.'
      )
    } catch (error) {
      logger.error('Error in /testpulse command:', { error })
      await ctx.reply('Ошибка при отправке тестового сообщения.')
    }
  })
  // --- КОНЕЦ ТЕСТОВОЙ КОМАНДЫ ---

  // --- ТЕПЕРЬ ВСЕ ОСТАЛЬНЫЕ ОБРАБОТЧИКИ ---

  // 4. ГЛОБАЛЬНЫЕ HEARS ДЛЯ ОСНОВНОЙ НАВИГАЦИИ (теперь ПОСЛЕ stage)
  bot.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
    logger.info('GLOBAL HEARS (POST-STAGE): Главное меню', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in Главное меню hears (POST-STAGE):', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })
  bot.hears(['❓ Справка', '❓ Help'], async ctx => {
    logger.info('GLOBAL HEARS (POST-STAGE): Справка', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('Error in Справка hears (POST-STAGE):', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })
  bot.hears(['Отмена', 'Cancel'], async ctx => {
    logger.info('GLOBAL HEARS (POST-STAGE): Отмена/Cancel', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.reply(
        isRussian(ctx) ? '❌ Процесс отменён.' : '❌ Process cancelled.',
        Markup.removeKeyboard()
      )
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in Отмена/Cancel hears (POST-STAGE):', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // 5. ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ ДЛЯ КНОПОК (КРОМЕ НАВИГАЦИИ) (теперь ПОСЛЕ stage)
  bot.hears([levels[103].title_ru, levels[103].title_en], async ctx => {
    console.log('CASE bot.hears: 💬 Техподдержка / Support')
    await ctx.scene.leave() // Теперь ctx.scene должен быть доступен
    await handleTechSupport(ctx)
  })

  // Добавляем глобальный обработчик для кнопки "Оформить подписку"
  bot.hears([levels[105].title_ru, levels[105].title_en], async ctx => {
    logger.info('GLOBAL HEARS (POST-STAGE): Оформить подписку / Subscribe', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave() // На всякий случай выходим из текущей сцены, если она есть
      ctx.session.mode = ModeEnum.SubscriptionScene // Устанавливаем режим
      // ctx.session.subscription = SubscriptionType.???; // TODO: Решить, какой тип подписки устанавливать здесь? Возможно, не нужно?
      await ctx.scene.enter(ModeEnum.SubscriptionScene) // Входим в сцену подписки
    } catch (error) {
      logger.error('Error in Оформить подписку hears (POST-STAGE):', {
        error,
        telegramId: ctx.from?.id,
      })
      const isRu = ctx.from?.language_code === 'ru'
      await ctx.reply(
        isRu
          ? '❌ Ошибка при переходе к оформлению подписки.'
          : '❌ Error entering subscription.'
      )
    }
  })

  bot.hears([levels[100].title_ru, levels[100].title_en], async ctx => {
    console.log('CASE bot.hears: 💎 Пополнить баланс / Top up balance')
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.PaymentScene
    ctx.session.subscription = SubscriptionType.STARS
    await ctx.scene.enter(ModeEnum.PaymentScene)
  })
  bot.hears([levels[101].title_ru, levels[101].title_en], async ctx => {
    console.log('CASE bot.hears: 🤑 Баланс / Balance')
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.Balance
    await ctx.scene.enter(ModeEnum.Balance)
  })
  bot.hears([levels[5].title_ru, levels[5].title_en], async ctx => {
    console.log('CASE bot.hears: 💭 Чат с аватаром / Chat with avatar')
    logger.info('GLOBAL HEARS: Чат с аватаром', { telegramId: ctx.from?.id })
    try {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.ChatWithAvatar)
    } catch (error) {
      logger.error('Error in Чат с аватаром hears:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('Произошла ошибка при входе в чат с аватаром.')
    }
  })
  bot.hears([levels[7].title_ru, levels[7].title_en], async ctx => {
    console.log('CASE bot.hears: 🎤 Голос аватара / Avatar Voice')
    logger.info('GLOBAL HEARS: Голос аватара', { telegramId: ctx.from?.id })
    try {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter(ModeEnum.Voice)
    } catch (error) {
      logger.error('Error in Голос аватара hears:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('Произошла ошибка при входе в Голос Аватара.')
    }
  })

  // ... (остальные hears для levels[0]...levels[10]) ...
  // Например:
  if (levels && typeof levels === 'object' && levels[1]) {
    bot.hears([levels[1].title_ru, levels[1].title_en], async ctx => {
      // 🤖 Цифровое тело
      logger.info('GLOBAL HEARS: Цифровое тело', { telegramId: ctx.from?.id })
      await ctx.scene.leave() // Теперь должно работать
      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    })
  }
  // ... (и так далее для всех функциональных кнопок)

  // Админские кнопки hears
  bot.hears('🤖 Цифровое тело 2', async ctx => {
    logger.info('GLOBAL HEARS: Цифровое тело 2 (Admin)', {
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })
  bot.hears('📸 Нейрофото 2', async ctx => {
    logger.info('GLOBAL HEARS: Нейрофото 2 (Admin)', {
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.NeuroPhotoV2
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  // hears для "Пригласить друга"
  if (levels && typeof levels === 'object' && levels[102]) {
    bot.hears([levels[102].title_ru, levels[102].title_en], async ctx => {
      console.log('CASE bot.hears: 👥 Пригласить друга / Invite a friend')
      ctx.session.mode = ModeEnum.Invite // Устанавливаем режим
      await ctx.scene.enter(ModeEnum.Invite) // InviteScene ID = 'inviteScene'
    })
  }

  // Добавляем обработчик hears для "Выбор модели ИИ" по аналогии
  if (levels && typeof levels === 'object' && levels[6]) {
    bot.hears([levels[6].title_ru, levels[6].title_en], async ctx => {
      console.log('CASE bot.hears: 🤖 Выбор модели ИИ / Choose AI Model')
      logger.info('GLOBAL HEARS: Выбор модели ИИ', { telegramId: ctx.from?.id })
      try {
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SelectModel // Устанавливаем режим
        await ctx.scene.enter(ModeEnum.SelectModel) // Входим в сцену выбора модели
      } catch (error) {
        logger.error('Error in Выбор модели ИИ hears:', {
          error,
          telegramId: ctx.from?.id,
        })
        await ctx.reply('Произошла ошибка при входе в Выбор модели ИИ.')
      }
    })
  }

  // 6. ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ НАВИГАЦИИ (ACTION) (теперь ПОСЛЕ stage)
  bot.action('go_main_menu', async ctx => {
    logger.info('GLOBAL ACTION: go_main_menu', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in go_main_menu action:', {
        error,
        telegramId: ctx.from?.id,
      })
      // Попытка уведомить пользователя об ошибке
      try {
        await ctx.reply('Ошибка при переходе в меню.')
      } catch {
        /* ignore */
      }
    }
  })

  bot.action('go_help', async ctx => {
    logger.info('GLOBAL ACTION: go_help', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      // Вход в helpScene. Контекст (ctx.session.mode) должен быть установлен ВЫЗЫВАЮЩЕЙ стороной/сценой.
      // Если ctx.session.mode не установлен, helpScene покажет общую справку.
      await ctx.scene.enter('helpScene')
    } catch (error) {
      logger.error('Error in go_help action:', {
        error,
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.reply('Ошибка при открытии справки.')
      } catch {
        /* ignore */
      }
    }
  })

  bot.action('go_back', async ctx => {
    logger.info('GLOBAL ACTION: go_back', { telegramId: ctx.from?.id })
    try {
      await ctx.answerCbQuery()
      // Просто выходим из текущей сцены. Если это helpScene, она сама удалит сообщение.
      // Если другая сцена, пользователь вернется к предыдущему шагу или выйдет.
      await ctx.scene.leave()
      // Опционально: можно удалять сообщение, к которому была привязана кнопка
      // try { await ctx.deleteMessage(); } catch { /* ignore */ }
    } catch (error) {
      logger.error('Error in go_back action:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // 7. Регистрация команд /start, /support, /menu (теперь ПОСЛЕ stage)
  bot.command('start', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }
    console.log('CASE bot.command: start')
    // При старте всегда сбрасываем сессию и входим в createUserScene
    ctx.session = { ...defaultSession }
    await ctx.scene.leave() // Явно выходим из любой сцены
    await ctx.scene.enter(ModeEnum.CreateUserScene)
  })

  bot.command('get100', async ctx => {
    if (!ctx.session.userModel) {
      ctx.session.userModel = {
        model_name: 'default',
        trigger_word: '',
        model_url: 'placeholder/placeholder:placeholder',
        finetune_id: '',
      }
    }
    await get100Command(ctx)
  })

  bot.command('support', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }
    console.log('CASE bot.command: support')
    await ctx.scene.leave() // Выходим из сцены перед показом контактов
    await handleTechSupport(ctx as MyContext)
  })

  bot.command('menu', async ctx => {
    if (ctx.chat.type !== 'private') {
      // В группах команда /menu не должна работать так же, как /start
      // Можно либо ничего не делать, либо отправить другое сообщение
      return // Просто игнорируем в группе
    }
    logger.info('COMMAND /menu: Переход к главному меню', {
      telegramId: ctx.from?.id,
    })
    try {
      // Re-enter the menu scene
      ctx.session.mode = ModeEnum.MainMenu // Устанавливаем режим перед входом
      await ctx.scene.leave() // Выходим из текущей, если есть
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in /menu command:', {
        error,
        telegramId: ctx.from?.id,
      })
      try {
        await ctx.reply('Ошибка при переходе в меню.')
      } catch {
        /* ignore */
      }
    }
  })

  bot.command('get100', async ctx => {
    if (!ctx.session.userModel) {
      ctx.session.userModel = {
        model_name: 'default',
        trigger_word: '',
        model_url: 'placeholder/placeholder:placeholder',
        finetune_id: '',
      }
    }
    await get100Command(ctx)
  })

  // Регистрируем команду /hello_world для тестирования Inngest
  bot.command('hello_world', async ctx => {
    if (ctx.chat.type !== 'private') {
      return sendGroupCommandReply(ctx)
    }
    logger.info('COMMAND /hello_world: Testing Inngest integration', {
      telegramId: ctx.from?.id,
    })
    await handleHelloWorld(ctx)
  })

  // 8. Регистрация специфичных для оплаты действий
  registerPaymentActions(bot)

  // 9. Обработка перезапуска видео
  bot.action(/^restart_video:(.+)$/, handleRestartVideoGeneration)

  // 10. Обработчик неизвестных колбэков (предпоследний)
  bot.on(callbackQuery('data'), async ctx => {
    await ctx.answerCbQuery('Неизвестное действие')
    console.warn('Unhandled callback_query:', ctx.callbackQuery)
  })

  // 11. ОБРАБОТЧИК ТЕКСТА (ПОСЛЕДНИЙ)
  // Убираем ранее добавленный универсальный обработчик,
  // так как кнопки меню обрабатываются через hears выше.
  // Оставляем только handleTextMessage, который, вероятно,
  // предназначен для обработки текста ВНУТРИ сцен.
  bot.on(message('text'), handleTextMessage)

  bot.command('price', priceCommand)

  console.log('✅ [SCENE_DEBUG] Stage импортирован успешно')
  console.log(
    '📊 [SCENE_DEBUG] Количество обработчиков сцен:',
    stage.scenes.size
  )
}
