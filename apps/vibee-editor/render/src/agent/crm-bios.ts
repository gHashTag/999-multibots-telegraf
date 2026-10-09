/**
 * A CONTACT'S OWN PROFILE BIO, READ POLITELY INTO THE CRM.
 *
 * Owner, 2026-10-09 (course-outreach spec v2): a contact's Telegram bio is
 * what he wrote about himself -- "backend on Go, github.com/..." -- and it
 * counts as his own words when course_outreach decides who is a programmer,
 * by the same two-group rule as his messages.
 *
 * Rules and numbers: gHashTag/t27 specs/automation/course-outreach.t27
 * (vendored in ../spec): bio_next, bio_due, BIOS_PER_RUN, BIO_GAP_MS,
 * BIO_REFRESH_DAYS, BIO_MAX_CHARS, BIO_KEEPS_ONLY_TEXT.
 *
 * HOW IT IS READ. crm_ingest_contacts already holds every contact as the
 * owner's own Telegram session returned it (contacts.GetContacts); for each
 * one whose bio is due, users.GetFullUser through the SAME session, one at a
 * time, BIO_GAP_MS apart, at most BIOS_PER_RUN per run.
 *
 * FLOOD_WAIT IS HONOURED, NOT FOUGHT. gramjs sleeps through a short wait by
 * itself (floodSleepThreshold in telegram-tools.ts); a longer one ends this
 * run, the moment it may resume is written down (crm_bio_wait), and the next
 * run does not call Telegram before it. The walk resumes where it stopped:
 * the people never read come first, then the oldest reads.
 *
 * WHAT IS KEPT: the bio text, cut to BIO_MAX_CHARS, and the time it was read
 * (our own bookkeeping, so a run knows whom it has done). Nothing else of the
 * full user -- photos, common chats, settings, birthday -- is stored, logged
 * or returned. An empty bio stores nothing.
 */
import * as SPEC from '../spec/course-outreach.gen'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: any[] }>
}

/** spec bio_next: a FLOOD_WAIT ends the run; so does the cap. Pure. */
export type BioStep = 'wait' | 'cap' | 'go'
export function bioNext(floodWaitS: number, readThisRun: number): BioStep {
  if (floodWaitS > 0) return 'wait'
  if (readThisRun >= SPEC.BIOS_PER_RUN) return 'cap'
  return 'go'
}

/** spec bio_due: never read, or read BIO_REFRESH_DAYS ago or more. Pure. */
export function bioDue(ageDays: number, neverRead: boolean): boolean {
  return neverRead || ageDays >= SPEC.BIO_REFRESH_DAYS
}

/**
 * The seconds a FLOOD_WAIT asks for, or 0 when the error is something else.
 * gramjs throws FloodWaitError with `seconds`; a raw RPC error says
 * FLOOD_WAIT_<n> (or FLOOD_PREMIUM_WAIT_<n>). Pure.
 */
export function floodSeconds(e: unknown): number {
  const sec = (e as { seconds?: unknown })?.seconds
  if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0)
    return Math.ceil(sec)
  const m = /FLOOD(?:_PREMIUM)?_WAIT_(\d+)/.exec(
    String((e as Error)?.message ?? e)
  )
  return m ? Number(m[1]) : 0
}

/**
 * The bio out of a users.GetFullUser answer, folded to one line and cut to
 * BIO_MAX_CHARS -- and NOTHING else of that answer. '' when there is none.
 * Pure.
 */
export function bioOf(full: unknown): string {
  const about = (full as { fullUser?: { about?: unknown } })?.fullUser?.about
  return typeof about === 'string'
    ? about.replace(/\s+/g, ' ').trim().slice(0, SPEC.BIO_MAX_CHARS)
    : ''
}

export const BIO_COLUMNS = [
  'ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS about text',
  'ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS about_at timestamptz',
] as const

export const BIO_WAIT_TABLE = `CREATE TABLE IF NOT EXISTS crm_bio_wait (
  owner_id text PRIMARY KEY,
  until_at timestamptz NOT NULL
)`

/** One contact as the book returned it: its lead id and what to ask by. */
export interface BookUser {
  lead: string
  /** The InputUser for users.GetFullUser, built by the caller. */
  input: unknown
}

