/**
 * THE TAB STRIP: every page open in the person's own browser, one tap away.
 *
 * Spec of record: gHashTag/t27 specs/automation/browser-tab-strip.t27,
 * vendored beside its `t27c gen-ts` output in ../spec/. Every number and
 * every name of an action comes from there; the spec's own tests run against
 * this file in ../spec/browser-tab-strip.test.ts.
 *
 * The pod runs Chromium without its own tab bar in view, so a page the agent
 * opened, or a link that opened a new tab, used to be a page the person could
 * not get back to. The strip lists them and lets the person switch, open and
 * close -- and only the person: the doors in routes.ts refuse an agent key.
 *
 * What leaves the pod is a title, clipped, and a host. Never a path, never a
 * query (that is where a reset token or a search lives), never page text.
 */
import * as SPEC from '../spec/browser-tab-strip.gen'
import {
  activatePage,
  closePage,
  evaluateOn,
  listTargets,
  newPage,
  type CdpTarget,
} from './cdp'
import { forgetFront, rememberFront } from './front-page'
import { readSession, setWheel, type Queryable } from './sessions'

/** One tab as the player sees it. */
export interface StripTab {
  id: string
  title: string
  host: string
  active: boolean
}

export type StripAction =
  | typeof SPEC.ACTION_ACTIVATE
  | typeof SPEC.ACTION_NEW
  | typeof SPEC.ACTION_CLOSE

const INTERNAL = [
  SPEC.HIDDEN_CHROME,
  SPEC.HIDDEN_DEVTOOLS,
  SPEC.HIDDEN_EXTENSION,
] as const

/** Whether an address is the browser's own machinery. Pure. */
export function isInternal(url: string): boolean {
  return INTERNAL.some(scheme => url.startsWith(scheme))
}

/** The spec's `shown`: a page, and not the browser's own. Pure. */
export function isStripTab(t: { type: string; url: string }): boolean {
  return t.type === SPEC.TAB_TYPE && !isInternal(t.url)
}

/** The spec's `may_close`: another page would remain. Pure. */
export function mayClose(openPages: number): boolean {
  return openPages > 1
}

/** The spec's `may_open`: below the pod's cap. Pure. */
export function mayOpen(openPages: number): boolean {
  return openPages < SPEC.MAX_TABS_SHOWN
}

/** The spec's `title_len`, applied: at most TITLE_MAX_CHARS characters. */
export function clipTitle(title: string): string {
  const chars = [...title.replace(/\s+/g, ' ').trim()]
  if (chars.length <= SPEC.TITLE_MAX_CHARS) return chars.join('')
  return `${chars.slice(0, SPEC.TITLE_MAX_CHARS - 1).join('')}…`
}

/** The host of an address and nothing else; '' when there is none. Pure. */
export function hostOnly(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * The strip from the browser's own list. `visible` holds the ids whose
 * document says it is visible; `remembered` is the tab the person last chose
 * here. The remembered one wins while it is still visible (two windows can
 * both be visible), then the first visible one, then the remembered one if it
 * is still open: with no answer from the pages, the person's own last choice
 * is the best guess, and no tab at all is marked rather than a wrong one.
 */
export function stripOf(
  targets: readonly CdpTarget[],
  visible: ReadonlySet<string>,
  remembered: string | null
): StripTab[] {
  const pages = targets.filter(isStripTab).slice(0, SPEC.MAX_TABS_SHOWN)
  const ids = new Set(pages.map(p => p.id))
  const active =
    remembered && ids.has(remembered) && visible.has(remembered)
      ? remembered
      : (pages.find(p => visible.has(p.id))?.id ??
        (remembered && ids.has(remembered) ? remembered : null))
  return pages.map(p => ({
    id: p.id,
    title: clipTitle(p.title || ''),
    host: hostOnly(p.url),
    active: p.id === active,
  }))
}

/** What the strip needs of the pod, so tests can stand in for Chromium. */
export interface StripIo {
  list: (endpoint: string) => Promise<CdpTarget[]>
  /** Ids of the pages whose document is visible right now. */
  visible: (endpoint: string, ids: readonly string[]) => Promise<Set<string>>
  activate: (endpoint: string, id: string) => Promise<void>
  open: (endpoint: string, url: string) => Promise<CdpTarget>
  close: (endpoint: string, id: string) => Promise<void>
}

export const cdpStripIo: StripIo = {
  list: listTargets,
  async visible(endpoint, ids) {
    const answers = await Promise.all(
      ids.map(id =>
        evaluateOn(endpoint, id, 'document.visibilityState').then(
          v => (v === 'visible' ? id : null),
          () => null
        )
      )
    )
    return new Set(answers.filter((id): id is string => id !== null))
  },
  activate: activatePage,
  open: newPage,
  close: closePage,
}

/* The tab each person last chose on the strip; in memory, like front-page.ts. */
const chosenHere = new Map<string, string>()

export function resetStripMemory(): void {
  chosenHere.clear()
}

interface Result {
  status: number
  body: Record<string, unknown>
}

const NO_BROWSER: Result = {
  status: SPEC.NO_SESSION_STATUS,
  body: { ok: false, error: 'сначала откройте браузер' }, // cyrillic-ok: user-facing error
}

async function readStrip(
  io: StripIo,
  endpoint: string,
  who: string
): Promise<StripTab[]> {
  const targets = await io.list(endpoint)
  const ids = targets
    .filter(isStripTab)
    .slice(0, SPEC.MAX_TABS_SHOWN)
    .map(t => t.id)
  const visible = await io.visible(endpoint, ids).catch(() => new Set<string>())
  return stripOf(targets, visible, chosenHere.get(who) ?? null)
}

/** Parse the POST body; throws only its own fixed sentences. */
export function parseStripBody(raw: string): {
  action: StripAction
  id: string | null
} {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error('the body is not JSON')
  }
  const b = (body ?? {}) as { action?: unknown; id?: unknown }
  const action = b.action
  if (
    action !== SPEC.ACTION_ACTIVATE &&
    action !== SPEC.ACTION_NEW &&
    action !== SPEC.ACTION_CLOSE
  )
    throw new Error('unknown action')
  const id = typeof b.id === 'string' && b.id ? b.id : null
  if (action !== SPEC.ACTION_NEW && !id) throw new Error('which tab?')
  return { action, id }
}

