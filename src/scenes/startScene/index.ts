import { MyContext, MyTextMessageContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  getUserDetails,
  createUser,
  getReferalsCountAndUserData,
  getUserData,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { isRussian } from '@/helpers/language'
import { startMenu } from '@/menu'

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    console.log('[TEST_DEBUG] Entered startScene handler')
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const currentBotName = ctx.botInfo.username
    const finalUsername =
      ctx.from?.username || ctx.from?.first_name || telegramId
    const telegram_id = ctx.from?.id
    const subscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID

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
        const invite_code = ctx.session.inviteCode

        try {
          if (invite_code) {
            logger.info({
              message: `[StartScene/CreateLogic] Found invite code: ${invite_code}. Fetching referrer...`,
              telegramId,
              function: 'startScene',
              step: 'fetch_referrer',
            })
            const { count, userData: refUserData } =
              await getReferalsCountAndUserData(invite_code.toString())
            refCount = count
            referrerData = refUserData || {}
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
                  invite_code,
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

              // --- Отправка в общую группу (с рефералом) ---
              if (subscribeChannelId) {
                try {
                  const targetChatId =
                    typeof subscribeChannelId === 'string' &&
                    !subscribeChannelId.startsWith('-')
                      ? `@${subscribeChannelId}`
                      : subscribeChannelId
                  await ctx.telegram.sendMessage(
                    targetChatId,
                    `[${currentBotName}] 🔗 Новый пользователь @${finalUsername} (ID: ${telegram_id}) по реф. от @${referrerData.username}`
                  )
                  logger.info({
                    message: `[StartScene/CreateLogic] General admin channel notified (${targetChatId}, with ref).`,
                    telegramId: telegram_id,
                    function: 'startScene',
                    step: 'notify_general_admin_ref_success',
                    channel: targetChatId,
                  })
                } catch (pulseErr) {
                  logger.error({
                    message: `[StartScene/CreateLogic] FAILED to notify general admin channel ${subscribeChannelId} (with ref)`,
                    telegramId: telegram_id,
                    function: 'startScene',
                    error:
                      pulseErr instanceof Error
                        ? pulseErr.message
                        : String(pulseErr),
                    channel: subscribeChannelId,
                  })
                }
              } else {
                logger.warn(
                  '[StartScene/CreateLogic] SUBSCRIBE_CHANNEL_ID is not set in .env, skipping general notification (with ref).',
                  {
                    telegram_id,
                    username: finalUsername,
                    bot_name: currentBotName,
                  }
                )
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

            // --- Отправка в общую группу (без реферала) ---
            if (subscribeChannelId) {
              try {
                const targetChatId =
                  typeof subscribeChannelId === 'string' &&
                  !subscribeChannelId.startsWith('-')
                    ? `@${subscribeChannelId}`
                    : subscribeChannelId
                await ctx.telegram.sendMessage(
                  targetChatId,
                  `[${currentBotName}] 🔗 Новый пользователь @${finalUsername} (ID: ${telegram_id})`
                )
                logger.info({
                  message: `[StartScene/CreateLogic] General admin channel notified (${targetChatId}, no ref).`,
                  telegramId: telegram_id,
                  function: 'startScene',
                  step: 'notify_general_admin_success',
                  channel: targetChatId,
                })
              } catch (pulseErr) {
                logger.error({
                  message: `[StartScene/CreateLogic] FAILED to notify general admin channel ${subscribeChannelId} (no ref)`,
                  telegramId: telegram_id,
                  function: 'startScene',
                  error:
                    pulseErr instanceof Error
                      ? pulseErr.message
                      : String(pulseErr),
                  channel: subscribeChannelId,
                })
              }
            } else {
              logger.warn(
                '[StartScene/CreateLogic] SUBSCRIBE_CHANNEL_ID is not set in .env, skipping general notification (no ref).',
                {
                  telegram_id,
                  username: finalUsername,
                  bot_name: currentBotName,
                }
              )
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
        // Отправка уведомления в ОБЩУЮ группу при повторном /start
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
            logger.info(
              `[StartScene/ExistingUser] Successfully notified general channel ${targetChatId} about restart`,
              {
                telegram_id,
                username: finalUsername,
                channel: targetChatId,
                bot_name: currentBotName,
              }
            )
          } catch (notifyError) {
            logger.error(
              `[StartScene/ExistingUser] FAILED to notify general channel ${subscribeChannelId} about restart`,
              {
                telegram_id,
                username: finalUsername,
                error: notifyError,
                channel: subscribeChannelId,
                bot_name: currentBotName,
              }
            )
          }
        } else {
          logger.warn(
            '[StartScene/ExistingUser] SUBSCRIBE_CHANNEL_ID is not set in .env, skipping general notification (restart).',
            { telegram_id, username: finalUsername, bot_name: currentBotName }
          )
        }
        // НЕ отправляем уведомление в группу бота при повторном /start
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

    // --- НАЧАЛО: Текущая логика StartScene (приветствие) ---
    // Эта часть выполняется ВСЕГДА (и для новых, и для старых)
    logger.info({
      message: '📡 [StartScene] Получение перевода для стартового сообщения',
      telegramId,
      function: 'startScene',
      bot_name: currentBotName,
      step: 'fetching_translation',
    })

    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: currentBotName,
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
        message: '📝 [StartScene] Отправка текстового приветствия (упрощенная)',
        telegramId,
        function: 'startScene',
        step: 'sending_welcome_text_simplified',
      })

      await ctx.reply(translation, {
        parse_mode: 'Markdown',
      })
    }

    logger.info({
      message: `🏁 [StartScene] Завершение сцены старта (упрощенное)`,
      telegramId,
      function: 'startScene',
      step: 'scene_leave_simplified',
    })

    return ctx.scene.leave()
  }
)
