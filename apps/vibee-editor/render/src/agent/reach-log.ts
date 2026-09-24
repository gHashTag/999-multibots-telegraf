/**
 * THE SHAPE OF EVERY POST IS WRITTEN DOWN WHEN IT GOES OUT.
 *
 * The owner promised a reader the numbers either way (reach-test.ts), and a
 * promise like that is kept by the boring part: a row per post, written at
 * the moment of posting, with the shape it took. Reach is filled in later by
 * whoever reads it off X -- a row with no number stays an unanswered
 * question, and the comparison refuses to speak until there are enough of
 * both shapes.
 *
 * Kept apart from blog-share so the recording cannot break the posting: a
 * lost row is a lost measurement, a failed post is a lost article.
 */
import type { Queryable } from '../browser/sessions'
import type { Posted, Shape } from './reach-test'

let ready = false
export async function ensureReachLog(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS blog_reach (
    slug text PRIMARY KEY,
    shape text NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    reach integer
  )`)
  ready = true
}
export function resetReachLogForTests(): void {
  ready = false
}

/** Write down how a post went out. Never throws. */
export async function noteShape(
  q: Queryable,
  slug: string,
  shape: Shape
): Promise<void> {
  if (!slug) return
  try {
    await ensureReachLog(q)
    await q.query(
      `INSERT INTO blog_reach (slug, shape) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET shape = EXCLUDED.shape`,
      [slug, shape]
    )
  } catch (e) {
    console.warn('[blog-reach] not kept:', String(e).slice(0, 160))
  }
}

/** Fill in what X reported for a post. Never throws. */
export async function noteReach(
  q: Queryable,
  slug: string,
  reach: number
): Promise<void> {
  if (!slug || !Number.isFinite(reach) || reach < 0) return
  try {
    await ensureReachLog(q)
    await q.query(`UPDATE blog_reach SET reach = $2 WHERE slug = $1`, [
      slug,
      Math.round(reach),
    ])
  } catch (e) {
    console.warn('[blog-reach] not filled:', String(e).slice(0, 160))
  }
}

/** Every post we know of, newest first. Never throws. */
export async function postsSoFar(q: Queryable): Promise<Posted[]> {
  try {
    await ensureReachLog(q)
    const { rows } = await q.query(
      `SELECT slug, shape, at, reach FROM blog_reach ORDER BY at DESC LIMIT 200`
    )
    return (rows as Array<Record<string, unknown>>).map(r => ({
      slug: String(r.slug),
      shape: (r.shape === 'thread' ? 'thread' : 'single') as Shape,
      at: String(r.at),
      reach:
        typeof r.reach === 'number' && Number.isFinite(r.reach)
          ? r.reach
          : null,
    }))
  } catch (e) {
    console.warn('[blog-reach] not read:', String(e).slice(0, 160))
    return []
  }
}
