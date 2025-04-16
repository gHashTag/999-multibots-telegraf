import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { getSubscriptionTranslations } from '@/core/supabase/getSubscriptionTranslations'
import { Translation } from '@/interfaces/translations.interface'
import { SubscriptionButton } from '@/interfaces/telegram-bot.interface'

interface SceneTranslation extends Omit<Translation, 'buttons'> {
  buttons?: SubscriptionButton[]
}

export const subscriptionScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.SubscriptionScene
)

// Шаг 1: Вход в сцену и получение переводов
subscriptionScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  const languageCode = isRu ? 'ru' : 'en'
  const bot_name = ctx.botInfo?.username || 'ai_koshey_bot'

  try {
    logger.info('🎭 Entering subscription selection scene', {
      telegram_id: ctx.from?.id,
      language_code: languageCode,
      bot_name,
    })

    // Сохраняем текущий шаг
    ctx.session.subscriptionStep = 'LOADING_TRANSLATIONS'

    // Получаем переводы из базы данных
    const translations = await getSubscriptionTranslations(
      languageCode,
      bot_name
    )

    if (!translations || translations.length === 0) {
      logger.error('❌ No translations found', {
        telegram_id: ctx.from?.id,
        language_code: languageCode,
        bot_name,
      })
      throw new Error('No translations available')
    }

    logger.info('✅ Translations loaded', {
      telegram_id: ctx.from?.id,
      translations_count: translations.length,
    })

    // Сохраняем переводы в сессии
    ctx.session.translations = translations as unknown as Translation[]

    // Переходим к показу подписок
    await showSubscriptionOptions(ctx)
  } catch (error) {
    logger.error('❌ Error in subscription scene:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
    })

    const errorText = isRu
      ? '❌ Произошла ошибка при загрузке подписок. Попробуйте позже.'
      : '❌ Error loading subscriptions. Please try again later.'

    await ctx.reply(errorText)
    await ctx.scene.leave()
  }
})

// Шаг 2: Показ доступных подписок
async function showSubscriptionOptions(ctx: MyContext) {
  const isRu = isRussian(ctx)

  try {
    logger.info('📋 Showing subscription options', {
      telegram_id: ctx.from?.id,
      step: 'SHOWING_OPTIONS',
    })

    // Устанавливаем текущий шаг
    ctx.session.subscriptionStep = 'SHOWING_OPTIONS'

    const translations = ctx.session.translations
    if (!translations) {
      throw new Error('No translations available')
    }
    const sceneTranslation = translations.find(
      t => t.key === 'subscriptionScene'
    ) as SceneTranslation

    if (!sceneTranslation || !sceneTranslation.buttons) {
      throw new Error('Subscription options not found')
    }

    // Формируем описание каждой подписки
    const subscriptionDescriptions = sceneTranslation.buttons
      .map((button: SubscriptionButton) => {
        const price = isRu ? button.ru_price : button.en_price
        return `
💫 ${button.text}
📝 ${button.description}
💰 ${isRu ? 'Цена' : 'Price'}: ${price}₽
⭐️ ${isRu ? 'Бонус' : 'Bonus'}: ${button.stars_price} ${isRu ? 'звезд' : 'stars'}
`
      })
      .join('\n')

    // Отправляем описания подписок
    await ctx.reply(
      `${sceneTranslation.translation}\n\n${subscriptionDescriptions}`,
      { parse_mode: 'HTML' }
    )

    // Формируем кнопки выбора
    const buttons = sceneTranslation.buttons.map(
      (button: SubscriptionButton) => [
        Markup.button.callback(
          `${button.text} - ${isRu ? button.ru_price : button.en_price}₽`,
          `select_subscription_${button.callback_data}`
        ),
      ]
    )

    // Добавляем кнопку возврата
    buttons.push([
      Markup.button.callback(
        isRu ? '🏠 Вернуться в меню' : '🏠 Back to menu',
        'back_to_menu'
      ),
    ])

    await ctx.reply(
      isRu ? '👆 Выберите подписку:' : '👆 Choose subscription:',
      Markup.inlineKeyboard(buttons)
    )

    logger.info('✅ Subscription options displayed', {
      telegram_id: ctx.from?.id,
      buttons_count: buttons.length,
    })
  } catch (error) {
    logger.error('❌ Error showing subscription options:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
    })

    const errorText = isRu
      ? '❌ Ошибка при отображении подписок. Попробуйте позже.'
      : '❌ Error displaying subscriptions. Please try again later.'

    await ctx.reply(errorText)
    await ctx.scene.leave()
  }
}

