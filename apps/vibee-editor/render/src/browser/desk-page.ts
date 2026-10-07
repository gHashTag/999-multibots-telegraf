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
import type { Queryable } from './sessions'
import type { SweepPage } from './tab-sweep'

/**
 * Whose browser this desk drives. Required, so no desk can open a tab
 * without saying whose list it answers to (site-rules.ts).
 */
export interface DeskWho {
  pool: Queryable
  telegramId: string
}

/** What a desk hears when the tab shows Chromium's error page. */
export const DID_NOT_LOAD =
  "the page did not load: the tab shows Chromium's error page, not the site"

/**
 * THE ONE CHECK EVERY DESK ROAD PASSES: may this desk be at `url` for this
 * person? Throws `blockedError` for a blocked site and `UNREADABLE_LIST` when
 * the list cannot be read. An address that cannot be parsed ('' from a tab
 * that is gone, a page still loading) is refused while the list blocks
 * anything: the unknown place may be the blocked one (agent-tools.ts
 * mustNotBeOn, same rule). Used by newDeskPage, by the desks that navigate a
 * window of their own (rounds), read through a tab already open (reddit) or
 * act on the tab in front (scenarios) -- found by the bee on #3488.
 *
 * Chromium's own error page (`chrome-error://`, "This site can't be
 * reached") is refused ALWAYS, list or no list: it is not a place, it is
 * the page that did not load. Read as one, a round reported a dead site as
 * seen and sent the error text to the person as its news; with a block on
 * the list the same look failed instead (the bee on #3488 saw only that
 * half).
 */
export async function deskMayGo(who: DeskWho, url: string): Promise<void> {
  await rulesAt(who, url)
}

/** deskMayGo's work, handing back the list it read for deskMayAct. */
async function rulesAt(
  who: DeskWho,
  url: string
): Promise<import('./site-rules').SiteRuleRow[]> {
  if (/^chrome-error:/i.test(url.trim())) throw new Error(DID_NOT_LOAD)
  const { siteRulesOf, ruleFor, blockedError, UNREADABLE_LIST } = await import(
    './site-rules'
  )
  const rules = await siteRulesOf(who.pool, who.telegramId)
  if (rules === null) throw new Error(UNREADABLE_LIST)
  if (ruleFor(url, rules) === 'block') throw blockedError(url)
  let known = false
  try {
    known = /^(https?|about|chrome):$/.test(new URL(url).protocol)
  } catch {
    /* Not an address at all: unknown. */
  }
  if (!known && rules.some(r => r.rule === 'block'))
    throw new Error(
      'the desk cannot tell which site this tab is on, and the person has ' +
        'blocked sites: refused (the unknown place may be a blocked one)'
    )
  return rules
}

/** What a desk hears when the person is driving the browser themselves. */
export const DESK_WHEEL_TAKEN =
  'the person has taken the wheel and is driving the browser themselves: ' +
  'the desk presses and types nothing until they hand it back'

/** What a desk hears on an "ask" site, or a sensitive one, with no fresh yes. */
export function deskNeedsYes(where: string): string {
  return (
    `acting on ${where} needs the person's fresh yes (their list says ` +
    '"ask", or the place is guarded for everyone): nothing pressed or typed'
  )
}

/**
 * THE CHECK BEFORE A DESK PRESSES OR TYPES (found 2026-10-03).
 *
 * The agent tools refuse to act on an "ask" site, a bank, a mail box or an
 * address they cannot read unless the person said yes in the last five
 * minutes (agent-tools.ts mustBeAllowedToAct). The desks -- blog-share,
 * reddit, engage, scenarios -- press and type over raw CDP, and only asked
 * deskMayGo, which knows "block" and nothing else: a person who put x.com
 * on "ask" still had the blog desk post there with no question. The same
 * guard, the same window, the same fail-closed reading of an unknown place.
 *
 * And the wheel: while the person drives, the tools act on nothing; a desk
 * typing into the page under their hands is the second pilot fighting the
 * first.
 */
export async function deskMayAct(
  who: DeskWho,
  url: string,
  now: number = Date.now()
): Promise<void> {
  const rules = await rulesAt(who, url)
  const { ruleFor } = await import('./site-rules')
  const { readSession, personHasTheWheel } = await import('./sessions')
  const { mayAct } = await import('./guard')
  const session = await readSession(who.pool, who.telegramId)
  if (personHasTheWheel(session, now)) throw new Error(DESK_WHEEL_TAKEN)
  const verdict = mayAct({
    url,
    allowedAtMs: session?.allowedAtMs ?? null,
    allowedHost: session?.allowedHost ?? null,
    nowMs: now,
    alsoSensitive: ruleFor(url, rules) === 'ask',
  })
  if (!verdict.allowed) throw new Error(deskNeedsYes(verdict.where))
}

/** A desk's click: where the tab is NOW is checked first (deskMayAct). */
export async function deskClick(
  who: DeskWho,
  cdp: string,
  targetId: string,
  x: number,
  y: number
): Promise<void> {
  const io = await import('./cdp')
  await deskMayAct(who, await io.pageUrl(cdp, targetId))
  await io.clickAt(cdp, targetId, x, y)
}

/** A desk's typing: where the tab is NOW is checked first (deskMayAct). */
export async function deskType(
  who: DeskWho,
  cdp: string,
  targetId: string,
  text: string,
  opts: { enterForNewline?: boolean } = {}
): Promise<void> {
  const io = await import('./cdp')
  await deskMayAct(who, await io.pageUrl(cdp, targetId))
  await io.typeText(cdp, targetId, text, opts)
}

/** Longer than any desk run (a share run measured 3-6 minutes). */
export const DESK_HOLD_MS = 15 * 60_000

const held = new Map<string, number>()

/** Tab ids a desk is working in right now; expired holds are dropped. */
export function deskTabsHeld(now: number = Date.now()): string[] {
  for (const [id, until] of held) if (until <= now) held.delete(id)
  return [...held.keys()]
}

/**
 * Hold a tab a desk opened by another road -- a desk WINDOW (windows.ts,
 * rounds-wiring.ts) -- so the sweep spares it and the tab strip marks it.
 */
export function holdDeskTab(
  id: string,
  now: number = Date.now(),
  ms: number = DESK_HOLD_MS
): void {
  held.set(id, now + ms)
}

/** The desk is done with that tab (its window closed, or the person closed it). */
export function releaseDeskTab(id: string): void {
  held.delete(id)
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
 *
 * THE PERSON'S SITE LIST HOLDS HERE TOO. The desks drive raw CDP, so the
 * agent tools' refusals (agent-tools.ts mustNotBeBlocked) never saw them: a
 * person who blocked x.com still got the blog desk's composer opened there.
 * A blocked address, or a list that cannot be read, refuses the open before
 * any tab is made or closed for room. `ask` is not checked here: this door
 * does not know whether the desk will act or only read.
 */
export async function newDeskPage(
  cdp: string,
  url: string,
  who: DeskWho,
  io?: DeskPageIo,
  now: number = Date.now()
): Promise<CdpTarget> {
  await deskMayGo(who, url)
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
