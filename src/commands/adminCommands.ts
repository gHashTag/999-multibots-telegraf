import { MyContext } from '@/interfaces'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { checkSubscriptionByTelegramId } from '@/core/supabase/checkSubscriptionByTelegramId'
import { adminRenewSubscription } from '@/core/supabase/adminRenewSubscription'
import { PaymentType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { requireAdmin } from '@/middleware/adminOnly'
import { Markup } from 'telegraf'
import { supabase } from '@/core/supabase/client'

// Расширяем тип сессии для админских операций
declare module '@/interfaces' {
  interface MySession {
    adminTargetUser?: string
    adminWaitingFor?: string
    adminTargetSubscription?: SubscriptionType
    broadcastMessage?: string
  }
}

/**
 * Единая система админских команд
 * 
 * Доступные команды:
 * - /admin - главное админ меню
 * - /admin_user <telegram_id> - управление конкретным пользователем
 * - /admin_stats - статистика системы
 * - /admin_broadcast <message> - рассылка всем пользователям
 */

/**
 * Главная админская команда - показывает меню всех доступных действий
 */
export async function handleAdminCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  
  const adminMenu = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '👤 Управление пользователем' : '👤 User Management',
        'admin_user_prompt'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '📊 Статистика системы' : '📊 System Stats',
        'admin_stats'
      ),
      Markup.button.callback(
        isRu ? '📢 Рассылка' : '📢 Broadcast',
        'admin_broadcast_prompt'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '💰 Пополнить звезды' : '💰 Add Stars',
        'admin_add_stars_prompt'
      ),
      Markup.button.callback(
        isRu ? '📅 Управление подписками' : '📅 Manage Subscriptions',
        'admin_subscription_prompt'
      )
    ],
    [
      Markup.button.callback(
        isRu ? '🔍 Поиск пользователя' : '🔍 Find User',
        'admin_find_user_prompt'
      ),
      Markup.button.callback(
        isRu ? '⚙️ Системные настройки' : '⚙️ System Settings',
        'admin_settings'
      )
    ]
  ])
  
  const message = isRu
    ? `🔧 **Панель администратора**

Добро пожаловать в административную панель!

Выберите действие из меню ниже:

📊 Статистика на сегодня:
• Активных пользователей: загрузка...
• Новых подписок: загрузка...
• Общий доход: загрузка...

👨‍💼 Администратор: @${ctx.from?.username || ctx.from?.id}`
    : `🔧 **Admin Panel**

Welcome to the admin panel!

Select an action from the menu below:

📊 Today's stats:
• Active users: loading...
• New subscriptions: loading...
• Total revenue: loading...

👨‍💼 Administrator: @${ctx.from?.username || ctx.from?.id}`

  await ctx.reply(message, {
    ...adminMenu,
    parse_mode: 'Markdown'
  })
}

/**
 * Управление конкретным пользователем
 */
