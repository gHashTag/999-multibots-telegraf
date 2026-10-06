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
 * works for and the surface, so one client's background never serves another.
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

export function keepBackground(
  who: string,
  prompt: string,
  bg: Omit<Background, 'at'>,
  now = Date.now()
): void {
  const key = `${who}\n${promptKey(prompt)}`
  kept.delete(key)
  kept.set(key, { ...bg, at: now })
  while (kept.size > MAX) kept.delete(kept.keys().next().value as string)
}

export function backgroundFor(
  who: string,
  prompt: string,
  now = Date.now()
): Background | null {
  const key = `${who}\n${promptKey(prompt)}`
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