export interface BioIo {
  /** users.GetFullUser for one person, through the owner's own session. */
  full: (input: unknown) => Promise<unknown>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

export interface BioReport {
  /** GetFullUser calls answered this run. */
  bios_read: number
  /** Of them, people whose bio had text. */
  bios_with_text: number
  /** Due people this run did not reach; the next run takes them. */
  bios_left: number
  /** Why the run ended early (a FLOOD_WAIT, a wait still running), or null. */
  bios_stopped: string | null
}

const DAY_S = 86_400

/**
 * Read the due bios of these contacts. Never throws for one person: a
 * person Telegram will not describe is marked read and skipped; a
 * FLOOD_WAIT ends the run and is written down for the next one.
 */
export async function readBios(
  pool: Pool,
  owner: string,
  users: readonly BookUser[],
  io: BioIo
): Promise<BioReport> {
  const report: BioReport = {
    bios_read: 0,
    bios_with_text: 0,
    bios_left: 0,
    bios_stopped: null,
  }
  if (!users.length) return report
  for (const sql of BIO_COLUMNS) await pool.query(sql)
  await pool.query(BIO_WAIT_TABLE)
  const nowS = Math.floor(io.now() / 1000)

  /* A wait from an earlier run is still running: Telegram is not asked. */
  const wait = await pool.query(
    `SELECT EXTRACT(EPOCH FROM until_at) AS until FROM crm_bio_wait
      WHERE owner_id = $1`,
    [owner]
  )
  const until = Number(wait.rows?.[0]?.until) || 0
  const left = Math.max(0, Math.ceil(until - nowS))

  const read = await pool.query(
    `SELECT lead_id, EXTRACT(EPOCH FROM about_at) AS at FROM crm_people
      WHERE owner_id = $1 AND lead_id = ANY($2::text[])`,
    [owner, users.map(u => u.lead)]
  )
  const at = new Map<string, number>()
  for (const r of read.rows ?? [])
    if (r.at !== null && r.at !== undefined)
      at.set(String(r.lead_id), Number(r.at) || 0)
  /* Never read first, then the oldest read: the walk resumes where it stopped. */
  const due = users
    .filter(u =>
      bioDue(
        at.has(u.lead) ? Math.floor((nowS - at.get(u.lead)!) / DAY_S) : 0,
        !at.has(u.lead)
      )
    )
    .sort(
      (a, b) =>
        (at.has(a.lead) ? at.get(a.lead)! : -1) -
        (at.has(b.lead) ? at.get(b.lead)! : -1)
    )

  let flood = left
  let i = 0
  for (; i < due.length; i++) {
    const step = bioNext(flood, report.bios_read)
    if (step === 'wait') {
      report.bios_stopped = `FLOOD_WAIT: bios resume after ${new Date(
        (nowS + flood) * 1000
      ).toISOString()}`
      break
    }
    if (step === 'cap') break
    if (report.bios_read > 0) await io.sleep(SPEC.BIO_GAP_MS)
    const u = due[i]
    let bio = ''
    let answered = true
    try {
      bio = bioOf(await io.full(u.input))
    } catch (e) {
      answered = false
      const s = floodSeconds(e)
      if (s > 0) {
        flood = s
        await pool.query(
          `INSERT INTO crm_bio_wait (owner_id, until_at)
           VALUES ($1, to_timestamp($2))
           ON CONFLICT (owner_id) DO UPDATE SET until_at = EXCLUDED.until_at`,
          [owner, Math.floor(io.now() / 1000) + s]
        )
        i -= 1 /* this person was not read: the loop says "wait" and stops */
        continue
      }
    }
    if (!answered) {
      /*
       * Telegram will not describe this one: marked read so the walk moves
       * on, and a bio read before is left as it was.
       */
      await pool.query(
        `UPDATE crm_people SET about_at = now()
          WHERE owner_id = $1 AND lead_id = $2`,
        [owner, u.lead]
      )
      report.bios_read += 1
      continue
    }
    await pool.query(
      `UPDATE crm_people SET about = $3, about_at = now()
        WHERE owner_id = $1 AND lead_id = $2`,
      [owner, u.lead, bio || null]
    )
    report.bios_read += 1
    if (bio) report.bios_with_text += 1
  }
  report.bios_left = Math.max(0, due.length - i)
  return report
}
