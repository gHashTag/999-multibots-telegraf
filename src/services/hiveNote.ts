import { logger } from '@/utils/logger'
import type { SweepOutcome } from './crmProactive'

/**
 * THE SWEEP WRITES ITSELF INTO THE HIVE JOURNAL.
 *
 * Owner, 2026-09-11: "write every sweep into the hive journal." Until now a
 * sweep had two voices -- an error alert in Telegram when it failed, and a
 * Railway log line nobody reads when it did not. Seventy quiet sweeps and
 * seventy broken ones looked the same from the owner's phone.
 *
 * Every outcome that means the sweep RAN (idle / card / failed) goes to the
 * render's journal over the server key; the queen's report tallies them
 * ("обход продавца: тихо — 46") and "покажи тревоги" in the agent chat shows
 * the failed ones with the model that produced them. `held` and `busy` are
 * not sweeps -- the previous card is still waiting, or a run overlapped --
 * and writing them would count the same waiting card forty times.
 *
 * NEVER THROWS, NEVER WAITS LONG. A journal that is down must not stop the
 * seller; the alert channel for failures (reportSweepOutcome) is untouched.
 */
const BASE =
  process.env.RENDER_BASE_URL || 'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 10_000

export type HiveNote = {
  kind: 'sweep-idle' | 'sweep-card' | 'sweep-failed'
  who: string | null
  what: string
  severity: 'normal' | 'attention' | 'alarm'
}

/** What the journal should say about this outcome, or null for non-sweeps. */
export function noteForSweep(
  owner: string,
  r: SweepOutcome,
  label?: string
): HiveNote | null {
  const prefix = label ? `${label}: ` : ''
  switch (r.did) {
    case 'idle':
      return {
        kind: 'sweep-idle',
        who: owner,
        what: (prefix + r.why).slice(0, 300),
        severity: 'normal',
      }
    case 'card':
      return {
        kind: 'sweep-card',
        who: owner,
        what: (prefix + r.why).slice(0, 300),
        severity: 'normal',
      }
    case 'failed':
      // Attention, not alarm: the Telegram error alert already fired for
      // this one (reportSweepOutcome); an alarm here would ring twice.
      return {
        kind: 'sweep-failed',
        who: owner,
        what: (prefix + r.why).slice(0, 300),
        severity: 'attention',
      }
    default:
      return null
  }
}

export async function noteSweepToHive(
  owner: string,
  r: SweepOutcome,
  opts: { label?: string; fetchImpl?: typeof fetch } = {}
): Promise<'noted' | 'skipped' | 'not noted'> {
  const note = noteForSweep(owner, r, opts.label)
  if (!note) return 'skipped'
  const key = process.env.RENDER_API_KEY || ''
  if (!key) return 'not noted'
  const doFetch = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await doFetch(`${BASE}/api/hive/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify(note),
      signal: ac.signal,
    })
    if (!res.ok) {
      logger.warn('[crm-proactive] hive note refused', {
        status: res.status,
        kind: note.kind,
      })
      return 'not noted'
    }
    return 'noted'
  } catch (e) {
    logger.warn('[crm-proactive] hive note failed', {
      error: e instanceof Error ? e.message : String(e),
      kind: note.kind,
    })
    return 'not noted'
  } finally {
    clearTimeout(timer)
  }
}
