import { record, type JournalPool } from './journal'

/**
 * SOMEBODY WROTE, AND NOBODY ANSWERED.
 *
 * Owner, 2026-09-20: "even in the DMs -- if anybody wrote or writes, find
 * every message and every fault and hand it on; the agents must report."
 *
 * This is the one class of fault that appears in NO log. When a provider dies
 * the bot throws and the error collector counts it; when a person writes "it
 * charged me and nothing came" nothing fails at all -- from the code's side
 * that is an ordinary message. It sat in `crm_messages` and waited for a human
 * to scroll far enough.
 *
 * ── WHY IT LIVES IN THE RENDER ─────────────────────────────────────────────
 *
 * The messages are here. So is the journal, and so is the timer the report
 * already runs on. A watcher in the bot would need a second copy of both.
 *
 * ── WHAT IT WRITES AND WHAT IT REFUSES TO WRITE ────────────────────────────
 *
 * The person, the wait, and whether their last words read like a fault. NEVER
 * the words themselves. The owner can already read them where they live; a
 * journal line is a pointer, and a pointer that quotes a stranger's message
 * turns an append-only log into a second copy of somebody's correspondence.
 *
 * ── ONE NOTE PER SILENCE ───────────────────────────────────────────────────
 *
 * The timer ticks every ten minutes. Without a guard the same waiting person
 * would be written six times an hour for as long as they wait, which is how a
 * board becomes wallpaper -- the lesson `seller-silence` already paid for. A
 * person is written once per unanswered message: the guard is whether a note
 * about them already exists NEWER than their last word.
 */

/**
 * How long a person waits before the wait is worth a line.
 *
 * Three hours, not twelve. This is not a watchdog over a machine -- it is a
 * person who is awake and waiting, and the point of the line is to reach them
 * before they give up rather than to record that they did.
 */
export const WAITING_MS = 3 * 60 * 60_000

/**
 * How many are written per tick.
 *
 * The first run meets the whole history at once: every lead who was ever left
 * unanswered. Writing them all would bury every other kind in the journal on
 * day one. The rest come on the following ticks -- the cap is reported, never
 * silent.
 */
export const PER_TICK = 20

/**
 * PAST THIS, IT IS HISTORY AND NOT A QUEUE.
 *
 * The first production run wrote twenty lines, and every one of them said
 * between 1591 and 2478 days: an imported archive, six and seven years old.
 * Nobody in it is waiting for anything. Worse, the watcher took the OLDEST
 * wait first -- so the board filled with correspondence from 2019 and the
 * person who wrote this morning never appeared at all.
 *
 * Both halves are fixed: nothing older than this is reported, and what is
 * reported comes NEWEST FIRST. A fresh wait is the one somebody can still do
 * something about; an old one is a fact about the past, and a board made of
 * facts about the past is a board nobody opens.
 */
export const TOO_OLD_MS = 30 * 24 * 60 * 60_000

/**
 * Words that mean "something is broken", as a person writes them.
 *
 * Deliberately narrow. This decides SEVERITY, not whether the person is
 * reported, so a miss costs a louder note and never a lost one -- and a wide
 * list would make every mention of money an alarm.
 */
const TROUBLE_WORDS = [
  /* cyrillic-ok: these are words a person writes, not code */
  'не работает',
  'не открыва',
  'не приход',
  'не пришл',
  'не получил',
  'списал',
  'списан',
  'верните',
  'вернуть деньги',
  'ошибк',
  'сломал',
  'завис',
  'не могу оплатить',
  'не могу войти',
  'not working',
  'does not work',
  "doesn't work",
  'refund',
  'broken',
  'charged me',
]

/*
 * Built from the list rather than written as a literal: the repository's
 * no-cyrillic gate reads a regex literal as code, and it is right to -- a
 * pattern is the one place where a letter that merely LOOKS Latin changes
 * behaviour invisibly. The words live in strings, where they belong.
 */
const TROUBLE = new RegExp(`(${TROUBLE_WORDS.join('|')})`, 'i')

export interface WaitingPerson {
  owner: string
  lead: string
  waitedMs: number
  trouble: boolean
}

interface Row {
  owner_id: string
  lead_id: string
  last_in: string | null
  last_out: string | null
  last_words: string | null
}

/**
 * Everybody whose last word is theirs and old enough to count.
 *
 * The whole base in one query: the alternative is a query per owner, and the
 * report's tick is not a place to open hundreds of round trips.
 */
