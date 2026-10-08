/**
 * A STORY REEL'S POSTER (plan-reel.t27 v3).
 *
 * The preview of a story reel -- on its plan card, in "My reels", on the
 * cabinet's story card -- was the video itself, asked for its frame at
 * PREVIEW_SEEK_MS: every card fetched the reel's metadata to show one
 * picture, and a phone's webview may draw nothing before playback. The feed's
 * videos already carried a cover drawn by the server; a story reel did not.
 *
 * Now the server draws that same frame once, POSTER_W wide (the card at the
 * densest screen), and keeps it in story_jobs.poster:
 *
 *   NULL      never tried                    (POSTER_NONE)
 *   ''        tried, nothing drawn           (POSTER_TRIED: the browser's frame stands)
 *   a link    drawn and kept                 (POSTER_KEPT: the card shows it)
 *
 * The reel is out before its poster is drawn: nothing here delays it, fails
 * it, or charges for it, and nothing here throws.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as SPEC from '../spec/plan-reel.gen'

type Pool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows: any[] }>
}

/** spec picture_of: a kept poster is the picture; else the browser's frame. */
export function pictureOf(poster: number): number {
  return poster === SPEC.POSTER_KEPT ? SPEC.PICTURE_POSTER : SPEC.PICTURE_FRAME
}

/** spec poster_swept: only a reel that came out, and only if never tried. */
export function posterSwept(reelOut: boolean, poster: number): boolean {
  return reelOut && poster === SPEC.POSTER_NONE
}

/** spec posters_this_round: how many of the waiting posters one round draws. */
export function postersThisRound(waiting: number): number {
  return Math.min(waiting, SPEC.POSTER_SWEEP_MAX)
}

/** The state of a stored poster column (see the table above). */
export function posterState(stored: unknown): number {
  if (stored === null || stored === undefined) return SPEC.POSTER_NONE
  return String(stored).trim() ? SPEC.POSTER_KEPT : SPEC.POSTER_TRIED
}

/** The poster a card may show: the stored link when one is kept, else none. */
export function posterOf(stored: unknown): string | undefined {
  return pictureOf(posterState(stored)) === SPEC.PICTURE_POSTER
    ? String(stored).trim()
    : undefined
}

/**
 * ffmpeg's arguments for the frame: the seek before the input (a quick jump,
 * not a decode from the start), one frame, POSTER_W wide at 9:16's height.
 */
export function posterArgs(video: string, out: string): string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-ss',
    (SPEC.PREVIEW_SEEK_MS / 1000).toFixed(3),
    '-i',
    video,
    '-frames:v',
    '1',
    '-vf',
    `scale=${SPEC.POSTER_W}:-2`,
    '-q:v',
    '4',
    '-y',
    out,
  ]
}

export interface PosterPort {
  /** Run ffmpeg; rejects when it exits non-zero. */
  ffmpeg: (args: string[]) => Promise<unknown>
  /** Put the bytes on the shelf; the link it is served at. */
  put: (bytes: Buffer, name: string, mime: string) => Promise<{ url: string }>
}

/** Draw one reel's poster; null when it could not be drawn. Never throws. */
export async function drawPoster(
  port: PosterPort,
  video: string
): Promise<string | null> {
  if (!/^https?:\/\//.test(video)) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-poster-'))
  const out = path.join(dir, 'poster.jpg')
  try {
    await port.ffmpeg(posterArgs(video, out))
    if (!fs.existsSync(out) || fs.statSync(out).size === 0) return null
    const shelf = await port.put(
      fs.readFileSync(out),
      'reel-poster.jpg',
      'image/jpeg'
    )
    return shelf?.url ? String(shelf.url) : null
  } catch (e) {
    console.warn('[story] poster not drawn:', String(e).slice(0, 200))
    return null
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Draw and keep the poster of one job that came out. The row is claimed first
 * (NULL -> ''), so two processes -- they overlap for a minute on every
 * deploy -- never draw it twice, and a poster that fails stays tried and is
 * left to the browser. The link when one was kept, else null. Never throws.
 */
export async function keepPoster(
  pool: Pool,
  draw: (video: string) => Promise<string | null>,
  id: number,
  video: string
): Promise<string | null> {
  try {
    const claim = await pool.query(
      `UPDATE story_jobs SET poster = '' WHERE id = $1 AND poster IS NULL RETURNING id`,
      [id]
    )
    if (!claim?.rows?.length) return null
    const url = await draw(video).catch(() => null)
    if (!url) return null
    await pool.query(`UPDATE story_jobs SET poster = $2 WHERE id = $1`, [
      id,
      url,
    ])
    console.log(`[story] job ${id}: poster kept`)
    return url
  } catch (e) {
    console.warn(`[story] job ${id}: poster not kept:`, String(e).slice(0, 200))
    return null
  }
}

/**
 * The sweep's share: the reels that came out without a poster (before v3, or
 * their process died before drawing it), newest first, POSTER_SWEEP_MAX a
 * round, one after another. How many were kept.
 */
export async function sweepPosters(
  pool: Pool,
  draw: (video: string) => Promise<string | null>
): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT id, url, poster FROM story_jobs
        WHERE status = 'done' AND url IS NOT NULL AND poster IS NULL
        ORDER BY id DESC LIMIT $1`,
      [SPEC.POSTER_SWEEP_MAX]
    )
    const rows = (r?.rows ?? []).filter((x: any) =>
      posterSwept(!!x.url, posterState(x.poster))
    )
    let kept = 0
    for (const x of rows.slice(0, postersThisRound(rows.length)))
      if (await keepPoster(pool, draw, Number(x.id), String(x.url))) kept++
    return kept
  } catch {
    return 0 // no poster column yet: the next round has one
  }
}
