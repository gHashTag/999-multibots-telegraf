/**
 * 💳 HANDLER: Payment Buttons
 *
 * Обрабатывает кнопки оплаты: "Звездами", "Рублями", "Пополнить"
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  STARS_PAYMENT_VARIANTS,
  RUBLES_PAYMENT_VARIANTS,
  CRYPTO_PAYMENT_VARIANTS,
} from '../config/buttons.config'
import {
  BALANCE_VARIANTS,
  getCategoryButtonVariants,
} from '../config/categories.config'

/**
 * Проверяет и обрабатывает нажатие кнопок оплаты
 * @returns true если обработано, false если не наш текст
 */
export async function handlePaymentButtons(
  ctx: MyContext,
  text: string
): Promise<boolean> {
  // ⭐️ ОПЛАТА ЗВЕЗДАМИ
  if (STARS_PAYMENT_VARIANTS.includes(text)) {
    logger.info('⭐️ [Payment] Stars payment button pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.StarPaymentScene)
      return true
    } catch (error) {
      logger.error('❌ [Payment] Error switching to Stars payment:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💳 ОПЛАТА РУБЛЯМИ
  if (RUBLES_PAYMENT_VARIANTS.includes(text)) {
    logger.info('💳 [Payment] Rubles payment button pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.RublePaymentScene)
      return true
    } catch (error) {
      logger.error('❌ [Payment] Error switching to Rubles payment:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💎 ОПЛАТА КРИПТОЙ - показываем inline-меню с выбором
  if (CRYPTO_PAYMENT_VARIANTS.includes(text)) {
    logger.info(
      '💎 [Payment] Crypto payment button pressed - showing selection menu',
      {
        telegramId: ctx.from?.id,
        currentScene: ctx.scene?.current?.id,
        text,
      }
    )

    try {
      const { Markup } = await import('telegraf')
      const { isRussian } = await import('@/helpers')
      const { canX402Credit } = await import('@/core/x402')
      const { TON_PAYMENT_SCENE_ID } = await import('@/scenes/tonPaymentScene')
      const { TON_NATIVE_PAYMENT_SCENE_ID } = await import(
        '@/scenes/tonNativePaymentScene'
      )

      const isRu = isRussian(ctx)
      // Same gate as paymentScene: offered only if it could be credited.
      const showX402 = canX402Credit()

      const message = isRu
        ? '💎 *Выберите криптовалюту для оплаты:*'
        : '💎 *Select cryptocurrency for payment:*'

      // Формируем кнопки
      const cryptoButtons = []

      // TON USDT (стейблкоин)
      cryptoButtons.push([
        Markup.button.callback(
          isRu ? '💠 TON USDT (стейблкоин)' : '💠 TON USDT (stablecoin)',
          'global_crypto_ton_usdt'
        ),
      ])

      // Нативный TON
      cryptoButtons.push([
        Markup.button.callback(
          isRu ? '💎 TON (нативный)' : '💎 TON (native)',
          'global_crypto_ton_native'
        ),
      ])

      // USDC Base если x402 настроен
      if (showX402) {
        cryptoButtons.push([
          Markup.button.callback(
            isRu ? '🔵 USDC (Base)' : '🔵 USDC (Base)',
            'global_crypto_usdc_base'
          ),
        ])
      }

      // Кнопка отмены
      cryptoButtons.push([
        Markup.button.callback(
          isRu ? '❌ Отмена' : '❌ Cancel',
          'global_crypto_cancel'
        ),
      ])

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(cryptoButtons),
      })

      return true
    } catch (error) {
      logger.error('❌ [Payment] Error showing Crypto selection menu:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💎 ПОПОЛНИТЬ (категория в главном меню)
  const TOP_UP_CATEGORY_VARIANTS = getCategoryButtonVariants('top_up')
  if (TOP_UP_CATEGORY_VARIANTS.includes(text)) {
    logger.info('💎 [Payment] Top Up category pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.PaymentScene)
      return true
    } catch (error) {
      logger.error('❌ [Payment] Error handling Top Up category:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  // 💰 БАЛАНС / ПОПОЛНИТЬ БАЛАНС
  if (BALANCE_VARIANTS.includes(text)) {
    logger.info('💰 [Payment] Balance button pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()

      // "Top up Balance" и "Пополнить баланс" → PaymentScene
      // Иначе → balance_scene (просмотр баланса)
      const isTopUp =
        text.includes('Пополнить') || text.toLowerCase().includes('top up')

      if (isTopUp) {
        await ctx.scene.enter(ModeEnum.PaymentScene)
      } else {
        await ctx.scene.enter(ModeEnum.BalanceScene)
      }
      return true
    } catch (error) {
      logger.error('❌ [Payment] Error handling Balance button:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Произошла ошибка. Попробуйте /start')
      return true
    }
  }

  return false
}