/**
 * GET and POST /api/browser/strip, past the person check in routes.ts.
 * `raw` is the POST body (null for GET).
 */
export async function handleStrip(
  pool: Queryable,
  who: string,
  raw: string | null,
  io: StripIo = cdpStripIo
): Promise<Result> {
  const session = await readSession(pool, who)
  if (!session || session.state !== 'live' || !session.cdpEndpoint)
    return NO_BROWSER
  const endpoint = session.cdpEndpoint

  if (raw === null) {
    try {
      return {
        status: 200,
        body: { ok: true, tabs: await readStrip(io, endpoint, who) },
      }
    } catch {
      return {
        status: 502,
        body: { ok: false, error: 'the browser did not answer' },
      }
    }
  }

  let wanted: ReturnType<typeof parseStripBody>
  try {
    wanted = parseStripBody(raw)
  } catch (e) {
    return {
      status: 400,
      body: { ok: false, error: e instanceof Error ? e.message : 'bad body' },
    }
  }

  let pages: CdpTarget[]
  try {
    pages = (await io.list(endpoint)).filter(isStripTab)
  } catch {
    return {
      status: 502,
      body: { ok: false, error: 'the browser did not answer' },
    }
  }
  const known = wanted.id !== null && pages.some(p => p.id === wanted.id)
  if (wanted.action !== SPEC.ACTION_NEW && !known)
    return { status: 404, body: { ok: false, error: 'no such tab' } }
  if (wanted.action === SPEC.ACTION_CLOSE && !mayClose(pages.length))
    return {
      status: SPEC.REFUSED_STATUS,
      body: { ok: false, error: 'the last tab stays open' },
    }
  if (wanted.action === SPEC.ACTION_NEW && !mayOpen(pages.length))
    return {
      status: SPEC.REFUSED_STATUS,
      body: { ok: false, error: 'too many tabs open; close one first' },
    }

  /* Switching is driving: the person's lease is renewed, never refused. */
  await setWheel(pool, who, 'person').catch(() => {})
  try {
    if (wanted.action === SPEC.ACTION_ACTIVATE) {
      await io.activate(endpoint, wanted.id!)
      chosenHere.set(who, wanted.id!)
      /* The agent acts on the tab the person is looking at (front-page.ts). */
      rememberFront(who, wanted.id!)
    } else if (wanted.action === SPEC.ACTION_NEW) {
      const made = await io.open(endpoint, SPEC.NEW_TAB_URL)
      await io.activate(endpoint, made.id).catch(() => {})
      chosenHere.set(who, made.id)
      rememberFront(who, made.id)
    } else {
      await io.close(endpoint, wanted.id!)
      if (chosenHere.get(who) === wanted.id) chosenHere.delete(who)
      /* A closed tab is nobody's choice, whichever lane made it. */
      forgetFront(who, wanted.id!)
    }
  } catch {
    return {
      status: 502,
      body: { ok: false, error: 'the browser did not take it' },
    }
  }
  try {
    return {
      status: 200,
      body: { ok: true, tabs: await readStrip(io, endpoint, who) },
    }
  } catch {
    return { status: 200, body: { ok: true, tabs: [] } }
  }
}
