/**
 * Feature Guard - Централизованная проверка доступа к платным функциям
 *
 * Поток:
 * 1. Показать справку (если пользователь видит функцию первый раз)
 * 2. Проверить баланс
 * 3. Если недостаточно - показать стоимость и кнопку пополнения
 * 4. Если достаточно - разрешить вход в сцену
 */

import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import {
  hasUserSeenFeature,
  markFeatureAsSeen,
} from '@/core/supabase/featureViews'
import {
  FEATURE_INFO,
  formatFeatureHelp,
  getFeatureMinCost,
  isFeaturePaid,
} from '@/helpers/featureInfo'
import { logger } from '@/utils/logger'

export interface FeatureAccessResult {
  allowed: boolean
  reason?: 'insufficient_balance' | 'feature_not_found' | 'error'
  balance?: number
  requiredCost?: number
}

/**
 * Проверка доступа к платной функции
 *
 * @param ctx - Telegram контекст
 * @param mode - Режим/функция (ModeEnum)
 * @returns true если доступ разрешён, false если нет
 */
export async function checkFeatureAccess(
  ctx: MyContext,
  mode: ModeEnum
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString()
  const isRu = isRussianFromState(ctx)

  if (!telegramId) {
    logger.error('❌ [featureGuard] No telegram ID in context')
    return false
  }

  // Проверить, есть ли информация о функции
  const info = FEATURE_INFO[mode]

  if (!info) {
    // Если нет информации - пропускаем проверку (возможно бесплатная функция)
    logger.warn('⚠️ [featureGuard] No feature info for mode', { mode })
    return true
  }

  // Если функция бесплатная - пропускаем
  if (!info.isPaid) {
    return true
  }

  try {
    // 1. Проверить, видел ли пользователь справку
    const hasSeenHelp = await hasUserSeenFeature(telegramId, mode)

    if (!hasSeenHelp) {
      // Показать справку ПЕРВЫЙ РАЗ
      const helpMessage = formatFeatureHelp(info, isRu)
      await ctx.reply(helpMessage, { parse_mode: 'HTML' })

      // Отметить что пользователь видел справку
      await markFeatureAsSeen(telegramId, mode)

      logger.info('📖 [featureGuard] First-time help shown', {
        telegramId,
        mode,
      })
    }

    // 2. Проверить баланс
    const balance = await getUserBalance(telegramId)
    const requiredCost = info.minCost

    logger.info('💰 [featureGuard] Balance check', {
      telegramId,
      mode,
      balance,
      requiredCost,
    })

    if (balance < requiredCost) {
      // Недостаточно средств - показать сообщение
      const costText =
        info.maxCost && info.maxCost !== requiredCost
          ? `${requiredCost}–${info.maxCost}⭐`
          : `${requiredCost}⭐`

      const message = isRu
        ? `⚠️ <b>Недостаточно средств</b>\n\n` +
          `У вас: <b>${balance}⭐</b>\n` +
          `Требуется: <b>${costText}</b>\n\n` +
          `Пополните баланс для использования этой функции.`
        : `⚠️ <b>Insufficient funds</b>\n\n` +
          `You have: <b>${balance}⭐</b>\n` +
          `Required: <b>${costText}</b>\n\n` +
          `Top up your balance to use this feature.`

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '💳 Пополнить баланс' : '💳 Top up balance',
              'go_to_balance_topup'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🏠 Главное меню' : '🏠 Main Menu',
              'go_to_main_menu'
            ),
          ],
        ]).reply_markup,
      })

      logger.info('❌ [featureGuard] Access denied - insufficient balance', {
        telegramId,
        mode,
        balance,
        requiredCost,
      })

      return false
    }

    // 3. Баланс достаточен - разрешить доступ
    logger.info('✅ [featureGuard] Access granted', {
      telegramId,
      mode,
      balance,
    })

    return true
  } catch (error) {
    logger.error('❌ [featureGuard] Error checking access', {
      telegramId,
      mode,
      error: error instanceof Error ? error.message : String(error),
    })

    // При ошибке - разрешаем доступ чтобы не блокировать пользователя
    return true
  }
}

/**
 * Проверка только баланса (без справки)
 * Для использования внутри сцен
 */
export async function checkBalanceOnly(
  ctx: MyContext,
  mode: ModeEnum
): Promise<FeatureAccessResult> {
  const telegramId = ctx.from?.id?.toString()

  if (!telegramId) {
    return { allowed: false, reason: 'error' }
  }

  const requiredCost = getFeatureMinCost(mode)

  if (requiredCost === 0) {
    return { allowed: true }
  }

  try {
    const balance = await getUserBalance(telegramId)

    if (balance < requiredCost) {
      return {
        allowed: false,
        reason: 'insufficient_balance',
        balance,
        requiredCost,
      }
    }

    return { allowed: true, balance, requiredCost }
  } catch {
    return { allowed: true } // При ошибке разрешаем
  }
}

/**
 * Показать сообщение о недостатке средств
 */
export async function showInsufficientBalanceMessage(
  ctx: MyContext,
  balance: number,
  requiredCost: number
): Promise<void> {
  const isRu = isRussianFromState(ctx)

  const message = isRu
    ? `⚠️ <b>Недостаточно средств</b>\n\n` +
      `У вас: <b>${balance}⭐</b>\n` +
      `Требуется: <b>${requiredCost}⭐</b>`
    : `⚠️ <b>Insufficient funds</b>\n\n` +
      `You have: <b>${balance}⭐</b>\n` +
      `Required: <b>${requiredCost}⭐</b>`

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '💳 Пополнить баланс' : '💳 Top up balance',
          'go_to_balance_topup'
        ),
      ],
    ]).reply_markup,
  })
}
