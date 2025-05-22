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
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'

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

    // --- НАЧАЛО: Приветствие ---
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
      bot_name: currentBotName,
    })

    // Функция для проверки валидности URL изображения
    const isValidImageUrl = (url: string | null): boolean => {
      if (!url || url.trim() === '') return false
      if (url.includes('t.me/c/') || url.startsWith('https://t.me/c/'))
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
        parse_mode: 'Markdown',
      })
    }
    // --- КОНЕЦ: Приветствие ---

    // --- НАЧАЛО: Лид-магнит / Видео-инструкция / Меню ---
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
Подпишись на живую группу - и тебе откроется доступ!

Но и это ещё не всё - в этой же группе ты сможешь:

🟡 освоить все фишки нейробота без боли и танцев с бубном
🟡 получать уроки, подсказки и вдохновляющие разборы
🟡 задавать вопросы и получать ответы (да, лично от меня)
🟡 делиться своими работами и наблюдать, как растут другие
🟡 быть частью тёплого, креативного нейро-комьюнити

Когда ты посмотришь видеоинструкцию, ты поймёшь:
это только начало.
Дальше - больше: живое общение, поддержка, идеи, совместный рост.
И всё это - уже внутри.

В общем, если ты не фанат одиночных исследований и хочешь чуть больше поддержки, красоты и пользы - жми "Подписаться" и ныряй с нами.

⸻

А если тебе норм и ты хочешь идти в соло-плавание, без видео, группы и подсказок -
нажимай "Оформить подписку" и пользуйся ботом в своём ритме.
Ты свободен, нейро-одиночка!`

      const leadMagnetTextEn = `Want to get a tutorial video? 📀
Subscribe to our live group for access!

Plus, in the group you can:
🟡 Master the neurobot's features easily
🟡 Get lessons, tips, and inspiring case studies
🟡 Ask questions and get answers
🟡 Share your work and see others grow
🟡 Be part of a warm, creative neuro-community

If you want support, beauty, and benefits - click "Subscribe & Dive In".
Or, if you prefer to go solo, click "Proceed to Subscription".`

      const leadMagnetMessage = isRu ? leadMagnetTextRu : leadMagnetTextEn

      const inlineKeyboard = Markup.inlineKeyboard([
        Markup.button.url(
          isRu ? '🌊 Подписаться и ныряй с нами' : '🌊 Subscribe & Dive In',
          groupJoinOrVideoUrl
        ),
        Markup.button.callback(
          isRu ? '💳 Оформить подписку' : '💳 Proceed to Subscription',
          'go_to_subscription_scene'
        ),
      ])

      await ctx.reply(leadMagnetMessage, {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard.reply_markup,
      })
    } else {
      // Случай, если URL для лид-магнита/видео не найден для этого бота
      logger.info({
        message: `ℹ️ [StartScene] URL для лид-магнита/туториала для ${currentBotName} не найден, показываем стандартное меню`,
        telegramId,
        function: 'startScene',
        step: 'lead_magnet_or_tutorial_url_not_found_showing_basic_menu',
      })

      const replyKeyboard = Markup.keyboard([
        Markup.button.text(isRu ? levels[105].title_ru : levels[105].title_en), // Пример кнопки, адаптируйте под ваши levels
        Markup.button.text(isRu ? levels[103].title_ru : levels[103].title_en), // Пример кнопки
      ]).resize()

      await ctx.reply(isRu ? 'Выберите действие:' : 'Choose an action:', {
        reply_markup: replyKeyboard.reply_markup,
      })
    }
    // --- КОНЕЦ: Лид-магнит / Видео-инструкция / Меню ---

    logger.info({
      message: `🏁 [StartScene] Завершение основного шага сцены старта`,
      telegramId,
      function: 'startScene',
      step: 'main_handler_step_leave',
    })
    // Оставляем сцену активной, чтобы обработчики action могли сработать,
    // или переходим в другую сцену через action.
    // Если пользователь нажмет URL, он уйдет из контекста бота временно.
    // Если нажмет callback-кнопку, сработает соответствующий action.
    return ctx.wizard.next() // Переходим к следующему шагу, если он есть, или завершаем сцену, если это последний шаг.
    // В данном случае, у нас один основной шаг обработки.
    // Вместо next() можно просто ничего не делать, чтобы сцена оставалась в текущем шаге.
    // Или ctx.scene.leave() если мы уверены, что все дальнейшие действия - это переход в другие сцены или выход из контекста.
    // Для inline кнопок, которые ведут в другие сцены, ctx.scene.leave() здесь безопасно.
    // Однако, чтобы обработчики .action() этой же сцены сработали, сцена должна быть активна.
    // Давайте пока уберем явный ctx.scene.leave() отсюда, т.к. переход будет через action.
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
    // Можно отправить подтверждающее сообщение перед переходом
    // await ctx.reply(isRu ? 'Переходим к выбору подписки...' : 'Proceeding to subscription options...')
    return ctx.scene.enter(ModeEnum.SubscriptionScene)
  } catch (error) {
    logger.error('Error in go_to_subscription_scene action:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Попробуйте позже.'
        : 'An error occurred. Please try again later.'
    )
    return ctx.scene.leave() // В случае ошибки выходим из сцены
  }
})
