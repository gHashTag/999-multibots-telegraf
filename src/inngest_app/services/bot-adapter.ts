/**
 * Bot Adapter for Inngest Functions
 * Adapts ai-server bot patterns to current multibots-telegraf bot system
 */

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { bots, getBotByName } from '@/core/bot'

export interface BotAdapter {
  bot: Telegraf<MyContext>
  error?: string | null
}

export interface UserBalanceResult {
  success: boolean
  currentBalance?: number
  error?: string
}

/**
 * Get bot instance by name (compatible with ai-server pattern)
 */
export function getBotByNameAdapter(bot_name: string): BotAdapter {
  try {
    const result = getBotByName(bot_name)
    if (result.error || !result.bot) {
      return {
        bot: undefined as any,
        error: result.error || 'Bot not found'
      }
    }
    return {
      bot: result.bot,
      error: null
    }
  } catch (error) {
    return {
      bot: undefined as any,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get user balance from current system
 */
export async function getUserBalanceAdapter(
  telegram_id: string,
  bot_name: string
): Promise<UserBalanceResult> {
  try {
    const { getUserBalance } = await import('@/core/supabase')
    const balance = await getUserBalance(telegram_id)

    if (balance === null || balance === undefined) {
      return {
        success: false,
        error: 'User not found or balance unavailable'
      }
    }

    return {
      success: true,
      currentBalance: balance
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Process balance operation (compatible with ai-server pattern)
 */
export async function processBalanceOperationAdapter({
  telegram_id,
  paymentAmount,
  is_ru,
  bot_name,
}: {
  telegram_id: string
  paymentAmount: number
  is_ru: boolean
  bot_name: string
}): Promise<{
  success: boolean
  currentBalance?: number
  error?: string
}> {
  try {
    const { updateUserBalance } = await import('@/core/supabase/updateUserBalance')
    const { PaymentType } = await import('@/interfaces/payments.interface')

    // Check balance first
    const balanceCheck = await getUserBalanceAdapter(telegram_id, bot_name)

    if (!balanceCheck.success || !balanceCheck.currentBalance) {
      return {
        success: false,
        error: is_ru
          ? '❌ Ошибка проверки баланса'
          : '❌ Balance check failed'
      }
    }

    if (balanceCheck.currentBalance < paymentAmount) {
      return {
        success: false,
        currentBalance: balanceCheck.currentBalance,
        error: is_ru
          ? `❌ Недостаточно средств. Нужно: ${paymentAmount} ⭐️, У вас: ${balanceCheck.currentBalance} ⭐️`
          : `❌ Insufficient funds. Required: ${paymentAmount} ⭐️, You have: ${balanceCheck.currentBalance} ⭐️`
      }
    }

    // Deduct balance
    const success = await updateUserBalance(
      telegram_id,
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      `Inngest operation (${bot_name})`,
      {
        stars: paymentAmount,
        payment_method: 'Internal',
        bot_name: bot_name,
        language: is_ru ? 'ru' : 'en',
        service_type: 'inngest_operation',
        category: 'REAL',
        cost: paymentAmount / 1.5
      }
    )

    if (!success) {
      return {
        success: false,
        error: is_ru
          ? '❌ Ошибка списания средств'
          : '❌ Failed to deduct balance'
      }
    }

    // Get new balance
    const newBalanceCheck = await getUserBalanceAdapter(telegram_id, bot_name)

    return {
      success: true,
      currentBalance: newBalanceCheck.currentBalance
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get user by Telegram ID (compatible with ai-server pattern)
 */
export async function getUserByTelegramIdAdapter(telegram_id: string): Promise<any> {
  try {
    const { getUserByTelegramId } = await import('@/core/supabase')
    return await getUserByTelegramId(telegram_id)
  } catch (error) {
    return null
  }
}

/**
 * Update user level (compatible with ai-server pattern)
 */
export async function updateUserLevelPlusOneAdapter(
  telegram_id: string,
  currentLevel: number
): Promise<boolean> {
  try {
    const { updateUserLevelPlusOne } = await import('@/core/supabase')
    await updateUserLevelPlusOne(telegram_id, currentLevel)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Update user balance (compatible with ai-server pattern)
 */
export async function updateUserBalanceAdapter(
  telegram_id: string,
  amount: number,
  type: any,
  description: string,
  metadata?: any
): Promise<boolean> {
  try {
    const { updateUserBalance } = await import('@/core/supabase/updateUserBalance')
    return await updateUserBalance(
      telegram_id,
      amount,
      type,
      description,
      metadata
    )
  } catch (error) {
    return false
  }
}
