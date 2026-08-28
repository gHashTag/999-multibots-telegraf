import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { competitorMonitoringApi } from './competitorMonitoringApiService'
import { Markup } from 'telegraf'
import { ADMIN_IDS_ARRAY } from '@/config'

// Пользователь сам вводит конкурентов - никаких готовых списков!

export async function handleCompetitorMonitoring(
  ctx: MyContext
): Promise<void> {
  logger.info('[Competitor Monitoring] Function called')
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()

  logger.info('[Competitor Monitoring] Retrieved telegram ID', {
    telegramId,
    isRu,
  })

  if (!telegramId) {
    logger.warn('[Competitor Monitoring] No telegram ID found')
    await ctx.reply(
      isRu
        ? '❌ Ошибка: не удалось определить ваш Telegram ID'
        : '❌ Error: unable to determine your Telegram ID'
    )
    return
  }

  try {
    logger.info('[Competitor Monitoring] Getting user subscriptions', {
      telegramId,
    })

    // Получаем существующие подписки пользователя через API сервис
    logger.info(
      '[Competitor Monitoring] Calling competitorMonitoringApi.getSubscriptions...'
    )
    const existingSubscriptions =
      await competitorMonitoringApi.getSubscriptions(telegramId, 'telegram_bot')
    logger.info(
      '[Competitor Monitoring] competitorMonitoringApi.getSubscriptions returned',
      {
        subscriptionsCount: existingSubscriptions.length,
        subscriptions: existingSubscriptions,
      }
    )

    const activeSubscriptions = existingSubscriptions.filter(s => s.is_active)
    logger.info('[Competitor Monitoring] Filtered active subscriptions', {
      activeCount: activeSubscriptions.length,
    })

    if (activeSubscriptions.length === 0) {
      logger.info(
        '[Competitor Monitoring] No active subscriptions, prompting for username'
      )
      // Если нет подписок - просим ввести username
      await promptForCompetitorUsername(ctx, isRu)
    } else {
      logger.info('[Competitor Monitoring] Showing existing subscriptions')
      // Показываем существующие подписки
      await showExistingSubscriptions(ctx, activeSubscriptions, isRu)
    }

    logger.info('[Competitor Monitoring] Function completed successfully')
  } catch (error) {
    logger.error(
      '[Competitor Monitoring] Error handling competitor monitoring',
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        telegramId,
        phase: 'handleCompetitorMonitoring',
      }
    )

    await ctx.reply(
      isRu
        ? '❌ Ошибка при загрузке мониторинга конкурентов'
        : '❌ Error loading competitor monitoring'
    )
  }
}

