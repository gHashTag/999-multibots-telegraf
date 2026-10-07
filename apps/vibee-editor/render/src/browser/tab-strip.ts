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
 *
 * v2: a tab the agent is working in carries one word, `agent: 'desk' |
 * 'chat'`, and closing it needs `{confirm: true}` -- without it the door
 * answers 409 `agent-working`, so a client that does not know the mark cannot
 * close the agent's page silently. Which tab is in front is asked over ONE
 * browser socket per read (cdp.ts visiblePages), and the answer is shared for
 * VISIBILITY_CACHE_MS between readers of the same pod.
 */
import * as SPEC from '../spec/browser-tab-strip.gen'
import {
  activatePage,
  closePage,
  listTargets,
  newPage,
  visiblePages,
  type CdpTarget,
} from './cdp'
import { deskTabsHeld, releaseDeskTab } from './desk-page'
import { agentChosenFrontsOf, forgetFront, rememberFront } from './front-page'
import { readSession, setWheel, type Queryable } from './sessions'

/** Who is working in a tab: one coarse word, never what they are doing. */
export type AgentMark = typeof SPEC.AGENT_DESK | typeof SPEC.AGENT_CHAT | null

/** One tab as the player sees it. */
export interface StripTab {
  id: string
  title: string
  host: string
  active: boolean
  agent: AgentMark
}

/** The tabs an agent is working in right now, by kind. */
export interface AgentTabs {
  desk: ReadonlySet<string>
  chat: ReadonlySet<string>
}

const NO_AGENT: AgentTabs = { desk: new Set(), chat: new Set() }

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

/** The spec's `mark`: a desk run wins over a chat lane. Pure. */
export function agentMark(desk: boolean, chat: boolean): AgentMark {
  if (desk) return SPEC.AGENT_DESK
  if (chat) return SPEC.AGENT_CHAT
  return null
}

/**
 * The spec's `may_close_tab`: never the last page, and never an agent's tab
 * without the person's confirm. Pure.
 */
export function mayCloseTab(
  openPages: number,
  agentHere: boolean,
  confirmed: boolean
): boolean {
  return mayClose(openPages) && (!agentHere || confirmed)
}

/** The spec's `cache_fresh`. Pure. */
export function cacheFresh(ageMs: number): boolean {
  return ageMs < SPEC.VISIBILITY_CACHE_MS
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
  remembered: string | null,
  agents: AgentTabs = NO_AGENT
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
    agent: agentMark(agents.desk.has(p.id), agents.chat.has(p.id)),
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
  /** The tabs an agent works in for this person (desk-page, front-page). */
  agents?: (who: string) => AgentTabs
}

/** Desk holds and the agent's own lane choices -- never the person's taps. */
export function agentTabsOf(who: string, now: number = Date.now()): AgentTabs {
  return {
    desk: new Set(deskTabsHeld(now)),
    chat: new Set(agentChosenFrontsOf(who, now)),
  }
}

export const cdpStripIo: StripIo = {
  list: listTargets,
  /* ONE browser socket per read, whatever the number of pages. */
  visible: (endpoint, ids) => visiblePages(endpoint, ids),
  activate: activatePage,
  open: newPage,
  close: closePage,
  agents: who => agentTabsOf(who),
}

/* The tab each person last chose on the strip; in memory, like front-page.ts. */
const chosenHere = new Map<string, string>()

/*
 * The last answer about which pages are visible, per pod. Two app tabs of the
 * same person poll the same pod; within VISIBILITY_CACHE_MS the second reads
 * the first's answer (or waits on the same question) instead of asking again.
 * Any action on the strip drops it: a switch changes the answer.
 *
 * Keyed by the person AND the pod (cacheSlot): one pod is one person's, and
 * an answer must never be read by somebody else even if an address were ever
 * reused. Stale slots are pruned on every write, so the map stays as small as
 * the number of strips polling right now.
 */
const visibleCache = new Map<
  string,
  { at: number; key: string; answer: Promise<Set<string>> }
>()

/** The cache slot of one person's strip on one pod. Pure. */
export function cacheSlot(who: string, endpoint: string): string {
  return `${who}\n${endpoint}`
}

