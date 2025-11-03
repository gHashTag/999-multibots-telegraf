import { MyContext } from '@/interfaces/telegram-bot.interface'
import { levels, HAIM_GROUP_STAFF_IDS } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { ModeEnum } from '@/interfaces/modes'
import { ADMIN_IDS_ARRAY } from '@/config'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  console.log('CASE: handleMenuCommand')
  const isRu = isRussian(ctx)

  // Получаем текст из message или из update
  let text = ''
  if (ctx.message && 'text' in ctx.message) {
    text = ctx.message.text || ''
    console.log('CASE: handleMenuCommand.text from message:', text)
  } else if (ctx.update.message && 'text' in ctx.update.message) {
    text = ctx.update.message.text || ''
    console.log('CASE: handleMenuCommand.text from update.message:', text)
  } else if (ctx.update.callback_query && 'data' in ctx.update.callback_query) {
    text = ctx.update.callback_query.data || ''
    console.log('CASE: handleMenuCommand.text from callback_query:', text)
  } else {
    console.log('CASE: handleMenuCommand - no text found in ctx')
    return
  }

  console.log('CASE: handleMenuCommand.processing text:', text)

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

<<<<<<< HEAD
  // Безопасное добавление action
  const addAction = (key: number, actionFn: () => Promise<void>) => {
    if (levels?.[key] && levels[key].title_ru && levels[key].title_en) {
      const actionKey = isRu ? levels[key].title_ru : levels[key].title_en
      actions[actionKey] = actionFn
        console.log(`✅ Added action for level ${key}: ${actionKey}`)
      } else {
        console.warn(`⚠️ levels[${key}] is not defined properly`)
=======
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text || ''
    const normalizedText = text.replace(/\s+/g, ' ').trim()
    logger.info({
      message: `📝 [handleMenu] Получен текст команды: "${normalizedText}"`,
      telegramId,
      function: 'handleMenu',
      text: normalizedText,
    })

    console.log('CASE: handleMenuCommand.text', normalizedText)

    // Создаем объект для сопоставления текста с действиями
    const actions: Record<string, () => Promise<void>> = {
      [isRu ? levels[105].title_ru : levels[105].title_en]: async () => {
        logger.info({
          message: '💫 [handleMenu] Оформление подписки',
          telegramId,
          function: 'handleMenu',
          action: 'subscribe',
          nextScene: ModeEnum.SubscriptionScene,
        })
        console.log('CASE: 💫 Оформление подписки')
        ctx.session.mode = ModeEnum.SubscriptionScene
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.SubscriptionScene}`
        )
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.SubscriptionScene}`
        )
      },
      // Обработчики для отдельных кнопок подписки убраны - теперь используется единая кнопка "💫 Оформить подписку"
      [isRu ? levels[1].title_ru : levels[1].title_en]: async () => {
        logger.info({
          message: '🤖 [handleMenu] Переход к цифровому телу',
          telegramId,
          function: 'handleMenu',
          action: 'digital_avatar_body',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🤖 Цифровое тело')
        ctx.session.mode = ModeEnum.DigitalAvatarBody
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? '🤖 Цифровое тело 2' : '🤖 Digital Body 2']: async () => {
        logger.info({
          message: '🤖 [handleMenu] Переход к цифровому телу 2',
          telegramId,
          function: 'handleMenu',
          action: 'digital_avatar_body_v2',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🤖 Цифровое тело 2')
        ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[2].title_ru : levels[2].title_en]: async () => {
        logger.info({
          message: '📸 [handleMenu] Переход к нейрофото',
          telegramId,
          function: 'handleMenu',
          action: 'neurophoto',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE handleMenu: 📸 Нейрофото')
        ctx.session.mode = ModeEnum.NeuroPhoto
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? '📸 Нейрофото 2' : '📸 NeuroPhoto 2']: async () => {
        logger.info({
          message: '📸 [handleMenu] Переход к нейрофото 2',
          telegramId,
          function: 'handleMenu',
          action: 'neurophoto_v2',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 📸 Нейрофото 2')
        ctx.session.mode = ModeEnum.NeuroPhotoV2
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      // Обработка варианта с двойным пробелом (например, если кнопка содержит лишний пробел)
      [isRu ? '📸 Нейрофото 2' : '📸 NeuroPhoto 2']: async () => {
        logger.info({
          message: '📸 [handleMenu] Переход к нейрофото 2 (двойной пробел)',
          telegramId,
          function: 'handleMenu',
          action: 'neurophoto_v2',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 📸  Нейрофото 2 (двойной пробел)')
        ctx.session.mode = ModeEnum.NeuroPhotoV2
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[3].title_ru : levels[3].title_en]: async () => {
        logger.info({
          message: '🔍 [handleMenu] Переход к промпту из фото',
          telegramId,
          function: 'handleMenu',
          action: 'image_to_prompt',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🔍 Промпт из фото')
        ctx.session.mode = ModeEnum.ImageToPrompt
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[4].title_ru : levels[4].title_en]: async () => {
        logger.info({
          message: '🧠 [handleMenu] Переход к мозгу аватара',
          telegramId,
          function: 'handleMenu',
          action: 'avatar_brain',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🧠 Мозг аватара')
        ctx.session.mode = ModeEnum.Avatar
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[5].title_ru : levels[5].title_en]: async () => {
        logger.info({
          message: '💭 [handleMenu] Переход к чату с аватаром',
          telegramId,
          function: 'handleMenu',
          action: ModeEnum.ChatWithAvatar,
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 💭 Чат с аватаром')
        ctx.session.mode = ModeEnum.ChatWithAvatar
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[6].title_ru : levels[6].title_en]: async () => {
        logger.info({
          message: '🤖 [handleMenu] Переход к выбору модели ИИ',
          telegramId,
          function: 'handleMenu',
          action: 'select_model',
          nextScene: ModeEnum.SelectModel,
        })
        console.log('CASE: 🤖 Выбор модели ИИ')
        ctx.session.mode = ModeEnum.SelectModel
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.SelectModel}`)
        await ctx.scene.enter(ModeEnum.SelectModel)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.SelectModel}`
        )
      },
      [isRu ? levels[7].title_ru : levels[7].title_en]: async () => {
        logger.info({
          message: '🎤 [handleMenu] Переход к голосу аватара',
          telegramId,
          function: 'handleMenu',
          action: 'voice_avatar',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🎤 Голос аватара')
        ctx.session.mode = ModeEnum.Voice
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[8].title_ru : levels[8].title_en]: async () => {
        logger.info({
          message: '🎙️ [handleMenu] Переход к тексту в голос',
          telegramId,
          function: 'handleMenu',
          action: 'text_to_speech',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🎙️ Текст в голос')
        ctx.session.mode = ModeEnum.TextToSpeech
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[9].title_ru : levels[9].title_en]: async () => {
        logger.info({
          message: '🎥 [handleMenu] Переход к фото в видео',
          telegramId,
          function: 'handleMenu',
          action: 'image_to_video',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🎥 Фото в видео')
        ctx.session.mode = ModeEnum.ImageToVideo
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[10].title_ru : levels[10].title_en]: async () => {
        logger.info({
          message: '🎬 [handleMenu] Переход к видео из текста',
          telegramId,
          function: 'handleMenu',
          action: 'text_to_video',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🎬 Видео из текста')
        
        // ✅ Добавляем немедленную обратную связь пользователю
        await ctx.reply(isRu ? '🎬 Загружаем генератор видео...' : '🎬 Loading video generator...')
        
        console.log('🎬 [handleMenu] SETTING MODE TO:', ModeEnum.TextToVideo)
        ctx.session.mode = ModeEnum.TextToVideo
        console.log('🎬 [handleMenu] MODE SET, CURRENT SESSION MODE:', ctx.session.mode)
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[11].title_ru : levels[11].title_en]: async () => {
        logger.info({
          message: '🖼️ [handleMenu] Переход к тексту в фото',
          telegramId,
          function: 'handleMenu',
          action: 'text_to_image',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🖼️ Текст в фото')
        ctx.session.mode = ModeEnum.TextToImage
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[12].title_ru : levels[12].title_en]: async () => {
        logger.info({
          message: '🎨 [handleMenu] Переход к ИИ Фотошоп',
          telegramId,
          function: 'handleMenu',
          action: 'ai_photoshop',
          nextScene: 'ai_photoshop_scene',
        })
        console.log('CASE: 🎨 ИИ Фотошоп')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в ИИ Фотошоп
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          '🎨 ИИ Фотошоп'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим ИИ Фотошоп и переходим напрямую в ai_photoshop_scene
        ctx.session.mode = 'ai_photoshop' as any
        console.log(`🔄 [handleMenu] Вход в сцену ai_photoshop_scene`)
        await ctx.scene.enter('ai_photoshop_scene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ai_photoshop_scene`)
      },
      [isRu ? levels[13].title_ru : levels[13].title_en]: async () => {
        logger.info({
          message: '🧬 [handleMenu] Переход к морфингу',
          telegramId,
          function: 'handleMenu',
          action: 'morphing',
          nextScene: 'morphing_wizard',
        })
        console.log('CASE: 🧬 Морфинг')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в морфинг
        const hasSubscription = await checkSubscriptionGuard(ctx, '🧬 Морфинг')
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим морфинга и переходим напрямую в morphing_wizard
        ctx.session.mode = 'morphing' as any
        console.log(`🔄 [handleMenu] Вход в сцену morphing_wizard`)
        await ctx.scene.enter('morphing_wizard')
        console.log(`✅ [handleMenu] Завершен вход в сцену morphing_wizard`)
      },
      [isRu ? levels[14].title_ru : levels[14].title_en]: async () => {
        console.log('🔵 [DEBUG 1] Lip Sync button handler started')
        logger.info({
          message: '🎤 [handleMenu] Открытие меню выбора Lip Sync модели',
          telegramId,
          function: 'handleMenu',
          action: 'lip_sync_menu',
        })
        console.log('CASE: 🎤 Лип Синк - показываем меню моделей')
        console.log('🔵 [DEBUG 2] Before checkSubscriptionGuard call')
        logger.info('🔧 [handleMenu DEBUG] Before checkSubscriptionGuard', {
          telegramId,
          currentScene: ctx.scene.current?.id,
        })

        console.log('🔵 [DEBUG 3] Calling checkSubscriptionGuard...')
        // ✅ ЗАЩИТА: Проверяем подписку перед входом в липсинк
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          isRu ? '🎤 Синхронизация губ' : '🎤 Lip Sync'
        )
        console.log('🔵 [DEBUG 4] checkSubscriptionGuard returned:', hasSubscription)

        console.log('🔵 [DEBUG 5] After checkSubscriptionGuard')
        logger.info('🔧 [handleMenu DEBUG] After checkSubscriptionGuard', {
          telegramId,
          hasSubscription,
          currentScene: ctx.scene.current?.id,
        })

        if (!hasSubscription) {
          console.log('🔴 [DEBUG 6] No subscription - exiting early')
          logger.warn('⚠️ [handleMenu] No subscription - exiting')
          return // Пользователь перенаправлен в subscriptionScene
        }

        console.log('🟢 [DEBUG 7] Subscription OK, preparing to enter wizard')
        logger.info('🔧 [handleMenu DEBUG] Subscription OK, entering wizard')

        // ❌ ИСПРАВЛЕНИЕ: НЕ устанавливаем mode = LipSync, чтобы не перехватывали middleware
        // ctx.session.mode = ModeEnum.LipSync

        // Сразу запускаем Veed Fabric wizard
        console.log('🟢 [DEBUG 8] About to enter veed_fabric_lipsync scene')
        logger.info(`🔄 [handleMenu] Запуск Veed Fabric wizard`)

        try {
          console.log('🟢 [DEBUG 9] Calling ctx.scene.enter("veed_fabric_lipsync")')
          await ctx.scene.enter('veed_fabric_lipsync')
          console.log('🟢 [DEBUG 10] Successfully entered veed_fabric_lipsync')
          logger.info(`✅ [handleMenu] Успешно вошли в veed_fabric_lipsync wizard`, {
            currentScene: ctx.scene.current?.id,
            wizardStep: (ctx.wizard as any)?.cursor,
          })
        } catch (error) {
          console.log('🔴 [DEBUG 11] Error entering wizard:', error)
          logger.error(`❌ [handleMenu] Ошибка входа в veed_fabric_lipsync`, { error })
          await ctx.reply(
            isRu
              ? '❌ Ошибка запуска wizard. Попробуйте позже.'
              : '❌ Error starting wizard. Try again later.'
          )
        }
      },
      [isRu ? levels[15].title_ru : levels[15].title_en]: async () => {
        logger.info({
          message: '🎭 [handleMenu] Переход к замене лица',
          telegramId,
          function: 'handleMenu',
          action: 'face_swap',
          nextScene: ModeEnum.FaceSwap,
        })
        console.log('CASE: 🎭 Замена лица')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в face swap
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          isRu ? '🎭 Замена лица' : '🎭 Face Swap'
        )

        if (!hasSubscription) {
          logger.warn('⚠️ [handleMenu] No subscription for Face Swap - exiting')
          return
        }

        logger.info(`🔄 [handleMenu] Запуск Face Swap wizard`)

        try {
          ctx.session.mode = ModeEnum.FaceSwap
          console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.FaceSwap}`)
          await ctx.scene.enter('faceSwapWizard')
          logger.info(`✅ [handleMenu] Успешно вошли в faceSwapWizard`, {
            currentScene: ctx.scene.current?.id,
          })
        } catch (error) {
          logger.error(`❌ [handleMenu] Ошибка входа в faceSwapWizard`, { error })
          console.error('Face swap enter error:', error)
          await ctx.reply(
            isRu
              ? '❌ Ошибка запуска замены лица. Попробуйте позже.'
              : '❌ Error starting face swap. Try again later.'
          )
        }
      },
      [isRu ? levels[107].title_ru : levels[107].title_en]: async () => {
        logger.info({
          message: '⬆️ [handleMenu] Переход к увеличению качества фото',
          telegramId,
          function: 'handleMenu',
          action: 'image_upscaler',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: ⬆️ Увеличить качество')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в upscaler
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          '⬆️ Увеличить качество'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим ImageUpscaler и идем через checkBalanceScene
        ctx.session.mode = ModeEnum.ImageUpscaler
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[108].title_ru : levels[108].title_en]: async () => {
        logger.info({
          message: '📺 [handleMenu] Переход к транскрибации видео',
          telegramId,
          function: 'handleMenu',
          action: 'video_transcription',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 📺 Транскрибация Reels')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в транскрибацию
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          '📺 Транскрибация Reels'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим VideoTranscription и идем через checkBalanceScene
        ctx.session.mode = ModeEnum.VideoTranscription
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
      },
      [isRu ? levels[109].title_ru : levels[109].title_en]: async () => {
        logger.info({
          message: '🔍 [handleMenu] Переход к Instagram парсеру',
          telegramId,
          function: 'handleMenu',
          action: 'instagram_parser',
          nextScene: 'instagram_parser_scene',
        })
        console.log('CASE: 🔍 Мониторинг конкурентов → Instagram Parser')
        
        // Проверяем доступ к парсингу
        const userId = ctx.from?.id?.toString()
        const botToken = ctx.telegram.token
        
        if (!userId) {
          await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
          return
        }
        
        const parsingAccess = getParsingAccess(userId, botToken)
        
        if (!parsingAccess.hasAccess) {
          logger.warn('Instagram parsing access denied via competitor monitoring button', {
            telegramId,
            userId,
          })
          await ctx.reply(
            isRu
              ? '❌ У вас нет доступа к Instagram парсингу.'
              : '❌ You do not have access to Instagram parsing.'
          )
          return
        }
        
        logger.info('✅ Instagram parsing access granted via competitor monitoring', {
          telegramId,
          userId,
          parsingAccess
        })
        
        // Переходим в Instagram parser scene
        ctx.session.mode = ModeEnum.InstagramParserScene
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.InstagramParserScene}`
        )
        await ctx.scene.enter(ModeEnum.InstagramParserScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену instagram_parser_scene`
        )
      },
      [isRu ? levels[110].title_ru : levels[110].title_en]: async () => {
        logger.info({
          message: '🎬 [handleMenu] AI Reels - запуск entry wizard',
          telegramId,
          function: 'handleMenu',
          action: 'ai_reels_entry',
        })
        console.log('CASE: 🎬 AI Reels - Entry Wizard')

        // Проверяем права администратора или сотрудников Хаим Групп
        const userId = ctx.from?.id?.toString()
        const isMainAdmin = userId && adminIds.includes(userId)
        const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
        const hasAccess = isMainAdmin || isHaimStaff

        if (!hasAccess) {
          logger.warn('[handleMenu] AI Reels access denied - not admin/staff', {
            telegramId,
            userId,
            isMainAdmin,
            isHaimStaff,
          })
          await ctx.reply(
            isRu
              ? '❌ У вас нет доступа к AI Reels. Функция доступна только администраторам.'
              : '❌ You do not have access to AI Reels. This feature is admin only.'
          )
          return
        }

        // Запускаем AI Reels entry wizard (выбор метода)
        console.log(`🔄 [handleMenu] Вход в сцену ai_reels_entry`)
        await ctx.scene.enter('ai_reels_entry')
        console.log(`✅ [handleMenu] Завершен вход в сцену ai_reels_entry`)

        logger.info('[handleMenu] AI Reels wizard launched', {
          telegramId,
          userId,
        })
      },
      [isRu ? levels[111].title_ru : levels[111].title_en]: async () => {
        logger.info({
          message: '🦸‍♂️ [handleMenu] Переход к ИИ Герои Transform',
          telegramId,
          function: 'handleMenu',
          action: 'ai_heroes_transform',
          nextScene: 'avatarTransformScene',
        })
        console.log('CASE: 🦸‍♂️ ИИ Герои - Launching Avatar Transform')

        // ИИ Герои используют avatar transform scene для трансформации
        ctx.session.mode = ModeEnum.AvatarTransform
        console.log(
          `🔄 [handleMenu] Вход в сцену avatarTransformScene`
        )
        await ctx.scene.enter('avatar_transform')
        console.log(
          `✅ [handleMenu] Завершен вход в сцену avatarTransformScene`
        )
      },
      // [isRu ? levels[13].title_ru : levels[13].title_en]: async () => {
      //   console.log('CASE: 🎥 Видео в URL')
      //   ctx.session.mode = 'video_in_url'
      //   await ctx.scene.enter('checkBalanceScene')
      // },
      [isRu ? levels[100].title_ru : levels[100].title_en]: async () => {
        logger.info({
          message: '💎 [handleMenu] Переход к пополнению баланса',
          telegramId,
          function: 'handleMenu',
          action: 'topup_balance_attempt',
        })
        console.log('CASE: 💎 Пополнить баланс')

        // Проверяем подписку пользователя перед пополнением баланса
        try {
          const userDetails = await getUserDetailsSubscription(telegramId)

          logger.info('[handleMenu] Subscription check for top-up', {
            telegramId,
            hasActiveSubscription: userDetails.isSubscriptionActive,
            subscriptionType: userDetails.subscriptionType,
            stars: userDetails.stars,
          })

          // Если у пользователя есть активная подписка - разрешаем пополнение баланса
          if (userDetails.isSubscriptionActive && userDetails.subscriptionType) {
            logger.info('[handleMenu] User has active subscription - proceeding to top-up', {
              telegramId,
              subscriptionType: userDetails.subscriptionType,
            })

            ctx.session.mode = ModeEnum.PaymentScene

            // Очищаем/инициализируем selectedPayment для контекста пополнения баланса
            ctx.session.selectedPayment = {
              amount: 0, // Сумма будет определена в payment_scene
              stars: 0, // Количество звезд будет определено в payment_scene
              subscription: null, // Явно указываем, что это не покупка подписки
              type: PaymentType.MONEY_INCOME, // Тип операции - пополнение
            }
            logger.info(
              '[handleMenu] Initialized ctx.session.selectedPayment for top-up',
              {
                telegramId,
                selectedPayment: ctx.session.selectedPayment,
              }
            )

            console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.PaymentScene}`)
            await ctx.scene.enter(ModeEnum.PaymentScene)
            console.log(
              `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.PaymentScene}`
            )
          } else {
            // Если подписки нет - предлагаем купить подписку
            logger.info('[handleMenu] User has no active subscription - offering subscription purchase', {
              telegramId,
              stars: userDetails.stars,
            })

            const message = isRu
              ? '💎 Для пополнения баланса требуется активная подписка.\n\n' +
                'Выберите подписку для доступа к пополнению баланса и всем функциям:'
              : '💎 Active subscription is required to top up balance.\n\n' +
                'Choose a subscription to access balance top-up and all features:'

            const keyboard = Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                  'subscription_menu'
                ),
              ],
              [
                Markup.button.callback(
                  isRu ? '🏠 Главное меню' : '🏠 Main menu',
                  'main_menu'
                ),
              ],
            ])

            await ctx.reply(message, { reply_markup: keyboard.reply_markup })
          }
        } catch (error) {
          logger.error('[handleMenu] Error checking subscription for top-up', {
            telegramId,
            error: error instanceof Error ? error.message : String(error),
          })

          // В случае ошибки - все равно предлагаем купить подписку
          const message = isRu
            ? '❌ Произошла ошибка при проверке подписки.\n\n' +
              'Для пополнения баланса требуется активная подписка.\n' +
              'Выберите подписку для доступа ко всем функциям:'
            : '❌ Error checking subscription.\n\n' +
              'Active subscription is required to top up balance.\n' +
              'Choose a subscription to access all features:'

          const keyboard = Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                'subscription_menu'
              ),
            ],
            [
              Markup.button.callback(
                isRu ? '🏠 Главное меню' : '🏠 Main menu',
                'main_menu'
              ),
            ],
          ])

          await ctx.reply(message, { reply_markup: keyboard.reply_markup })
        }
      },
      [isRu ? levels[101].title_ru : levels[101].title_en]: async () => {
        logger.info({
          message: '🤑 [handleMenu] Переход к балансу',
          telegramId,
          function: 'handleMenu',
          action: 'balance',
          nextScene: 'balanceScene',
        })
        console.log('CASE: 🤑 Баланс')
        ctx.session.mode = ModeEnum.Balance
        console.log(`🔄 [handleMenu] Вход в сцену ${'balanceScene'}`)
        await ctx.scene.enter('balanceScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'balanceScene'}`)
      },
      [isRu ? levels[102].title_ru : levels[102].title_en]: async () => {
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
      [isRu ? levels[103].title_ru : levels[103].title_en]: async () => {
        logger.info({
          message: '❓ [handleMenu] Переход к помощи',
          telegramId,
          function: 'handleMenu',
          action: 'help',
          nextScene: ModeEnum.Help,
        })
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.Help}`)
        await handleTechSupport(ctx)
        console.log(`✅ [handleMenu] Завершен вызов handleTechSupport`)
      },
      [isRu ? levels[104].title_ru : levels[104].title_en]: async () => {
        logger.info({
          message: '🏠 [handleMenu] Переход к главному меню',
          telegramId,
          function: 'handleMenu',
          action: 'main_menu',
          nextScene: ModeEnum.MainMenu,
        })
        console.log('CASE: 🏠 Главное меню')
        // Re-enter the menu scene
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.MainMenu}`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.MainMenu}`
        )
      },
      ['/support']: async () => {
        logger.info({
          message: '❓ [handleMenu] Переход к помощи',
          telegramId,
          function: 'handleMenu',
          action: 'help',
          nextScene: ModeEnum.Help,
        })
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.Help}`)
        await handleTechSupport(ctx)
        console.log(`✅ [handleMenu] Завершен вызов handleTechSupport`)
      },
      '/invite': async () => {
        logger.info({
          message:
            '👥 [handleMenu] Команда /invite - переход к приглашению друга',
          telegramId,
          function: 'handleMenu',
          action: 'invite_command',
          nextScene: 'inviteScene',
        })
        console.log('CASE: 👥 Пригласить друга')
        ctx.session.mode = ModeEnum.Invite
        console.log(`🔄 [handleMenu] Вход в сцену ${'inviteScene'}`)
        await ctx.scene.enter('inviteScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'inviteScene'}`)
      },
      '/price': async () => {
        logger.info({
          message: '💰 [handleMenu] Команда /price - переход к ценам',
          telegramId,
          function: 'handleMenu',
          action: 'price_command',
          nextScene: 'priceScene',
        })
        console.log('CASE: 💰 Цены')
        await handlePriceCommand(ctx)
      },

      '/balance': async () => {
        logger.info({
          message: '💰 [handleMenu] Команда /balance - переход к балансу',
          telegramId,
          function: 'handleMenu',
          action: 'balance_command',
          nextScene: 'balanceScene',
        })
        console.log('CASE: 💰 Баланс')
        ctx.session.mode = ModeEnum.Balance
        console.log(`🔄 [handleMenu] Вход в сцену ${'balanceScene'}`)
        await ctx.scene.enter('balanceScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${'balanceScene'}`)
      },
      '/help': async () => {
        logger.info({
          message: '❓ [handleMenu] Команда /help - переход к помощи',
          telegramId,
          function: 'handleMenu',
          action: 'help_command',
          nextScene: 'helpScene',
        })
        console.log('CASE: ❓ Помощь')
        ctx.session.mode = ModeEnum.Help
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.Help}`)
        await ctx.scene.enter('helpScene')
        console.log(`✅ [handleMenu] Завершен вход в сцену ${ModeEnum.Help}`)
      },
      '/menu': async () => {
        logger.info({
          message: '🏠 [handleMenu] Команда /menu - переход к главному меню',
          telegramId,
          function: 'handleMenu',
          action: 'menu_command',
          nextScene: ModeEnum.MainMenu,
        })
        console.log('CASE: 🏠 Главное меню')
        // Re-enter the menu scene
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Вход в сцену ${ModeEnum.MainMenu}`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.MainMenu}`
        )
      },
      // УБРАН КОНФЛИКТУЮЩИЙ ОБРАБОТЧИК /start - команды обрабатываются только в registerCommands.ts
      Отмена: async () => {
        // Исправленный обработчик для 'Отмена'
        logger.info('[handleMenu] Обработка Отмены')
        await ctx.reply(
          isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.',
          Markup.removeKeyboard()
        )
        await ctx.scene.leave() // Покидаем текущую сцену (вероятно, menuScene)
        await ctx.scene.enter(ModeEnum.MainMenu) // Входим в главное меню
      },
      Cancel: async () => {
        // Исправленный обработчик для 'Cancel'
        logger.info('[handleMenu] Handling Cancel')
        await ctx.reply('❌ Process cancelled.', Markup.removeKeyboard())
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.MainMenu)
      },
      // ✅ Добавляем обработчики для ОБЕИХ языковых кнопок явно
      '🌐 EN': async () => {
        logger.info({
          message: '🌐 [handleMenu] Переключение на английский язык',
          telegramId,
          function: 'handleMenu',
          action: 'language_toggle_to_en',
          currentLanguage: getUserLanguageFromState(ctx),
        })
        console.log('CASE: 🌐 EN - Переключение на английский')

        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
        await setUserLanguageInState(ctx, 'en')

        // Уведомляем пользователя о смене языка
        await ctx.reply('🌐 Language changed to English')

        logger.info({
          message: '✅ [handleMenu] Язык успешно переключен на английский',
          telegramId,
          function: 'handleMenu',
          newLanguage: 'en',
        })

        // Перезагружаем главное меню с новым языком
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Перезагрузка меню с английским языком`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(`✅ [handleMenu] Меню перезагружено с языком: en`)
      },
      '🌐 RU': async () => {
        logger.info({
          message: '🌐 [handleMenu] Переключение на русский язык',
          telegramId,
          function: 'handleMenu',
          action: 'language_toggle_to_ru',
          currentLanguage: getUserLanguageFromState(ctx),
        })
        console.log('CASE: 🌐 RU - Переключение на русский')

        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
        await setUserLanguageInState(ctx, 'ru')

        // Уведомляем пользователя о смене языка
        await ctx.reply('🌐 Язык изменен на русский')

        logger.info({
          message: '✅ [handleMenu] Язык успешно переключен на русский',
          telegramId,
          function: 'handleMenu',
          newLanguage: 'ru',
        })

        // Перезагружаем главное меню с новым языком
        ctx.session.mode = ModeEnum.MainMenu
        console.log(`🔄 [handleMenu] Перезагрузка меню с русским языком`)
        await ctx.scene.enter(ModeEnum.MainMenu)
        console.log(`✅ [handleMenu] Меню перезагружено с языком: ru`)
      },
    }

    // ✅ ОТЛАДКА: Выводим все ключи actions для диагностики
    const actionKeys = Object.keys(actions)
    console.log('🔧 [DEBUG] Available action keys:', actionKeys)
    console.log('🔧 [DEBUG] Looking for key:', normalizedText)
    console.log('🔧 [DEBUG] levels[10].title_ru:', levels[10].title_ru)
    console.log(
      '🔧 [DEBUG] Exact match check:',
      actionKeys.includes(normalizedText)
    )

    // Выполняем действие, если оно существует
    if (actions[normalizedText]) {
      logger.info({
        message: `✅ [handleMenu] Найдено действие для текста: "${normalizedText}"`,
        telegramId,
        function: 'handleMenu',
        text: normalizedText,
        result: 'action_found',
      })
      console.log('CASE: handleMenuCommand.if', normalizedText)
      await actions[normalizedText]()
    } else if (normalizedText.startsWith(isRu ? levels[111].title_ru : levels[111].title_en)) {
      // ✅ ИСПРАВЛЕНИЕ: Обработка AI Heroes с любым badge (♾️, 🚫, или счетчиком)
      logger.info({
        message: `🦸‍♂️ [handleMenu] AI Heroes с badge обнаружен: "${normalizedText}"`,
        telegramId,
        function: 'handleMenu',
        action: 'ai_heroes_transform_with_badge',
        nextScene: 'avatarTransformScene',
      })
      console.log('CASE: 🦸‍♂️ ИИ Герои с badge - Launching Avatar Transform')

      // ИИ Герои используют avatar transform scene для трансформации
      ctx.session.mode = ModeEnum.AvatarTransform
      console.log(
        `🔄 [handleMenu] Вход в сцену avatarTransformScene`
      )
      await ctx.scene.enter('avatar_transform')
      console.log(
        `✅ [handleMenu] Завершен вход в сцену avatarTransformScene`
      )
    } else {
      // Логика для необработанного текста (если нужна)
      logger.warn({
        message: `⚠️ [handleMenu] Не найдено действие для текста: "${normalizedText}"`,
        telegramId,
        function: 'handleMenu',
        text: normalizedText,
        result: 'action_not_found',
      })
      console.log('CASE: handleMenuCommand.else', normalizedText)
      
      // Проверяем, ожидается ли ввод username конкурента
      console.log('🔍 [handleMenu] Checking competitor username input...')
      console.log('Session competitor monitoring state:', ctx.session.competitorMonitoring)
      
      if (ctx.session.competitorMonitoring?.waitingForUsername) {
        console.log('✅ [handleMenu] User is waiting for username input, processing...')
        logger.info({
          message: `🔍 [handleMenu] Обрабатываем ввод username конкурента: "${normalizedText}"`,
          telegramId,
          function: 'handleMenu',
          text: normalizedText,
          result: 'competitor_username_input',
        })
        
        try {
          // Импортируем и вызываем функцию обработки username
          const handled = await handleCompetitorUsernameInput(ctx, normalizedText)
          if (handled) {
            console.log('✅ [handleMenu] Successfully handled competitor username input')
            return // Завершаем обработку
          }
        } catch (error) {
          console.log('❌ [handleMenu] Error handling competitor username input:', error)
          logger.error('[handleMenu] Error handling competitor username input', {
            error: error instanceof Error ? error.message : String(error),
            telegramId,
            username: normalizedText
          })
        }
>>>>>>> a439e5e3a6835afff1d55154e4e7140dd8ad0e13
      }
    }

    addAction(105, async () => {
      console.log('CASE: 💫 Оформление подписки')
      ctx.session.mode = ModeEnum.Subscribe
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
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

    addAction(12, async () => {
      console.log('CASE: 🎨 ИИ Фотошоп')
      ctx.session.mode = ModeEnum.AiPhotoshop
      await ctx.scene.enter('ai_photoshop_scene')
    })

    addAction(13, async () => {
      console.log('CASE: 🌀 Infinity Морфинг')
      ctx.session.mode = ModeEnum.MorphingWizard
      await ctx.scene.enter('morphing_wizard')
    })

    addAction(14, async () => {
      console.log('CASE: 🎤 Синхронизация губ')
      // Проверяем админские права
      const { ADMIN_IDS_ARRAY } = await import('@/config')
      const userId = ctx.from?.id
      const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

      if (!isAdmin) {
        await ctx.reply('❌ Функция доступна только администраторам.')
        return
      }

      // Входим в сцену lipSync
      await ctx.scene.enter('lip_sync')
    })

    addAction(15, async () => {
      console.log('CASE: 🎭 Замена лица')
      ctx.session.mode = ModeEnum.FaceSwap
      await ctx.scene.enter('faceSwapWizard')
    })

    addAction(107, async () => {
      console.log('CASE: ⬆️ Увеличить качество фото')
      ctx.session.mode = ModeEnum.ImageUpscaler
      await ctx.scene.enter('imageUpscalerWizard')
    })

    addAction(108, async () => {
      console.log('CASE: 📺 Транскрибация Reels')
      ctx.session.mode = ModeEnum.VideoTranscription
      await ctx.scene.enter('video_transcription')
    })

    addAction(111, async () => {
      console.log('CASE: 🦸‍♂️ ИИ Герои')
      ctx.session.mode = ModeEnum.AIHeroes
      await ctx.scene.enter('avatarTransformScene')
    })

    addAction(100, async () => {
      console.log('CASE: 💎 Пополнить баланс')
      ctx.session.mode = ModeEnum.TopUpBalance
      await ctx.scene.enter('paymentScene')
    })

    addAction(101, async () => {
      console.log('CASE: 🤑 Баланс')
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter(ModeEnum.BalanceScene)
    })

    addAction(102, async () => {
      console.log('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter(ModeEnum.InviteScene)
    })

    addAction(103, async () => {
      console.log('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter(ModeEnum.HelpScene)
    })

    addAction(104, async () => {
      console.log('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    })

    addAction(106, async () => {
      console.log('CASE: 🌐 Смена языка')
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
      console.log('CASE: 🔍 Мониторинг конкурентов')

      // Проверяем права администратора или сотрудников Хаим Групп
      const userId = ctx.from?.id?.toString()
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        console.log('[handleMenu] Competitor monitoring access denied - not admin/staff', {
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
      console.log(`🔄 [handleMenu] Вход в сцену instagram_parser_wizard`)
      await ctx.scene.enter('instagram_parser_wizard')
      console.log(`✅ [handleMenu] Завершен вход в сцену instagram_parser_wizard`)
    })

    // AI Reels button handler (level 110)
    addAction(110, async () => {
      console.log('CASE: 🎬 ИИ Рилс - Entry Wizard')

      // Проверяем права администратора или сотрудников Хаим Групп
      const userId = ctx.from?.id?.toString()
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        console.log('[handleMenu] AI Reels access denied - not admin/staff', {
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
      console.log(`🔄 [handleMenu] Вход в сцену ai_reels_entry`)
      await ctx.scene.enter('ai_reels_entry')
      console.log(`✅ [handleMenu] Завершен вход в сцену ai_reels_entry`)
    })

    actions['/invite'] = async () => {
      console.log('CASE: 👥 Пригласить друга')
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter(ModeEnum.InviteScene)
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
      await ctx.scene.enter(ModeEnum.BalanceScene)
    }

    actions['/help'] = async () => {
      console.log('CASE: ❓ Помощь')
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter(ModeEnum.HelpScene)
    }

    actions['/menu'] = async () => {
      console.log('CASE: 🏠 Главное меню')
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    }

    actions['/start'] = async () => {
      console.log('CASE: 🚀 Начать обучение')
      await ctx.scene.enter(ModeEnum.StartScene)
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

// Экспортируем функцию, если она будет использоваться в другом месте
export default handleMenu
