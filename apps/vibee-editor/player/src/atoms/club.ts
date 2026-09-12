/*
 * THE CLUB, CLIENT SIDE.
 *
 * Owner, 2026-09-09: "this is the price of entering the club, a monthly
 * payment: 10 000 Stars per 30 days, 30% back in tokens on the balance".
 * The server (render/src/agent/club-membership.ts) owns every number; this
 * file only asks it and never hard-codes a price, so a change on the server
 * cannot leave the screen lying about what the person is about to pay.
 *
 * Three calls, all behind the owner's Telegram identity:
 *   GET  /api/club/status  — is the membership active, until when, and the
 *                            current price / period / tokens per period;
 *   POST /api/club/invoice — a Telegram Stars subscription invoice link;
 *   POST /api/club/verify  — after "paid": books the charge from the first
 *                            source (getStarTransactions) and credits tokens.
 *
 * Verification is retried a few times because Stars appear in the ledger
 * with a lag; a failure to see them is reported as "not yet", never as
 * "credited".
 */
import { atom } from 'jotai'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { openInvoice } from '@/lib/telegram'
import { reportPayOutcome } from '@/lib/payOutcome'

/** Why the club is open without a charge; null = paid (or not a member). */
export type ClubGrant = 'owner' | 'keeper' | 'guest' | null

export interface ClubStatus {
  active: boolean
  /**
   * Bot owners (their bots in `avatars`) and keepers enter without paying
   * (owner, 2026-09-10). The server decides; this side only shows it.
   */
  granted: ClubGrant
  until: string | null
  days_left: number
  periods: number
  stars: number
  period_days: number
  tokens_per_period: number
}

export type ClubBuyOutcome =
  | 'joined'
  | 'already_active'
  | 'cancelled'
  | 'failed'
  | 'unsupported'
  | 'pending'

/** null = not asked yet; the screen shows a skeleton until the first answer. */
export const clubStatusAtom = atom<ClubStatus | null>(null)
export const clubErrorAtom = atom<string | null>(null)
export const clubBusyAtom = atom(false)

const VERIFY_ATTEMPTS = 3
const VERIFY_PAUSE_MS = 25_000

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const loadClubStatusAtom = atom(null, async (_get, set) => {
  set(clubErrorAtom, null)
  try {
    const r = await fetch(`${API_BASE}/api/club/status`, {
      headers: authHeaders(),
    })
    const d = (await r.json()) as Partial<ClubStatus> & {
      ok?: boolean
      error?: string
    }
    if (!r.ok || d.ok === false) {
      throw new Error(String(d.error ?? `HTTP ${r.status}`))
    }
    set(clubStatusAtom, {
      active: !!d.active,
      granted:
        d.granted === 'owner' ||
        d.granted === 'keeper' ||
        d.granted === 'guest'
          ? d.granted
          : null,
      until: d.until ?? null,
      days_left: Number(d.days_left ?? 0),
      periods: Number(d.periods ?? 0),
      stars: Number(d.stars ?? 0),
      period_days: Number(d.period_days ?? 0),
      tokens_per_period: Number(d.tokens_per_period ?? 0),
    })
  } catch (e) {
    set(clubErrorAtom, e instanceof Error ? e.message : String(e))
  }
})

/**
 * Buy a period. Resolves with what actually happened; the caller decides
 * what to say. `pending` means Telegram reported "paid" but the ledger did
 * not show the charge within the retry window — the hourly sweep on the
 * server will book it, and the status atom is left as it was.
 */
export const joinClubAtom = atom(
  null,
  async (_get, set): Promise<ClubBuyOutcome> => {
    set(clubBusyAtom, true)
    set(clubErrorAtom, null)
    try {
      const headers = authHeaders({ 'Content-Type': 'application/json' })
      const ir = await fetch(`${API_BASE}/api/club/invoice`, {
        method: 'POST',
        headers,
        body: '{}',
      })
      const inv = (await ir.json()) as {
        ok: boolean
        link?: string
        // The cashier's answer (club-membership.ts): the price it charged,
        // reported with the outcome so a failed payment says how much.
        stars?: number
        already_active?: boolean
        error?: string
      }
      if (!inv.ok) {
        if (inv.already_active) {
          await set(loadClubStatusAtom)
          return 'already_active'
        }
        throw new Error(String(inv.error ?? `HTTP ${ir.status}`))
      }
      if (!inv.link) throw new Error('no invoice link')

      const status = await openInvoice(inv.link)
      if (status !== 'paid') {
        // The keepers hear it too (payOutcome.ts): a closed cashier is a
        // note, a failed one is an alarm.
        reportPayOutcome('club', status, { stars: inv.stars })
        return status
      }

      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
        const vr = await fetch(`${API_BASE}/api/club/verify`, {
          method: 'POST',
          headers,
          body: '{}',
        })
        const vd = (await vr.json()) as { ok?: boolean; active?: boolean }
        if (vd.ok && vd.active) {
          await set(loadClubStatusAtom)
          return 'joined'
        }
        if (attempt < VERIFY_ATTEMPTS - 1) await pause(VERIFY_PAUSE_MS)
      }
      // Telegram said "paid", the ledger did not show it in time: alarm.
      reportPayOutcome('club', 'pending')
      return 'pending'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set(clubErrorAtom, msg)
      reportPayOutcome('club', 'failed', { error: msg })
      return 'failed'
    } finally {
      set(clubBusyAtom, false)
    }
  }
)
