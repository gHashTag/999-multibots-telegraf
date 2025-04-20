import { MyContext, MyTextMessageContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  getUserDetails,
  createUser,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { isRussian } from '@/helpers/language'

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    console.log('[TEST_DEBUG] Entered startScene handler')
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const botName = ctx.botInfo.username

    logger.info({
      message: `[StartScene ENTRY] User: ${telegramId}, Lang: ${
        isRu ? 'ru' : 'en'
      }`,
      telegramId,
      function: 'startScene',
      step: 'entry',
      session: JSON.stringify(ctx.session || {}),
    })

    // --- НАЧАЛО: Логика проверки и создания пользователя ---
    try {
      logger.info({
        message: `[StartScene] Checking user existence...`,
        telegramId,
        function: 'startScene',
        step: 'check_user',
      })
      const userDetails = await getUserDetails(telegramId)
      logger.info({
        message: `[StartScene] User check result: Exists=${userDetails.isExist}`,
        telegramId,
        function: 'startScene',
        step: 'check_user_result',
        exists: userDetails.isExist,
      })

      if (!userDetails.isExist) {
        logger.info({
          message: `[StartScene] User ${telegramId} is NEW. Starting creation process...`,
          telegramId,
          function: 'startScene',
          step: 'new_user_start',
        })
        // --- Логика из createUserStep ---
        const {
          username,
          id: telegram_id, // Используем telegram_id из ctx.from
          first_name,
          last_name,
          is_bot,
          language_code,
        } = ctx.from! // Уверены, что ctx.from есть

        const finalUsername = username || first_name || telegram_id.toString()
        const photo_url = getPhotoUrl(ctx, 1)
        const currentBotName = ctx.botInfo.username // Используем имя текущего бота

        let refCount = 0
        let referrerData: { user_id?: string; username?: string } = {}

        try {
          if (ctx.session.inviteCode) {
            logger.info({
              message: `[StartScene/CreateLogic] Found invite code: ${ctx.session.inviteCode}. Fetching referrer...`,
              telegramId,
              function: 'startScene',
              step: 'fetch_referrer',
            })
            const { count, userData } = await getReferalsCountAndUserData(
              ctx.session.inviteCode.toString()
            )
            refCount = count
            referrerData = userData || {}
            ctx.session.inviter = referrerData.user_id // Сохраняем ID инвайтера
            logger.info({
              message: `[StartScene/CreateLogic] Referrer data fetched.`,
              telegramId,
              function: 'startScene',
              step: 'referrer_fetched',
              refCount,
              referrerUserId: referrerData.user_id,
              referrerUsername: referrerData.username,
            })

            if (ctx.session.inviter) {
              logger.info({
                message: `[StartScene/CreateLogic] Notifying referrer ${ctx.session.inviter}...`,
                telegramId,
                function: 'startScene',
                step: 'notify_referrer',
              })
              try {
                await ctx.telegram.sendMessage(
                  ctx.session.inviteCode,
                  isRussian(ctx)
                    ? `🔗 Новый пользователь @${finalUsername} зарегистрировался по вашей ссылке.\n🆔 Уровень: ${refCount}`
                    : `🔗 New user @${finalUsername} registered via your link.\n🆔 Level: ${refCount}`
                )
                logger.info({
                  message: `[StartScene/CreateLogic] Referrer notified.`,
                  telegramId,
                  function: 'startScene',
                  step: 'notify_referrer_success',
                })
              } catch (err) {
                logger.error({
                  message: `[StartScene/CreateLogic] FAILED to notify referrer ${ctx.session.inviter}`,
                  telegramId,
                  function: 'startScene',
                  error: err instanceof Error ? err.message : String(err),
                })
              }

              // --- Отправка в общую группу (с рефералом) --- MUST HAVE
              try {
                await ctx.telegram.sendMessage(
                  '@neuro_blogger_pulse', // Всегда отправляем сюда
                  `[${currentBotName}] 🔗 Новый пользователь @${finalUsername} (ID: ${telegram_id}) по реф. от @${referrerData.username}`
                )
                logger.info({
                  message: `[StartScene/CreateLogic] General admin channel notified (@neuro_blogger_pulse, with ref).`,
                  telegramId,
                  function: 'startScene',
                  step: 'notify_general_admin_ref_success',
                })
              } catch (pulseErr) {
                logger.error({
                  message: `[StartScene/CreateLogic] FAILED to notify general admin channel @neuro_blogger_pulse (with ref)`,
                  telegramId,
                  function: 'startScene',
                  error:
                    pulseErr instanceof Error
                      ? pulseErr.message
                      : String(pulseErr),
                })
              }
              // --- КОНЕЦ Отправки в общую группу ---
            }
          } else {
            logger.info({
              message: `[StartScene/CreateLogic] No invite code. Fetching user count...`,
              telegramId,
              function: 'startScene',
              step: 'fetch_user_count',
            })
            const { count } = await getReferalsCountAndUserData(
              telegram_id.toString()
            )
            refCount = count

            // --- Отправка в общую группу (без реферала) --- MUST HAVE
            try {
              await ctx.telegram.sendMessage(
                '@neuro_blogger_pulse', // Всегда отправляем сюда
                `[${currentBotName}] 🔗 Новый пользователь @${finalUsername} (ID: ${telegram_id})`
              )
              logger.info({
                message: `[StartScene/CreateLogic] General admin channel notified (@neuro_blogger_pulse).`,
                telegramId,
                function: 'startScene',
                step: 'notify_general_admin_success',
              })
            } catch (pulseErr) {
              logger.error({
                message: `[StartScene/CreateLogic] FAILED to notify general admin channel @neuro_blogger_pulse`,
                telegramId,
                function: 'startScene',
                error:
                  pulseErr instanceof Error
                    ? pulseErr.message
                    : String(pulseErr),
              })
            }
            // --- КОНЕЦ Отправки в общую группу ---
          }
        } catch (error) {
          logger.error({
            message: `[StartScene/CreateLogic] Error during notification/referrer check`,
            telegramId,
            function: 'startScene',
            error: error instanceof Error ? error.message : String(error),
          })
        }

        const userDataToCreate = {
          username: finalUsername,
          telegram_id: telegram_id.toString(),
          first_name: first_name || null,
          last_name: last_name || null,
          is_bot: is_bot || false,
          language_code: language_code || 'en',
          photo_url,
          chat_id: ctx.chat?.id || null,
          mode: 'clean',
          model: 'gpt-4-turbo',
          count: 0,
          aspect_ratio: '9:16',
          balance: 0,
          inviter: ctx.session.inviter || null,
          bot_name: currentBotName, // Используем имя текущего бота
        }

        logger.info({
          message: `[StartScene/CreateLogic] Preparing to create user...`,
          telegramId,
          function: 'startScene',
          step: 'create_user_start',
          userData: JSON.stringify(userDataToCreate),
        })

        try {
          await createUser(userDataToCreate)
          logger.info({
            message: `[StartScene/CreateLogic] User created successfully.`,
            telegramId,
            function: 'startScene',
            step: 'create_user_success',
          })
          // Опционально: отправить сообщение об успехе создания?
          // await ctx.reply(isRu ? '✅ Ваш профиль создан!' : '✅ Your profile has been created!');
        } catch (error) {
          logger.error({
            message: `[StartScene/CreateLogic] FAILED to create user`,
            telegramId,
            function: 'startScene',
            error: error instanceof Error ? error.message : String(error),
          })
          await ctx.reply(
            'Произошла ошибка при создании вашего профиля. Пожалуйста, попробуйте /start позже или свяжитесь с поддержкой.'
          )
          return ctx.scene.leave() // ВЫХОДИМ из сцены при ошибке создания
        }
        logger.info({
          message: `[StartScene] User ${telegramId} created. Proceeding to welcome message...`,
          telegramId,
          function: 'startScene',
          step: 'new_user_created_continue',
        })
      } else {
        logger.info({
          message: `[StartScene] User ${telegramId} exists. Proceeding directly to welcome message...`,
          telegramId,
          function: 'startScene',
          step: 'existing_user_continue',
        })
      }
    } catch (error) {
      logger.error({
        message: `[StartScene] Error during user check/creation block`,
        telegramId,
        function: 'startScene',
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(
        'Произошла серьезная ошибка при инициализации. Пожалуйста, свяжитесь с поддержкой.'
      )
      return ctx.scene.leave() // Выходим из сцены
    }
    // --- КОНЕЦ: Логика проверки и создания пользователя ---

    // --- НАЧАЛО: Текущая логика StartScene (приветствие, туториал) ---
    // Эта часть выполняется ВСЕГДА (и для новых, и для старых)
    logger.info({
      message: '📡 [StartScene] Получение перевода для стартового сообщения',
      telegramId,
      function: 'startScene',
      bot_name: botName,
      step: 'fetching_translation',
    })

    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: botName,
    })

    logger.info({
      message: '✅ [StartScene] Перевод получен',
      telegramId,
      function: 'startScene',
      translationReceived: !!translation,
      imageUrlReceived: !!url,
      step: 'translation_received',
    })

    if (url && url.trim() !== '') {
      logger.info({
        message:
          '🖼️ [StartScene] Отправка приветственного изображения с подписью',
        telegramId,
        function: 'startScene',
        url,
        step: 'sending_welcome_image',
      })

      await ctx.replyWithPhoto(url, {
        caption: translation,
      })
    } else {
      logger.info({
        message: '📝 [StartScene] Отправка текстового приветствия',
        telegramId,
        function: 'startScene',
        step: 'sending_welcome_text',
      })

      await ctx.reply(translation, {
        parse_mode: 'Markdown',
      })
    }

    const tutorialUrl = BOT_URLS[botName]
    let replyKeyboard

    if (tutorialUrl) {
      logger.info({
        message: `🎬 [StartScene] Отправка ссылки на туториал для ${botName}`,
        telegramId,
        function: 'startScene',
        tutorialUrl,
        step: 'sending_tutorial',
      })

      const tutorialText = isRu
        ? `🎬 Посмотрите [видео-инструкцию](${tutorialUrl}), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`
        : `🎬 Watch this [tutorial video](${tutorialUrl}) on how to create neurophotos in this bot.\n\nIn this video, you will learn how to train your model (Digital avatar body), create photos, and get a prompt from any photo that inspires you.`

      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()

      logger.info({
        message: `📤 [StartScene] Отправка текста с туториалом и клавиатурой`,
        telegramId,
        function: 'startScene',
        step: 'sending_tutorial_text_with_keyboard',
        buttons: [
          isRu ? levels[105].title_ru : levels[105].title_en,
          isRu ? levels[103].title_ru : levels[103].title_en,
        ],
      })

      await ctx.reply(tutorialText, {
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard.reply_markup,
      })
    } else {
      logger.info({
        message: `ℹ️ [StartScene] Ссылка на туториал для ${botName} не найдена`,
        telegramId,
        function: 'startScene',
        step: 'tutorial_url_not_found',
      })

      replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en),
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en),
      ]).resize()

      logger.info({
        message: `📤 [StartScene] Отправка простого меню выбора действия`,
        telegramId,
        function: 'startScene',
        step: 'sending_basic_menu',
        buttons: [
          isRu ? levels[105].title_ru : levels[105].title_en,
          isRu ? levels[103].title_ru : levels[103].title_en,
        ],
      })

      await ctx.reply(isRu ? 'Выберите действие:' : 'Choose an action:', {
        reply_markup: replyKeyboard.reply_markup,
      })
    }

    logger.info({
      message: `🏁 [StartScene] Завершение сцены старта`,
      telegramId,
      function: 'startScene',
      step: 'scene_leave',
    })

    return ctx.scene.leave()
  }
)
