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
import { isRussian } from '@/helpers/language'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { defaultSession } from '@/store'
import { handleMenu } from '@/handlers/handleMenu'

interface StartSceneState {
  initialDisplayDone?: boolean
}

// Список известных глобальных команд, которые startScene должна "отпускать"
const GLOBAL_COMMANDS_TO_RELEASE = [
  '/menu',
  '/price',
  '/start', // Если пользователь снова введет /start, глобальный обработчик должен сработать
  '/support',
  '/get100',
  // Добавьте другие глобальные команды по мере необходимости
]

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const currentBotName = ctx.botInfo.username

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
            // ✅ ИСПРАВЛЕНИЕ: Проверяем подписку перед входом в меню
            const { getUserDetailsSubscription } = await import(
              '@/core/supabase'
            )
            const { simulateSubscriptionForDev } = await import(
              '@/scenes/menuScene/helpers/simulateSubscription'
            )
            const { isDev } = await import('@/config')

            const userDetails = await getUserDetailsSubscription(telegramId)
            const effectiveSubscription = simulateSubscriptionForDev(
              userDetails?.subscriptionType || null,
              isDev
            )

            logger.info('[StartScene] /menu: Checking subscription', {
              telegramId,
              originalSubscription: userDetails?.subscriptionType,
              effectiveSubscription,
              isDev,
            })

            await ctx.scene.leave()

            // Если нет подписки (включая симуляцию), направляем в subscriptionScene
            if (!effectiveSubscription || effectiveSubscription === 'STARS') {
              logger.info(
                '[StartScene] /menu: No subscription, redirecting to subscription scene',
                {
                  telegramId,
                  effectiveSubscription,
                }
              )
              ctx.session.mode = ModeEnum.SubscriptionScene
              return ctx.scene.enter(ModeEnum.SubscriptionScene)
            }

            // Если подписка есть, входим в меню
            ctx.session.mode = ModeEnum.MainMenu
            return ctx.scene.enter(ModeEnum.MainMenu)
          }
          case '/price': {
            // ✅ ЗАЩИТА: Проверяем подписку перед показом цен
            const { checkSubscriptionGuard } = await import(
              '@/helpers/subscriptionGuard'
            )
            const hasSubscription = await checkSubscriptionGuard(ctx, '/price')
            if (!hasSubscription) {
              return // Пользователь перенаправлен в subscriptionScene
            }

            await ctx.scene.leave()
            // Импортируем и вызываем priceCommand напрямую
            const { priceCommand } = await import('@/commands/priceCommand')
            return priceCommand(ctx)
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
              ctx.session.inviter = referrerData.user_id
              // Уведомление рефереру
              try {
                await ctx.telegram.sendMessage(
                  invite_code,
                  isRussian(ctx)
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
                isRussian(ctx)
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
              isRussian(ctx)
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
            '🖼️ [StartScene] Отправка приветственного изображения с подписью',
          telegramId,
          function: 'startScene',
          url,
          step: 'sending_welcome_image',
        })
        await ctx.replyWithPhoto(url, {
          caption:
            translation.length > 1024
              ? translation.substring(0, 1021) + '...'
              : translation,
        })
      } else {
        logger.info({
          message: '📝 [StartScene] Отправка текстового приветствия',
          telegramId,
          function: 'startScene',
          step: 'sending_welcome_text',
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
                isRu ? '💳 Оформить подписку' : '💳 Subscribe',
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
    const isRu = isRussian(ctx)

    if ('message' in ctx.update && 'text' in ctx.update.message) {
      const text = ctx.update.message.text
      logger.info(`[StartScene Step 2] Received text: ${text}`, {
        telegramId,
        text,
      })

      // Обработка кнопки "Оформить подписку"
      if (text === levels[105].title_ru || text === levels[105].title_en) {
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
  const isRu = ctx.from?.language_code === 'ru'
  try {
    await ctx.answerCbQuery()
    logger.info({
      message: `💳 [StartScene] Пользователь нажал "Оформить подписку". Переход в SubscriptionScene.`,
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