export async function whoIsWaiting(
  pool: JournalPool,
  now: number
): Promise<WaitingPerson[]> {
  const r = await pool.query(
    `WITH agg AS (
       SELECT owner_id, lead_id,
              max(at) FILTER (WHERE NOT "out") AS last_in,
              max(at) FILTER (WHERE "out")     AS last_out
         FROM crm_messages
        GROUP BY owner_id, lead_id
     )
     SELECT agg.owner_id, agg.lead_id, agg.last_in, agg.last_out,
            (SELECT m.text FROM crm_messages m
              WHERE m.owner_id = agg.owner_id AND m.lead_id = agg.lead_id
                AND NOT m."out"
              ORDER BY m.at DESC LIMIT 1) AS last_words
       FROM agg
      WHERE agg.last_in IS NOT NULL
        AND (agg.last_out IS NULL OR agg.last_in > agg.last_out)
      ORDER BY agg.last_in DESC`,
    []
  )
  const out: WaitingPerson[] = []
  let tooOld = 0
  for (const raw of (r.rows ?? []) as Row[]) {
    const lastIn = raw.last_in ? new Date(raw.last_in).getTime() : NaN
    if (!Number.isFinite(lastIn)) continue
    const waitedMs = now - lastIn
    if (waitedMs < WAITING_MS) continue
    // History, not a queue -- see TOO_OLD_MS. Counted by the caller so the
    // silence about them is a number rather than an absence.
    if (waitedMs > TOO_OLD_MS) {
      tooOld++
      continue
    }
    out.push({
      owner: String(raw.owner_id),
      lead: String(raw.lead_id),
      waitedMs,
      // The words are READ here and never leave this function.
      trouble: TROUBLE.test(String(raw.last_words ?? '')),
    })
  }
  if (tooOld) lastTooOld = tooOld
  return out
}

/**
 * How many were passed over as history on the last look.
 *
 * Module state rather than a return value: `whoIsWaiting` answers "who is
 * waiting", and a second number in that answer would have to be threaded
 * through every caller to be printed once. It exists to be LOGGED -- a cap
 * that drops people silently is the thing this file argues against.
 */
let lastTooOld = 0
export function historySkippedOnLastLook(): number {
  return lastTooOld
}

/** The line for one waiting person: the wait, the reason, never the words. */
export function lineFor(p: WaitingPerson): string {
  const hours = Math.round(p.waitedMs / 3600_000)
  const how = hours >= 48 ? `${Math.round(hours / 24)} дн` : `${hours} ч` // cyrillic-ok: journal text
  return p.trouble
    ? // cyrillic-ok-next-line: journal text
      `написал о неисправности и ждёт ${how} — ответить и разобраться`
    : // cyrillic-ok-next-line: journal text
      `написал и ждёт ответа ${how}`
}

/**
 * Write the people who are waiting, at most one note each per message.
 *
 * Returns what it did, so the caller can log it: a watcher that reports
 * nothing about itself is the thing this whole journal exists against.
 */
export async function checkWaitingClients(
  pool: JournalPool,
  now = Date.now()
): Promise<{
  waiting: number
  written: number
  deferred: number
  history: number
}> {
  let waiting: WaitingPerson[]
  try {
    waiting = await whoIsWaiting(pool, now)
  } catch {
    // An unreadable table is not "nobody is waiting". It is nothing known,
    // and a watcher that turns an unknown into a comfortable zero is worse
    // than no watcher.
    return { waiting: -1, written: 0, deferred: 0, history: 0 }
  }

  let written = 0
  let considered = 0
  for (const p of waiting) {
    if (written >= PER_TICK) break
    considered++
    let already = false
    try {
      const seen = await pool.query(
        `SELECT 1 FROM hive_events
          WHERE kind = 'client-unanswered' AND who = $1
            AND at > $2::timestamptz
          LIMIT 1`,
        [p.lead, new Date(now - p.waitedMs).toISOString()]
      )
      already = Boolean(seen.rows?.length)
    } catch {
      // Unknown again -- and here the safe direction is the opposite one:
      // writing a duplicate line costs the owner a glance, while skipping
      // costs a customer.
      already = false
    }
    if (already) continue
    await record(pool, {
      kind: 'client-unanswered',
      who: p.lead,
      what: lineFor(p),
      severity: p.trouble ? 'alarm' : 'attention',
    })
    written++
  }
  return {
    waiting: waiting.length,
    written,
    deferred: Math.max(0, waiting.length - considered),
    history: historySkippedOnLastLook(),
  }
}
