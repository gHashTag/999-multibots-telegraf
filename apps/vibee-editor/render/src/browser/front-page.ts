/**
 * THE AGENT ACTS IN THE TAB IT CHOSE.
 *
 * 2026-09-22, signing into TikTok: the agent brought Apple's sign-in pop-up
 * to the front (browser_status front, which calls CDP /json/activate) and
 * then typed -- into the TikTok tab behind it. Activating a tab does not
 * reorder /json/list, and "the front page" was read as "the first page in
 * that list". Twenty characters of an address went to the wrong page, and
 * the press after it opened a second pop-up.
 *
 * So a choice is remembered: after browser_status front, the agent's tools
 * act in THAT tab until it is closed, another is chosen, or the choice goes
 * stale. The person's own typing (person-type.ts) is untouched -- they type
 * into what they are looking at, which is the real front window.
 *
 * In memory on purpose: the choice belongs to the turn, not to the person's
 * profile, and a restarted render simply forgets it and takes the first page
 * again.
 */
export interface PageLike {
  id: string
  type?: string
  url: string
}

/** A choice older than this is not a choice any more. */
export const CHOICE_TTL_MS = 30 * 60_000

const chosen = new Map<string, { id: string; at: number }>()

export function rememberFront(
  telegramId: string,
  id: string,
  now: number = Date.now()
): void {
  chosen.set(telegramId, { id, at: now })
}

export function forgetFront(telegramId: string, id?: string): void {
  const had = chosen.get(telegramId)
  if (!id || had?.id === id) chosen.delete(telegramId)
}

export function chosenFront(
  telegramId: string,
  now: number = Date.now()
): string | null {
  const had = chosen.get(telegramId)
  if (!had) return null
  if (now - had.at > CHOICE_TTL_MS) {
    chosen.delete(telegramId)
    return null
  }
  return had.id
}

/** A real page of the person's browsing, not an extension's own page. Pure. */
export const isRealPage = (t: PageLike): boolean =>
  t.type === 'page' && !t.url.startsWith('chrome-extension://')

/**
 * The page to act in: the chosen one while it is still open, else the first
 * real page. Pure.
 */
export function pickFront<T extends PageLike>(
  targets: T[],
  chosenId: string | null
): T | null {
  const real = targets.filter(isRealPage)
  if (chosenId) {
    const still = real.find(t => t.id === chosenId)
    if (still) return still
  }
  return real[0] ?? null
}
