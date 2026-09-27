/**
 * A TAB IS A PROCESS, AND THE POD CAN COUNT TO A THOUSAND.
 *
 * Measured 2026-09-27 on the owner's pod. The profile had grown to 27 open
 * tabs. On a restart Chromium restored all of them at once, every renderer
 * forked, and the container's PID cgroup ran out: `pids.max = 1000`,
 * `crun: fork: Resource temporarily unavailable`, no shell, no CDP list. Worse
 * than the outage, it did not end with it -- the zygote never recovered. Tabs
 * that were already running kept answering, and every NEW tab hung forever,
 * which is how a signed-in Reddit account came to look like a broken login for
 * a day. Only `supervisorctl restart chromium` cured it.
 *
 * So the ceiling is real, it is reached by accumulation, and the thing that
 * accumulates is tabs nobody closed.
 *
 * ── WHY THIS EXISTS NEXT TO tab-budget.ts ─────────────────────────────────
 *
 * `tab-budget.ts` caps the tabs THE AGENT OPENED, from a list it keeps in
 * memory, at the moment it opens one. Both halves of that leak: the list dies
 * with the process (render is deployed many times a day), and it never knew
 * about the tabs the PERSON opened or the ones Chromium restored. Twenty-seven
 * tabs accumulated with that budget already in place. This sweep asks the
 * browser what is actually open instead of remembering, so a restart cannot
 * lose the count.
 *
 * ── WHAT IS NEVER CLOSED ──────────────────────────────────────────────────
 *
 * The tab the agent chose to work in (front-page.ts), and the oldest tab of
 * each origin. That second rule is the person's protection: a duplicate is
 * almost always the agent opening r/FPGA for the sixth time, while the first
 * one is the tab the person opened themselves and may be looking at. The
 * order of `/json/list` is creation order -- activating a tab does not reorder
 * it, measured in front-page.ts -- so "first of its origin" really is the
 * oldest one.
 *
 * And never everything: a browser with no tabs at all looks broken to the
 * person watching it, so at least one page always survives.
 *
 * THE PROFILE IS NOT TOUCHED. Closing a tab signs nobody out; the cookies are
 * the profile's, not the tab's.
 *
 * WHY THE NUMBER REPORTED IS TABS AND NOT `pids.current`. The ceiling is a
 * PID ceiling, so PIDs would be the honest gauge -- and they are in the POD's
 * cgroup, not in this container's, with no shell between the two. Reading them
 * would need a new endpoint on the pod, which is a bigger promise than this
 * sweep needs: tabs are what we can count, tabs are what we control, and the
 * whole measured path from 27 tabs to a browser that cannot fork is tabs.
 */
import { isRealPage } from './front-page'
import type { Queryable } from './sessions'

/**
 * How many pages may stay open. Arithmetic, not taste: the wedge happened at
 * 27 pages against `pids.max = 1000`, and 9 pages measured 527 PIDs of the
 * same 1000 -- roughly 250 for the browser itself and some 30 per renderer.
 * Twelve leaves the ceiling a wide margin and is more tabs than a person
 * watching one screen works in.
 */
export const TAB_CAP = 12

export interface SweepPage {
  id: string
  type?: string
  url: string
}

export interface Doomed {
  id: string
  url: string
  why: 'duplicate' | 'over cap'
}

export interface SweepPlan {
  close: Doomed[]
  /** How many pages would be left open. */
  left: number
}

/**
 * THE ORIGIN A TAB BELONGS TO, for the purpose of calling two tabs the same
 * page. Compared as origins because that is what a duplicate is: ten
 * `reddit.com/r/...` tabs are ten renderers of one site. Anything without an
 * origin of its own -- `about:blank` most of all, which the agent leaves
 * behind whenever an open goes wrong -- is keyed by its own text, so blanks
 * collapse into one blank and a `data:` page is not mistaken for it.
 */
function groupOf(url: string): string {
  try {
    const o = new URL(url).origin
    return o && o !== 'null' ? o : url
  } catch {
    return url
  }
}

/**
 * Which tabs should go, and why. Pure: the caller lists and closes, so the
 * rule is testable without a pod.
 */
export function planTabSweep(
  targets: readonly SweepPage[],
  keepIds: readonly string[] = [],
  cap: number = TAB_CAP
): SweepPlan {
  const pages = targets.filter(t => isRealPage({ ...t, type: t.type ?? '' }))
  const spare = new Set(keepIds)
  const close: Doomed[] = []
  const survivors: SweepPage[] = []
  const seen = new Set<string>()

  for (const p of pages) {
    const group = groupOf(p.url)
    if (!seen.has(group) || spare.has(p.id)) {
      seen.add(group)
      survivors.push(p)
      continue
    }
    close.push({ id: p.id, url: p.url, why: 'duplicate' })
  }

  /*
   * Still too many distinct sites open. The newest go first: an old tab is
   * more likely to be the person's, and the agent's leftovers are always the
   * recent ones. A protected tab is passed over rather than counted out.
   */
  const room = Math.max(1, cap)
  for (let i = survivors.length - 1; i >= 0 && survivors.length > room; i--) {
    const p = survivors[i]
    if (spare.has(p.id)) continue
    close.push({ id: p.id, url: p.url, why: 'over cap' })
    survivors.splice(i, 1)
  }

  return { close, left: survivors.length }
}

export interface SweepIo {
  list: (cdp: string) => Promise<SweepPage[]>
  close: (cdp: string, id: string) => Promise<void>
}

export interface PodSweep {
  telegramId: string
  closed: number
  left: number
}

/** One pod. A tab that refuses to close is left for the next pass. */
export async function sweepPodTabs(
  cdp: string,
  keepIds: readonly string[],
  io: SweepIo,
  cap: number = TAB_CAP
): Promise<{ closed: Doomed[]; left: number }> {
  const plan = planTabSweep(await io.list(cdp), keepIds, cap)
  const closed: Doomed[] = []
  for (const t of plan.close) {
    try {
      await io.close(cdp, t.id)
      closed.push(t)
    } catch {
      /* Left open on purpose: the next pass sees it again. */
    }
  }
  return { closed, left: plan.left + (plan.close.length - closed.length) }
}

/**
 * Every live pod, once, reported whether or not anything was closed -- the
 * caller decides what is worth a line, and a tidy pod is still evidence that
 * the sweep ran. A pod that cannot be listed is skipped in silence: it is
 * either starting or already in the trouble the health check reports, and
 * neither is this sweep's business to announce.
 */
export async function sweepEveryPod(
  pool: Queryable,
  io: SweepIo,
  cap: number = TAB_CAP
): Promise<PodSweep[]> {
  const { rows } = await pool.query(
    `SELECT telegram_id, cdp_endpoint FROM browser_sessions
      WHERE state = 'live' AND cdp_endpoint IS NOT NULL`,
    []
  )
  const { chosenFront } = await import('./front-page')
  const out: PodSweep[] = []
  for (const row of rows) {
    const telegramId = String(row.telegram_id)
    const cdp = String(row.cdp_endpoint)
    const chosen = chosenFront(telegramId)
    try {
      const done = await sweepPodTabs(cdp, chosen ? [chosen] : [], io, cap)
      out.push({ telegramId, closed: done.closed.length, left: done.left })
    } catch {
      /* Not a browser right now. Nothing to tidy, nothing to say. */
    }
  }
  return out
}
