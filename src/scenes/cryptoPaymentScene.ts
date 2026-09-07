/**
 * Crypto Payment Scene (x402 Protocol)
 *
 * Allows users to top up their balance using USDC on Base network
 * through the x402 payment protocol.
 */

import { Markup, Scenes } from 'telegraf'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  usdcTopUpOptions,
  getUsdcTopUpOption,
} from '@/price/helpers/usdcTopUpOptions'
import {
  generateX402PaymentUrl,
  isX402Configured,
  canX402Credit,
  X402_SETTLEMENT_IMPLEMENTED,
  getX402Config,
  logX402Event,
} from '@/core/x402'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { getMainMenuText } from '@/navigation'
import {
  PaymentStatus,
  Currency,
  PaymentType,
  PaymentMethod,
} from '@/interfaces/payments.interface'

export const cryptoPaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.CryptoPaymentScene
)

// Entry point: Show available USDC top-up options
cryptoPaymentScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  logger.info('[CryptoPaymentScene] Scene entered', {
    telegram_id: userId,
  })

  if (!userId) {
    logger.error('[CryptoPaymentScene] User ID is missing on enter!')
    await ctx.reply(
      isRu
        ? 'Произошла ошибка: не удалось определить ваш аккаунт.'
        : 'An error occurred: could not identify your account.'
    )
    return ctx.scene.leave()
  }

  /*
   * A PAYMENT WE CANNOT CREDIT MUST NOT BE OFFERED, AND THE REFUSAL MUST CARRY
   * THE WAY OUT.
   *
   * This asked `isX402Configured`, which only checks that a wallet address is a
   * well-formed 0x string. Settlement verification does not exist, so nothing
   * could ever turn such a payment into stars -- twelve people found that out
   * by paying. canX402Credit is the question that matters.
   *
   * The refusal was a bare `ctx.reply` pointing at "another payment method" in
   * words, with no keyboard. Prose where a button belongs is the same defect
   * the shared money refusal had; standardButtons puts top-up first, so a
   * person leaves this dead end holding a live way to pay.
   */
  if (!canX402Credit()) {
    logger.warn('[CryptoPaymentScene] x402 cannot credit a payment', {
      settlementImplemented: X402_SETTLEMENT_IMPLEMENTED,
      walletConfigured: isX402Configured(),
    })
    await ctx.reply(
      isRu
        ? '❌ Оплата криптовалютой сейчас недоступна. Пополнить можно так:'
        : '❌ Crypto payment is unavailable right now. You can top up here:',
      standardButtons(isRu)
    )
    return ctx.scene.leave()
  }

  const config = getX402Config()
  const networkLabel =
    config.network === 'base-mainnet'
      ? 'Base Mainnet'
      : 'Base Sepolia (Testnet)'

  // Show info message about crypto payment
  const infoMessage = isRu
    ? `💎 <b>Пополнение баланса через USDC</b>\n\n` +
      `Сеть: <code>${networkLabel}</code>\n` +
      `Токен: USDC\n` +
      `Протокол: x402\n\n` +
      `Выберите сумму для пополнения:`
    : `💎 <b>Top up balance with USDC</b>\n\n` +
      `Network: <code>${networkLabel}</code>\n` +
      `Token: USDC\n` +
      `Protocol: x402\n\n` +
      `Select the amount to top up:`

  // Create inline keyboard with top-up options
  const keyboard = Markup.inlineKeyboard(
    [
      ...usdcTopUpOptions.map(option =>
        Markup.button.callback(
          isRu ? option.labelRu : option.label,
          `crypto_topup_${option.amountUsd}`
        )
      ),
      Markup.button.callback(
        isRu ? '⬅️ Назад' : '⬅️ Back',
        'crypto_back_to_payment'
      ),
    ],
    { columns: 1 }
  )

  await ctx.reply(infoMessage, {
    parse_mode: 'HTML',
    ...keyboard,
  })

  logX402Event('Scene entered', {
    telegram_id: userId,
    network: config.network,
  })
})

