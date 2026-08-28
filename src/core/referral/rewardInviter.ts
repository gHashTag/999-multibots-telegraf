import { PaymentType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * Награда пригласившему.
 *
 * ЗАЧЕМ. Сцена приглашения обещает: «Что вы получите? — Бонусные звёзды…
 * Доступ к эксклюзивным функциям… Повышение уровня». Проверено по данным:
 * из 17 136 платежей НИ ОДИН не является наградой за приглашение, а `level`
 * равен нулю у 2351 профиля из 2354. Обещаны три вещи, не выполнена ни одна.
 *
 * При этом приглашения — единственный канал роста, который здесь когда-либо
 * работал: из 2354 профилей 738 пришли по ссылке, 611 из них за сентябрь
 * 2025. В августе 2026 — ноль.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ. Механизм начисления, готовый к включению. Размер награды —
 * решение владельца, поэтому берётся из окружения и по умолчанию равен нулю.
 * Пока он нулевой, награда не начисляется И НЕ ОБЕЩАЕТСЯ: текст сцены
 * приглашения смотрит на то же число.
 *
 * ЗАЩИТА ОТ ДВОЙНОЙ ВЫПЛАТЫ. Номер счёта складывается из пары «пригласивший →
 * приглашённый» и потому одинаков при любом повторе. Номер счёта в базе
 * уникален — измерено: 16 680 разных на 16 680 строк, дублей ноль
 * (docs/audit/money-map.md). Вторую строку база не примет, вернув код 23505,
 * и повторный вызов ничего не начислит.
 */
export const REFERRAL_BONUS_STARS = Math.max(
  0,
  Number(process.env.REFERRAL_BONUS_STARS ?? 0) || 0
)

export type RewardOutcome =
  | { rewarded: true; stars: number }
  | {
      rewarded: false
      reason: 'disabled' | 'already' | 'failed'
      error?: string
    }

/** Отличает «такая награда уже выдана» от настоящего отказа. */
function isDuplicate(error?: string): boolean {
  return Boolean(
    error && (error.includes('23505') || /duplicate key/i.test(error))
  )
}

export function referralInvoiceId(
  inviterTelegramId: string | number,
  newUserTelegramId: string | number
): string {
  return `referral-${inviterTelegramId}-${newUserTelegramId}`
}

export async function rewardInviter(params: {
  inviterTelegramId: string | number
  newUserTelegramId: string | number
  botName: string
}): Promise<RewardOutcome> {
  const { inviterTelegramId, newUserTelegramId, botName } = params

  if (REFERRAL_BONUS_STARS <= 0) {
    return { rewarded: false, reason: 'disabled' }
  }

  if (String(inviterTelegramId) === String(newUserTelegramId)) {
    // Пригласить самого себя — не приглашение.
    return { rewarded: false, reason: 'failed', error: 'самоприглашение' }
  }

  const { directPaymentProcessor } = await import(
    '@/core/supabase/directPayment'
  )

  const result = await directPaymentProcessor({
    telegram_id: String(inviterTelegramId),
    amount: REFERRAL_BONUS_STARS,
    type: PaymentType.MONEY_INCOME,
    description: `🔗 Награда за приглашение: ${REFERRAL_BONUS_STARS} звёзд`,
    bot_name: botName,
    service_type: ModeEnum.StartScene,
    inv_id: referralInvoiceId(inviterTelegramId, newUserTelegramId),
    metadata: {
      category: 'BONUS',
      is_referral_reward: true,
      invited_telegram_id: String(newUserTelegramId),
      stars_granted: REFERRAL_BONUS_STARS,
    },
  })

  if (result.success) {
    logger.info('🎁 [Referral] Награда за приглашение начислена', {
      inviter: String(inviterTelegramId),
      invited: String(newUserTelegramId),
      stars: REFERRAL_BONUS_STARS,
    })
    return { rewarded: true, stars: REFERRAL_BONUS_STARS }
  }

  if (isDuplicate(result.error)) {
    // Не отказ: за эту же пару уже платили.
    logger.info('🔁 [Referral] Награда за эту пару уже выдана', {
      inviter: String(inviterTelegramId),
      invited: String(newUserTelegramId),
    })
    return { rewarded: false, reason: 'already' }
  }

  logger.error('❌ [Referral] Не удалось начислить награду за приглашение', {
    inviter: String(inviterTelegramId),
    invited: String(newUserTelegramId),
    error: result.error,
  })
  return { rewarded: false, reason: 'failed', error: result.error }
}
