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
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 10_000

export type HiveNote = {
  kind:
    | 'sweep-idle'
    | 'sweep-card'
    | 'sweep-failed'
    | 'sweep-held'
    | 'card-pressed'
  who: string | null
  what: string
  severity: 'normal' | 'attention' | 'alarm'
}

/*
 * THE DURATION, IN A SHAPE A TOOL CAN READ BACK.
 *
 * Plain ASCII on purpose: `123s`, not `123с`. The two look identical in a
 * terminal and the second one is Cyrillic, so a parser written against the
 * wrong letter finds nothing and reports a journal with no timings -- which
 * is indistinguishable from a journal that has none.
 *
 * Appended after the reason is cut, never before it: the line is read by a
 * person first, and the first words must stay the person and the step.
 */
const TOOK_CHARS = 12

function withTook(text: string, ms?: number): string {
  const body = text.slice(0, 300 - TOOK_CHARS)
  if (!Number.isFinite(ms) || (ms as number) < 0) return text.slice(0, 300)
  return `${body} [${Math.round((ms as number) / 1000)}s]`
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
        what: withTook(prefix + r.why, r.ms),
        severity: 'normal',
      }
    case 'card':
      return {
        kind: 'sweep-card',
        who: owner,
        what: withTook(prefix + r.why, r.ms),
        severity: 'normal',
      }
    /*
     * A HOLD IS SILENT BY DESIGN, AND ONCE IN A WHILE IT SAYS SO.
     *
     * Writing every hold would put a line in the journal every half hour and
     * bury the days when something happened -- which is why it was silent.
     * But silence costs more than noise here: a seller holding a card and a
     * seller whose cron died look exactly the same, and telling them apart
     * meant reasoning about backoff arithmetic against a 24-hour cap.
     *
     * The caller decides WHEN (once per HEARTBEAT_MS); this decides what it
     * says. Its own kind, not `sweep-idle`, because idle means the seller
     * looked and found nothing to do -- counting the two together would spoil
     * the only number that says whether anybody is worth writing to.
     */
    case 'held':
      return {
        kind: 'sweep-held',
        who: owner,
        what: ('жив, держу паузу: ' + prefix + r.why).slice(0, 300),
        severity: 'normal',
      }
    case 'failed':
      // Attention, not alarm: the Telegram error alert already fired for
      // this one (reportSweepOutcome); an alarm here would ring twice.
      return {
        kind: 'sweep-failed',
        who: owner,
        what: withTook(prefix + r.why, r.ms),
        severity: 'attention',
      }
    default:
      return null
  }
}

/*
 * THE PRESS ITSELF, WHICH NOTHING RECORDED.
 *
 * A sweep writes three outcomes into the journal. The act those outcomes
 * exist for -- the owner pressing a button on the card -- wrote nothing at
 * all: a confirmed send records a `written` touch only when the draft carried
 * a lead, a successful press has no log line, and the journal had no kind for
 * it. So the question the whole design's throughput reduces to, "how often
 * does the owner press", could not be answered from production. An
 * investigation on 2026-09-16 listed it as the one thing it could not
 * establish, and it was right: there was nothing to read.
 *
 * Both buttons are written, because "he refused it" is as much an answer as
 * "he sent it" -- and because counting only the sends would make a careful
 * owner look like an idle one.
 *
 * `normal`, not `attention`: a press is the product working, not a problem.
 */
export function noteForPress(
  owner: string,
  action: 'sent' | 'cancelled'
): HiveNote {
  return {
    kind: 'card-pressed',
    who: owner,
    what: action === 'sent' ? 'отправил' : 'не отправил', // cyrillic-ok: journal text
    severity: 'normal',
  }
}

/** Write a press. Never throws; a journal that is down must not eat a press. */
export async function notePressToHive(
  owner: string,
  action: 'sent' | 'cancelled',
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<'noted' | 'not noted'> {
  return postNote(noteForPress(owner, action), opts.fetchImpl)
}

export async function noteSweepToHive(
  owner: string,
  r: SweepOutcome,
  opts: { label?: string; fetchImpl?: typeof fetch } = {}
): Promise<'noted' | 'skipped' | 'not noted'> {
  const note = noteForSweep(owner, r, opts.label)
  if (!note) return 'skipped'
  return postNote(note, opts.fetchImpl)
}

/** One door to the journal, shared by the sweep and the press. */
async function postNote(
  note: HiveNote,
  fetchImpl?: typeof fetch
): Promise<'noted' | 'not noted'> {
  const key = process.env.RENDER_API_KEY || ''
  if (!key) return 'not noted'
  const doFetch = fetchImpl ?? fetch
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