export async function handleAdminUserCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  
  // Получаем ID пользователя из команды
  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu 
        ? '❌ Используйте: /admin_user <telegram_id>' 
        : '❌ Usage: /admin_user <telegram_id>'
    )
    return
  }
  
  const parts = message.text.split(' ')
  if (parts.length < 2) {
    await ctx.reply(
      isRu 
        ? '❌ Укажите ID пользователя: /admin_user <telegram_id>' 
        : '❌ Please specify user ID: /admin_user <telegram_id>'
    )
    return
  }
  
  const targetUserId = parts[1]
  
  try {
    // Получаем информацию о пользователе
    const user = await getUserByTelegramId(targetUserId)
    if (!user) {
      await ctx.reply(
        isRu 
          ? `❌ Пользователь с ID ${targetUserId} не найден`
          : `❌ User with ID ${targetUserId} not found`
      )
      return
    }
    
    // Получаем баланс и подписку
    const balance = await getUserBalance(targetUserId)
    const subscription = await checkSubscriptionByTelegramId(targetUserId)
    
    // Получаем последние платежи
    const { data: payments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(3)
    
    const userMenu = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '➕ Пополнить звезды' : '➕ Add Stars',
          `admin_add_stars_${targetUserId}`
        ),
        Markup.button.callback(
          isRu ? '➖ Списать звезды' : '➖ Deduct Stars',
          `admin_deduct_stars_${targetUserId}`
        )
      ],
      [
        Markup.button.callback(
          isRu ? '📅 Продлить подписку' : '📅 Extend Subscription',
          `admin_extend_sub_${targetUserId}`
        ),
        Markup.button.callback(
          isRu ? '🔄 Изменить подписку' : '🔄 Change Subscription',
          `admin_change_sub_${targetUserId}`
        )
      ],
      [
        Markup.button.callback(
          isRu ? '📜 История платежей' : '📜 Payment History',
          `admin_payment_history_${targetUserId}`
        ),
        Markup.button.callback(
          isRu ? '📊 Статистика' : '📊 Statistics',
          `admin_user_stats_${targetUserId}`
        )
      ],
      [
        Markup.button.callback(
          isRu ? '✉️ Отправить сообщение' : '✉️ Send Message',
          `admin_message_user_${targetUserId}`
        ),
        Markup.button.callback(
          isRu ? '🚫 Заблокировать' : '🚫 Block',
          `admin_block_user_${targetUserId}`
        )
      ],
      [
        Markup.button.callback(
          isRu ? '🔙 Назад в меню' : '🔙 Back to Menu',
          'admin_main_menu'
        )
      ]
    ])
    
    const userInfo = isRu
      ? `👤 **Информация о пользователе**

🆔 Telegram ID: \`${targetUserId}\`
👤 Имя: ${user.first_name || 'Не указано'} ${user.last_name || ''}
📝 Username: @${user.username || 'не указан'}
💰 Баланс: ${balance} ⭐
📅 Подписка: ${subscription === 'unsubscribed' ? '❌ Нет' : `✅ ${subscription}`}
🌐 Язык: ${user.is_ru ? '🇷🇺 Русский' : '🇬🇧 English'}
📅 Регистрация: ${user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : 'Неизвестно'}

📊 Последние платежи:
${payments && payments.length > 0 
  ? payments.map(p => `• ${new Date(p.created_at).toLocaleDateString('ru-RU')} - ${p.amount || p.stars} ⭐ (${p.type})`).join('\n')
  : 'Платежей не найдено'}

Выберите действие:`
      : `👤 **User Information**

🆔 Telegram ID: \`${targetUserId}\`
👤 Name: ${user.first_name || 'Not specified'} ${user.last_name || ''}
📝 Username: @${user.username || 'not specified'}
💰 Balance: ${balance} ⭐
📅 Subscription: ${subscription === 'unsubscribed' ? '❌ None' : `✅ ${subscription}`}
🌐 Language: ${user.is_ru ? '🇷🇺 Russian' : '🇬🇧 English'}
📅 Registration: ${user.created_at ? new Date(user.created_at).toLocaleDateString('en-US') : 'Unknown'}

📊 Recent payments:
${payments && payments.length > 0 
  ? payments.map(p => `• ${new Date(p.created_at).toLocaleDateString('en-US')} - ${p.amount || p.stars} ⭐ (${p.type})`).join('\n')
  : 'No payments found'}

Select an action:`
    
    await ctx.reply(userInfo, {
      ...userMenu,
      parse_mode: 'Markdown'
    })
    
    // Сохраняем в сессии ID пользователя для дальнейших действий
    ctx.session.adminTargetUser = targetUserId
    
  } catch (error) {
    logger.error('Error in admin user command', { error, targetUserId })
    await ctx.reply(
      isRu
        ? `❌ Ошибка при получении информации о пользователе: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
        : `❌ Error getting user information: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Быстрое пополнение звезд
 */
export async function handleQuickAddStarsCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  
  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu 
        ? '❌ Неверный формат команды' 
        : '❌ Invalid command format'
    )
    return
  }
  
  const parts = message.text.split(' ')
  if (parts.length < 3) {
    await ctx.reply(
      isRu
        ? `📝 Использование: /add_stars <user_id> <amount> [причина]

Примеры:
• /add_stars 7007992081 1000 Бонус за активность
• /add_stars 7007992081 500 Тестирование`
        : `📝 Usage: /add_stars <user_id> <amount> [reason]

Examples:
• /add_stars 7007992081 1000 Activity bonus
• /add_stars 7007992081 500 Testing`
    )
    return
  }
  
  const targetUserId = parts[1]
  const amount = parseFloat(parts[2])
  const reason = parts.slice(3).join(' ') || (isRu ? 'Административное пополнение' : 'Administrative top-up')
  
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply(
      isRu
        ? '❌ Неверная сумма. Укажите положительное число'
        : '❌ Invalid amount. Please specify a positive number'
    )
    return
  }
  
  try {
    const currentBalance = await getUserBalance(targetUserId)
    
    const result = await updateUserBalance(
      targetUserId,
      amount,
      PaymentType.MONEY_INCOME,
      `Admin top-up: ${reason}`,
      {
        bot_name: ctx.botInfo?.username || 'admin_system',
        service_type: 'admin_topup',
        payment_method: 'Admin',
        language: isRu ? 'ru' : 'en',
        operation_id: `admin-topup-${Date.now()}-${ctx.from?.id}`,
        admin_id: ctx.from?.id,
        admin_username: ctx.from?.username,
        reason: reason,
        category: 'BONUS',
      }
    )
    
    if (result) {
      const newBalance = await getUserBalance(targetUserId)
      
      await ctx.reply(
        isRu
          ? `✅ Звезды успешно добавлены!

👤 Пользователь: ${targetUserId}
💰 Было: ${currentBalance} ⭐
💰 Стало: ${newBalance} ⭐
➕ Добавлено: ${amount} ⭐
📝 Причина: ${reason}`
          : `✅ Stars successfully added!

👤 User: ${targetUserId}
💰 Was: ${currentBalance} ⭐
💰 Now: ${newBalance} ⭐
➕ Added: ${amount} ⭐
📝 Reason: ${reason}`
      )
      
      // Отправляем уведомление пользователю
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          isRu
            ? `🎁 Вам начислены звезды!

➕ Добавлено: ${amount} ⭐
💰 Ваш баланс: ${newBalance} ⭐
📝 Причина: ${reason}`
            : `🎁 Stars have been credited to you!

➕ Added: ${amount} ⭐
💰 Your balance: ${newBalance} ⭐
📝 Reason: ${reason}`
        )
      } catch (e) {
        logger.warn('Failed to notify user about stars addition', { targetUserId })
      }
    }
  } catch (error) {
    logger.error('Error adding stars', { error, targetUserId, amount })
    await ctx.reply(
      isRu
        ? `❌ Ошибка при добавлении звезд: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
        : `❌ Error adding stars: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Быстрое изменение подписки
 */
export async function handleQuickSubscriptionCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  
  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu 
        ? '❌ Неверный формат команды' 
        : '❌ Invalid command format'
    )
    return
  }
  
  const parts = message.text.split(' ')
  if (parts.length < 4) {
    await ctx.reply(
      isRu
        ? `📝 Использование: /set_subscription <user_id> <type> <days>

Типы подписок:
• NEUROPHOTO - базовый доступ
• NEUROVIDEO - полный доступ
• STARS - звездная подписка
• NEUROTESTER - тестовая подписка

Примеры:
• /set_subscription 7007992081 NEUROVIDEO 30
• /set_subscription 7007992081 NEUROPHOTO 7`
        : `📝 Usage: /set_subscription <user_id> <type> <days>

Subscription types:
• NEUROPHOTO - basic access
• NEUROVIDEO - full access
• STARS - star subscription
• NEUROTESTER - test subscription

Examples:
• /set_subscription 7007992081 NEUROVIDEO 30
• /set_subscription 7007992081 NEUROPHOTO 7`
    )
    return
  }
  
  const targetUserId = parts[1]
  const subscriptionType = parts[2].toUpperCase() as SubscriptionType
  const days = parseInt(parts[3], 10)
  
  if (!Object.values(SubscriptionType).includes(subscriptionType)) {
    await ctx.reply(
      isRu
        ? `❌ Неверный тип подписки. Доступны: ${Object.values(SubscriptionType).join(', ')}`
        : `❌ Invalid subscription type. Available: ${Object.values(SubscriptionType).join(', ')}`
    )
    return
  }
  
  if (isNaN(days) || days <= 0 || days > 365) {
    await ctx.reply(
      isRu
        ? '❌ Количество дней должно быть от 1 до 365'
        : '❌ Number of days must be between 1 and 365'
    )
    return
  }
  
  try {
    const result = await adminRenewSubscription({
      telegram_id: targetUserId,
      subscription_type: subscriptionType,
      duration_days: days,
      bot_name: ctx.botInfo?.username || 'admin_system',
      reason: `Admin set subscription by ${ctx.from?.username || ctx.from?.id}`
    })
    
    if (result.success) {
      await ctx.reply(
        isRu
          ? `✅ Подписка успешно установлена!

👤 Пользователь: ${targetUserId}
📅 Тип: ${subscriptionType}
⏱️ Период: ${days} дней
📅 Действует до: ${new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('ru-RU')}`
          : `✅ Subscription successfully set!

👤 User: ${targetUserId}
📅 Type: ${subscriptionType}
⏱️ Period: ${days} days
📅 Valid until: ${new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-US')}`
      )
      
      // Отправляем уведомление пользователю
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          isRu
            ? `🎉 Ваша подписка обновлена!

📅 Тип: ${subscriptionType}
⏱️ Период: ${days} дней
✅ Теперь вам доступны все функции подписки!`
            : `🎉 Your subscription has been updated!

📅 Type: ${subscriptionType}
⏱️ Period: ${days} days
✅ Now you have access to all subscription features!`
        )
      } catch (e) {
        logger.warn('Failed to notify user about subscription', { targetUserId })
      }
    } else {
      throw new Error(result.error || 'Unknown error')
    }
  } catch (error) {
    logger.error('Error setting subscription', { error, targetUserId, subscriptionType, days })
    await ctx.reply(
      isRu
        ? `❌ Ошибка при установке подписки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
        : `❌ Error setting subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Статистика системы
 */
export async function handleAdminStatsCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  
  try {
    // Получаем статистику из базы данных
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Активные пользователи за сегодня
    const { count: activeUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', today.toISOString())
    
    // Новые подписки за сегодня
    const { count: newSubscriptions } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })
      .not('subscription_type', 'is', null)
      .gte('created_at', today.toISOString())
    
    // Общая сумма платежей за сегодня
    const { data: todayPayments } = await supabase
      .from('payments_v2')
      .select('amount, stars')
      .gte('created_at', today.toISOString())
      .eq('type', PaymentType.MONEY_INCOME)
    
    const totalRevenue = todayPayments?.reduce((sum, payment) => 
      sum + (payment.stars || payment.amount || 0), 0) || 0
    
    // Всего пользователей
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
    
    // Активные подписки
    const { count: activeSubscriptions } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })
      .not('subscription_type', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    
    const stats = isRu
      ? `📊 **Статистика системы**

📅 Сегодня (${today.toLocaleDateString('ru-RU')}):
• Активных пользователей: ${activeUsers || 0}
• Новых подписок: ${newSubscriptions || 0}
• Доход: ${totalRevenue} ⭐

📈 Общая статистика:
• Всего пользователей: ${totalUsers || 0}
• Активных подписок: ${activeSubscriptions || 0}

💰 Типы подписок:
• NEUROPHOTO: загрузка...
• NEUROVIDEO: загрузка...
• STARS: загрузка...
• NEUROTESTER: загрузка...`
      : `📊 **System Statistics**

📅 Today (${today.toLocaleDateString('en-US')}):
• Active users: ${activeUsers || 0}
• New subscriptions: ${newSubscriptions || 0}
• Revenue: ${totalRevenue} ⭐

📈 Overall statistics:
• Total users: ${totalUsers || 0}
• Active subscriptions: ${activeSubscriptions || 0}

💰 Subscription types:
• NEUROPHOTO: loading...
• NEUROVIDEO: loading...
• STARS: loading...
• NEUROTESTER: loading...`
    
    await ctx.reply(stats, { parse_mode: 'Markdown' })
    
  } catch (error) {
    logger.error('Error getting admin stats', { error })
    await ctx.reply(
      isRu
        ? '❌ Ошибка при получении статистики'
        : '❌ Error getting statistics'
    )
  }
}