// Шаг 3: Обработка выбора подписки
subscriptionScene.action(/^select_subscription_(.+)$/, async ctx => {
  const isRu = isRussian(ctx)
  const subscriptionType = ctx.match?.[1] as SubscriptionType

  try {
    logger.info('💫 Processing subscription selection', {
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
      step: 'SUBSCRIPTION_SELECTED',
    })

    // Устанавливаем текущий шаг
    ctx.session.subscriptionStep = 'SUBSCRIPTION_SELECTED'
    ctx.session.subscription = subscriptionType

    await ctx.answerCbQuery()

    // Подтверждение выбора
    const confirmText = isRu
      ? `✅ Вы выбрали подписку: ${subscriptionType}\nПродолжить оформление?`
      : `✅ You selected: ${subscriptionType}\nProceed with purchase?`

    const confirmButtons = [
      [
        Markup.button.callback(
          isRu ? '✅ Подтвердить' : '✅ Confirm',
          `confirm_subscription_${subscriptionType}`
        ),
        Markup.button.callback(
          isRu ? '❌ Отменить' : '❌ Cancel',
          'cancel_subscription'
        ),
      ],
    ]

    await ctx.reply(confirmText, Markup.inlineKeyboard(confirmButtons))

    logger.info('✅ Awaiting subscription confirmation', {
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
    })
  } catch (error) {
    logger.error('❌ Error processing subscription selection:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
    })

    const errorText = isRu
      ? '❌ Ошибка при выборе подписки. Попробуйте позже.'
      : '❌ Error selecting subscription. Please try again later.'

    await ctx.reply(errorText)
    await ctx.scene.leave()
  }
})

// Шаг 4: Подтверждение выбора и переход к оплате
subscriptionScene.action(/^confirm_subscription_(.+)$/, async ctx => {
  const isRu = isRussian(ctx)
  const subscriptionType = ctx.match?.[1] as SubscriptionType

  try {
    logger.info('✅ Processing subscription confirmation', {
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
      step: 'CONFIRMING_SUBSCRIPTION',
    })

    await ctx.answerCbQuery()

    // Переходим к обработке покупки
    await handleBuySubscription(ctx as unknown as MyContext, subscriptionType)

    logger.info('🚀 Proceeding to payment', {
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
    })
  } catch (error) {
    logger.error('❌ Error confirming subscription:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
    })

    const errorText = isRu
      ? '❌ Ошибка при подтверждении подписки. Попробуйте позже.'
      : '❌ Error confirming subscription. Please try again later.'

    await ctx.reply(errorText)
    await ctx.scene.leave()
  }
})

// Отмена выбора подписки
subscriptionScene.action('cancel_subscription', async ctx => {
  const isRu = isRussian(ctx)

  logger.info('❌ Subscription selection cancelled', {
    telegram_id: ctx.from?.id,
    step: 'CANCELLED',
  })

  await ctx.answerCbQuery()

  const cancelText = isRu
    ? '❌ Выбор подписки отменен. Показать доступные подписки снова?'
    : '❌ Subscription selection cancelled. Show available subscriptions again?'

  const retryButtons = [
    [
      Markup.button.callback(
        isRu ? '🔄 Показать снова' : '🔄 Show again',
        'show_subscriptions'
      ),
      Markup.button.callback(isRu ? '🏠 В меню' : '🏠 Menu', 'back_to_menu'),
    ],
  ]

  await ctx.reply(cancelText, Markup.inlineKeyboard(retryButtons))
})

// Повторный показ подписок
subscriptionScene.action('show_subscriptions', async ctx => {
  logger.info('🔄 Reshowing subscription options', {
    telegram_id: ctx.from?.id,
  })

  await ctx.answerCbQuery()
  await showSubscriptionOptions(ctx)
})

// Возврат в меню
subscriptionScene.action('back_to_menu', async ctx => {
  logger.info('🏠 Returning to menu', {
    telegram_id: ctx.from?.id,
  })

  await ctx.answerCbQuery()
  await ctx.scene.enter('menuScene')
})
