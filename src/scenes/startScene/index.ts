import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  createUser,
  getReferalsCountAndUserData,
  supabase,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { isRussian } from '@/helpers/language'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { UserType } from '@/interfaces/supabase.interface'

export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const currentBotName = ctx.botInfo.username
    const {
      username: currentUsername,
      first_name: currentFirstName,
      last_name: currentLastName,
      language_code: currentLanguageCode,
      id: tg_id_num,
      is_bot: currentIsBot,
    } = ctx.from!
    const finalUsernameForDisplay =
      currentUsername || currentFirstName || telegramId
    const subscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID

    let userToProceed: UserType | null = null
    let actionMessage = 'ОБРАБОТАН' // Для уведомления админу

    logger.info(
      `[StartScene v2] Начало обработки для telegram_id: ${telegramId}. Username: ${currentUsername}`
    )

    // --- НАПОМИНАНИЕ ГУРУ: Убедитесь, что выполнена команда: ALTER TABLE public.users ALTER COLUMN telegram_id TYPE TEXT; ---

    try {
      // === ШАГ 1: Поиск по username (если есть) ===
      if (currentUsername) {
        const { data: userByUsername, error: findByUsernameError } =
          await supabase
            .from('users')
            .select<string, UserType>('*')
            .eq('username', currentUsername)
            .maybeSingle()

        if (findByUsernameError) {
          logger.error(
            `[StartScene v2] Ошибка при поиске по username ${currentUsername}`,
            { error: findByUsernameError }
          )
          // Не блокируем, пробуем найти по telegram_id
        } else if (userByUsername) {
          logger.info(
            `[StartScene v2] Пользователь найден по username: ${currentUsername}. Обновление данных и telegram_id.`
          )
          actionMessage = 'ОБНОВЛЕН (найден по username)'
          const updatesForExisting: Partial<UserType> = {
            telegram_id: telegramId !== 'unknown' ? BigInt(telegramId) : null, // Обновляем/восстанавливаем telegram_id!
            first_name: currentFirstName || userByUsername.first_name || '',
            last_name: currentLastName || userByUsername.last_name || '',
            language_code:
              currentLanguageCode || userByUsername.language_code || 'en',
            photo_url:
              (await getUserPhotoUrl(ctx, tg_id_num)) ||
              userByUsername.photo_url,
          }
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update(updatesForExisting)
            .eq('user_id', userByUsername.user_id) // Обновляем по user_id
            .select()
            .single()

          if (updateError) {
            logger.error(
              `[StartScene v2] Ошибка обновления пользователя ${userByUsername.user_id} (найден по username)`,
              { error: updateError }
            )
            // Попробуем найти по telegram_id ниже
          } else {
            userToProceed = updatedUser
          }
        }
      }

      // === ШАГ 2: Поиск по telegram_id (если не найден по username или username нет) ===
      if (!userToProceed) {
        const { data: userByTelegramId, error: findByTelegramIdError } =
          await supabase
            .from('users')
            .select<string, UserType>('*')
            .eq('telegram_id', telegramId)
            .maybeSingle()

        if (
          findByTelegramIdError &&
          findByTelegramIdError.code !== 'PGRST116'
        ) {
          logger.error(
            `[StartScene v2] Ошибка при поиске по telegram_id ${telegramId}`,
            { error: findByTelegramIdError }
          )
          // Не блокируем, пробуем создать
        } else if (userByTelegramId) {
          logger.info(
            `[StartScene v2] Пользователь найден по telegram_id: ${telegramId}. Обновление данных.`
          )
          actionMessage = 'ОБНОВЛЕН (найден по telegram_id)'
          const updatesForExisting: Partial<UserType> = {
            username: currentUsername || userByTelegramId.username, // Обновляем username, если появился
            first_name: currentFirstName || userByTelegramId.first_name || '',
            last_name: currentLastName || userByTelegramId.last_name || '',
            language_code:
              currentLanguageCode || userByTelegramId.language_code || 'en',
            photo_url:
              (await getUserPhotoUrl(ctx, tg_id_num)) ||
              userByTelegramId.photo_url,
          }
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update(updatesForExisting)
            .eq('telegram_id', telegramId) // Обновляем по telegram_id
            .select()
            .single()

          if (updateError) {
            logger.error(
              `[StartScene v2] Ошибка обновления пользователя ${telegramId} (найден по telegram_id)`,
              { error: updateError }
            )
            // Пробуем создать ниже, на всякий случай
          } else {
            userToProceed = updatedUser
          }
        }
      }

      // === ШАГ 3: Создание нового пользователя (если не найден ни по username, ни по telegram_id) ===
      if (!userToProceed) {
        logger.info(
          `[StartScene v2] Пользователь НЕ найден ни по username, ни по telegram_id (${telegramId}). Создание новой записи.`
        )
        actionMessage = 'СОЗДАН'
        const userPhotoUrl = await getUserPhotoUrl(ctx, tg_id_num)
        const userDataToCreate: Omit<
          UserType,
          'id' | 'user_id' | 'created_at' | 'updated_at' | 'level'
        > & { inviter?: string | null } = {
          username: currentUsername || currentFirstName || telegramId,
          telegram_id: telegramId !== 'unknown' ? BigInt(telegramId) : null,
          first_name: currentFirstName || '',
          last_name: currentLastName || '',
          is_bot: currentIsBot || false,
          language_code: currentLanguageCode || 'en',
          photo_url: userPhotoUrl,
          chat_id: BigInt(ctx.chat?.id || 0),
          mode: 'clean',
          model: 'gpt-4-turbo',
          count: 0,
          aspect_ratio: '9:16',
          balance: 0,
          vip: false,
          is_leela_start: false,
        }

        // Логика обработки реферального кода...
        const invite_code_session = ctx.session.inviteCode
        if (invite_code_session) {
          try {
            const { userData: refUserData } = await getReferalsCountAndUserData(
              invite_code_session.toString()
            )
            if (refUserData && refUserData.user_id) {
              userDataToCreate.inviter = refUserData.user_id
              logger.info(
                `[StartScene v2] Пользователь ${telegramId} пришел по приглашению от user_id: ${refUserData.user_id}`
              )
              await ctx.telegram
                .sendMessage(
                  invite_code_session,
                  isRussian(ctx)
                    ? `🔗 Новый пользователь @${userDataToCreate.username} зарегистрировался по вашей ссылке.`
                    : `🔗 New user @${userDataToCreate.username} registered via your link.`
                )
                .catch(err =>
                  logger.warn(
                    `[StartScene v2] Не удалось уведомить реферера ${invite_code_session}`,
                    { error: err }
                  )
                )
            } else {
              logger.warn(
                `[StartScene v2] Реферер с кодом ${invite_code_session} не найден или не имеет user_id.`
              )
            }
          } catch (refError) {
            logger.error(
              `[StartScene v2] Ошибка обработки реферального кода ${invite_code_session}`,
              { error: refError }
            )
          }
        }

        const { data: createdUser, error: createError } = await supabase
          .from('users')
          .insert(userDataToCreate as UserType)
          .select()
          .single()

        if (createError) {
          // Если даже создание не удалось (может быть очень редкий конфликт или другая проблема)
          logger.error(
            `[StartScene v2] Ошибка при финальной попытке создания пользователя ${telegramId}`,
            { error: createError }
          )
          // Не устанавливаем userToProceed, чтобы ниже вывести сообщение об ошибке
        } else {
          userToProceed = createdUser
        }
      }

      // === ШАГ 4: Обработка результата и продолжение ===
      if (userToProceed) {
        logger.info(
          `[StartScene v2] Пользователь успешно обработан: telegram_id: ${telegramId}, user_id (UUID): ${userToProceed.user_id}, Действие: ${actionMessage}`
        )
        // Не выводим сообщение об успехе здесь, чтобы не дублировать с приветствием ниже
        // await ctx.reply(...)

        // Уведомление админу о новом/обновленном пользователе
        if (subscribeChannelId) {
          try {
            const targetChatId =
              typeof subscribeChannelId === 'string' &&
              !subscribeChannelId.startsWith('-')
                ? `@${subscribeChannelId}`
                : subscribeChannelId
            // @ts-ignore userToProceed точно не null здесь
            const finalUsernameNotify =
              userToProceed.username || userToProceed.first_name || telegramId
            // @ts-ignore userToProceed точно не null здесь
            const refMessage = userToProceed.inviter
              ? `по реф. от user_id: ${userToProceed.inviter}`
              : ''
            await ctx.telegram.sendMessage(
              targetChatId,
              `[${currentBotName}] ✨ Пользователь @${finalUsernameNotify} (ID: ${telegramId}) ${actionMessage} ${refMessage}`
            )
          } catch (pulseErr) {
            logger.warn(
              `[StartScene v2] Ошибка уведомления админа о пользователе ${telegramId}`,
              { error: pulseErr }
            )
          }
        }
      } else {
        // Если userToProceed все еще null, значит была неразрешимая ошибка
        logger.error(
          `[StartScene v2] Не удалось обработать пользователя ${telegramId} после всех попыток.`
        )
        await ctx.reply(
          isRu
            ? 'Произошла внутренняя ошибка при обработке вашего профиля. Попробуйте /start позже.'
            : 'An internal error occurred while processing your profile. Please try /start later.'
        )
        return ctx.scene.leave()
      }
    } catch (globalError) {
      logger.error(
        `[StartScene v2] Глобальная необработанная ошибка в сцене старта для telegram_id: ${telegramId}`,
        { error: globalError }
      )
      await ctx.reply(
        isRu
          ? 'Произошла критическая ошибка. Попробуйте /start еще раз.'
          : 'A critical error occurred. Please try /start again.'
      )
      return ctx.scene.leave()
    }
    // --- КОНЕЦ: Новая логика проверки/обновления/создания пользователя ---

    // --- НАЧАЛО: Приветствие + Видео-инструкция (оставляем оригинальную логику) ---
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: currentBotName,
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
        parse_mode: 'Markdown',
      })
    }

    const tutorialUrl = BOT_URLS[currentBotName]
    let replyKeyboard

    if (tutorialUrl) {
      logger.info({
        message: `🎬 [StartScene] Отправка ссылки на туториал для ${currentBotName}`,
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
        message: `ℹ️ [StartScene] Ссылка на туториал для ${currentBotName} не найдена`,
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
