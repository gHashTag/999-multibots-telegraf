/**
 * BalanceOperationProcessor - унифицированный обработчик операций с балансом
 *
 * Консолидирует дублированную логику из:
 * - processBalanceOperation.ts
 * - processBalanceVideoOperation.ts
 * - processServiceBalanceOperation.ts
 *
 * Цель: устранить ~455 строк дублированного кода
 */

import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/enhancedLogger'
import { ModeEnum } from '@/interfaces'
import { Telegraf } from 'telegraf'

/**
 * Параметры для обработки операции с балансом
 */
export interface BalanceOperationParams {
  // Обязательные параметры
  telegram_id: string | number
  paymentAmount: number
  is_ru: boolean
  bot_name: string

  // Опциональные параметры
  ctx?: MyContext
  description?: string
  service_type?: ModeEnum | string
  model_name?: string
  metadata?: Record<string, any>
  bot?: Telegraf<MyContext>

  // Специальные флаги
  bypass_payment_check?: boolean // Для лидмагнетов (бесплатное использование)
}

/**
 * Класс для обработки операций с балансом
 */
export class BalanceOperationProcessor {
  /**
   * Обрабатывает операцию с балансом
   * Унифицированный метод для всех типов операций
   */
  static async processOperation(
    params: BalanceOperationParams
  ): Promise<BalanceOperationResult> {
    const {
      telegram_id,
      paymentAmount,
      is_ru,
      bot_name,
      ctx,
      description = 'Payment operation',
      service_type,
      model_name,
      metadata = {},
      bot,
      bypass_payment_check = false,
    } = params

    // Нормализуем telegram_id к строке
    const telegramIdStr =
      typeof telegram_id === 'number' ? telegram_id.toString() : telegram_id
    const telegramIdNum =
      typeof telegram_id === 'number' ? telegram_id : Number(telegram_id)

    logger.info('🔄 Processing balance operation:', {
      telegram_id: telegramIdStr,
      paymentAmount,
      service_type,
      model_name,
      bypass_payment_check,
    })

    // 🎁 ЛИДМАГНЕТ: Проверяем флаг обхода платежа
    if (bypass_payment_check || ctx?.session?.bypass_payment_check) {
      logger.info('🎁 [LEAD MAGNET] Bypassing payment check - FREE usage!', {
        telegram_id: telegramIdStr,
        bypassFlag: bypass_payment_check || ctx?.session?.bypass_payment_check,
      })

      // Получаем текущий баланс для отображения (но не списываем)
      const currentBalance = await getUserBalance(telegramIdStr)

      return {
        newBalance: currentBalance, // Баланс НЕ изменился
        success: true, // Операция успешна
        modePrice: paymentAmount, // Обычная цена (для статистики)
        paymentAmount: 0, // РЕАЛЬНО списано 0
        currentBalance,
      }
    }

    try {
      // 1. Получаем текущий баланс
      logger.info('💰 Fetching current balance for:', { telegram_id: telegramIdStr })
      const currentBalance = await getUserBalance(telegramIdStr)
      logger.info('💰 Current balance fetched:', {
        telegram_id: telegramIdStr,
        currentBalance,
      })

      // 2. Проверяем достаточность средств
      if (currentBalance < paymentAmount) {
        const message = is_ru
          ? 'Недостаточно средств на балансе. Пополните баланс в главном меню.'
          : 'Insufficient funds. Top up your balance in the main menu.'

        logger.warn('❌ Insufficient funds:', {
          telegram_id: telegramIdStr,
          currentBalance,
          paymentAmount,
        })

        // Отправляем сообщение пользователю
        await this.sendMessage(ctx, bot, telegramIdNum, message)

        return {
          newBalance: currentBalance,
          success: false,
          error: message,
          modePrice: paymentAmount,
          paymentAmount: paymentAmount,
          currentBalance,
        }
      }

      // 3. Рассчитываем новый баланс
      const newBalance = Number(currentBalance) - Number(paymentAmount)

      // 4. Обновляем баланс в БД
      logger.info('💳 Updating balance with details:', {
        telegram_id: telegramIdStr,
        paymentAmount,
        bot_name,
        service_type,
        model_name,
      })

      const updateSuccess = await updateUserBalance(
        telegramIdStr,
        paymentAmount,
        PaymentType.MONEY_OUTCOME,
        description,
        {
          bot_name: ctx?.botInfo?.username || bot_name,
          service_type: service_type || ctx?.session?.mode || 'unknown_service',
          model_name: model_name || undefined,
          modePrice: paymentAmount,
          currentBalance: currentBalance,
          paymentAmount: paymentAmount,
          ...metadata,
        },
        paymentAmount
      )

      if (!updateSuccess) {
        // Обработка ошибки обновления баланса
        const message = is_ru
          ? 'Ошибка обновления баланса.'
          : 'Error updating balance.'

        logger.error('❌ Failed to update balance:', {
          telegram_id: telegramIdStr,
          service_type,
        })

        await this.sendMessage(ctx, bot, telegramIdNum, message)

        return {
          newBalance: currentBalance,
          success: false,
          error: message,
          modePrice: paymentAmount,
          paymentAmount: paymentAmount,
          currentBalance,
        }
      }

      logger.info('✅ Balance updated successfully:', {
        telegram_id: telegramIdStr,
        newBalance,
        paymentAmount,
      })

      return {
        newBalance,
        success: true,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    } catch (error) {
      logger.error('❌ Error in processBalanceOperation:', {
        telegram_id: telegramIdStr,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Получаем баланс для возврата
      let currentBalance = 0
      try {
        currentBalance = await getUserBalance(telegramIdStr)
      } catch (balanceError) {
        logger.error('Failed to get balance in catch block:', {
          telegram_id: telegramIdStr,
          error: balanceError,
        })
      }

      const errorMsg = is_ru
        ? 'Внутренняя ошибка обработки операции.'
        : 'Internal error processing operation.'

      return {
        newBalance: currentBalance,
        success: false,
        error:
          errorMsg + (error instanceof Error ? `: ${error.message}` : ''),
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }
  }

  /**
   * Отправляет сообщение пользователю через ctx или bot
   */
  private static async sendMessage(
    ctx: MyContext | undefined,
    bot: Telegraf<MyContext> | undefined,
    telegram_id: number,
    message: string
  ): Promise<void> {
    try {
      if (ctx?.telegram) {
        await ctx.telegram.sendMessage(telegram_id.toString(), message)
      } else if (bot?.telegram) {
        await bot.telegram.sendMessage(telegram_id.toString(), message)
      } else {
        logger.warn('⚠️ No context or bot available to send message:', {
          telegram_id,
        })
      }
    } catch (error) {
      logger.error('❌ Failed to send message to user:', {
        telegram_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Обработка операции с балансом для видео
   * Специализированная версия для видеогенерации
   */
  static async processVideoOperation(
    ctx: MyContext,
    configKey: string,
    isRu: boolean,
    calculateFinalPrice: (key: string) => number,
    modelConfig?: { title: string }
  ): Promise<BalanceOperationResult> {
    const telegram_id = ctx.from?.id

    if (!telegram_id) {
      logger.error('processVideoOperation: User ID not found')
      return {
        success: false,
        error: 'User ID not found',
        newBalance: 0,
        modePrice: 0,
        paymentAmount: 0,
        currentBalance: 0,
      }
    }

    logger.info('🎬 Processing video balance operation:', { configKey })

    // Рассчитываем цену
    let paymentAmount = 0
    try {
      paymentAmount = calculateFinalPrice(configKey)
    } catch (costError) {
      logger.error('Error calculating cost:', {
        configKey,
        error: costError,
      })
      const errorMsg = isRu
        ? 'Ошибка расчета стоимости.'
        : 'Error calculating cost.'
      return {
        success: false,
        error: errorMsg,
        newBalance: 0,
        modePrice: 0,
        paymentAmount: 0,
        currentBalance: 0,
      }
    }

    // Используем основной метод
    return this.processOperation({
      telegram_id,
      paymentAmount,
      is_ru: isRu,
      bot_name: ctx.botInfo?.username || 'unknown_bot',
      ctx,
      description: `Video generation${modelConfig ? ` (${modelConfig.title})` : ''}`,
      service_type: ctx.session?.mode,
      model_name: configKey,
      metadata: {
        configKey,
      },
    })
  }
}
