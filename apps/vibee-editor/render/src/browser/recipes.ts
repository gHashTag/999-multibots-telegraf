/**
 * THE AGENT LEARNS THE BUTTONS OF EACH SITE, FROM ITS OWN PRESSES.
 *
 * Owner, 2026-09-23: "self-improvement through training". A press by label
 * is the agent's one reliable move (find-target.ts), and the label is the
 * thing sites change: X's "Sign in with Google" became "Continue with
 * Google" overnight, and LinkedIn answers in Russian where the recipe says
 * "Post". Each press that worked is kept as (host, what was asked) -> the
 * label that actually answered; when the asked words are not on the page,
 * the remembered label is tried before giving up, and a press that works
 * that way REPLACES the recipe. So every site the person uses gets a little
 * better with use, and nothing is invented: only labels that were really
 * pressed are stored.
 *
 * Deliberately not a model's memory: a row per (host, want), read in one
 * query, written after the press. No page text, no values -- a label is what
 * anybody looking at the screen can read.
 */
import type { Queryable } from './sessions'

/** The site a URL belongs to, without www. Pure. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '').slice(0, 120)
  } catch {
    return ''
  }
}

/** What the agent asked for, as a key. Pure. */
export function wantKey(text: string): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

let ready = false
export async function ensureRecipes(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS browser_recipes (
    host text NOT NULL,
    want text NOT NULL,
    label text NOT NULL,
    how text NOT NULL DEFAULT 'text',
    hits integer NOT NULL DEFAULT 1,
    at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (host, want)
  )`)
  ready = true
}
export function resetRecipesForTests(): void {
  ready = false
}

/** Keep what worked. Never throws: a lesson lost is better than a press lost. */
export async function rememberPress(
  q: Queryable,
  input: { url: string; want: string; label: string; how?: string }
): Promise<void> {
  const host = hostOf(input.url)
  const want = wantKey(input.want)
  const label = String(input.label ?? '')
    .trim()
    .slice(0, 160)
  if (!host || !want || !label) return
  try {
    await ensureRecipes(q)
    await q.query(
      `INSERT INTO browser_recipes (host, want, label, how) VALUES ($1, $2, $3, $4)
       ON CONFLICT (host, want) DO UPDATE SET
         label = EXCLUDED.label,
         how = EXCLUDED.how,
         hits = browser_recipes.hits + 1,
         at = now()`,
      [host, want, label, input.how || 'text']
    )
  } catch (e) {
    console.warn('[browser:recipes] not kept:', String(e).slice(0, 160))
  }
}

/** The label that worked here last time, or null. Never throws. */
export async function learnedLabel(
  q: Queryable,
  url: string,
  want: string
): Promise<string | null> {
  const host = hostOf(url)
  const key = wantKey(want)
  if (!host || !key) return null
  try {
    await ensureRecipes(q)
    const { rows } = await q.query(
      `SELECT label FROM browser_recipes WHERE host = $1 AND want = $2`,
      [host, key]
    )
    const label = (rows[0] as { label?: unknown } | undefined)?.label
    return typeof label === 'string' && label.trim() ? label : null
  } catch (e) {
    console.warn('[browser:recipes] not read:', String(e).slice(0, 160))
    return null
  }
}

/** Is this remembered label worth trying instead of what was asked? Pure. */
export function worthTrying(
  want: string,
  learned: string | null | undefined
): boolean {
  if (!learned) return false
  return wantKey(learned) !== wantKey(want)
}
