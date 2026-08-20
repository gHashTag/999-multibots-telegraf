import { logger } from '@/utils/logger'
import { rewardInviter, REFERRAL_BONUS_STARS } from './rewardInviter'

/**
 * Награда пригласившему — за ПЕРВОЕ ПОПОЛНЕНИЕ приглашённого, а не за
 * регистрацию.
 *
 * ПОЧЕМУ НЕ ЗА РЕГИСТРАЦИЮ. Измерено по нашим данным: из 738 человек,
 * пришедших по ссылке, хоть раз пополняли баланс **33 — четыре процента**.
 * Награда за регистрацию означает платить двадцать пять раз за одного
 * плательщика, причём регистрацию в Telegram подделать дёшево.
 *
 * Обзор рынка говорит то же: главную награду принято выдавать за первую
 * покупку, а не за приход, и удерживать её на срок возврата. Награда за
 * регистрацию — «слабейшее звено», потому что активируется лишь пятая-третья
 * часть перешедших по ссылке.
 *
 * ЭКОНОМИКА, НА КОТОРОЙ СТОИТ РЕШЕНИЕ (docs/audit/referral-economics.md):
 * приглашённый приносит в среднем 71 звезду за всё время. Это потолок для
 * платы за приглашение; разумная доля — 5-10%, то есть единицы звёзд при
 * оплате за регистрацию и десятки при оплате за первое пополнение.
 *
 * ЗАЩИТА ОТ ДВОЙНОЙ ВЫПЛАТЫ уже есть в `rewardInviter`: номер счёта
 * складывается из пары «пригласивший → приглашённый», а он в базе уникален.
 * Поэтому эту функцию можно звать на каждом пополнении — заплатит она один раз.
 */
export async function rewardInviterOnFirstTopUp(params: {
  invitedTelegramId: string | number
  botName: string
}): Promise<void> {
  const { invitedTelegramId, botName } = params

  // Быстрый выход, пока владелец не назначил размер награды.
  if (REFERRAL_BONUS_STARS <= 0) return

  try {
    const { supabase } = await import('@/core/supabase')

    const { data: invited, error: invitedError } = await supabase
      .from('users')
      .select('inviter')
      .eq('telegram_id', String(invitedTelegramId))
      .maybeSingle()

    if (invitedError) {
      logger.error('❌ [Referral] Не удалось прочитать профиль приглашённого', {
        invited: String(invitedTelegramId),
        error: invitedError.message,
      })
      return
    }

    const inviterUserId = invited?.inviter
    if (!inviterUserId) return // пришёл сам — награждать некого

    // `users.inviter` хранит user_id (UUID), а начисление идёт по telegram_id.
    const { data: inviter, error: inviterError } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('user_id', inviterUserId)
      .maybeSingle()

    if (inviterError || !inviter?.telegram_id) {
      logger.error('❌ [Referral] Пригласивший не найден по user_id', {
        invited: String(invitedTelegramId),
        inviterUserId: String(inviterUserId),
        error: inviterError?.message,
      })
      return
    }

    const outcome = await rewardInviter({
      inviterTelegramId: String(inviter.telegram_id),
      newUserTelegramId: String(invitedTelegramId),
      botName,
    })

    if (outcome.rewarded) {
      logger.info('🎁 [Referral] Награда за первое пополнение приглашённого', {
        inviter: String(inviter.telegram_id),
        invited: String(invitedTelegramId),
        stars: outcome.stars,
      })
    }
  } catch (e) {
    // Пополнение уже состоялось и важнее награды: ронять его нельзя.
    logger.error('❌ [Referral] Исключение при награде за пополнение', {
      invited: String(invitedTelegramId),
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