// Handle top-up amount selection
cryptoPaymentScene.action(/crypto_topup_(\d+)/, async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id
  const amountUsd = parseInt(ctx.match[1], 10)

  /*
   * THE GUARD BELONGS WHERE THE ROW IS WRITTEN, NOT ONLY AT THE DOOR.
   *
   * The entry check added yesterday refuses this scene while x402 cannot
   * credit, and that closed the way IN. It did not close this handler. A
   * person already inside the scene -- session state outlives a restart, and a
   * message with these buttons stays pressable in the chat history forever --
   * reaches this line without passing the door, and the next thirty lines
   * write a PENDING payment row and hand out a payment URL.
   *
   * Guarding the offer is not guarding the act. That is the whole shape of the
   * defect this scene already carries: twelve X402 rows exist because a button
   * was live while nothing could credit it.
   */
  if (!canX402Credit()) {
    logger.warn('[CryptoPaymentScene] top-up refused: x402 cannot credit', {
      telegram_id: userId,
      amountUsd,
    })
    await ctx.reply(
      isRu
        ? '❌ Оплата криптовалютой сейчас недоступна. Пополнить можно так:'
        : '❌ Crypto payment is unavailable right now. You can top up here:',
      standardButtons(isRu)
    )
    return ctx.scene.leave()
  }

  if (!userId) {
    await ctx.reply(
      isRu
        ? 'Произошла ошибка: не удалось определить ваш аккаунт.'
        : 'An error occurred: could not identify your account.'
    )
    return
  }

  const option = getUsdcTopUpOption(amountUsd)
  if (!option) {
    logger.error('[CryptoPaymentScene] Invalid top-up option', {
      telegram_id: userId,
      amountUsd,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка: неверная сумма пополнения.'
        : 'An error occurred: invalid top-up amount.'
    )
    return
  }

  try {
    // Generate unique invoice ID
    const invId = `x402_${Date.now()}_${userId}`
    const description = isRu
      ? `Пополнение баланса на ${option.stars} звезд (${option.amountUsd} USDC)`
      : `Balance top-up for ${option.stars} stars (${option.amountUsd} USDC)`

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Generate payment URL
    const paymentUrl = generateX402PaymentUrl({
      invId,
      telegramId: userId.toString(),
      amountUsd: option.amountUsd,
      stars: option.stars,
      description,
      botName: bot_name,
    })

    // Save PENDING payment to database
    // Ошибка здесь означает, что записи платежа НЕТ. Отправлять человека
    // платить по ссылке в таком случае нельзя: деньги спишутся, а обратный
    // вызов не найдёт платёж по inv_id и звёзды не начислятся.
    try {
      await setPayments({
        telegram_id: userId.toString(),
        OutSum: option.amountUsd.toString(),
        InvId: invId,
        currency: Currency.USDC,
        stars: option.stars,
        status: PaymentStatus.PENDING,
        payment_method: PaymentMethod.X402,
        type: PaymentType.MONEY_INCOME,
        subscription_type: null,
        bot_name,
        language: ctx.from?.language_code ?? 'en',
        metadata: {
          network: getX402Config().network,
          protocol: 'x402',
        },
      })
    } catch (paymentRecordError) {
      logger.error('❌ Не удалось создать запись платежа — ссылку не выдаём', {
        error:
          paymentRecordError instanceof Error
            ? paymentRecordError.message
            : String(paymentRecordError),
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось подготовить платёж. Попробуйте ещё раз через минуту — деньги не списаны.'
          : '❌ Could not prepare the payment. Please try again in a minute — nothing was charged.'
      )
      return ctx.scene.leave()
    }

    logger.info('[CryptoPaymentScene] PENDING payment created', {
      telegram_id: userId,
      invId,
      amountUsd: option.amountUsd,
      stars: option.stars,
    })

    // Send payment message with link
    const config = getX402Config()
    const networkInfo =
      config.network === 'base-mainnet'
        ? ''
        : isRu
          ? '\n\n⚠️ <i>Тестовая сеть: используйте тестовые USDC с </i><a href="https://faucet.circle.com/">Circle Faucet</a>'
          : '\n\n⚠️ <i>Testnet: use test USDC from </i><a href="https://faucet.circle.com/">Circle Faucet</a>'

    const paymentMessage = isRu
      ? `💎 <b>Счет на оплату создан</b>\n\n` +
        `Сумма: <b>$${option.amountUsd} USDC</b>\n` +
        `Вы получите: <b>${option.stars} ⭐️</b>\n\n` +
        `Нажмите кнопку ниже, чтобы перейти к оплате.\n` +
        `После оплаты баланс пополнится автоматически.${networkInfo}`
      : `💎 <b>Invoice created</b>\n\n` +
        `Amount: <b>$${option.amountUsd} USDC</b>\n` +
        `You will receive: <b>${option.stars} ⭐️</b>\n\n` +
        `Click the button below to proceed with payment.\n` +
        `Your balance will be updated automatically after payment.${networkInfo}`

    await ctx.reply(paymentMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isRu
                ? `💰 Оплатить $${option.amountUsd} USDC`
                : `💰 Pay $${option.amountUsd} USDC`,
              url: paymentUrl,
            },
          ],
          [
            {
              text: isRu ? '❓ Как оплатить?' : '❓ How to pay?',
              callback_data: 'crypto_how_to_pay',
            },
          ],
        ],
      },
    })

    logX402Event('Payment invoice created', {
      telegram_id: userId,
      invId,
      amountUsd: option.amountUsd,
      stars: option.stars,
      paymentUrl,
    })
  } catch (error) {
    logger.error('[CryptoPaymentScene] Error creating payment', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: userId,
      amountUsd,
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при создании счета. Попробуйте позже.'
        : '❌ An error occurred while creating the invoice. Please try again later.'
    )
  }
})

