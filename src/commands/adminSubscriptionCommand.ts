/**
 * ADMIN SUBSCRIPTION MANAGEMENT COMMAND
 * 
 * Provides admin tools for:
 * - Checking user subscription status
 * - Force-refreshing user sessions
 * - Creating manual subscription overrides
 * - Diagnosing subscription issues
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { supabase } from '@/core/supabase'
import { Markup } from 'telegraf'

/**
 * Admin command for subscription management
 * Usage: /admin_sub check|refresh|override|diagnose [user_id] [subscription_type?]
 */
export async function adminSubscriptionCommand(ctx: MyContext) {
  const userId = ctx.from?.id
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  
  // Check admin permissions
  if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
    await ctx.reply('❌ У вас нет прав для использования этой команды.')
    return
  }

  const args = messageText.split(' ').slice(1) // Remove /admin_sub
  const [action, targetUserId, subscriptionTypeArg] = args

  if (!action || !targetUserId) {
    await ctx.reply(`
🔧 <b>Админ команды для управления подписками</b>

<code>/admin_sub check [user_id]</code> - Проверить статус подписки
<code>/admin_sub refresh [user_id]</code> - Принудительно обновить сессию
<code>/admin_sub override [user_id] [NEUROVIDEO|NEUROPHOTO|NEUROTESTER]</code> - Создать подписку вручную
<code>/admin_sub diagnose [user_id]</code> - Полная диагностика

<b>Пример:</b>
<code>/admin_sub check 321330903</code>
<code>/admin_sub override 321330903 NEUROVIDEO</code>
    `, { parse_mode: 'HTML' })
    return
  }

  logger.info(`[AdminSubCommand] ${action} requested for user ${targetUserId}`, {
    adminId: userId,
    targetUser: targetUserId,
    action,
  })

  try {
    switch (action) {
      case 'check':
        await handleCheckSubscription(ctx, targetUserId)
        break
      case 'refresh':
        await handleRefreshUserSession(ctx, targetUserId)
        break
      case 'override':
        await handleCreateOverride(ctx, targetUserId, subscriptionTypeArg as SubscriptionType)
        break
      case 'diagnose':
        await handleDiagnoseUser(ctx, targetUserId)
        break
      default:
        await ctx.reply('❌ Неизвестная команда. Используйте: check, refresh, override, diagnose')
    }
  } catch (error) {
    logger.error('[AdminSubCommand] Error executing command', {
      error,
      action,
      targetUserId,
      adminId: userId,
    })
    await ctx.reply(`❌ Ошибка выполнения команды: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check user subscription status
 */
async function handleCheckSubscription(ctx: MyContext, targetUserId: string) {
  await ctx.reply('🔍 Проверяю статус подписки...')

  const userDetails = await getUserDetailsSubscription(targetUserId)
  
  const statusMessage = `
📊 <b>Статус подписки пользователя ${targetUserId}</b>

👤 <b>Существует в системе:</b> ${userDetails.isExist ? '✅ Да' : '❌ Нет'}
⭐ <b>Баланс:</b> ${userDetails.stars} звёзд
📋 <b>Тип подписки:</b> ${userDetails.subscriptionType || 'Нет'}
🔑 <b>Активна:</b> ${userDetails.isSubscriptionActive ? '✅ Да' : '❌ Нет'}
📅 <b>Дата начала:</b> ${userDetails.subscriptionStartDate ? new Date(userDetails.subscriptionStartDate).toLocaleString('ru-RU') : 'Не указана'}

<b>Статус:</b> ${userDetails.isSubscriptionActive ? '🟢 ВСЁ В ПОРЯДКЕ' : '🔴 ТРЕБУЕТ ВНИМАНИЯ'}
  `

  await ctx.reply(statusMessage, { 
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Обновить сессию', `refresh_${targetUserId}`)],
      [Markup.button.callback('🔧 Создать подписку', `override_${targetUserId}`)],
      [Markup.button.callback('🩺 Диагностика', `diagnose_${targetUserId}`)],
    ]).reply_markup
  })
}

/**
 * Force refresh user session (clear cache, reset state)
 */
async function handleRefreshUserSession(ctx: MyContext, targetUserId: string) {
  await ctx.reply('🔄 Принудительно обновляю пользовательскую сессию...')

  try {
    // Clear any cached subscription data (if we had Redis, we'd clear it here)
    
    // Force re-check subscription
    const refreshedDetails = await getUserDetailsSubscription(targetUserId)
    
    // Log the refresh
    logger.info(`[AdminSubCommand] User session refreshed`, {
      targetUserId,
      refreshedSubscription: refreshedDetails.subscriptionType,
      isActive: refreshedDetails.isSubscriptionActive,
      adminId: ctx.from?.id,
    })

    await ctx.reply(`✅ <b>Сессия обновлена!</b>

Новый статус:
📋 Подписка: ${refreshedDetails.subscriptionType || 'Нет'}
🔑 Активна: ${refreshedDetails.isSubscriptionActive ? 'Да' : 'Нет'}
⭐ Баланс: ${refreshedDetails.stars} звёзд

💡 <b>Рекомендации для пользователя:</b>
1. Перезапустить бота командой /start
2. Попробовать команду /menu
3. При необходимости - перезапустить Telegram
    `, { parse_mode: 'HTML' })

  } catch (error) {
    logger.error('[AdminSubCommand] Error refreshing user session', {
      error,
      targetUserId,
    })
    await ctx.reply('❌ Ошибка при обновлении сессии')
  }
}

/**
 * Create manual subscription override
 */
async function handleCreateOverride(ctx: MyContext, targetUserId: string, subscriptionType?: SubscriptionType) {
  if (!subscriptionType) {
    await ctx.reply(`❌ Укажите тип подписки: NEUROVIDEO, NEUROPHOTO или NEUROTESTER
    
Пример: <code>/admin_sub override ${targetUserId} NEUROVIDEO</code>`, 
    { parse_mode: 'HTML' })
    return
  }

  if (!Object.values(SubscriptionType).includes(subscriptionType)) {
    await ctx.reply('❌ Неверный тип подписки. Используйте: NEUROVIDEO, NEUROPHOTO, NEUROTESTER')
    return
  }

  await ctx.reply('🔧 Создаю подписку вручную...')

  try {
    const override = await createSuccessfulPayment({
      telegram_id: targetUserId,
      amount: 0,
      type: 'subscription_override',
      description: `Manual subscription override: ${subscriptionType}`,
      bot_name: 'admin_tools',
      service_type: 'subscription',
      model_name: 'manual_override',
      payment_method: 'ADMIN_OVERRIDE',
      metadata: {
        manual_override: true,
        created_by_admin: ctx.from?.id,
        created_at: new Date().toISOString(),
        reason: 'Admin subscription override',
        original_subscription_type: subscriptionType,
      },
      inv_id: `admin_override_${targetUserId}_${Date.now()}`,
      stars: 0,
      status: PaymentStatus.COMPLETED,
      currency: Currency.RUB,
    })

    if (override) {
      // Update subscription type
      await supabase
        .from('payments_v2')
        .update({ 
          subscription_type: subscriptionType,
          payment_date: new Date().toISOString()
        })
        .eq('id', override.id)

      logger.info(`[AdminSubCommand] Manual subscription override created`, {
        targetUserId,
        subscriptionType,
        paymentId: override.id,
        adminId: ctx.from?.id,
      })

      // Verify the override worked
      const verifyDetails = await getUserDetailsSubscription(targetUserId)

      await ctx.reply(`✅ <b>Подписка создана успешно!</b>

👤 Пользователь: ${targetUserId}
📋 Тип: ${subscriptionType}
🆔 ID платежа: ${override.id}

<b>Проверка:</b>
🔑 Активна: ${verifyDetails.isSubscriptionActive ? '✅ Да' : '❌ Нет'}
📊 Статус: ${verifyDetails.subscriptionType}

💡 <b>Пользователю нужно:</b>
1. Выполнить /start в боте
2. Проверить доступ к функциям
      `, { parse_mode: 'HTML' })

    } else {
      throw new Error('Failed to create payment override')
    }

  } catch (error) {
    logger.error('[AdminSubCommand] Error creating subscription override', {
      error,
      targetUserId,
      subscriptionType,
    })
    await ctx.reply('❌ Не удалось создать подписку. Проверьте логи.')
  }
}

/**
 * Full user diagnostics
 */
async function handleDiagnoseUser(ctx: MyContext, targetUserId: string) {
  await ctx.reply('🩺 Запускаю полную диагностику...')

  try {
    // Check user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', targetUserId)
      .maybeSingle()

    // Get payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(5)

    // Get subscription details
    const userDetails = await getUserDetailsSubscription(targetUserId)

    const diagnosticReport = `
🩺 <b>ДИАГНОСТИЧЕСКИЙ ОТЧЁТ</b>
Пользователь: ${targetUserId}

<b>📊 СИСТЕМА:</b>
👤 Пользователь в БД: ${userData ? '✅ Найден' : '❌ Не найден'}
🆔 ID пользователя: ${userData?.id || 'N/A'}
📅 Создан: ${userData?.created_at ? new Date(userData.created_at).toLocaleString('ru-RU') : 'N/A'}

<b>💳 ПЛАТЕЖИ (последние 5):</b>
${payments?.map((p, i) => 
  `${i+1}. [${new Date(p.created_at).toLocaleDateString('ru-RU')}] ${p.subscription_type || 'N/A'} - ${p.status} - ${p.amount}`
).join('\n') || 'Нет платежей'}

<b>🔑 ПОДПИСКА:</b>
Тип: ${userDetails.subscriptionType || 'Нет'}
Активна: ${userDetails.isSubscriptionActive ? '✅ Да' : '❌ Нет'}
Баланс: ${userDetails.stars} ⭐
Дата: ${userDetails.subscriptionStartDate ? new Date(userDetails.subscriptionStartDate).toLocaleString('ru-RU') : 'N/A'}

<b>🎯 ДОСТУПНЫЕ ФУНКЦИИ:</b>
${userDetails.subscriptionType === SubscriptionType.NEUROVIDEO ? 
  '✅ Все функции доступны' : 
  userDetails.subscriptionType === SubscriptionType.NEUROPHOTO ? 
  '⚠️ Ограниченный доступ (только фото)' :
  '❌ Базовый доступ'}

<b>💡 РЕКОМЕНДАЦИИ:</b>
${userDetails.isSubscriptionActive ? 
  '🟢 Всё в порядке. Если пользователь не может получить доступ:\n• Выполнить /start\n• Перезапустить Telegram\n• Проверить правильный ли бот' :
  '🔴 Нет активной подписки:\n• Проверить обработку платежей\n• Создать подписку вручную\n• Связаться с пользователем'}
    `

    await ctx.reply(diagnosticReport, { parse_mode: 'HTML' })

    logger.info(`[AdminSubCommand] Full diagnostics completed`, {
      targetUserId,
      hasUser: !!userData,
      paymentsCount: payments?.length || 0,
      subscriptionActive: userDetails.isSubscriptionActive,
      adminId: ctx.from?.id,
    })

  } catch (error) {
    logger.error('[AdminSubCommand] Error in user diagnostics', {
      error,
      targetUserId,
    })
    await ctx.reply('❌ Ошибка при выполнении диагностики')
  }
}

/**
 * Handle inline button callbacks for admin subscription management
 */
export async function handleAdminSubscriptionCallback(ctx: MyContext) {
  const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
  
  if (!callbackData.startsWith('refresh_') && !callbackData.startsWith('override_') && !callbackData.startsWith('diagnose_')) {
    return false
  }

  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
    await ctx.answerCbQuery('❌ Нет прав доступа')
    return true
  }

  const [action, targetUserId] = callbackData.split('_')
  
  try {
    switch (action) {
      case 'refresh':
        await handleRefreshUserSession(ctx, targetUserId)
        break
      case 'override':
        await ctx.reply(`Создание подписки для ${targetUserId}:
        
<code>/admin_sub override ${targetUserId} NEUROVIDEO</code>
<code>/admin_sub override ${targetUserId} NEUROPHOTO</code>
<code>/admin_sub override ${targetUserId} NEUROTESTER</code>`, 
        { parse_mode: 'HTML' })
        break
      case 'diagnose':
        await handleDiagnoseUser(ctx, targetUserId)
        break
    }
    
    await ctx.answerCbQuery('✅ Выполнено')
    return true
    
  } catch (error) {
    logger.error('[AdminSubCallback] Error handling callback', {
      error,
      callbackData,
      userId,
    })
    await ctx.answerCbQuery('❌ Ошибка выполнения')
    return true
  }
}