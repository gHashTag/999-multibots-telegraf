import { MyContext } from '@/interfaces'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// Список админов берётся из ОДНОГО источника — переменной ADMIN_IDS через
// config. Раньше здесь лежал свой захардкоженный массив из четырёх ID, и
// «можно вынести в конфиг» в комментарии никто не выполнил.
//
// Расхождение было реальным: в проде ADMIN_IDS содержит ПЯТЬ идентификаторов,
// и 435572800 в захардкоженный список не входил. Этот человек был админом
// везде, кроме команд из этого файла, — и получал отказ без объяснения, потому
// что для него это выглядело как обычная ошибка доступа.
//
// Побочный эффект осознанный: если ADMIN_IDS не задана, массив пуст и
// админских прав нет НИ У КОГО. Для привилегий это верное поведение — отказ по
// умолчанию, — а факт пустого списка виден в логе config при старте.

// Кэш для предотвращения дублирования операций
const operationCache = new Map<string, number>()
const OPERATION_CACHE_TTL = 5000 // 5 секунд

/**
 * Проверяет, является ли пользователь админом
 */
function isAdmin(telegramId: number): boolean {
  return ADMIN_IDS_ARRAY.includes(telegramId)
}

/**
 * Команда для пополнения/списания баланса пользователя
 * Использование: /addbalance <user_id> <amount> [причина]
 */