// Handle "How to pay?" button
cryptoPaymentScene.action('crypto_how_to_pay', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)
  const config = getX402Config()

  const howToPayMessage = isRu
    ? `<b>Как оплатить через x402:</b>\n\n` +
      `1️⃣ Установите <a href="https://www.coinbase.com/wallet">Coinbase Wallet</a> или MetaMask\n\n` +
      `2️⃣ Добавьте сеть Base (${config.network === 'base-mainnet' ? 'Mainnet' : 'Sepolia'})\n\n` +
      `3️⃣ Пополните кошелек USDC на Base\n` +
      (config.network === 'base-sepolia'
        ? `   (Тестовые USDC: <a href="https://faucet.circle.com/">Circle Faucet</a>)\n\n`
        : '\n') +
      `4️⃣ Нажмите "Оплатить" - откроется страница оплаты\n\n` +
      `5️⃣ Подтвердите транзакцию в кошельке\n\n` +
      `После успешной оплаты баланс пополнится автоматически за ~2 секунды.`
    : `<b>How to pay with x402:</b>\n\n` +
      `1️⃣ Install <a href="https://www.coinbase.com/wallet">Coinbase Wallet</a> or MetaMask\n\n` +
      `2️⃣ Add Base network (${config.network === 'base-mainnet' ? 'Mainnet' : 'Sepolia'})\n\n` +
      `3️⃣ Fund your wallet with USDC on Base\n` +
      (config.network === 'base-sepolia'
        ? `   (Test USDC: <a href="https://faucet.circle.com/">Circle Faucet</a>)\n\n`
        : '\n') +
      `4️⃣ Click "Pay" - payment page will open\n\n` +
      `5️⃣ Confirm the transaction in your wallet\n\n` +
      `After successful payment, your balance will be updated automatically in ~2 seconds.`

  await ctx.reply(howToPayMessage, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
})

// Handle back button
cryptoPaymentScene.action('crypto_back_to_payment', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  // Return to payment selection or balance scene
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})

// Switch to ruble payment
cryptoPaymentScene.hears(['₽ Рубли', '₽ Rubles'], async ctx => {
  logger.info('[CryptoPaymentScene] User wants to switch to Ruble payment', {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.RublePaymentScene)
})

// Switch to star payment
cryptoPaymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  logger.info('[CryptoPaymentScene] User wants to switch to Star payment', {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.StarPaymentScene)
})

// Exit scene via main menu
cryptoPaymentScene.hears(/^🏠/, async ctx => {
  const isRu = isRussianFromState(ctx)
  const mainMenuText = getMainMenuText(isRu)

  if (
    ctx.message &&
    'text' in ctx.message &&
    ctx.message.text === mainMenuText
  ) {
    logger.info('[CryptoPaymentScene] Leaving scene via Main Menu button', {
      telegram_id: ctx.from?.id,
    })
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  }
})

// Handle unexpected messages
cryptoPaymentScene.on('message', async ctx => {
  const isRu = isRussianFromState(ctx)
  logger.warn('[CryptoPaymentScene] Received unexpected message', {
    telegram_id: ctx.from?.id,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите сумму для пополнения или вернитесь в главное меню.'
      : 'Please select a top-up amount or return to the main menu.'
  )
})
