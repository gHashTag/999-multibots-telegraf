import { CreateUserData, MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  getUserDetails,
  createUser,
  supabase,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'

const SUBSCRIBE_CHANNEL_ID = '@neuro_blogger_pulse'

const isRussian = (ctx: MyContext): boolean => ctx.from?.language_code === 'ru'

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString()
    const botName = ctx.botInfo.username
    if (!telegramId) {
      logger.error({
        message: '❌ [StartScene] Не удалось получить telegramId',
        function: 'startScene',
      })
      await ctx.reply('Произошла ошибка. Попробуйте еще раз.')
      return ctx.scene.leave()
    }

    const initialUsername = ctx.from?.username
    const firstName = ctx.from?.first_name
    const lastName = ctx.from?.last_name
    const langCode = ctx.from?.language_code
    const isBot = ctx.from?.is_bot
    const finalUsername = initialUsername || firstName || telegramId

    logger.info({
      message: '🚀 [StartScene] Начало работы с ботом',
      telegramId,
      function: 'startScene',
      username: initialUsername,
      language: langCode,
      sessionData: JSON.stringify(ctx.session || {}),
    })

    try {
      logger.info({
        message: '👤 [StartScene] Проверка существования пользователя',
        telegramId,
        function: 'startScene',
        step: 'checking_user_existence',
      })
      const userDetails = await getUserDetails(telegramId)
      const isNewUser = !userDetails.isExist

      logger.info({
        message: `🚩 [StartScene] Статус пользователя: ${
          isNewUser ? 'НОВЫЙ' : 'СУЩЕСТВУЮЩИЙ'
        }`,
        telegramId,
        isNewUser,
        function: 'startScene',
        step: 'user_status_determined',
      })

      if (!isNewUser) {
        logger.info({
          message: '✅ [StartScene] Пользователь уже существует',
          telegramId,
          function: 'startScene',
          userDetails,
          step: 'user_exists',
        })

        const updateData: Partial<CreateUserData> = {
          username: finalUsername,
          first_name: firstName || null,
          last_name: lastName || null,
          language_code: langCode || 'en',
          bot_name: botName,
        }
        try {
          await createUser(updateData as CreateUserData, ctx)
          logger.info({
            message:
              '🔄 [StartScene] Данные существующего пользователя обновлены',
            telegramId,
            function: 'startScene',
            step: 'user_data_updated',
          })
        } catch (updateError) {
          logger.error({
            message:
              '❌ [StartScene] Ошибка при обновлении данных существующего пользователя',
            telegramId,
            error:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
            function: 'startScene',
            step: 'user_data_update_error',
          })
        }

        const isRu = isRussian(ctx)

        logger.info({
          message:
            '📡 [StartScene] Получение перевода для стартового сообщения (существующий пользователь)',
          telegramId,
          function: 'startScene',
          bot_name: botName,
          step: 'fetching_translation_existing',
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
            parse_mode: 'Markdown',
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
            Markup.button.text(
              isRu ? levels[105].title_ru : levels[105].title_en
            ),
            Markup.button.text(
              isRu ? levels[103].title_ru : levels[103].title_en
            ),
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
            Markup.button.text(
              isRu ? levels[105].title_ru : levels[105].title_en
            ),
            Markup.button.text(
              isRu ? levels[103].title_ru : levels[103].title_en
            ),
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
          message:
            '🚪 [StartScene] Вход в главное меню для существующего пользователя',
          telegramId,
          function: 'startScene',
          step: 'enter_main_menu',
        })
        return ctx.scene.enter(ModeEnum.MainMenu)
      } else {
        logger.info({
          message: '✨ [StartScene] Обнаружен новый пользователь! Создание...',
          telegramId,
          function: 'startScene',
          step: 'new_user_detected',
        })

        let inviterId: string | null = null
        let inviterUsername: string | null = null
        let startPayload: string | null = null
        if (ctx.message && 'text' in ctx.message) {
          startPayload = ctx.message.text.split(' ')[1] ?? null
        }
        if (startPayload) {
          inviterId = startPayload
          logger.info({
            message: '👥 [StartScene] Обнаружен инвайт-код (start payload)',
            telegramId,
            inviterId,
            step: 'invite_code_found',
          })
          try {
            const { data: inviterData, error: inviterError } = await supabase
              .from('users')
              .select('username')
              .eq('id', inviterId)
              .single()
            if (inviterError) throw inviterError
            if (inviterData) inviterUsername = inviterData.username
          } catch (error) {
            logger.error({
              message:
                '❌ [StartScene] Ошибка при получении username пригласившего',
              telegramId,
              inviterId,
              error: error instanceof Error ? error.message : String(error),
              step: 'get_inviter_username_error',
            })
          }
        }

        const photo_url = await getPhotoUrl(ctx, 1)
        const createData: CreateUserData = {
          username: finalUsername,
          telegram_id: telegramId,
          first_name: firstName || null,
          last_name: lastName || null,
          is_bot: isBot || false,
          language_code: langCode || 'en',
          photo_url,
          chat_id: ctx.chat?.id || null,
          mode: 'clean',
          model: 'gpt-4-turbo',
          count: 0,
          aspect_ratio: '9:16',
          inviter: inviterId,
          bot_name: botName,
        }

        try {
          const newUser = await createUser(createData, ctx)
          if (!newUser) {
            throw new Error(
              'Функция createUser не вернула данные пользователя после создания'
            )
          }
          logger.info({
            message: '✅ [StartScene] Новый пользователь успешно создан',
            telegramId,
            function: 'startScene',
            userId: newUser.id,
            step: 'new_user_created',
          })

          try {
            let notificationMessage = `🔗 Новый пользователь зарегистрировался: @${finalUsername}`
            if (inviterId) {
              notificationMessage += `\nПо реф. ссылке от: ${
                inviterUsername ? `@${inviterUsername}` : `ID ${inviterId}`
              }`
            }
            await ctx.telegram.sendMessage(
              SUBSCRIBE_CHANNEL_ID,
              notificationMessage
            )
            logger.info({
              message:
                '📢 [StartScene] Уведомление о новом пользователе отправлено в канал',
              telegramId,
              channel: SUBSCRIBE_CHANNEL_ID,
              step: 'admin_notification_sent',
            })
          } catch (notifyError) {
            if (
              notifyError instanceof Error &&
              'code' in notifyError &&
              notifyError.code === 403
            ) {
              logger.warn({
                message:
                  '⚠️ [StartScene] Не удалось отправить уведомление в канал админов (возможно, бот не участник или нет прав)',
                telegramId,
                channel: SUBSCRIBE_CHANNEL_ID,
                botName: ctx.botInfo.username,
                error: notifyError.message,
                step: 'admin_notification_failed_403',
              })
            } else {
              logger.error({
                message:
                  '❌ [StartScene] Ошибка при отправке уведомления в канал админов',
                telegramId,
                error:
                  notifyError instanceof Error
                    ? notifyError.message
                    : String(notifyError),
                step: 'admin_notification_error',
              })
            }
          }

          if (inviterId) {
            try {
              const inviteReply = isRussian(ctx)
                ? `🔗 Новый пользователь @${finalUsername} зарегистрировался по вашей ссылке!`
                : `🔗 New user @${finalUsername} registered using your link!`
              await ctx.telegram.sendMessage(inviterId, inviteReply)
              logger.info({
                message: '✉️ [StartScene] Уведомление пригласившему отправлено',
                telegramId,
                inviterId,
                step: 'inviter_notification_sent',
              })
            } catch (inviterNotifyError) {
              if (
                inviterNotifyError instanceof Error &&
                'code' in inviterNotifyError &&
                inviterNotifyError.code === 403
              ) {
                logger.warn({
                  message:
                    '⚠️ [StartScene] Не удалось отправить уведомление пригласившему (возможно, бот заблокирован им)',
                  telegramId,
                  inviterId,
                  botName: ctx.botInfo.username,
                  error: inviterNotifyError.message,
                  step: 'inviter_notification_failed_403',
                })
              } else {
                logger.error({
                  message:
                    '❌ [StartScene] Ошибка при отправке уведомления пригласившему',
                  telegramId,
                  inviterId,
                  error:
                    inviterNotifyError instanceof Error
                      ? inviterNotifyError.message
                      : String(inviterNotifyError),
                  step: 'inviter_notification_error',
                })
              }
            }
          }

          await ctx.reply(
            isRussian(ctx)
              ? '✅ Вы успешно зарегистрированы!'
              : '✅ You have successfully registered!'
          )

          logger.info({
            message:
              '🚪 [StartScene] Вход в главное меню для нового пользователя',
            telegramId,
            function: 'startScene',
            step: 'enter_main_menu_new',
          })
          return ctx.scene.enter(ModeEnum.MainMenu)
        } catch (creationError) {
          logger.error({
            message:
              '❌ [StartScene] Критическая ошибка при создании нового пользователя',
            telegramId,
            error:
              creationError instanceof Error
                ? creationError.message
                : String(creationError),
            function: 'startScene',
            step: 'new_user_creation_critical_error',
          })
          await ctx.reply(
            'Произошла критическая ошибка при регистрации. Попробуйте /start еще раз или обратитесь в поддержку.'
          )
          return ctx.scene.leave()
        }
      }
    } catch (error) {
      logger.error({
        message: '❌ [StartScene] Общая ошибка при обработке пользователя',
        telegramId,
        function: 'startScene',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await ctx.reply(
        'Произошла ошибка при запуске бота. Попробуйте /start еще раз.'
      )
      return ctx.scene.leave()
    }
  }
)