export async function handleAddBalanceCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  // Проверяем права админа
  if (!ctx.from?.id || !isAdmin(ctx.from.id)) {
    await ctx.reply(
      isRu
        ? '❌ У вас нет прав для выполнения этой команды'
        : '❌ You do not have permission to execute this command'
    )
    return
  }

  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu ? '❌ Неверный формат команды' : '❌ Invalid command format'
    )
    return
  }

  const parts = message.text.split(' ')
  if (parts.length < 3) {
    await ctx.reply(
      isRu
        ? `📝 Использование: /addbalance <user_id> <amount> [причина]

Примеры:
• /addbalance 484954118 1000 Бонус за активность
• /addbalance 484954118 -500 Корректировка баланса

💡 Положительные числа - пополнение, отрицательные - списание`
        : `📝 Usage: /addbalance <user_id> <amount> [reason]

Examples:
• /addbalance 484954118 1000 Activity bonus
• /addbalance 484954118 -500 Balance correction

💡 Positive numbers - add balance, negative - deduct balance`
    )
    return
  }

  const targetUserId = parts[1]
  const amount = parseFloat(parts[2])
  const reason =
    parts.slice(3).join(' ') ||
    (isRu ? 'Пополнение администратором' : 'Admin top-up')

  // Валидация
  if (isNaN(amount) || amount === 0) {
    await ctx.reply(
      isRu
        ? '❌ Неверная сумма. Укажите число (положительное для пополнения, отрицательное для списания)'
        : '❌ Invalid amount. Please specify a number (positive to add, negative to deduct)'
    )
    return
  }

  if (Math.abs(amount) > 10000) {
    await ctx.reply(
      isRu
        ? // promise-checked: the ceiling is the comparison three lines above, in this same guard
          '❌ Максимальная сумма операции: 10,000 ⭐'
        : '❌ Maximum operation amount: 10,000 ⭐'
    )
    return
  }

  // ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ОПЕРАЦИЙ
  const operationKey = `${ctx.from.id}-${targetUserId}-${amount}-${Date.now()
    .toString()
    .slice(0, -3)}` // Округляем до секунд
  const now = Date.now()

  // Проверяем, была ли такая операция недавно
  if (operationCache.has(operationKey)) {
    const lastOperation = operationCache.get(operationKey)!
    if (now - lastOperation < OPERATION_CACHE_TTL) {
      logger.warn('🚫 Предотвращено дублирование операции addbalance', {
        admin_id: ctx.from.id,
        target_user_id: targetUserId,
        amount: amount,
        operation_key: operationKey,
        time_since_last: now - lastOperation,
      })

      await ctx.reply(
        isRu
          ? '⚠️ Операция уже выполняется. Подождите несколько секунд.'
          : '⚠️ Operation is already in progress. Please wait a few seconds.'
      )
      return
    }
  }

  // Записываем операцию в кэш
  operationCache.set(operationKey, now)

  // Очищаем старые записи из кэша
  for (const [key, timestamp] of operationCache.entries()) {
    if (now - timestamp > OPERATION_CACHE_TTL) {
      operationCache.delete(key)
    }
  }

  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(targetUserId)

    // Определяем тип операции и абсолютную сумму
    const isDeduction = amount < 0
    const absoluteAmount = Math.abs(amount)
    const operationType = isDeduction
      ? PaymentType.MONEY_OUTCOME
      : PaymentType.MONEY_INCOME
    const operationText = isDeduction
      ? isRu
        ? 'списываю'
        : 'deducting'
      : isRu
        ? 'пополняю'
        : 'adding'

    await ctx.reply(
      isRu
        ? `⏳ ${operationText} ${absoluteAmount} ⭐ ${
            isDeduction ? 'с' : ''
          } баланса пользователя ${targetUserId}...`
        : `⏳ ${operationText} ${absoluteAmount} ⭐ ${
            isDeduction ? 'from' : 'to'
          } user ${targetUserId} balance...`
    )

    // Выполняем операцию с балансом
    const result = await updateUserBalance(
      targetUserId,
      absoluteAmount,
      operationType,
      `Admin balance ${isDeduction ? 'deduction' : 'top-up'}: ${reason}`,
      {
        bot_name: ctx.botInfo?.username || 'admin_system',
        service_type: isDeduction ? 'admin_deduction' : 'admin_topup',
        payment_method: 'Admin',
        language: isRu ? 'ru' : 'en',
        operation_id: `admin-${
          isDeduction ? 'deduct' : 'topup'
        }-${Date.now()}-${ctx.from.id}`,
        admin_id: ctx.from.id,
        admin_username: ctx.from.username,
        reason: reason,
        category: 'BONUS',
      }
    )

    if (result) {
      const newBalance = await getUserBalance(targetUserId)

      // Логируем операцию
      logger.info('💰 Admin balance operation completed', {
        admin_id: ctx.from.id,
        admin_username: ctx.from.username,
        target_user_id: targetUserId,
        amount: amount,
        reason: reason,
        balance_before: currentBalance,
        balance_after: newBalance,
        operation_key: operationKey,
      })

      await ctx.reply(
        isRu
          ? `✅ Баланс успешно ${isDeduction ? 'скорректирован' : 'пополнен'}!

👤 Пользователь: ${targetUserId}
💰 Было: ${currentBalance} ⭐
💰 Стало: ${newBalance} ⭐
${isDeduction ? '➖ Списано' : '➕ Добавлено'}: ${absoluteAmount} ⭐
📝 Причина: ${reason}

👨‍💼 Администратор: ${ctx.from.username || ctx.from.id}`
          : `✅ Balance successfully ${isDeduction ? 'deducted' : 'added'}!

👤 User: ${targetUserId}
💰 Was: ${currentBalance} ⭐
💰 Now: ${newBalance} ⭐
${isDeduction ? '➖ Deducted' : '➕ Added'}: ${absoluteAmount} ⭐
📝 Reason: ${reason}

👨‍💼 Administrator: ${ctx.from.username || ctx.from.id}`
      )
    } else {
      await ctx.reply(
        isRu
          ? '❌ Ошибка при изменении баланса. Проверьте логи.'
          : '❌ Error changing balance. Check logs.'
      )
    }
  } catch (error) {
    logger.error('❌ Error in admin balance operation', {
      admin_id: ctx.from.id,
      target_user_id: targetUserId,
      amount: amount,
      operation_key: operationKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    await ctx.reply(
      isRu
        ? `❌ Произошла ошибка: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ An error occurred: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  } finally {
    // Удаляем операцию из кэша через некоторое время
    setTimeout(() => {
      operationCache.delete(operationKey)
    }, OPERATION_CACHE_TTL)
  }
}

/**
 * Команда для проверки баланса пользователя
 * Использование: /checkbalance <user_id>
 */
export async function handleCheckBalanceCommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  // Проверяем права админа
  if (!ctx.from?.id || !isAdmin(ctx.from.id)) {
    await ctx.reply(
      isRu
        ? '❌ У вас нет прав для выполнения этой команды'
        : '❌ You do not have permission to execute this command'
    )
    return
  }

  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu ? '❌ Неверный формат команды' : '❌ Invalid command format'
    )
    return
  }

  const parts = message.text.split(' ')
  if (parts.length < 2) {
    await ctx.reply(
      isRu
        ? '📝 Использование: /checkbalance <user_id>'
        : '📝 Usage: /checkbalance <user_id>'
    )
    return
  }

  const targetUserId = parts[1]

  try {
    const balance = await getUserBalance(targetUserId)

    await ctx.reply(
      isRu
        ? `💰 Баланс пользователя ${targetUserId}: ${balance} ⭐`
        : `💰 User ${targetUserId} balance: ${balance} ⭐`
    )
  } catch (error) {
    await ctx.reply(
      isRu
        ? `❌ Ошибка получения баланса: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ Error getting balance: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}
