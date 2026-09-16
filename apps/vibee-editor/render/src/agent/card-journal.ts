import { onOrphaned } from './tg-proposals'
import type { OrphanReason, PublicProposal } from './tg-proposals'
import { record } from '../hive/journal'
import type { JournalPool } from '../hive/journal'

/**
 * EVERY CARD THAT LEAVES UNSENT LEAVES A LINE.
 *
 * MEASURED FROM THE HIVE JOURNAL 2026-09-16: the seller prepared 62 cards in
 * five and a half days, about eleven a day. The CRM holds five `written`
 * touches in total. So 57 proposals went somewhere, and nothing anywhere
 * recorded where: the queue keeps one draft per person, a new card replaces
 * the previous, and the previous vanished without a trace because the only
 * listener cared about invoices and pictures.
 *
 * "62 prepared, 5 sent, 57 nowhere" was not a fact anybody could look up. It
 * is now, and the funnel it belongs to is the one question the owner keeps
 * asking: where do the proposals go.
 *
 * WHAT IS WRITTEN: the owner, the reason, and the kind of action. NOT the
 * client, not the text, not the target. A journal line is read by a person
 * looking at a funnel; who the card was for is in Telegram, where that
 * belongs.
 */
type GetPool = () => JournalPool | Promise<JournalPool>

let wired = false

/**
 * Register once per process, beside the invoice bookkeeper. Separate from it
 * on purpose: one cares about money left pending, this one about proposals
 * that evaporated, and a single listener doing both would filter for the
 * stricter of the two -- which is how the plain cards came to be invisible.
 */
export function wireCardJournal(getPool: GetPool): void {
  if (wired) return
  wired = true
  onOrphaned((p, reason) => {
    // Fire and forget: nobody awaits a bookkeeping line, and a slow database
    // must not hold the press that caused it.
    void noteCardDropped(getPool, p, reason)
  })
}

/** For tests: forget the registration so the next wire takes effect. */
export function unwireCardJournal(): void {
  wired = false
}

/** Severity is deliberately flat: this is a funnel, not an alarm. */
export async function noteCardDropped(
  getPool: GetPool,
  p: PublicProposal,
  reason: OrphanReason
): Promise<'recorded' | 'not recorded'> {
  try {
    const pool = await getPool()
    return await record(pool, {
      kind: 'card-dropped',
      who: String(p.telegramId ?? '') || null,
      // Reason first, so a hundred of these read as a tally rather than prose.
      what: `${reason}: ${String(p.action ?? 'card')}`,
      severity: 'normal',
    })
  } catch {
    return 'not recorded'
  }
}
