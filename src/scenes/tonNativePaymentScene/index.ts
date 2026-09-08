/**
 * TON Native Payment Scene
 *
 * Сцена для оплаты нативным TON (не USDT)
 *
 * Flow:
 * 1. Показать кнопки с суммами в TON
 * 2. Создать PENDING запись в payments_v2
 * 3. Показать инструкцию и ссылки для оплаты
 * 4. Кнопка "Проверить оплату"
 * 5. Подтверждение или сообщение "не найдено"
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import {
  tonNativeTopUpOptions,
  generateTonNativeInvoiceId,
  TON_PRICE_USD,
} from '@/price/helpers/tonTopUpOptions'
import {
  getTonConfig,
  generateTonNativePaymentLink,
  findNativePaymentByComment,
  nanoToTon,
} from '@/core/ton'
import { supabase } from '@/core/supabase'
import {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Currency,
} from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { getBotNameFromContext } from '@/helpers'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'

// Scene ID
export const TON_NATIVE_PAYMENT_SCENE_ID = 'tonNativePaymentScene'

// Wizard data interface
interface TonNativePaymentWizardData {
  step: number
  selectedTon?: number
  selectedStars?: number
  invId?: string
  createdAt?: number
}

/**
 * TON Native Payment Scene (WizardScene)
 */
const tonNativePaymentScene = new Scenes.WizardScene<MyContext>(
  TON_NATIVE_PAYMENT_SCENE_ID,

  // Step 1: Показать варианты пополнения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id

    logger.info('[TON NATIVE PAYMENT] Scene entered', { telegramId })

    // Инициализация wizard data
    ctx.session.wizardData = {
      step: 1,
    } as TonNativePaymentWizardData

    // Создаём кнопки для каждого варианта
    const buttons = tonNativeTopUpOptions.map(opt => [
      Markup.button.callback(
        isRu ? opt.labelRu : opt.labelEn,
        `tonn_select_${opt.ton}`
      ),
    ])

    // Добавляем кнопку назад
    buttons.push([
      Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'tonn_back'),
    ])

    const message = isRu
      ? `💎 *Пополнение через TON*\n\n` +
        `Выберите сумму пополнения:\n\n` +
        `• Курс: ~$${TON_PRICE_USD} за 1 TON\n` +
        `• Минимальная комиссия сети (~0.01 TON)\n` +
        `• Мгновенное зачисление после подтверждения\n` +
        `• Поддерживаются: Tonkeeper, TON Wallet, @wallet`
      : `💎 *Top-up via TON*\n\n` +
        `Choose top-up amount:\n\n` +
        `• Rate: ~$${TON_PRICE_USD} per 1 TON\n` +
        `• Minimal network fee (~0.01 TON)\n` +
        `• Instant crediting after confirmation\n` +
        `• Supported: Tonkeeper, TON Wallet, @wallet`

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    })

    return ctx.wizard.next()
  },

  // Step 2: Показать инструкцию оплаты
  async ctx => {
    // Этот шаг обрабатывается через action handlers
    return
  }
)