export function resetStripMemory(): void {
  chosenHere.clear()
  visibleCache.clear()
}

function visibleShared(
  io: StripIo,
  who: string,
  endpoint: string,
  ids: readonly string[],
  now: number = Date.now()
): Promise<Set<string>> {
  const slot = cacheSlot(who, endpoint)
  const key = ids.join(',')
  const had = visibleCache.get(slot)
  if (had && had.key === key && cacheFresh(now - had.at)) return had.answer
  for (const [s, v] of visibleCache)
    if (!cacheFresh(now - v.at)) visibleCache.delete(s)
  const answer = io.visible(endpoint, ids).catch(() => new Set<string>())
  visibleCache.set(slot, { at: now, key, answer })
  return answer
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
  const visible = await visibleShared(io, who, endpoint, ids)
  const agents = io.agents ? io.agents(who) : NO_AGENT
  return stripOf(targets, visible, chosenHere.get(who) ?? null, agents)
}

/** Parse the POST body; throws only its own fixed sentences. */
export function parseStripBody(raw: string): {
  action: StripAction
  id: string | null
  confirm: boolean
} {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error('the body is not JSON')
  }
  const b = (body ?? {}) as {
    action?: unknown
    id?: unknown
    confirm?: unknown
  }
  const action = b.action
  if (
    action !== SPEC.ACTION_ACTIVATE &&
    action !== SPEC.ACTION_NEW &&
    action !== SPEC.ACTION_CLOSE
  )
    throw new Error('unknown action')
  const id = typeof b.id === 'string' && b.id ? b.id : null
  if (action !== SPEC.ACTION_NEW && !id) throw new Error('which tab?')
  /* Only a literal true is a yes: "true", 1 or a missing field are not. */
  return { action, id, confirm: b.confirm === true }
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
  if (wanted.action === SPEC.ACTION_CLOSE) {
    const agents = io.agents ? io.agents(who) : NO_AGENT
    const mark = agentMark(
      agents.desk.has(wanted.id!),
      agents.chat.has(wanted.id!)
    )
    if (!mayCloseTab(pages.length, mark !== null, wanted.confirm))
      return {
        status: SPEC.AGENT_TAB_STATUS,
        body: {
          ok: false,
          /* `error` is the machine code the player's apiFetch reads. */
          error: SPEC.REASON_AGENT_WORKING,
          reason: SPEC.REASON_AGENT_WORKING,
          detail: 'the agent is working in this tab; confirm to close it',
          agent: mark,
        },
      }
  }
  if (wanted.action === SPEC.ACTION_NEW && !mayOpen(pages.length))
    return {
      status: SPEC.REFUSED_STATUS,
      body: { ok: false, error: 'too many tabs open; close one first' },
    }

  /* Switching is driving: the person's lease is renewed, never refused. */
  await setWheel(pool, who, 'person').catch(() => {})
  /* Whatever happens next, the old answer about the front tab is stale. */
  visibleCache.delete(cacheSlot(who, endpoint))
  try {
    if (wanted.action === SPEC.ACTION_ACTIVATE) {
      await io.activate(endpoint, wanted.id!)
      chosenHere.set(who, wanted.id!)
      /*
       * The agent acts on the tab the person is looking at (front-page.ts),
       * and the choice is recorded as the PERSON's: it is not a tab the agent
       * is working in, so the strip does not mark it.
       */
      rememberFront(who, wanted.id!, Date.now(), 'person')
    } else if (wanted.action === SPEC.ACTION_NEW) {
      const made = await io.open(endpoint, SPEC.NEW_TAB_URL)
      await io.activate(endpoint, made.id).catch(() => {})
      chosenHere.set(who, made.id)
      rememberFront(who, made.id, Date.now(), 'person')
    } else {
      await io.close(endpoint, wanted.id!)
      if (chosenHere.get(who) === wanted.id) chosenHere.delete(who)
      /* A closed tab is nobody's choice, whichever lane made it. */
      forgetFront(who, wanted.id!)
      /* Nor a desk's: the person said yes to closing it. */
      releaseDeskTab(wanted.id!)
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
