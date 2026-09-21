import {
  transcribeAndMirror,
  type MediaRow,
  type MediaKind,
} from './media-library'

/**
 * THE RECORDINGS NOBODY EVER READ BACK.
 *
 * Owner, 2026-09-20: "study all my voice messages in the DMs and update the
 * Zep context, so the information is current."
 *
 * They could not be read, and the reason was measured the same day: the
 * transcriber answered `200 OK` with a body it had failed to build, so every
 * recording came back empty. The code did the correct thing with an empty
 * answer -- it wrote `transcribed_at` with `transcript = NULL`, meaning "asked,
 * there were no words". That verdict is now known to be wrong, and nothing
 * would ever ask again: a row marked as read is never re-read.
 *
 * So this exists to ask again, exactly once, for everything that was asked
 * before the transcriber was fixed.
 *
 * ── AND THE ONES NOBODY EVER ASKED ABOUT ───────────────────────────────────
 *
 * Measured 2026-09-21: 346 rows had `transcribed_at IS NULL` -- not "asked and
 * silent", but never asked at all, spanning 2020 to yesterday. Describing a
 * row happens exactly once, as a fire-and-forget on insert; a restart or a
 * failure there leaves the row unread for ever, and the sweep as first written
 * required `transcribed_at IS NOT NULL`, so it walked straight past them. One
 * client alone (Tim, Woody Weed) had 23 files the agent had never perceived,
 * which is why it kept answering his recordings with "send it as text".
 *
 * The sweep now takes both: never asked, or asked while the transcriber was
 * broken. It is no longer audio-only either -- `describeMedia` reads images,
 * sampled video frames and text-like documents too, and those were stranded by
 * the same hole.
 *
 * ── WHY A CUT-OFF AND NOT A FLAG ───────────────────────────────────────────
 *
 * A flag would need a migration and would be read by nothing else ever again.
 * The honest boundary is the moment the fault was fixed: every attempt before
 * it is suspect and every attempt after it is trustworthy. Rows attempted
 * after the cut-off keep their verdict -- some recordings really are silence,
 * and re-reading those forever is a loop that spends money on nothing.
 *
 * ── WHY IT IS SLOW ON PURPOSE ──────────────────────────────────────────────
 *
 * One batch per tick, small. Each recording is a call to a transcriber that
 * takes seconds and is the same one the live chat uses -- a backlog that
 * emptied itself in one burst would make every person talking to the agent at
 * that moment wait behind years of history.
 */

/**
 * Attempts before this instant are the broken ones.
 *
 * MOVED FORWARD ONCE, AND THE REASON MATTERS. The first cut-off assumed the
 * 07:03Z deploy had fixed the transcriber. It had not: the server kept
 * answering 200 with an empty body, in a different shape, until 10:05Z. So
 * every recording judged in between was filed as "no words" on the same false
 * verdict, and the backlog reported `left 0` about a backlog it had excluded.
 *
 * The lesson is the cut-off's own: it is only honest when the fix behind it is
 * MEASURED, not deployed. This one sits after the last observed failure.
 */
export const BROKEN_UNTIL = new Date('2026-09-20T12:00:00Z')

/** How many are re-read per tick. Small: see above. */
export const BATCH = 5

/**
 * The unread: never asked about, or asked while the transcriber was broken.
 *
 * One clause, used by both the count and the fetch, because the two drifting
 * apart is how a backlog reports `left 0` about rows it is excluding.
 * `$1` is BROKEN_UNTIL.
 */
const UNREAD_WHERE = `transcript IS NULL
     AND (transcribed_at IS NULL OR transcribed_at < $1)`

export interface BacklogOutcome {
  /** How many rows are still waiting to be asked again. */
  left: number
  reopened: number
  described: number
  mirrored: number
}

type Pool = Parameters<typeof transcribeAndMirror>[0]

interface Row {
  id: number
  owner_id: string
  lead_id: string
  surface: string
  msg_id: number | null
  at: Date
  out: boolean
  kind: string
  name: string
  mime: string | null
  bytes: number | null
  url: string
  tg_file_unique_id: string | null
  caption: string | null
}

/**
 * Ask again for one batch.
 *
 * Returns what it did, including how many are LEFT -- a backlog that drains
 * silently is one nobody can tell from a backlog that is stuck.
 */
export async function transcribeBacklogOnce(
  pool: Pool,
  now = new Date()
): Promise<BacklogOutcome> {
  const none = { left: 0, reopened: 0, described: 0, mirrored: 0 }

  let rows: Row[]
  let left = 0
  try {
    const counted = await pool.query(
      `SELECT count(*)::int AS n FROM user_media
        WHERE ${UNREAD_WHERE}`,
      [BROKEN_UNTIL]
    )
    left = Number((counted.rows?.[0] as { n?: number })?.n ?? 0)
    if (!left) return none

    /*
     * NEWEST FIRST, for the same reason the waiting-clients watcher takes the
     * newest wait: what somebody said last week shapes an answer today, and
     * what they said in 2019 mostly does not. If the backlog is never fully
     * drained, the part that gets read is the part worth reading.
     */
    const got = await pool.query(
      `SELECT id, owner_id, lead_id, surface, msg_id, at, "out", kind,
              name, mime, bytes, url, tg_file_unique_id, caption
         FROM user_media
        WHERE ${UNREAD_WHERE}
        ORDER BY at DESC
        LIMIT $2`,
      [BROKEN_UNTIL, BATCH]
    )
    rows = (got.rows ?? []) as Row[]
  } catch (e) {
    console.warn(`[backlog] could not be read: ${String(e).slice(0, 160)}`)
    return none
  }
  if (!rows.length) return { ...none, left }

  /*
   * MARKED AS ASKED BEFORE ASKING. If the process dies mid-batch, these five
   * are not re-read for ever on every tick; they simply keep their old
   * verdict, which is the state they were already in. The alternative -- mark
   * after -- turns one crash into an endless loop against a paid endpoint.
   */
  const ids = rows.map(r => r.id)
  await pool.query(
    `UPDATE user_media SET transcribed_at = $2 WHERE id = ANY($1::int[])`,
    [ids, now]
  )

  let described = 0
  let mirrored = 0
  /*
   * One owner at a time: `transcribeAndMirror` takes an owner, and a
   * transcript belongs to the correspondence of exactly one of them. Mixing
   * them in one call would write another person's words into the wrong
   * memory.
   */
  const byOwner = new Map<string, Array<MediaRow & { id: number }>>()
  for (const r of rows) {
    const list = byOwner.get(r.owner_id) ?? []
    list.push({
      id: r.id,
      lead: String(r.lead_id),
      surface: r.surface as MediaRow['surface'],
      msgId: r.msg_id,
      at: new Date(r.at),
      out: Boolean(r.out),
      kind: r.kind as MediaKind,
      name: r.name,
      mime: r.mime,
      bytes: r.bytes,
      url: r.url,
      tgFileUniqueId: r.tg_file_unique_id,
      caption: r.caption,
    })
    byOwner.set(r.owner_id, list)
  }
  for (const [owner, list] of byOwner) {
    const done = await transcribeAndMirror(pool, owner, list)
    described += done.described
    mirrored += done.mirrored
  }

  return {
    left: Math.max(0, left - rows.length),
    reopened: rows.length,
    described,
    mirrored,
  }
}