// Action: Выбор суммы
tonNativePaymentScene.action(/^tonn_select_(\d+)$/, async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id
  const match = ctx.match
  const ton = parseInt(match[1])

  const option = tonNativeTopUpOptions.find(opt => opt.ton === ton)
  if (!option) {
    await ctx.reply(isRu ? '❌ Неверная сумма' : '❌ Invalid amount')
    return
  }

  logger.info('[TON NATIVE PAYMENT] Amount selected', {
    telegramId,
    ton: option.ton,
    stars: option.stars,
  })

  try {
    // Получаем конфиг TON
    const tonConfig = getTonConfig()

    // Генерируем уникальный invoice ID
    const invId = generateTonNativeInvoiceId()

    // Сохраняем в wizard data
    const wizardData = ctx.session.wizardData as TonNativePaymentWizardData
    wizardData.selectedTon = option.ton
    wizardData.selectedStars = option.stars
    wizardData.invId = invId
    wizardData.createdAt = Math.floor(Date.now() / 1000)

    // Создаём PENDING запись в payments_v2
    const botName = getBotNameFromContext(ctx)

    const { error: insertError } = await supabase.from('payments_v2').insert({
      telegram_id: telegramId,
      amount: option.ton,
      stars: option.stars,
      currency: Currency.TON,
      status: PaymentStatus.PENDING,
      type: PaymentType.MONEY_INCOME,
      payment_method: PaymentMethod.TON_NATIVE,
      description: `TON Top-up: ${option.ton} TON → ${option.stars}⭐`,
      bot_name: botName,
      service_type: ModeEnum.TopUpBalance,
      inv_id: invId,
      metadata: {
        ton_amount: option.ton,
        stars_amount: option.stars,
        usd_equivalent: option.usdEquivalent,
        ton_wallet: tonConfig.walletAddress,
        created_at: wizardData.createdAt,
      },
    })

    if (insertError) {
      logger.error('[TON NATIVE PAYMENT] Error creating payment record', {
        telegramId,
        error: insertError.message,
      })
      await ctx.reply(
        isRu ? '❌ Ошибка создания платежа' : '❌ Error creating payment'
      )
      return
    }

    logger.info('[TON NATIVE PAYMENT] Payment record created', {
      telegramId,
      invId,
      ton: option.ton,
      stars: option.stars,
    })

    // Генерируем ссылку для оплаты
    const paymentLink = generateTonNativePaymentLink({
      recipientAddress: tonConfig.walletAddress,
      tonAmount: option.ton,
      comment: invId,
    })

    // Сообщение с инструкцией
    const instructionMessage = isRu
      ? `💎 *Оплата TON*\n\n` +
        `💰 Сумма: *${option.ton} TON* (~$${option.usdEquivalent})\n` +
        `⭐ Получите: *${option.stars} звёзд*\n\n` +
        `📋 *Инструкция:*\n` +
        `1. Откройте кошелёк Tonkeeper или @wallet\n` +
        `2. Отправьте *${option.ton} TON* на адрес:\n` +
        `\`${tonConfig.walletAddress}\`\n\n` +
        `⚠️ *ВАЖНО:* В комментарии укажите:\n` +
        `\`${invId}\`\n\n` +
        `После оплаты нажмите "Проверить оплату"`
      : `💎 *TON Payment*\n\n` +
        `💰 Amount: *${option.ton} TON* (~$${option.usdEquivalent})\n` +
        `⭐ You'll get: *${option.stars} stars*\n\n` +
        `📋 *Instructions:*\n` +
        `1. Open Tonkeeper or @wallet\n` +
        `2. Send *${option.ton} TON* to address:\n` +
        `\`${tonConfig.walletAddress}\`\n\n` +
        `⚠️ *IMPORTANT:* Add comment:\n` +
        `\`${invId}\`\n\n` +
        `After payment, click "Check payment"`

    // Кнопки
    const buttons = [
      [
        Markup.button.url(
          isRu ? '📱 Открыть Tonkeeper' : '📱 Open Tonkeeper',
          paymentLink
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '🔍 Проверить оплату' : '🔍 Check payment',
          `tonn_check_${invId}`
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '❌ Отменить' : '❌ Cancel',
          'tonn_cancel'
        ),
      ],
    ]

    // Удаляем предыдущее сообщение
    try {
      await ctx.deleteMessage()
    } catch {
      // Ignore
    }

    await ctx.reply(instructionMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    })
  } catch (error) {
    logger.error('[TON NATIVE PAYMENT] Error processing selection', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ Error occurred. Try again later.'
    )
  }
})

