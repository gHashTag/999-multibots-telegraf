import { handlePaymentPolicyInfo } from './paymentHandlers/handlePaymentPolicyInfo'
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
} from './paymentHandlers'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'

import { handleTopUp } from './paymentHandlers/handleTopUp'
import { TON_PAYMENT_SCENE_ID } from '@/scenes/tonPaymentScene'
import { TON_NATIVE_PAYMENT_SCENE_ID } from '@/scenes/tonNativePaymentScene'

export function registerPaymentActions(bot: Telegraf<MyContext>) {
  bot.action('payment_policy_info', handlePaymentPolicyInfo)
  bot.action(/top_up_\d+/, handleTopUp)
  bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
  bot.on('successful_payment', handleSuccessfulPayment as any)

  // 💎 ГЛОБАЛЬНЫЕ КРИПТО-КНОПКИ (из inline-меню)

  // TON USDT
  bot.action('global_crypto_ton_usdt', async (ctx) => {
    await ctx.answerCbQuery()
    logger.info('💠 [Payment] Global crypto: TON USDT selected', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.deleteMessage()
    } catch {
      // ignore
    }
    await ctx.scene.enter(TON_PAYMENT_SCENE_ID)
  })

  // Нативный TON
  bot.action('global_crypto_ton_native', async (ctx) => {
    await ctx.answerCbQuery()
    logger.info('💎 [Payment] Global crypto: TON native selected', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.deleteMessage()
    } catch {
      // ignore
    }
    await ctx.scene.enter(TON_NATIVE_PAYMENT_SCENE_ID)
  })

  // USDC Base
  bot.action('global_crypto_usdc_base', async (ctx) => {
    await ctx.answerCbQuery()
    logger.info('🔵 [Payment] Global crypto: USDC Base selected', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.deleteMessage()
    } catch {
      // ignore
    }
    await ctx.scene.enter(ModeEnum.CryptoPaymentScene)
  })

  // Отмена
  bot.action('global_crypto_cancel', async (ctx) => {
    await ctx.answerCbQuery()
    logger.info('❌ [Payment] Global crypto: Cancelled', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.deleteMessage()
    } catch {
      // ignore
    }
  })
}