/**
 * Обработчики callback кнопок
 */
export function setupAdminCallbacks(bot: any) {
  // Главное меню
  bot.action('admin_main_menu', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    await handleAdminCommand(ctx)
  })
  
  // Статистика
  bot.action('admin_stats', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    await handleAdminStatsCommand(ctx)
  })
  
  // Запрос ID пользователя
  bot.action('admin_user_prompt', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '📝 Введите Telegram ID пользователя:'
        : '📝 Enter user Telegram ID:'
    )
    ctx.session.adminWaitingFor = 'user_id'
  })
  
  // Добавление звезд - запрос данных
  bot.action(/^admin_add_stars_(\d+)$/, requireAdmin(), async (ctx: MyContext & { match?: RegExpMatchArray }) => {
    await ctx.answerCbQuery()
    const userId = ctx.match?.[1] || ''
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? `💰 Введите количество звезд для добавления пользователю ${userId}:`
        : `💰 Enter amount of stars to add for user ${userId}:`
    )
    ctx.session.adminWaitingFor = 'add_stars'
    ctx.session.adminTargetUser = userId
  })
  
  // Изменение подписки
  bot.action(/^admin_change_sub_(\d+)$/, requireAdmin(), async (ctx: MyContext & { match?: RegExpMatchArray }) => {
    await ctx.answerCbQuery()
    const userId = ctx.match?.[1] || ''
    const isRu = isRussianFromState(ctx)
    
    const subMenu = Markup.inlineKeyboard([
      [
        Markup.button.callback('NEUROPHOTO', `admin_set_sub_${userId}_NEUROPHOTO`),
        Markup.button.callback('NEUROVIDEO', `admin_set_sub_${userId}_NEUROVIDEO`)
      ],
      [
        Markup.button.callback('STARS', `admin_set_sub_${userId}_STARS`),
        Markup.button.callback('NEUROTESTER', `admin_set_sub_${userId}_NEUROTESTER`)
      ],
      [
        Markup.button.callback(
          isRu ? '🔙 Назад' : '🔙 Back',
          `admin_user_${userId}`
        )
      ]
    ])
    
    await ctx.reply(
      isRu
        ? '📅 Выберите тип подписки:'
        : '📅 Select subscription type:',
      subMenu
    )
  })
  
  // Установка подписки
  bot.action(/^admin_set_sub_(\d+)_(\w+)$/, requireAdmin(), async (ctx: MyContext & { match?: RegExpMatchArray }) => {
    await ctx.answerCbQuery()
    const userId = ctx.match?.[1] || ''
    const subType = (ctx.match?.[2] || '') as SubscriptionType
    const isRu = isRussianFromState(ctx)
    
    await ctx.reply(
      isRu
        ? `📅 Введите количество дней для подписки ${subType}:`
        : `📅 Enter number of days for ${subType} subscription:`
    )
    ctx.session.adminWaitingFor = 'subscription_days'
    ctx.session.adminTargetUser = userId
    ctx.session.adminTargetSubscription = subType
  })
  
  // Запрос на добавление звезд
  bot.action('admin_add_stars_prompt', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '📝 Введите команду в формате:\n/add_stars <user_id> <amount> [причина]\n\nПример: /add_stars 7007992081 1000 Бонус'
        : '📝 Enter command in format:\n/add_stars <user_id> <amount> [reason]\n\nExample: /add_stars 7007992081 1000 Bonus'
    )
  })
  
  // Запрос на управление подписками
  bot.action('admin_subscription_prompt', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '📝 Введите команду в формате:\n/set_subscription <user_id> <type> <days>\n\nТипы: NEUROPHOTO, NEUROVIDEO, STARS, NEUROTESTER\nПример: /set_subscription 7007992081 NEUROVIDEO 30'
        : '📝 Enter command in format:\n/set_subscription <user_id> <type> <days>\n\nTypes: NEUROPHOTO, NEUROVIDEO, STARS, NEUROTESTER\nExample: /set_subscription 7007992081 NEUROVIDEO 30'
    )
  })
  
  // Поиск пользователя
  bot.action('admin_find_user_prompt', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '🔍 Введите username пользователя (без @) или его Telegram ID:'
        : '🔍 Enter user\'s username (without @) or Telegram ID:'
    )
    ctx.session.adminWaitingFor = 'find_user'
  })
  
  // Рассылка
  bot.action('admin_broadcast_prompt', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '📢 Введите сообщение для рассылки всем пользователям:'
        : '📢 Enter message to broadcast to all users:'
    )
    ctx.session.adminWaitingFor = 'broadcast_message'
  })
  
  // История платежей
  bot.action(/^admin_payment_history_(\d+)$/, requireAdmin(), async (ctx: MyContext & { match?: RegExpMatchArray }) => {
    await ctx.answerCbQuery()
    const userId = ctx.match?.[1] || ''
    const isRu = isRussianFromState(ctx)
    
    try {
      const { data: payments } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (!payments || payments.length === 0) {
        await ctx.reply(
          isRu ? '📜 История платежей пуста' : '📜 Payment history is empty'
        )
        return
      }
      
      const history = payments.map(p => {
        const date = new Date(p.created_at).toLocaleDateString(isRu ? 'ru-RU' : 'en-US')
        const amount = p.stars || p.amount || 0
        const type = p.type
        const sub = p.subscription_type || '-'
        return `${date} | ${amount}⭐ | ${type} | ${sub}`
      }).join('\n')
      
      await ctx.reply(
        `📜 **${isRu ? 'История платежей' : 'Payment History'}**\n\n\`\`\`\n${history}\n\`\`\``,
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      logger.error('Error getting payment history', { error, userId })
      await ctx.reply(
        isRu ? '❌ Ошибка получения истории' : '❌ Error getting history'
      )
    }
  })
  
  // Системные настройки
  bot.action('admin_settings', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    
    const settingsMenu = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🔧 Режим обслуживания' : '🔧 Maintenance Mode',
          'admin_maintenance_toggle'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '📊 Экспорт данных' : '📊 Export Data',
          'admin_export_data'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '🔙 Назад' : '🔙 Back',
          'admin_main_menu'
        )
      ]
    ])
    
    await ctx.reply(
      isRu
        ? '⚙️ **Системные настройки**\n\nВыберите действие:'
        : '⚙️ **System Settings**\n\nSelect action:',
      { ...settingsMenu, parse_mode: 'Markdown' }
    )
  })
}