// Action: Проверить оплату
tonNativePaymentScene.action(/^tonn_check_(.+)$/, async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id
  const invId = ctx.match[1]

  logger.info('[TON NATIVE PAYMENT] Checking payment', { telegramId, invId })

  try {
    // Получаем платёж из БД
    const { data: payment, error: fetchError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', invId)
      .eq('status', PaymentStatus.PENDING)
      .single()

    if (fetchError || !payment) {
      // The same split as tonPaymentScene: a read that failed is money news,
      // an absent row is not. warn is not forwarded to the owner; error is.
      if (fetchError)
        logger.error(
          '[TON NATIVE PAYMENT] payments_v2 read FAILED for a payment',
          { telegramId, invId, error: fetchError.message }
        )
      logger.warn(
        '[TON NATIVE PAYMENT] Payment not found or already processed',
        {
          telegramId,
          invId,
        }
      )
      await ctx.reply(
        isRu
          ? '❌ Платёж не найден или уже обработан'
          : '❌ Payment not found or already processed'
      )
      return ctx.scene.leave()
    }

    // Ownership guard. The invId is the PUBLIC on-chain transfer memo, and
    // callback_query data is client-forgeable, so an attacker who reads a
    // victim's memo off the blockchain could tap tonn_check_<victimInvId> in
    // their own scene session and be credited for the victim's confirmed top-up.
    // The payment belongs to whoever created it (payment.telegram_id at insert),
    // NOT the caller (ctx.from.id): refuse when they differ. Skip-only guard --
    // it never adds credit, only prevents crediting the wrong user.
    if (String(payment.telegram_id) !== String(telegramId)) {
      logger.warn(
        '[TON NATIVE PAYMENT] Caller is not the payment owner — refusing',
        {
          callerTelegramId: telegramId,
          paymentOwner: payment.telegram_id,
          invId,
        }
      )
      await ctx.reply(isRu ? '❌ Платёж не найден' : '❌ Payment not found')
      return ctx.scene.leave()
    }

    // Получаем конфиг и проверяем транзакцию
    const tonConfig = getTonConfig()
    const transaction = await findNativePaymentByComment(
      tonConfig.walletAddress,
      invId,
      payment.amount,
      payment.metadata?.created_at
    )

    if (!transaction) {
      // Платёж не найден - показываем кнопку повторной проверки
      await ctx.reply(
        isRu
          ? `⏳ Платёж пока не найден.\n\n` +
              `Убедитесь, что:\n` +
              `• Вы отправили *${payment.amount} TON*\n` +
              `• В комментарии указано: \`${invId}\`\n` +
              `• Транзакция подтверждена в сети\n\n` +
              `Попробуйте проверить через 1-2 минуты.`
          : `⏳ Payment not found yet.\n\n` +
              `Make sure:\n` +
              `• You sent *${payment.amount} TON*\n` +
              `• Comment contains: \`${invId}\`\n` +
              `• Transaction is confirmed on network\n\n` +
              `Try checking in 1-2 minutes.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? '🔄 Проверить снова' : '🔄 Check again',
                `tonn_check_${invId}`
              ),
            ],
            [
              Markup.button.callback(
                isRu ? '❌ Отменить' : '❌ Cancel',
                'tonn_cancel'
              ),
            ],
          ]),
        }
      )
      return
    }

    // Платёж найден! Обновляем статус
    logger.info('[TON NATIVE PAYMENT] Payment found!', {
      telegramId,
      invId,
      txHash: transaction.hash,
      amount: nanoToTon(transaction.amount),
    })

    // Claim the payment with a compare-and-set: only the check that flips it
    // from PENDING to COMPLETED is allowed to credit. Two concurrent taps of
    // "check payment" both read the PENDING row and both find the on-chain tx,
    // so without the status guard both would credit — a double top-up for one
    // real payment. .eq('status', PENDING) makes the UPDATE atomic in Postgres
    // and .select() reports whether this tap won.
    const { data: claimed, error: updateError } = await supabase
      .from('payments_v2')
      .update({
        status: PaymentStatus.COMPLETED,
        metadata: {
          ...payment.metadata,
          ton_tx_hash: transaction.hash,
          ton_sender: transaction.from,
          ton_lt: transaction.lt,
          completed_at: Date.now(),
        },
      })
      .eq('inv_id', invId)
      .eq('status', PaymentStatus.PENDING)
      .select('inv_id')

    if (updateError) {
      logger.error('[TON NATIVE PAYMENT] Error updating payment status', {
        telegramId,
        invId,
        error: updateError.message,
      })
    }

    if (!claimed || claimed.length === 0) {
      // Another concurrent check already completed this payment. Do NOT credit
      // again — this tap lost the compare-and-set.
      logger.warn(
        '[TON NATIVE PAYMENT] Payment already completed, skipping duplicate credit',
        { telegramId, invId }
      )
      await ctx.reply(
        isRu
          ? '✅ Платёж уже обработан.'
          : '✅ Payment has already been processed.'
      )
      return ctx.scene.leave()
    }

    // Зачисляем звёзды
    const balanceUpdated = await updateUserBalance(
      String(telegramId),
      payment.stars,
      PaymentType.MONEY_INCOME,
      `TON Top-up: ${payment.amount} TON`,
      {
        payment_method: PaymentMethod.TON_NATIVE,
        currency: Currency.TON,
        inv_id: invId,
        ton_tx_hash: transaction.hash,
      }
    )

    if (balanceUpdated) {
      await ctx.reply(
        isRu
          ? `✅ *Оплата успешно получена!*\n\n` +
              `💰 Зачислено: *${payment.stars} звёзд*\n` +
              `📝 TX: \`${transaction.hash.substring(0, 16)}...\`\n\n` +
              `Спасибо за пополнение!`
          : `✅ *Payment received successfully!*\n\n` +
              `💰 Credited: *${payment.stars} stars*\n` +
              `📝 TX: \`${transaction.hash.substring(0, 16)}...\`\n\n` +
              `Thank you for your top-up!`,
        { parse_mode: 'Markdown' }
      )

      // Уведомляем владельца бота о платеже
      const botName = getBotNameFromContext(ctx)
      if (botName) {
        notifyBotOwners(botName, {
          username: ctx.from?.username || '',
          telegram_id: String(telegramId),
          amount: payment.amount,
          stars: payment.stars,
        }).catch(err => {
          logger.error('[TON NATIVE PAYMENT] Error notifying bot owners', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
    } else {
      await ctx.reply(
        isRu
          ? `⚠️ Платёж получен, но произошла ошибка зачисления.\nОбратитесь в поддержку с ID: ${invId}`
          : `⚠️ Payment received but crediting failed.\nContact support with ID: ${invId}`
      )
    }

    return ctx.scene.leave()
  } catch (error) {
    logger.error('[TON NATIVE PAYMENT] Error checking payment', {
      telegramId,
      invId,
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx.reply(
      isRu ? '❌ Ошибка проверки платежа' : '❌ Error checking payment'
    )
  }
})

// Action: Отмена
tonNativePaymentScene.action('tonn_cancel', async ctx => {
  await ctx.answerCbQuery()

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id
  const wizardData = ctx.session.wizardData as TonNativePaymentWizardData

  // Отменяем PENDING платёж если есть
  if (wizardData?.invId) {
    await supabase
      .from('payments_v2')
      .update({ status: PaymentStatus.CANCELLED })
      .eq('inv_id', wizardData.invId)
      .eq('status', PaymentStatus.PENDING)

    logger.info('[TON NATIVE PAYMENT] Payment cancelled', {
      telegramId,
      invId: wizardData.invId,
    })
  }

  await ctx.reply(isRu ? '❌ Оплата отменена' : '❌ Payment cancelled')
  return ctx.scene.leave()
})

// Action: Назад
tonNativePaymentScene.action('tonn_back', async ctx => {
  await ctx.answerCbQuery()
  // Same fix as tonPaymentScene: the registered id is ModeEnum.PaymentScene
  // ('payment_scene'), not the literal 'paymentScene'.
  return ctx.scene.enter(ModeEnum.PaymentScene)
})

// Handle text in scene (ignore)
tonNativePaymentScene.on('text', async ctx => {
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu ? 'Используйте кнопки для навигации' : 'Use buttons for navigation'
  )
})

export default tonNativePaymentScene
