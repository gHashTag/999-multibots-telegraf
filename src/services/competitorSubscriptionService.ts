import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { 
  getCompetitorSubscriptions,
  createCompetitorSubscription 
} from '@/core/supabase/instagramDatabase'
import { Markup } from 'telegraf'

// Пользователь сам вводит конкурентов - никаких готовых списков!

export async function handleCompetitorMonitoring(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  
  if (!telegramId) {
    await ctx.reply(
      isRu 
        ? '❌ Ошибка: не удалось определить ваш Telegram ID'
        : '❌ Error: unable to determine your Telegram ID'
    )
    return
  }

  try {
    logger.info('[Competitor Monitoring] Getting user subscriptions', { telegramId })

    // Получаем существующие подписки пользователя
    const existingSubscriptions = await getCompetitorSubscriptions(
      telegramId,
      'telegram_bot'
    )

    const activeSubscriptions = existingSubscriptions.filter(s => s.is_active)
    
    if (activeSubscriptions.length === 0) {
      // Если нет подписок - просим ввести username
      await promptForCompetitorUsername(ctx, isRu)
    } else {
      // Показываем существующие подписки
      await showExistingSubscriptions(ctx, activeSubscriptions, isRu)
    }

  } catch (error) {
    logger.error('[Competitor Monitoring] Error handling competitor monitoring', {
      error: error instanceof Error ? error.message : String(error),
      telegramId
    })

    await ctx.reply(
      isRu
        ? '❌ Ошибка при загрузке мониторинга конкурентов'
        : '❌ Error loading competitor monitoring'
    )
  }
}

async function promptForCompetitorUsername(ctx: MyContext, isRu: boolean): Promise<void> {
  const message = isRu
    ? `🔍 **Мониторинг конкурентов Instagram**

📺 Получайте новый контент конкурентов каждые 24 часа
🎬 Видео и рилсы с высокими просмотрами
📊 Аналитика трендов

✏️ **Введите Instagram username конкурента** (без @):

💡 Например: neuro_sage`
    : `🔍 **Instagram Competitor Monitoring**

📺 Get new competitor content every 24 hours
🎬 Videos and reels with high views
📊 Trend analytics

✏️ **Enter competitor Instagram username** (without @):

💡 Example: neuro_sage`

  // Сохраняем состояние "ожидания ввода конкурента" в сессии
  if (!ctx.session.competitorMonitoring) {
    ctx.session.competitorMonitoring = {}
  }
  ctx.session.competitorMonitoring.waitingForUsername = true

  await ctx.reply(message, {
    parse_mode: 'Markdown'
  })
}

async function showExistingSubscriptions(
  ctx: MyContext, 
  subscriptions: any[], 
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? `📋 **Ваши подписки на конкурентов** (${subscriptions.length}/10)

${subscriptions.map((sub, index) => 
  `${index + 1}. @${sub.competitor_username} ${sub.is_active ? '🟢' : '🔴'}
   📊 До ${sub.max_reels} рилсов | 👀 Мин. ${sub.min_views} просмотров`
).join('\n\n')}

⏰ Обновление: каждые 24 часа в 08:00 UTC`
    : `📋 **Your competitor subscriptions** (${subscriptions.length}/10)

${subscriptions.map((sub, index) => 
  `${index + 1}. @${sub.competitor_username} ${sub.is_active ? '🟢' : '🔴'}
   📊 Up to ${sub.max_reels} reels | 👀 Min ${sub.min_views} views`
).join('\n\n')}

⏰ Updates: every 24 hours at 08:00 UTC`

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '➕ Добавить конкурента' : '➕ Add competitor',
        'add_new_competitor'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '⚙️ Настройки' : '⚙️ Settings',
        'subscription_settings'
      ),
      Markup.button.callback(
        isRu ? '🔄 Обновить' : '🔄 Refresh',
        'refresh_subscriptions'
      )
    ]
  ])

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  })
}

export async function addCompetitorSubscription(
  ctx: MyContext,
  competitorUsername: string
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  
  if (!telegramId) return

  try {
    logger.info('[Competitor Monitoring] Adding competitor subscription', {
      telegramId,
      competitorUsername
    })

    await ctx.answerCbQuery(
      isRu 
        ? 'Добавляем подписку...' 
        : 'Adding subscription...'
    )

    const subscription = await createCompetitorSubscription({
      user_telegram_id: telegramId,
      bot_name: 'telegram_bot',
      competitor_username: competitorUsername,
      max_reels: 15, // До 15 рилсов за день
      min_views: 5000, // Минимум 5к просмотров
      max_age_days: 1, // Только за последний день
      delivery_format: 'individual' // Каждый рилс отдельно
    })

    if (subscription) {
      await ctx.editMessageText(
        isRu
          ? `✅ Подписка на @${competitorUsername} создана!

📊 Настройки:
• До 15 рилсов в день
• Минимум 5,000 просмотров  
• Доставка: каждый рилс отдельно
• Обновление: каждые 24 часа

🎬 Начнем присылать новый контент завтра в 08:00 UTC`
          : `✅ Subscription to @${competitorUsername} created!

📊 Settings:
• Up to 15 reels per day
• Minimum 5,000 views
• Delivery: individual reels
• Updates: every 24 hours

🎬 Will start sending new content tomorrow at 08:00 UTC`,
        { parse_mode: 'Markdown' }
      )
    } else {
      await ctx.editMessageText(
        isRu
          ? '❌ Не удалось создать подписку. Возможно, достигнут лимит (10 подписок)'
          : '❌ Failed to create subscription. Limit (10 subscriptions) may be reached'
      )
    }

  } catch (error) {
    logger.error('[Competitor Monitoring] Error adding competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      competitorUsername
    })

    await ctx.editMessageText(
      isRu
        ? '❌ Ошибка при создании подписки'
        : '❌ Error creating subscription'
    )
  }
}

// Callback handlers для inline кнопок
export function setupCompetitorCallbacks(bot: any): void {
  // Показать меню добавления конкурентов
  bot.action('add_new_competitor', async (ctx: MyContext) => {
    const isRu = isRussianFromState(ctx)
    await promptForCompetitorUsername(ctx, isRu)
  })

  // Обновить список подписок
  bot.action('refresh_subscriptions', async (ctx: MyContext) => {
    await handleCompetitorMonitoring(ctx)
  })
}

// Обработка текстового ввода username конкурента
export async function handleCompetitorUsernameInput(ctx: MyContext, username: string): Promise<boolean> {
  // Проверяем, ожидается ли ввод username
  if (!ctx.session.competitorMonitoring?.waitingForUsername) {
    return false // Не обрабатываем этот текст
  }

  const isRu = isRussianFromState(ctx)
  
  // Валидация Instagram username
  const cleanUsername = username.trim().replace('@', '')
  const instagramUsernameRegex = /^[a-zA-Z0-9._]{1,30}$/
  
  if (!instagramUsernameRegex.test(cleanUsername)) {
    await ctx.reply(
      isRu
        ? '❌ Некорректный Instagram username!\n\n✅ Должен содержать только буквы, цифры, точки и подчеркивания (1-30 символов)\n💡 Попробуйте еще раз:'
        : '❌ Invalid Instagram username!\n\n✅ Must contain only letters, numbers, dots and underscores (1-30 characters)\n💡 Try again:'
    )
    return true // Обрабатывали, но с ошибкой
  }

  // Сбрасываем состояние ожидания
  ctx.session.competitorMonitoring.waitingForUsername = false

  // Добавляем подписку
  await addCompetitorSubscription(ctx, cleanUsername)
  
  return true // Успешно обработали
}