/**
 * Crediting a bot owner's free club month -- through the ledger, as a grant.
 *
 * `creditStarsPayment` (stars-credit.ts) is for money: it locks on a Telegram
 * charge id and writes kind 'purchase' / "Telegram Stars". A free month has no
 * charge and is not a purchase; writing it as one would make the owner's own
 * income report count tokens nobody paid for. So the grant has its own door:
 * the same `moveTokens` (one function moves tokens), kind 'grant', with the
 * period's ref. The idempotency lock is the `club_grant_period` row in
 * club-membership.ts, not this file.
 */
import { moveTokens } from './token-ledger'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> }

export async function creditClubGrant(
  pool: Queryable,
  g: { telegramId: string; tokens: number; ref: string; grant: 'owner' | 'keeper' }
): Promise<{ credited: boolean; reason?: string }> {
  if (!(g.tokens > 0) || !g.telegramId) {
    return { credited: false, reason: 'no amount or recipient' }
  }
  const moved = await moveTokens(pool, {
    telegramId: g.telegramId,
    delta: g.tokens,
    kind: 'grant',
    reason:
      g.grant === 'keeper'
        ? 'клуб: месяц хранителя' // cyrillic-ok: ledger reason shown to the person
        : 'клуб: месяц владельца бота', // cyrillic-ok: ledger reason shown to the person
    ref: g.ref,
    meta: { club_grant: g.grant, ref: g.ref },
  })
  return moved.ok
    ? { credited: true }
    : { credited: false, reason: moved.reason }
}
