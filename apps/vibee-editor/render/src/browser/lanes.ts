/**
 * PARALLEL CHAT LANES IN THE ONE BROWSER.
 *
 * A person has ONE browser, with their logins in it (windows.ts says why it
 * stays one). Two chats driving it at once used to fight over the one thing
 * they share: the tab the tools act in (front-page.ts). The second chat's
 * `browser_open` chose ITS new tab, and the first chat's next click landed
 * there.
 *
 * So a chat may name a LANE (`lane` on POST /api/agent/chat). The default lane
 * is `main` and is exactly what there was before: tabs, the chosen tab, all of
 * it. Any other lane works in a WINDOW of its own in the same browser -- its
 * first `browser_open` opens the window, later ones walk that window -- and
 * its tools act in its own chosen tab, never in main's.
 *
 * WHAT IS STILL SHARED, and must be:
 *  - the person's wheel: while they drive, every lane stands still (the wheel
 *    is read per person in agent-tools.ts, and a lane changes nothing there);
 *  - the guard, the site list and the password rule: a lane runs the very
 *    same tools, so it passes the very same checks;
 *  - the pod's memory: hence the cap. A person holds at most MAX_WINDOWS
 *    lanes, main included, and a lane idle for CHOICE_TTL_MS is let go -- its
 *    window closed, its choice forgotten.
 *
 * In memory on purpose, like the choice it extends: a lane belongs to the
 * chats that are running, and a restarted render starts with main alone.
 */
import {
  CHOICE_TTL_MS,
  MAIN_LANE,
  chosenLaneFront,
  forgetLaneFront,
  isRealPage,
  rememberLaneFront,
  type PageLike,
} from './front-page'
import {
  MAX_WINDOWS,
  deskWindow,
  type DeskWindow,
  type DeskWindowDeps,
} from './windows'

export { MAIN_LANE }

/** Short, lowercase, and safe to log and to put in a journal row. */
export const LANE_SHAPE = /^[a-z0-9][a-z0-9-]{0,23}$/

export type LaneRead = { ok: true; lane: string } | { ok: false; error: string }

/**
 * The lane a request names. No `lane` at all is the default lane; a string
 * of the right shape is that lane; anything else -- null, a number, an
 * uppercase name, a 25th character -- is a refusal, not a guess. Pure.
 */
export function readLane(raw: unknown): LaneRead {
  if (raw === undefined) return { ok: true, lane: MAIN_LANE }
  if (typeof raw === 'string' && LANE_SHAPE.test(raw))
    return { ok: true, lane: raw }
  return {
    ok: false,
    error:
      'lane must be a string matching ^[a-z0-9][a-z0-9-]{0,23}$ ' +
      '(lowercase letters, digits and dashes, at most 24), or left out for the main lane',
  }
}

/**
 * The tab a lane acts in: its own chosen tab while that is open, and never
 * anybody else's -- main falls back to the first page, a lane does not
 * (agent-tools.ts podOf). A list that did not answer (`null`) is no proof the
 * tab is gone, so the choice stands and the tool itself finds out. Pure.
 */
export function pickLaneFront(
  targets: PageLike[] | null,
  chosenId: string | null
): string | null {
  if (!chosenId) return null
  if (targets === null) return chosenId
  return targets.some(t => t.id === chosenId && isRealPage(t)) ? chosenId : null
}

interface Held {
  at: number
  /** The lane's own window, once its first browser_open has opened one. */
  window?: { endpoint: string; win: DeskWindow }
}

/** telegram id -> lane (never main) -> when it was last used, and its window. */
const held = new Map<string, Map<string, Held>>()

/** Lets the lane go: its choice forgotten, its window given back. */
export function releaseLane(telegramId: string, lane: string): void {
  const lanes = held.get(telegramId)
  const had = lanes?.get(lane)
  lanes?.delete(lane)
  if (lanes && !lanes.size) held.delete(telegramId)
  forgetLaneFront(telegramId, lane)
  /* Best effort, like every window close: a window left open is not a fault. */
  if (had?.window) void had.window.win.close().catch(() => {})
}

/** The person's lanes besides main that are still in use. Idle ones go. */
export function lanesOf(
  telegramId: string,
  now: number = Date.now()
): string[] {
  const lanes = held.get(telegramId)
  if (!lanes) return []
  for (const [lane, h] of [...lanes])
    if (now - h.at > CHOICE_TTL_MS) releaseLane(telegramId, lane)
  return [...(held.get(telegramId)?.keys() ?? [])]
}

export type LaneClaim = { ok: true } | { ok: false; error: string }

/**
 * Takes the lane for this person, or keeps it: a lane in use stays in use,
 * and its chosen tab with it -- a chat that is still working must not find
 * its tab forgotten half an hour after it chose it. Main is always there and
 * always counted. A lane past the cap is refused, with the names of the ones
 * that hold the windows, so the caller can reuse one instead of guessing.
 */
export function claimLane(
  telegramId: string,
  lane: string,
  now: number = Date.now()
): LaneClaim {
  if (lane === MAIN_LANE) return { ok: true }
  const others = lanesOf(telegramId, now)
  if (!others.includes(lane) && others.length + 1 >= MAX_WINDOWS) {
    const minutes = Math.round(CHOICE_TTL_MS / 60_000)
    return {
      ok: false,
      error:
        `this browser already has ${MAX_WINDOWS} lanes working in it ` +
        `(${[MAIN_LANE, ...others].join(', ')}), one window each, and that is the cap. ` +
        `Send this chat in one of those lanes, or wait: a lane is let go after ${minutes} minutes without use.`,
    }
  }
  const lanes = held.get(telegramId) ?? new Map<string, Held>()
  const h = lanes.get(lane) ?? { at: now }
  h.at = now
  lanes.set(lane, h)
  held.set(telegramId, lanes)
  const id = chosenLaneFront(telegramId, lane, now)
  if (id) rememberLaneFront(telegramId, lane, id, now)
  return { ok: true }
}

/**
 * THE LANE'S OWN WINDOW, AT THAT ADDRESS (windows.ts deskWindow): opened by
 * the lane's first browser_open, walked by the later ones, opened again if a
 * restart took it -- and the tab in it becomes the lane's chosen tab. Never
 * for main, which opens tabs as it always has.
 *
 * `depsFor` builds the window calls for one endpoint: a browser restarted on
 * another address is a new browser, so it gets a new window rather than a
 * check against an address that is gone. Injected, so the open-once, the walk
 * and the reopen are tested without a pod.
 */
export async function openInLane(
  telegramId: string,
  lane: string,
  endpoint: string,
  url: string,
  depsFor: (endpoint: string) => DeskWindowDeps,
  now: number = Date.now()
): Promise<{ id: string; url: string }> {
  if (lane === MAIN_LANE)
    throw new Error('the main lane opens tabs, not a window of its own')
  const claim = claimLane(telegramId, lane, now)
  if (!claim.ok) throw new Error(claim.error)
  const h = held.get(telegramId)!.get(lane)!
  if (!h.window || h.window.endpoint !== endpoint)
    h.window = { endpoint, win: deskWindow(depsFor(endpoint)) }
  const id = await h.window.win.at(url)
  rememberLaneFront(telegramId, lane, id, now)
  return { id, url }
}

/** Test seam: every lane of every person let go, windows untouched. */
export function resetLanesForTests(): void {
  for (const [who, lanes] of [...held])
    for (const lane of [...lanes.keys()]) forgetLaneFront(who, lane)
  held.clear()
}
