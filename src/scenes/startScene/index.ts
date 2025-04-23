import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  getTranslation,
  getUserDetailsSubscription,
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
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const currentBotName = ctx.botInfo.username
    const finalUsername =
      ctx.from?.username || ctx.from?.first_name || telegramId
    const telegram_id = ctx.from?.id
    const subscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID

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
        const final_username_create = username || first_name || tg_id.toString()
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
              /* лог ошибки */
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
                /* лог ошибки */
              }
            } else {
              /* лог warn */
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
                /* лог ошибки */
              }
            } else {
              /* лог warn */
            }
          }
        } catch (error) {
          /* лог ошибки */
        }

        // Создание пользователя
        const userDataToCreate = {
          username: final_username_create,
          telegram_id: tg_id.toString(),
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
          bot_name: currentBotName,
        }
        try {
          const [wasCreated] = await createUser(userDataToCreate, ctx)
          if (wasCreated) {
            await ctx.reply(
              isRussian(ctx)
                ? '✅ Аватар успешно создан! Добро пожаловать!'
                : '✅ Avatar created successfully! Welcome!'
            )
          }
        } catch (error) {
          /* лог ошибки + reply + return */
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
            /* лог ошибки */
          }
        } else {
          /* лог warn */
        }
      }
    } catch (error) {
      /* лог ошибки + reply + return */
    }
    // --- КОНЕЦ: Логика проверки и создания пользователя ---

    // --- НАЧАЛО: Приветствие + Видео-инструкция ---
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: currentBotName,
    })
    // Отправка фото или текста
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

    // Отправка видео-инструкции (ВОССТАНОВЛЕНА)
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
    // --- КОНЕЦ: Приветствие + Видео-инструкция ---

    logger.info({
      message: `🏁 [StartScene] Завершение сцены старта`,
      telegramId,
      function: 'startScene',
      step: 'scene_leave',
    })

    return ctx.scene.leave()
  }
)
