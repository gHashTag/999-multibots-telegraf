import { MyContext } from '@/interfaces/telegram-bot.interface'
import { Markup } from 'telegraf'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { handlePriceCommand } from '@/commands/priceCommand'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { handleTechSupport } from '@/commands/handleTechSupport'
// Импортируем функцию перезапуска видео сцены
import { handleRestartVideoGeneration } from './handleVideoRestart'
import { PaymentType } from '@/interfaces/payments.interface'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
// ✅ Обновляем импорты для новых функций языка
// ✅ НОВАЯ ЦЕНТРАЛИЗОВАННАЯ СИСТЕМА ЯЗЫКОВ (БЕЗ ЗАПРОСОВ К БД!)
import {
  getUserLanguageFromState,
  isRussianFromState,
  setUserLanguageInState,
} from '@/helpers/centralizedLanguage'

// Получаем ID администраторов из переменных окружения
const adminIds = process.env.ADMIN_IDS?.split(',') || []
logger.info('[handleMenu] adminIds from env:', adminIds)

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [handleMenu] Обработка команды меню',
    telegramId,
    function: 'handleMenu',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  console.log('CASE: handleMenuCommand')
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)

  // Логируем текущий язык из state
  const currentLanguage = getUserLanguageFromState(ctx)
  logger.info('[handleMenu] Current user language:', {
    telegramId,
    currentLanguage,
    telegramLanguage: ctx.from?.language_code,
  })

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
        ctx.session.mode = ModeEnum.TextToVideo
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
          message: '🎨 [handleMenu] Переход к FLUX Kontext',
          telegramId,
          function: 'handleMenu',
          action: 'flux_kontext',
          nextScene: ModeEnum.CheckBalanceScene,
        })
        console.log('CASE: 🎨 FLUX Kontext')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в FLUX Kontext
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          '🎨 FLUX Kontext'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим FLUX Kontext и идем через checkBalanceScene
        ctx.session.mode = ModeEnum.FluxKontext
        console.log(
          `🔄 [handleMenu] Вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
        console.log(
          `✅ [handleMenu] Завершен вход в сцену ${ModeEnum.CheckBalanceScene}`
        )
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
        logger.info({
          message: '🎤 [handleMenu] Переход к Kling Lip Sync',
          telegramId,
          function: 'handleMenu',
          action: 'lip_sync',
          nextScene: 'lip_sync',
        })
        console.log('CASE: 🎤 Kling Lip Sync')

        // ✅ ЗАЩИТА: Проверяем подписку перед входом в липсинк
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          '🎤 Kling Lip Sync'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        // Устанавливаем режим LipSync и переходим напрямую в lip_sync scene
        ctx.session.mode = ModeEnum.LipSync
        console.log(`🔄 [handleMenu] Вход в сцену lip_sync`)
        await ctx.scene.enter('lip_sync')
        console.log(`✅ [handleMenu] Завершен вход в сцену lip_sync`)
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
          action: 'topup_balance',
          nextScene: ModeEnum.PaymentScene,
        })
        console.log('CASE: 💎 Пополнить баланс')
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
      // Возможно, здесь не нужно ничего делать или отправить сообщение типа "Неизвестная команда"
    }
  } else {
    // Логика для нетекстовых сообщений
    logger.warn({
      message: '⚠️ [handleMenu] Получено не текстовое сообщение',
      telegramId,
      function: 'handleMenu',
      messageType: ctx.message ? typeof ctx.message : 'undefined',
      result: 'non_text_message',
    })
  }
}

// Экспортируем функцию, если она будет использоваться в другом месте
export default handleMenu