/**
 * Обработчик текстовых сообщений для админских операций
 */
export async function handleAdminTextInput(ctx: MyContext) {
  if (!ctx.session.adminWaitingFor) return false
  
  const isRu = isRussianFromState(ctx)
  const message = ctx.message
  if (!message || !('text' in message)) return false
  
  const text = message.text
  const waitingFor = ctx.session.adminWaitingFor
  
  try {
    switch (waitingFor) {
      case 'user_id':
        // Ввод ID пользователя для управления
        ctx.session.adminWaitingFor = undefined
        ctx.session.adminTargetUser = text
        // Симулируем команду /admin_user
        const fakeMessage = { ...ctx.message, text: `/admin_user ${text}` }
        const fakeCtx = { ...ctx, message: fakeMessage }
        await handleAdminUserCommand(fakeCtx as MyContext)
        return true
        
      case 'add_stars':
        // Добавление звезд
        if (!ctx.session.adminTargetUser) {
          await ctx.reply(isRu ? '❌ Не указан пользователь' : '❌ No user specified')
          ctx.session.adminWaitingFor = undefined
          return true
        }
        
        const starsAmount = parseFloat(text)
        if (isNaN(starsAmount) || starsAmount <= 0) {
          await ctx.reply(
            isRu ? '❌ Неверная сумма' : '❌ Invalid amount'
          )
          ctx.session.adminWaitingFor = undefined
          return true
        }
        
        const currentBalance = await getUserBalance(ctx.session.adminTargetUser)
        const starsResult = await updateUserBalance(
          ctx.session.adminTargetUser,
          starsAmount,
          PaymentType.MONEY_INCOME,
          `Admin top-up: Admin added by ${ctx.from?.username || ctx.from?.id}`,
          {
            bot_name: ctx.botInfo?.username || 'admin_system',
            service_type: 'admin_topup',
            payment_method: 'Admin',
            language: isRu ? 'ru' : 'en',
            operation_id: `admin-topup-${Date.now()}-${ctx.from?.id}`,
            admin_id: ctx.from?.id,
            admin_username: ctx.from?.username,
            reason: `Admin added by ${ctx.from?.username || ctx.from?.id}`,
            category: 'BONUS',
          }
        )
        
        if (starsResult) {
          await ctx.reply(
            isRu
              ? `✅ Добавлено ${starsAmount} ⭐ пользователю ${ctx.session.adminTargetUser}`
              : `✅ Added ${starsAmount} ⭐ to user ${ctx.session.adminTargetUser}`
          )
          
          // Уведомляем пользователя
          try {
            await ctx.telegram.sendMessage(
              ctx.session.adminTargetUser,
              isRu
                ? `🎁 Вам начислено ${starsAmount} ⭐`
                : `🎁 You received ${starsAmount} ⭐`
            )
          } catch (e) {
            logger.warn('Failed to notify user', { userId: ctx.session.adminTargetUser })
          }
        } else {
          await ctx.reply(
            isRu
              ? `❌ Ошибка при добавлении звезд`
              : `❌ Error adding stars`
          )
        }
        
        ctx.session.adminWaitingFor = undefined
        ctx.session.adminTargetUser = undefined
        return true
        
      case 'subscription_days':
        // Установка подписки
        if (!ctx.session.adminTargetUser || !ctx.session.adminTargetSubscription) {
          await ctx.reply(
            isRu ? '❌ Не указаны данные подписки' : '❌ Subscription data not specified'
          )
          ctx.session.adminWaitingFor = undefined
          return true
        }
        
        const days = parseInt(text, 10)
        if (isNaN(days) || days <= 0 || days > 365) {
          await ctx.reply(
            isRu ? '❌ Количество дней должно быть от 1 до 365' : '❌ Days must be between 1 and 365'
          )
          ctx.session.adminWaitingFor = undefined
          return true
        }
        
        const subResult = await adminRenewSubscription({
          telegram_id: ctx.session.adminTargetUser,
          subscription_type: ctx.session.adminTargetSubscription as SubscriptionType,
          duration_days: days,
          bot_name: ctx.botInfo?.username || 'admin_system',
          reason: `Admin set by ${ctx.from?.username || ctx.from?.id}`,
        })
        
        if (subResult.success) {
          await ctx.reply(
            isRu
              ? `✅ Подписка ${ctx.session.adminTargetSubscription} на ${days} дней установлена для ${ctx.session.adminTargetUser}`
              : `✅ Subscription ${ctx.session.adminTargetSubscription} for ${days} days set for ${ctx.session.adminTargetUser}`
          )
          
          // Уведомляем пользователя
          try {
            await ctx.telegram.sendMessage(
              ctx.session.adminTargetUser,
              isRu
                ? `🎉 Ваша подписка ${ctx.session.adminTargetSubscription} активирована на ${days} дней!`
                : `🎉 Your ${ctx.session.adminTargetSubscription} subscription activated for ${days} days!`
            )
          } catch (e) {
            logger.warn('Failed to notify user', { userId: ctx.session.adminTargetUser })
          }
        } else {
          await ctx.reply(
            isRu
              ? `❌ Ошибка: ${subResult.error}`
              : `❌ Error: ${subResult.error}`
          )
        }
        
        ctx.session.adminWaitingFor = undefined
        ctx.session.adminTargetUser = undefined
        ctx.session.adminTargetSubscription = undefined
        return true
        
      case 'find_user':
        // Поиск пользователя
        ctx.session.adminWaitingFor = undefined
        
        let searchQuery = text.replace('@', '').trim()
        
        // Поиск по username или ID
        const { data: users } = await supabase
          .from('users')
          .select('*')
          .or(`username.ilike.%${searchQuery}%,telegram_id.eq.${searchQuery}`)
          .limit(5)
        
        if (!users || users.length === 0) {
          await ctx.reply(
            isRu ? '❌ Пользователи не найдены' : '❌ No users found'
          )
          return true
        }
        
        const buttons = users.map(user => [
          Markup.button.callback(
            `${user.first_name || ''} ${user.last_name || ''} (@${user.username || 'no_username'}) - ${user.telegram_id}`,
            `admin_user_select_${user.telegram_id}`
          )
        ])
        
        buttons.push([
          Markup.button.callback(
            isRu ? '🔙 Назад' : '🔙 Back',
            'admin_main_menu'
          )
        ])
        
        await ctx.reply(
          isRu ? '🔍 Найденные пользователи:' : '🔍 Found users:',
          Markup.inlineKeyboard(buttons)
        )
        return true
        
      case 'broadcast_message':
        // Массовая рассылка
        ctx.session.adminWaitingFor = undefined
        
        const confirmMenu = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '✅ Отправить' : '✅ Send',
              'admin_broadcast_confirm'
            ),
            Markup.button.callback(
              isRu ? '❌ Отмена' : '❌ Cancel',
              'admin_broadcast_cancel'
            )
          ]
        ])
        
        ctx.session.broadcastMessage = text
        
        await ctx.reply(
          isRu
            ? `📢 **Подтвердите рассылку:**\n\n${text}\n\nОтправить всем пользователям?`
            : `📢 **Confirm broadcast:**\n\n${text}\n\nSend to all users?`,
          { ...confirmMenu, parse_mode: 'Markdown' }
        )
        return true
        
      default:
        return false
    }
  } catch (error) {
    logger.error('Error in admin text input', { error, waitingFor })
    await ctx.reply(
      isRu ? '❌ Произошла ошибка' : '❌ An error occurred'
    )
    ctx.session.adminWaitingFor = undefined
    return true
  }
}

