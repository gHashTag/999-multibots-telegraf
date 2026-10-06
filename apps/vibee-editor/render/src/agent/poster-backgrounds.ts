/**
 * THE UNDRAWN BACKGROUND, KEPT SO A TITLE NEVER COSTS A SECOND PICTURE (#3733).
 *
 * A poster with a date, time or price is a textless background plus facts
 * drawn by code (#3717). When the agent forgot the title, the only way to add
 * it used to be a whole new paid generation -- and a different background.
 * The background that was already paid for is kept here for a short while,
 * so a follow-up with the same prompt and a title only redraws the overlay.
 *
 * In memory on purpose: a redeploy forgets it, and the worst case is the old
 * path (a new generation). The key carries the person, the client the turn
 * works for and the surface, so one client's background never serves another,
 * and the requested size, so a new size is a new picture (#3736).
 */
export interface Background {
  bytes: Buffer
  contentType: string
  provider: string | null
  at: number
}

const TTL_MS = 30 * 60_000
const MAX = 16
const kept = new Map<string, Background>()

export const promptKey = (prompt: string): string =>
  prompt.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * THE SIZE IS PART OF THE KEY (#3736). A follow-up asking for another size
 * or aspect used to get the kept background back at the old size, silently.
 * Now it misses and pays for a normal generation at the size it asked for.
 *
 * A side that is missing, zero or not a number is the default the route
 * applies (`width || 1024` in render-server.ts /api/generate/image), so "no
 * size" in both calls and "1024" in one of them name the same picture.
 */
export const DEFAULT_SIDE = 1024
const side = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_SIDE
}
export const sizeKey = (width: unknown, height: unknown): string =>
  `${side(width)}x${side(height)}`

const keyOf = (who: string, prompt: string, size: string): string =>
  `${who}\n${size}\n${promptKey(prompt)}`

export function keepBackground(
  who: string,
  prompt: string,
  size: string,
  bg: Omit<Background, 'at'>,
  now = Date.now()
): void {
  const key = keyOf(who, prompt, size)
  kept.delete(key)
  kept.set(key, { ...bg, at: now })
  while (kept.size > MAX) kept.delete(kept.keys().next().value as string)
}

export function backgroundFor(
  who: string,
  prompt: string,
  size: string,
  now = Date.now()
): Background | null {
  const key = keyOf(who, prompt, size)
  const bg = kept.get(key)
  if (!bg) return null
  if (now - bg.at > TTL_MS) {
    kept.delete(key)
    return null
  }
  return bg
}

export function forgetBackgrounds(): void {
  kept.clear()
}
