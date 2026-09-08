import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { SERVICE_DESCRIPTION_PREFIX } from '@/utils/serviceMapping'
type BalanceOperationProps = {
  ctx?: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  bot_name?: string
  is_welcome_gift?: boolean // Flag to skip payment for welcome generation
}

export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
  bot_name,
  is_welcome_gift,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  console.log('Processing balance operation for:', {
    telegram_id,
    paymentAmount,
    is_ru,
    bot_name,
    is_welcome_gift,
  })
  console.log('Context available:', !!ctx)

  // 🎁 WELCOME GIFT: Пропускаем оплату для бесплатной генерации при регистрации
  if (is_welcome_gift) {
    console.log(
      '🎁 [WELCOME GIFT] Skipping payment - free generation for new user!',
      {
        telegram_id,
        paymentAmount,
      }
    )

    // Получаем текущий баланс для отображения (но не списываем)
    const currentBalance = await getUserBalance(telegram_id.toString())

    return {
      newBalance: currentBalance, // Баланс НЕ изменился
      success: true, // Операция успешна
      modePrice: paymentAmount, // Обычная цена (для статистики)
      paymentAmount: 0, // РЕАЛЬНО списано 0
      currentBalance,
    }
  }

  // 🎁 ЛИДMАГНЕТ: Проверяем флаг обхода платежа (ТОЛЬКО для AvatarTransform!)
  // ✅ БЕЗОПАСНОСТЬ: Bypass работает ТОЛЬКО для mode = 'AvatarTransform'
  const isAvatarTransformMode = ctx?.session?.mode === 'AvatarTransform'

  if (ctx?.session?.bypass_payment_check && isAvatarTransformMode) {
    console.log(
      '🎁 [LEAD MAGNET] Bypassing payment check - FREE AvatarTransform only!',
      {
        telegram_id,
        mode: ctx.session.mode,
        bypassFlag: ctx.session.bypass_payment_check,
      }
    )

    // Получаем текущий баланс для отображения (но не списываем)
    const currentBalance = await getUserBalance(telegram_id.toString())

    // ✅ БЕЗОПАСНОСТЬ: Очищаем флаг после использования (одноразовый bypass)
    delete ctx.session.bypass_payment_check

    return {
      newBalance: currentBalance, // Баланс НЕ изменился
      success: true, // Операция успешна
      modePrice: paymentAmount, // Обычная цена (для статистики)
      paymentAmount: 0, // РЕАЛЬНО списано 0
      currentBalance,
    }
  }

  // ✅ БЕЗОПАСНОСТЬ: Если bypass_payment_check установлен, но режим НЕ AvatarTransform - ИГНОРИРУЕМ!
  if (ctx?.session?.bypass_payment_check && !isAvatarTransformMode) {
    console.warn(
      '⚠️ [SECURITY] bypass_payment_check detected in non-AvatarTransform mode - IGNORING!',
      {
        telegram_id,
        mode: ctx.session.mode,
        bypassFlag: ctx.session.bypass_payment_check,
      }
    )

    // Очищаем флаг для безопасности
    delete ctx.session.bypass_payment_check
  }

  // Fail closed on a non-positive price. The two legitimate free paths
  // (is_welcome_gift, AvatarTransform bypass) have already returned above; by
  // here a paymentAmount <= 0 is an anomaly (a missing/regressed price flooring
  // to 0 -- calculateFinalImageCostInStars returns 0 for a 0 baseCost). A 0
  // slips past the `currentBalance < paymentAmount` check below (balance < 0 is
  // always false) and would charge 0 for a paid image: the 0-cost-bypass class.
  // This is the image twin of the video-helper guard (#1571). No image model is
  // priced <= 0, so this refuses only an invalid price; !(x > 0) also catches NaN.
  if (!(paymentAmount > 0)) {
    console.error('processBalanceOperation: non-positive price refused', {
      telegram_id,
      paymentAmount,
    })
    return {
      newBalance: 0,
      success: false,
      error: is_ru ? 'Ошибка расчета стоимости.' : 'Error calculating cost.',
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  try {
    // Получаем текущий баланс
    console.log('Fetching current balance for:', telegram_id)
    const currentBalance = await getUserBalance(telegram_id.toString())
    console.log('Current balance fetched:', currentBalance)
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните — и продолжим.'
        : 'Insufficient funds. Top up and we continue.'
      // The refusal carries the way to pay: standardButtons puts top-up first.
      // Rationale in price/helpers/sendInsufficientStarsMessage.ts.
      await ctx.telegram.sendMessage(
        telegram_id.toString(),
        message,
        standardButtons(is_ru)
      )
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = Number(currentBalance) - Number(paymentAmount)

    // Обновляем баланс в БД, передавая все необходимые аргументы
    //
    // The description names the session mode on purpose. A database trigger
    // rewrites service_type into a short whitelist ('other' for AI Photoshop,
    // face swap, avatar transform; 'neuro_photo' for Flux Kontext and the
    // upscaler), so the column cannot say what the money bought — and the old
    // constant description said nothing either. Measured 2026-09-09:
    // 4005 expense rows carried that constant, 949 of the owner's own. The
    // trigger leaves description alone; resolveUserService reads it back.
    const serviceMode = ctx?.session?.mode || 'unknown_mode'
    console.log('Updating balance with details:', {
      telegram_id,
      paymentAmount,
      bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
      service_type: serviceMode,
    })
    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      `${SERVICE_DESCRIPTION_PREFIX}${serviceMode}`,
      {
        bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
        service_type: serviceMode,
        modePrice: paymentAmount,
        currentBalance: currentBalance,
      },
      paymentAmount
    )

    if (!updateSuccess) {
      // Обработка ошибки обновления баланса
      const message = is_ru
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    return {
      newBalance,
      success: true,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    return {
      newBalance: await getUserBalance(telegram_id.toString()),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: await getUserBalance(telegram_id.toString()),
    }
  }
}