/**
 * Дополнительные callback обработчики
 */
export function setupAdditionalCallbacks(bot: any) {
  // Выбор пользователя из поиска
  bot.action(/^admin_user_select_(\d+)$/, requireAdmin(), async (ctx: MyContext & { match?: RegExpMatchArray }) => {
    await ctx.answerCbQuery()
    const userId = ctx.match?.[1] || ''
    const fakeMessage = { text: `/admin_user ${userId}` }
    const fakeCtx = { ...ctx, message: fakeMessage }
    await handleAdminUserCommand(fakeCtx as MyContext)
  })
  
  // Подтверждение рассылки
  bot.action('admin_broadcast_confirm', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    
    if (!ctx.session.broadcastMessage) {
      await ctx.reply(
        isRu ? '❌ Сообщение не найдено' : '❌ Message not found'
      )
      return
    }
    
    const message = ctx.session.broadcastMessage
    ctx.session.broadcastMessage = undefined
    
    await ctx.reply(
      isRu ? '📤 Начинаю рассылку...' : '📤 Starting broadcast...'
    )
    
    try {
      // Получаем всех пользователей
      const { data: users } = await supabase
        .from('users')
        .select('telegram_id')
        .not('telegram_id', 'is', null)
      
      if (!users || users.length === 0) {
        await ctx.reply(
          isRu ? '❌ Пользователи не найдены' : '❌ No users found'
        )
        return
      }
      
      let sent = 0
      let failed = 0
      
      for (const user of users) {
        try {
          await ctx.telegram.sendMessage(user.telegram_id, message)
          sent++
        } catch (e) {
          failed++
          logger.warn('Failed to send broadcast', { userId: user.telegram_id })
        }
        
        // Задержка между сообщениями для избежания лимитов
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      await ctx.reply(
        isRu
          ? `✅ Рассылка завершена!\n\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`
          : `✅ Broadcast completed!\n\n📤 Sent: ${sent}\n❌ Failed: ${failed}`
      )
    } catch (error) {
      logger.error('Broadcast error', { error })
      await ctx.reply(
        isRu ? '❌ Ошибка рассылки' : '❌ Broadcast error'
      )
    }
  })
  
  // Отмена рассылки
  bot.action('admin_broadcast_cancel', requireAdmin(), async (ctx: MyContext) => {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)
    ctx.session.broadcastMessage = undefined
    await ctx.reply(
      isRu ? '❌ Рассылка отменена' : '❌ Broadcast cancelled'
    )
  })
}