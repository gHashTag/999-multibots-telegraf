import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  getUserDetailsSubscription,
  createUser,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { defaultSession } from '@/store'
import { handleMenu } from '@/handlers/handleMenu'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
interface StartSceneState {
  initialDisplayDone?: boolean
}

// Список известных глобальных команд, которые startScene должна "отпускать"
const GLOBAL_COMMANDS_TO_RELEASE = [
  '/menu',
  '/price',
  '/start',
  '/support',
  '/get100',
]

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = isRussianFromState(ctx)
    const currentBotName = ctx.botInfo.username

    // ✅ OPTIMIZED LOGIC: High-performance user experience detection
    // Uses cached analysis to minimize database load while maintaining accuracy
    try {
      const skipOnboarding = await shouldSkipOnboardingCached(telegramId, currentBotName)

      if (skipOnboarding) {
        logger.info({
          message: `[StartScene] Experienced user detected via optimized check - redirecting to main menu`,
          telegramId,
          botName: currentBotName,
          optimizationType: 'cached_analysis',
          function: 'startScene.experiencedUserRedirect',
        })

        // Immediate redirect to main menu for experienced users
        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }

      logger.info({
        message: `[StartScene] New or inexperienced user detected via optimized check - proceeding with full onboarding`,
        telegramId,
        botName: currentBotName,
        optimizationType: 'cached_analysis',
        function: 'startScene.newUserOnboarding',
      })
    } catch (error) {
      // Enhanced error handling with fallback to non-cached version
      logger.warn({
        message: `[StartScene] Error in optimized user experience check, attempting fallback`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId,
        botName: currentBotName,
        function: 'startScene.optimizedCheckError',
      })

      // Fallback to non-cached version
      try {
        const skipOnboardingFallback = await shouldSkipOnboarding(telegramId, currentBotName)

        if (skipOnboardingFallback) {
          logger.info({
            message: `[StartScene] Experienced user detected via fallback check - redirecting to main menu`,
            telegramId,
            botName: currentBotName,
            optimizationType: 'fallback_analysis',
            function: 'startScene.experiencedUserRedirect',
          })

          ctx.session.mode = ModeEnum.MainMenu
          await ctx.scene.leave()
          return ctx.scene.enter(ModeEnum.MainMenu)
        }

        logger.info({
          message: `[StartScene] New user confirmed via fallback check - proceeding with onboarding`,
          telegramId,
          botName: currentBotName,
          optimizationType: 'fallback_analysis',
          function: 'startScene.newUserOnboarding',
        })
      } catch (fallbackError) {
        // Ultimate fallback: proceed with normal flow for safety
        logger.error({
          message: `[StartScene] Both optimized and fallback checks failed - proceeding with normal flow for safety`,
          originalError: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          telegramId,
          botName: currentBotName,
          function: 'startScene.allChecksFailedFallback',
        })
      }
    }

    // ✅ ИСПРАВЛЕНИЕ: Проверяем, является ли это ПРОМО-командой (не всеми командами с параметрами!)
    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text

      // Проверяем ТОЛЬКО промо-команды, используя существующую функцию
      const { extractPromoFromContext } = await import('@/helpers/contextUtils')
      const promoInfo = extractPromoFromContext(ctx)

      // Если это промо-ссылка И промо еще не было обработано, перенаправляем в CreateUserScene
      if (promoInfo?.isPromo && !ctx.session.promoProcessed) {
        logger.info({
          message: `[StartScene] Promo command detected, redirecting to CreateUserScene`,
          telegramId,
          command: messageText,
          promoType: promoInfo.parameter,
        })

        // Устанавливаем флаг, что промо будет обработано
        ctx.session.promoProcessed = true

        // Очищаем сессию и переходим в CreateUserScene для обработки промо-логики
        ctx.session = { ...defaultSession, promoProcessed: true }
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.CreateUserScene)
      }

      // Если это промо-ссылка, но промо уже было обработано, идем в главное меню
      if (promoInfo?.isPromo && ctx.session.promoProcessed) {
        logger.info({
          message: `[StartScene] Promo already processed, redirecting to MainMenu`,
          telegramId,
          command: messageText,
          promoType: promoInfo.parameter,
        })

        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }
    }

    // Проверка, не является ли это командой, которую нужно отпустить
    if (
      (ctx.wizard.state as StartSceneState).initialDisplayDone &&
      ctx.message &&
      'text' in ctx.message
    ) {
      const text = ctx.message.text
      if (GLOBAL_COMMANDS_TO_RELEASE.includes(text)) {
        logger.info({
          message: `[StartScene] Active, received global command "${text}". Handling directly.`,
          telegramId,
          function: 'startScene',
          command: text,
        })
        delete (ctx.wizard.state as StartSceneState).initialDisplayDone // Очищаем состояние перед выходом

        // ✅ ИСПРАВЛЕНИЕ: Напрямую обрабатываем команды вместо ожидания глобального обработчика
        switch (text) {
          case '/menu': {
            // ✅ ИСПРАВЛЕНИЕ: Убираем проверку подписки - пускаем всех в меню
            logger.info('[StartScene] /menu: Entering main menu', {
              telegramId,
            })

            await ctx.scene.leave()
            ctx.session.mode = ModeEnum.MainMenu
            return ctx.scene.enter(ModeEnum.MainMenu)
          }
          case '/start': {
            ctx.session = { ...defaultSession }
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.CreateUserScene)
          }
          case '/support': {
            await ctx.scene.leave()
            const { handleTechSupport } = await import(
              '@/commands/handleTechSupport'
            )
            return handleTechSupport(ctx)
          }
          case '/get100': {
            // ✅ ЗАЩИТА: Проверяем подписку перед выдачей бонуса
            const { checkSubscriptionGuard } = await import(
              '@/helpers/subscriptionGuard'
            )
            const hasSubscription = await checkSubscriptionGuard(ctx, '/get100')
            if (!hasSubscription) {
              return // Пользователь перенаправлен в subscriptionScene
            }

            await ctx.scene.leave()
            const { get100Command } = await import('@/commands/get100Command')
            return get100Command(ctx)
          }
          case '/price': {
            await ctx.scene.leave()
            // Импортируем и вызываем priceCommand напрямую
            const { priceCommand } = await import('@/commands/priceCommand')
            return priceCommand(ctx)
          }
          default: {
            // Если команда не распознана, просто выходим из сцены
            await ctx.scene.leave()
            return
          }
        }
      }
    }

    // --- ОСНОВНАЯ ЛОГИКА СЦЕНЫ (Проверка пользователя, приветствие, кнопки) ---
    const finalUsername =
      ctx.from?.username || ctx.from?.first_name || telegramId
    const telegram_id = ctx.from?.id
    const subscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID

    // Только при первом входе в сцену (когда initialDisplayDone еще не установлен)
    // или если это не команда, которую нужно было отпустить.
    if (!(ctx.wizard.state as StartSceneState).initialDisplayDone) {
      try {
        const userDetails = await getUserDetailsSubscription(telegramId)

        if (!userDetails.isExist) {
          // --- Новый пользователь ---
          const {
            username,
            id: tg_id,
            first_name,
            last_name,
            is_bot,
            language_code,
          } = ctx.from!
          const final_username_create =
            username || first_name || tg_id.toString()
          const photo_url = getPhotoUrl(ctx, 1)

          let refCount = 0
          let referrerData: { user_id?: string; username?: string } = {}
          const invite_code = ctx.session.inviteCode

          try {
            if (invite_code) {
              // С рефералом
              const { count, userData: refUserData } =
                await getReferalsCountAndUserData(invite_code.toString())
              refCount = count
              referrerData = refUserData || {}
              // Устанавливаем inviter только если пользователь существует
              if (refUserData && refUserData.user_id) {
                ctx.session.inviter = refUserData.user_id
              }
              // Уведомление рефереру
              try {
                await ctx.telegram.sendMessage(
                  invite_code,
                  isRussianFromState(ctx)
                    ? `🔗 Новый пользователь @${final_username_create} зарегистрировался по вашей ссылке.\n🆔 Уровень: ${refCount}`
                    : `🔗 New user @${final_username_create} registered via your link.\n🆔 Level: ${refCount}`
                )
              } catch (err) {
                logger.warn(
                  `[StartScene] Could not notify referrer ${invite_code} about new user ${final_username_create}`,
                  err
                )
              }
              // Уведомление админу (с рефом)
              if (subscribeChannelId) {
                try {
                  const targetChatId =
                    typeof subscribeChannelId === 'string' &&
                    !subscribeChannelId.startsWith('-')
                      ? `@${subscribeChannelId}`
                      : subscribeChannelId
                  await ctx.telegram.sendMessage(
                    targetChatId,
                    `[${currentBotName}] 🔗 Новый пользователь @${final_username_create} (ID: ${tg_id}) по реф. от @${referrerData.username}`
                  )
                } catch (pulseErr) {
                  logger.warn(
                    `[StartScene] Could not notify admin channel ${subscribeChannelId} about new referred user`,
                    pulseErr
                  )
                }
              } else {
                logger.warn(
                  '[StartScene] SUBSCRIBE_CHANNEL_ID is not set, admin will not be notified about new referred user.'
                )
              }
            } else {
              // Без реферала
              const { count } = await getReferalsCountAndUserData(
                tg_id.toString()
              )
              refCount = count
              // Уведомление админу (без рефа)
              if (subscribeChannelId) {
                try {
                  const targetChatId =
                    typeof subscribeChannelId === 'string' &&
                    !subscribeChannelId.startsWith('-')
                      ? `@${subscribeChannelId}`
                      : subscribeChannelId
                  await ctx.telegram.sendMessage(
                    targetChatId,
                    `[${currentBotName}] 🔗 Новый пользователь @${final_username_create} (ID: ${tg_id})`
                  )
                } catch (pulseErr) {
                  logger.warn(
                    `[StartScene] Could not notify admin channel ${subscribeChannelId} about new user`,
                    pulseErr
                  )
                }
              } else {
                logger.warn(
                  '[StartScene] SUBSCRIBE_CHANNEL_ID is not set, admin will not be notified about new user.'
                )
              }
            }
          } catch (error) {
            logger.error(
              '[StartScene] Error processing referral logic for new user:',
              error
            )
          }

          // Создание пользователя
          const photoUrlResolved = await photo_url
          const userPhotoUrl = await getUserPhotoUrl(ctx, ctx.from?.id || 0)
          const userDataToCreate = {
            username: final_username_create,
            telegram_id: tg_id.toString(),
            first_name: first_name || null,
            last_name: last_name || null,
            is_bot: is_bot || false,
            language_code: language_code || 'en',
            photo_url: userPhotoUrl || photoUrlResolved,
            chat_id: ctx.chat?.id || null,
            mode: 'clean',
            model: 'gpt-4-turbo',
            count: 0,
            aspect_ratio: '9:16',
            balance: 0,
            inviter: ctx.session.inviter || null,
            bot_name: currentBotName,
          }
          try {
            const [wasCreated] = await createUser(userDataToCreate)
            if (wasCreated) {
              await ctx.reply(
                isRussianFromState(ctx)
                  ? '✅ Аватар успешно создан! Добро пожаловать!'
                  : '✅ Avatar created successfully! Welcome!'
              )
            }
          } catch (error) {
            logger.error('[StartScene] Error creating user:', {
              error,
              telegramId,
            })
            await ctx.reply(
              isRussianFromState(ctx)
                ? 'Произошла ошибка при создании вашего профиля.'
                : 'Error creating your profile.'
            )
            return ctx.scene.leave() // Выходим при критической ошибке
          }
        } else {
          // --- Существующий пользователь ---
          // Уведомление админу о рестарте
          if (subscribeChannelId) {
            try {
              const targetChatId =
                typeof subscribeChannelId === 'string' &&
                !subscribeChannelId.startsWith('-')
                  ? `@${subscribeChannelId}`
                  : subscribeChannelId
              await ctx.telegram.sendMessage(
                targetChatId,
                `[${currentBotName}] 🔄 Пользователь @${finalUsername} (ID: ${telegram_id}) перезапустил бота (/start).`
              )
            } catch (notifyError) {
              logger.warn(
                `[StartScene] Could not notify admin channel ${subscribeChannelId} about user restart`,
                notifyError
              )
            }
          } else {
            logger.warn(
              '[StartScene] SUBSCRIBE_CHANNEL_ID is not set, admin will not be notified about user restart.'
            )
          }
        }
      } catch (error) {
        logger.error('[StartScene] Error in user processing logic:', {
          error,
          telegramId,
        })
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при обработке вашего профиля.'
            : 'Error processing your profile.'
        )
        return ctx.scene.leave() // Выходим при критической ошибке
      }

      const { translation, url } = await getTranslation({
        key: 'start',
        ctx,
        bot_name: currentBotName,
      })

      // Функция для проверки валидности URL изображения
      const isValidImageUrl = (imgUrl: string | null): boolean => {
        if (!imgUrl || imgUrl.trim() === '') return false
        if (imgUrl.includes('t.me/c/') || imgUrl.startsWith('https://t.me/c/'))
          return false
        return true
      }

      if (isValidImageUrl(url)) {
        logger.info({
          message:
            '🖼️ [StartScene] Попытка отправки приветственного изображения с fallback',
          telegramId,
          function: 'startScene',
          url,
          step: 'sending_welcome_image_with_fallback',
        })

        const photoSent = await sendPhotoWithFallback(ctx, url, {
          caption:
            translation.length > 1024
              ? translation.substring(0, 1021) + '...'
              : translation,
        })

        if (!photoSent) {
          // Если не удалось отправить фото даже с fallback, отправляем текст
          logger.info({
            message:
              '📝 [StartScene] Отправка текстового приветствия (fallback не сработал)',
            telegramId,
            function: 'startScene',
            step: 'sending_welcome_text_fallback_failed',
          })
          await ctx.reply(translation, {
            parse_mode: 'HTML',
          })
        }
      } else {
        logger.info({
          message:
            '📝 [StartScene] Отправка текстового приветствия (неверный URL изображения)',
          telegramId,
          function: 'startScene',
          step: 'sending_welcome_text_invalid_url',
        })
        await ctx.reply(translation, {
          parse_mode: 'HTML',
        })
      }

      const groupJoinOrVideoUrl = BOT_URLS[currentBotName]

      if (groupJoinOrVideoUrl) {
        logger.info({
          message: `🧲 [StartScene] Отправка лид-магнита для ${currentBotName}`,
          telegramId,
          function: 'startScene',
          url: groupJoinOrVideoUrl,
          step: 'sending_lead_magnet',
        })

        const leadMagnetTextRu = `Хочешь получить обучающее видео? 📀
Подпишись на канал - и тебе откроется доступ!

В этом канале будут публиковаться новости и я буду рассказывать об обновлениях нейро бота  

Жми "Обучение" и ныряй с нами.
`

        const leadMagnetTextEn = `Want to get a training video? 📀
Subscribe to the channel - and you will have access!

This channel will publish news and I will talk about updates to the neuro bot

Click "Training" and dive with us.
`

        await ctx.replyWithHTML(
          isRu ? leadMagnetTextRu : leadMagnetTextEn,
          Markup.inlineKeyboard([
            [
              Markup.button.url(
                isRu ? '🎓 Обучение' : '🎓 Training',
                groupJoinOrVideoUrl
              ),
            ],
            [
              Markup.button.callback(
                isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                'go_to_subscription_scene'
              ),
            ],
          ])
        )
      } else {
        // Случай, если URL для лид-магнита/видео не найден для этого бота
        logger.info({
          message: `ℹ️ [StartScene] URL для лид-магнита/туториала для ${currentBotName} не найден, показываем стандартное меню`,
          telegramId,
          function: 'startScene',
          step: 'lead_magnet_or_tutorial_url_not_found_showing_basic_menu',
        })

        // Восстанавливаем replyKeyboard, если нет лид-магнита, используя isRu
        const replyKeyboard = Markup.keyboard([
          Markup.button.text(
            isRu ? levels[105].title_ru : levels[105].title_en
          ), // Пример кнопки, адаптируйте под ваши levels
          Markup.button.text(
            isRu ? levels[103].title_ru : levels[103].title_en
          ), // Пример кнопки
        ]).resize()

        await ctx.reply(isRu ? 'Выберите действие:' : 'Choose an action:', {
          reply_markup: replyKeyboard.reply_markup,
        })
      }

      ;(ctx.wizard.state as StartSceneState).initialDisplayDone = true // Устанавливаем флаг после успешного отображения
    } // Конец if (!(ctx.wizard.state as StartSceneState).initialDisplayDone)

    logger.info({
      message: `🏁 [StartScene] Завершение обработки в WizardScene. Сцена остается активной для action-обработчиков.`,
      telegramId,
      function: 'startScene',
      initialDisplayDone: (ctx.wizard.state as StartSceneState)
        .initialDisplayDone,
    })

    // Переключаемся на второй хендлер для обработки текстовых сообщений
    return ctx.wizard.next()
  },
  // Второй шаг WizardScene для обработки текстовых сообщений
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = isRussianFromState(ctx)
    const currentBotName = ctx.botInfo.username

    // ✅ OPTIMIZED EDGE CASE PROTECTION: High-performance check for experienced users on step 2
    // Uses cached analysis for minimal performance impact
    try {
      const skipOnboarding = await shouldSkipOnboardingCached(telegramId, currentBotName)

      if (skipOnboarding) {
        logger.info({
          message: `[StartScene Step 2] Experienced user detected on step 2 via optimized check - redirecting to main menu`,
          telegramId,
          botName: currentBotName,
          optimizationType: 'cached_analysis',
          edgeCase: 'step2_experienced_user',
          function: 'startScene.step2.experiencedUserRedirect',
        })

        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }
    } catch (error) {
      logger.warn({
        message: `[StartScene Step 2] Error in optimized user experience check - proceeding with normal flow`,
        error: error instanceof Error ? error.message : String(error),
        telegramId,
        botName: currentBotName,
        step: 'step2',
        function: 'startScene.step2.optimizedCheckError',
      })

      // Note: No fallback needed in step 2 as it's just edge case protection
      // If the check fails, we safely continue with normal step 2 flow
    }

    if ('message' in ctx.update && 'text' in ctx.update.message) {
      const text = ctx.update.message.text
      logger.info(`[StartScene Step 2] Received text: ${text}`, {
        telegramId,
        text,
      })

      // ✅ ИСПРАВЛЕНИЕ: Обработка команды /start с параметром (реферальный код)
      if (text.startsWith('/start ')) {
        const parts = text.split(' ')
        if (parts.length > 1) {
          const startParam = parts[1]
          logger.info('[StartScene Step 2] /start with parameter detected', {
            telegramId,
            parameter: startParam,
          })

          // Проверяем, является ли это реферальным кодом (только цифры)
          if (/^\d+$/.test(startParam)) {
            // Это реферальный код
            logger.info(
              '[StartScene Step 2] Referral code detected, redirecting to /start handler',
              {
                telegramId,
                referralCode: startParam,
              }
            )

            // Сбрасываем сессию и сохраняем реферальный код
            ctx.session = { ...defaultSession }
            ctx.session.inviteCode = startParam

            // Выходим из сцены и запускаем обработчик /start
            await ctx.scene.leave()

            // Проверяем существование пользователя
            const { getUserDetailsSubscription } = await import(
              '@/core/supabase'
            )
            const userDetails = await getUserDetailsSubscription(telegramId)

            if (!userDetails.isExist) {
              // Новый пользователь - идем в CreateUserScene с реферальным кодом
              return ctx.scene.enter(ModeEnum.CreateUserScene)
            } else {
              // Существующий пользователь - идем в AvatarTransform
              return ctx.scene.enter(ModeEnum.AvatarTransform)
            }
          }
        }
      }

      // ✅ ДОБАВЛЯЕМ: Проверка промо-команд во втором шаге
      const { extractPromoFromContext } = await import('@/helpers/contextUtils')
      const promoInfo = extractPromoFromContext(ctx)

      // Если это промо-команда и промо уже обработано, идем в главное меню
      if (promoInfo?.isPromo && ctx.session.promoProcessed) {
        logger.info({
          message: `[StartScene Step 2] Promo already processed, redirecting to MainMenu`,
          telegramId,
          command: text,
          promoType: promoInfo.parameter,
        })

        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }

      // Если это промо-команда и промо еще не обработано, перенаправляем в CreateUserScene
      if (promoInfo?.isPromo && !ctx.session.promoProcessed) {
        logger.info({
          message: `[StartScene Step 2] Promo command detected, redirecting to CreateUserScene`,
          telegramId,
          command: text,
          promoType: promoInfo.parameter,
        })

        // Устанавливаем флаг, что промо будет обработано
        ctx.session.promoProcessed = true

        // Очищаем сессию и переходим в CreateUserScene для обработки промо-логики
        ctx.session = { ...defaultSession, promoProcessed: true }
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.CreateUserScene)
      }

      // Обработка кнопки "Оформить подписку" (все варианты: новые 💫 и старые 💳)
      if (
        text === levels[105].title_ru ||
        text === levels[105].title_en ||
        text === '💳 Оформить подписку' ||
        text === '💳 Subscribe'
      ) {
        logger.info({
          message: `💫 [StartScene] Пользователь нажал текстовую кнопку "Оформить подписку". Переход в SubscriptionScene.`,
          telegramId,
          function: 'startScene.step2.subscription_button',
        })
        delete (ctx.wizard.state as StartSceneState).initialDisplayDone
        return ctx.scene.enter(ModeEnum.SubscriptionScene)
      }

      // Обработка кнопки "Техподдержка"
      if (text === levels[103].title_ru || text === levels[103].title_en) {
        logger.info({
          message: `💬 [StartScene] Пользователь нажал "Техподдержка".`,
          telegramId,
          function: 'startScene.step2.support_button',
        })
        await ctx.scene.leave()
        const { handleTechSupport } = await import(
          '@/commands/handleTechSupport'
        )
        return handleTechSupport(ctx)
      }

      // ✅ ИСПРАВЛЕНИЕ: Перехватываем команды РАНЬШЕ, чем пересылать в handleMenu
      if (text.startsWith('/')) {
        logger.info({
          message: `🔧 [StartScene Step 2] Command detected, processing directly: ${text}`,
          telegramId,
          command: text,
          function: 'startScene.step2.command_interceptor',
        })

        // Выходим из startScene, чтобы глобальные обработчики команд могли сработать
        await ctx.scene.leave()

        // НЕ вызываем handleMenu для команд - пусть обработает registerCommands.ts
        return
      }

      // Для остальных сообщений используем handleMenu
      logger.info({
        message: `📝 [StartScene] Forwarding text to handleMenu: ${text}`,
        telegramId,
        text,
      })
      await handleMenu(ctx)
      return
    }

    // Если не текстовое сообщение, возвращаемся на первый шаг
    return ctx.wizard.back()
  }
)

startScene.action('go_to_subscription_scene', async ctx => {
  const isRu = isRussianFromState(ctx)
  try {
    await ctx.answerCbQuery()
    logger.info({
      message: `💫 [StartScene] Пользователь нажал "Оформить подписку". Переход в SubscriptionScene.`,
      telegramId: ctx.from?.id?.toString() || 'unknown',
      function: 'startScene.action.go_to_subscription_scene',
    })
    delete (ctx.wizard.state as StartSceneState).initialDisplayDone // Очищаем состояние при переходе в другую сцену
    return ctx.scene.enter(ModeEnum.SubscriptionScene)
  } catch (error) {
    logger.error('Error in go_to_subscription_scene action:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Попробуйте позже.'
        : 'An error occurred. Please try again later.'
    )
    delete (ctx.wizard.state as StartSceneState).initialDisplayDone // Очищаем состояние и при ошибке
    return ctx.scene.leave() // В случае ошибки выходим из сцены
  }
})