export async function promptForCompetitorUsername(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  logger.info('[promptForCompetitorUsername] Called', {
    userId: ctx.from?.id,
    isRu,
    sessionBefore: ctx.session,
  })

  const message = isRu
    ? `🔍 Мониторинг конкурентов Instagram

📺 Получайте новый контент конкурентов каждые 24 часа
🎬 Видео и рилсы с высокими просмотрами  
📊 Аналитика трендов

✏️ Введите Instagram username конкурента (без @):

💡 Например: neuro_sage`
    : `🔍 Instagram Competitor Monitoring

📺 Get new competitor content every 24 hours
🎬 Videos and reels with high views
📊 Trend analytics

✏️ Enter competitor Instagram username (without @):

💡 Example: neuro_sage`

  // Сохраняем состояние "ожидания ввода конкурента" в сессии
  if (!ctx.session.competitorMonitoring) {
    logger.info(
      '[promptForCompetitorUsername] Creating competitorMonitoring object in session'
    )
    ctx.session.competitorMonitoring = {}
  }
  ctx.session.competitorMonitoring.waitingForUsername = true

  logger.info('[promptForCompetitorUsername] Set waitingForUsername = true', {
    sessionAfter: ctx.session,
  })

  try {
    await ctx.reply(message)
    logger.info('[promptForCompetitorUsername] Message sent successfully')

    // Выходим из текущей сцены, чтобы обработчик текста мог работать правильно
    if (ctx.scene && ctx.scene.current) {
      logger.info(
        '[promptForCompetitorUsername] Leaving current scene to enable text input handling'
      )
      await ctx.scene.leave()
    }
  } catch (error) {
    logger.error('[promptForCompetitorUsername] Failed to send message', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function showExistingSubscriptions(
  ctx: MyContext,
  subscriptions: any[],
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? `📋 Ваши подписки на конкурентов (${subscriptions.length}/10)

${subscriptions
  .map(
    (sub, index) =>
      `${index + 1}. @${sub.competitor_username} ${sub.is_active ? '🟢' : '🔴'}
   📊 До ${sub.max_reels} рилсов | 👀 Мин. ${sub.min_views} просмотров`
  )
  .join('\n\n')}

⏰ Обновление: каждые 24 часа в 08:00 UTC`
    : `📋 Your competitor subscriptions (${subscriptions.length}/10)

${subscriptions
  .map(
    (sub, index) =>
      `${index + 1}. @${sub.competitor_username} ${sub.is_active ? '🟢' : '🔴'}
   📊 Up to ${sub.max_reels} reels | 👀 Min ${sub.min_views} views`
  )
  .join('\n\n')}

⏰ Updates: every 24 hours at 08:00 UTC`

  // Создаем кнопки для каждой подписки с возможностью удаления
  const subscriptionButtons = subscriptions.map(sub => [
    Markup.button.callback(
      `❌ ${sub.competitor_username}`,
      `delete_subscription_${sub.id}`
    ),
  ])

  // Проверяем, является ли пользователь администратором
  const userId = ctx.from?.id
  const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

  // Создаем массив кнопок для клавиатуры
  const keyboardButtons = []

  // Добавляем кнопку "Добавить конкурента" только для администраторов
  if (isAdmin) {
    keyboardButtons.push([
      Markup.button.callback(
        isRu ? '➕ Добавить конкурента' : '➕ Add competitor',
        'add_new_competitor'
      ),
    ])
  }

  // Добавляем кнопки удаления подписок
  keyboardButtons.push(...subscriptionButtons)

  // Добавляем служебные кнопки
  keyboardButtons.push([
    Markup.button.callback(
      isRu ? '⚙️ Настройки' : '⚙️ Settings',
      'subscription_settings'
    ),
    Markup.button.callback(
      isRu ? '🔄 Обновить' : '🔄 Refresh',
      'refresh_subscriptions'
    ),
  ])

  const keyboard = Markup.inlineKeyboard(keyboardButtons)

  await ctx.reply(message, keyboard)
}

export async function addCompetitorSubscription(
  ctx: MyContext,
  competitorUsername: string
): Promise<void> {
  console.log(
    '🎯 [addCompetitorSubscription] Function called with username:',
    competitorUsername
  )

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()

  console.log('🎯 [addCompetitorSubscription] Telegram ID:', telegramId)
  console.log('🎯 [addCompetitorSubscription] Language:', isRu ? 'ru' : 'en')

  if (!telegramId) {
    console.log('❌ [addCompetitorSubscription] No telegram ID, returning')
    return
  }

  try {
    console.log(
      '📝 [addCompetitorSubscription] Logging subscription creation...'
    )
    logger.info('[Competitor Monitoring] Adding competitor subscription', {
      telegramId,
      competitorUsername,
    })

    // ВАЖНО: Не используем answerCbQuery для обычных сообщений!
    console.log('💬 [addCompetitorSubscription] Sending progress message...')
    await ctx.reply(isRu ? 'Добавляем подписку...' : 'Adding subscription...')

    console.log(
      '📞 [addCompetitorSubscription] Calling competitorMonitoringApi.createSubscription...'
    )
    const result = await competitorMonitoringApi.createSubscription(ctx, {
      competitorUsername,
      maxReels: 15, // До 15 рилсов за день
      minViews: 5000, // Минимум 5к просмотров
      maxAgeDays: 1, // Только за последний день
      deliveryFormat: 'individual', // Каждый рилс отдельно
    })

    console.log(
      '📞 [addCompetitorSubscription] competitorMonitoringApi.createSubscription result:',
      result.success
    )

    if (result.success) {
      console.log(
        '✅ [addCompetitorSubscription] Subscription created, sending success message...'
      )
      await ctx.reply(result.message)
      console.log('✅ [addCompetitorSubscription] Success message sent')
    } else {
      console.log(
        '❌ [addCompetitorSubscription] Subscription creation failed, sending error message...'
      )
      await ctx.reply(result.message)
    }
  } catch (error) {
    console.log('💥 [addCompetitorSubscription] Error occurred:', error)
    logger.error(
      '[Competitor Monitoring] Error adding competitor subscription',
      {
        error: error instanceof Error ? error.message : String(error),
        telegramId,
        competitorUsername,
      }
    )

    await ctx.reply(
      isRu
        ? '❌ Ошибка при создании подписки'
        : '❌ Error creating subscription'
    )
  }
}

// Обработка текстового ввода username конкурента
export async function handleCompetitorUsernameInput(
  ctx: MyContext,
  username: string
): Promise<boolean> {
  console.log(
    '🎯 [handleCompetitorUsernameInput] Function called with username:',
    username
  )
  console.log(
    '🎯 [handleCompetitorUsernameInput] Session state:',
    ctx.session.competitorMonitoring
  )

  // Проверяем, ожидается ли ввод username
  if (!ctx.session.competitorMonitoring?.waitingForUsername) {
    console.log(
      '❌ [handleCompetitorUsernameInput] Not waiting for username, returning false'
    )
    return false // Не обрабатываем этот текст
  }

  console.log(
    '✅ [handleCompetitorUsernameInput] Waiting for username = true, processing...'
  )
  const isRu = isRussianFromState(ctx)

  // Валидация Instagram username
  const cleanUsername = username.trim().replace('@', '')
  console.log(
    '🔍 [handleCompetitorUsernameInput] Clean username:',
    cleanUsername
  )

  const instagramUsernameRegex = /^[a-zA-Z0-9._]{1,30}$/
  const isValid = instagramUsernameRegex.test(cleanUsername)
  console.log(
    '🔍 [handleCompetitorUsernameInput] Username validation result:',
    isValid
  )

  if (!isValid) {
    console.log(
      '❌ [handleCompetitorUsernameInput] Invalid username, sending error message'
    )
    await ctx.reply(
      isRu
        ? '❌ Некорректный Instagram username!\n\n✅ Должен содержать только буквы, цифры, точки и подчеркивания (1-30 символов)\n💡 Попробуйте еще раз:'
        : '❌ Invalid Instagram username!\n\n✅ Must contain only letters, numbers, dots and underscores (1-30 characters)\n💡 Try again:'
    )
    return true // Обрабатывали, но с ошибкой
  }

  console.log(
    '✅ [handleCompetitorUsernameInput] Username is valid, resetting state and adding subscription'
  )

  // Сбрасываем состояние ожидания
  ctx.session.competitorMonitoring.waitingForUsername = false
  console.log(
    '🔄 [handleCompetitorUsernameInput] Set waitingForUsername = false'
  )

  // Добавляем подписку
  console.log(
    '📞 [handleCompetitorUsernameInput] Calling addCompetitorSubscription...'
  )
  await addCompetitorSubscription(ctx, cleanUsername)
  console.log(
    '✅ [handleCompetitorUsernameInput] addCompetitorSubscription completed'
  )

  return true // Успешно обработали
}
