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

/**
 * THE LANE A CHOICE BELONGS TO (lanes.ts). A person may run a few chats at
 * once in their one browser, and each chat chooses its own tab -- otherwise
 * the second chat's `browser_open` would move the first chat's hands. A
 * caller that names no lane is in this one, and everything below answers it
 * exactly as it did before lanes existed.
 */
export const MAIN_LANE = 'main'

/** Whose choice, then which lane's: telegram id -> lane -> the tab. */
const chosen = new Map<string, Map<string, { id: string; at: number }>>()

export function rememberLaneFront(
  telegramId: string,
  lane: string,
  id: string,
  now: number = Date.now()
): void {
  const lanes = chosen.get(telegramId) ?? new Map()
  lanes.set(lane, { id, at: now })
  chosen.set(telegramId, lanes)
}

/** Drops that lane's choice; with an id, only while it is still that tab. */
export function forgetLaneFront(
  telegramId: string,
  lane: string,
  id?: string
): void {
  const lanes = chosen.get(telegramId)
  if (!lanes) return
  if (!id || lanes.get(lane)?.id === id) lanes.delete(lane)
  if (!lanes.size) chosen.delete(telegramId)
}

export function chosenLaneFront(
  telegramId: string,
  lane: string,
  now: number = Date.now()
): string | null {
  const had = chosen.get(telegramId)?.get(lane)
  if (!had) return null
  if (now - had.at > CHOICE_TTL_MS) {
    forgetLaneFront(telegramId, lane)
    return null
  }
  return had.id
}

export function rememberFront(
  telegramId: string,
  id: string,
  now: number = Date.now()
): void {
  rememberLaneFront(telegramId, MAIN_LANE, id, now)
}

/**
 * Without an id: the default lane lets go of its choice. With one: that tab
 * was closed, and a closed tab is nobody's choice, whichever lane made it.
 */
export function forgetFront(telegramId: string, id?: string): void {
  if (!id) return forgetLaneFront(telegramId, MAIN_LANE)
  for (const lane of [...(chosen.get(telegramId)?.keys() ?? [])])
    forgetLaneFront(telegramId, lane, id)
}

export function chosenFront(
  telegramId: string,
  now: number = Date.now()
): string | null {
  return chosenLaneFront(telegramId, MAIN_LANE, now)
}

/** Every live choice of one person, one per lane. */
export function chosenFrontsOf(
  telegramId: string,
  now: number = Date.now()
): string[] {
  const out: string[] = []
  for (const lane of [...(chosen.get(telegramId)?.keys() ?? [])]) {
    const id = chosenLaneFront(telegramId, lane, now)
    if (id) out.push(id)
  }
  return out
}

/**
 * Every live choice, whoever made it, in whichever lane. A desk knows the
 * pod, not always whose it is, and must not spend the tab a tool is working
 * in (desk-page.ts).
 */
export function chosenFrontIds(now: number = Date.now()): string[] {
  return [...chosen.keys()].flatMap(who => chosenFrontsOf(who, now))
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
