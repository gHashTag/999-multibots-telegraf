/**
 * THE ONE DOOR A DESK OPENS A TAB THROUGH.
 *
 * Found 2026-10-03 while asking why the blog does not reach the networks. The
 * desks -- blog-share, reddit, engage, scenarios -- drive the person's browser
 * over raw CDP, and every one of them opened its tabs with `newPage` straight
 * from cdp.ts. Two rules lived on the other road only:
 *
 * 1. ROOM BEFORE THE OPEN. `browser_open` asks `roomForOne` first, because on
 *    2026-09-27 a fifteenth tab wedged Chromium (tab-sweep.ts). The desks did
 *    not ask: the pod stood at 10 of 12 with a Reddit submit form a share run
 *    had left behind, and one blog-share run opens up to four more (the X
 *    thread, LinkedIn, Reddit, Threads) and keeps the unconfirmed ones open.
 *
 * 2. A TAB IN USE IS NOT LITTER. The five-minute sweep closes every later tab
 *    of an origin, newest first, and protected only the tool's chosen tab. A
 *    desk composing on x.com/compose/post while x.com/home is open is exactly
 *    that later tab: the clock could close the composer between "type" and
 *    "post", and the owner read "thread did not go through".
 *
 * So a desk opens here: room is made first, and the new tab is held for
 * `DESK_HOLD_MS` -- the sweep and the next room-making both pass it over.
 * The hold lives in memory on purpose: the desk run it protects dies with the
 * process too, so a deploy loses nothing a restart has not already lost.
 */
import type { CdpTarget } from './cdp'
import type { SweepPage } from './tab-sweep'

/** Longer than any desk run (a share run measured 3-6 minutes). */
export const DESK_HOLD_MS = 15 * 60_000

const held = new Map<string, number>()

/** Tab ids a desk is working in right now; expired holds are dropped. */
export function deskTabsHeld(now: number = Date.now()): string[] {
  for (const [id, until] of held) if (until <= now) held.delete(id)
  return [...held.keys()]
}

/** For tests: forget every hold. */
export function resetDeskHoldsForTests(): void {
  held.clear()
}

export interface DeskPageIo {
  list: (cdp: string) => Promise<SweepPage[]>
  close: (cdp: string, id: string) => Promise<void>
  open: (cdp: string, url: string) => Promise<CdpTarget>
}

async function realIo(): Promise<DeskPageIo> {
  /*
   * Each export is reached when it is called, not here: tests mock ./cdp in
   * part, and a mock without `listTargets` throws on the read. Inside `list`
   * that throw is the "cannot be listed" case, and the open still happens.
   */
  const cdp = await import('./cdp')
  return {
    list: async c =>
      (await cdp.listTargets(c)).map(t => ({
        id: t.id,
        url: t.url ?? '',
        type: t.type ?? 'page',
      })),
    close: (c, id) => cdp.closePage(c, id),
    open: (c, url) => cdp.newPage(c, url),
  }
}

/**
 * `newPage` for a desk: makes room under `TAB_CAP` first, then holds the new
 * tab. A pod that cannot be listed still gets the open -- the health check
 * reports that trouble, and a desk refused by the tidy-up would only fail
 * later with a worse message.
 */
export async function newDeskPage(
  cdp: string,
  url: string,
  io?: DeskPageIo,
  now: number = Date.now()
): Promise<CdpTarget> {
  const use = io ?? (await realIo())
  try {
    const { roomForOne, namesOfClosed, whereItWas } = await import(
      './tab-sweep'
    )
    const { chosenFrontIds } = await import('./front-page')
    const keep = [...deskTabsHeld(now), ...chosenFrontIds(now)]
    const doomed = roomForOne(await use.list(cdp), keep, undefined, url)
    for (const d of doomed) await use.close(cdp, d.id).catch(() => undefined)
    if (doomed.length)
      console.log(
        `🧹 [tabs] room for a desk tab on ${whereItWas(url)}: ` +
          namesOfClosed(doomed)
      )
  } catch {
    /* No list, no room-making: the open goes ahead. */
  }
  const page = await use.open(cdp, url)
  held.set(page.id, now + DESK_HOLD_MS)
  return page
}
