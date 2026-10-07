import * as SPEC from '@/spec/kanban-card-chat.gen'

/**
 * A CARD ON THE GAME'S KANBAN OPENS ITS CONVERSATION (owner, 2026-10-01:
 * "tap any card on app.t27.ai/game/kanban and a chat with the agent opens,
 * with its history, so any task can be written to and carried on").
 *
 * Spec of record: gHashTag/t27 specs/automation/kanban-card-chat.t27; the
 * generated module beside this app is a byte copy of render's
 * (spec/kanban-card-chat.gen.ts, held equal by cardChat.test.ts), because the
 * player's build stage cannot reach render/. Pure: no React, no fetch.
 *
 * Three ways a card asks to open, one result -- a task key
 * "gHashTag/t27#5382" the server's task thread (render task-thread.ts) takes:
 *   1. the board posts {v, type:'t27-app', kind:'open-card', repo, number}
 *      (gHashTag/trinity Queen.tsx, once QUEEN_REF carries it);
 *   2. until then, a tap on the card's own GitHub anchor inside the frame
 *      (same origin, so the page can listen before the browser follows it);
 *   3. the address: /game/kanban?card=5382[&repo=gHashTag/other].
 */

export interface OpenCard {
  /** "gHashTag/t27#5382" -- the server resolves nothing further. */
  task: string
  number: number
  repo: string
  title?: string
  column?: string
}

const OWNER = SPEC.TASK_OWNER
const NAME_RE = /^[A-Za-z0-9_.-]+$/
const NUMBER_RE = /^[1-9]\d*$/

function numberOk(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= SPEC.NUMBER_MAX
}

/** owner/name of ours, the owner spelled one way, or null. */
function ourRepo(raw: unknown): string | null {
  const [owner, name, extra] = String(raw ?? '').split('/')
  if (extra !== undefined || !name || !NAME_RE.test(name)) return null
  if (name.length > SPEC.REPO_NAME_MAX) return null
  if (String(owner).toLowerCase() !== OWNER.toLowerCase()) return null
  return `${OWNER}/${name}`
}

function card(repo: string, number: number, extra: Partial<OpenCard> = {}) {
  return {
    task: `${repo}${SPEC.NUMBER_SEP}${number}`,
    repo,
    number,
    ...extra,
  }
}

/**
 * The frame's message, or null. `sameOrigin` is the caller's check of
 * `event.origin === location.origin` AND `event.source` being the frame:
 * SAME_ORIGIN_ONLY -- a stranger's page cannot open a card in the app.
 */
export function cardFromMessage(
  data: unknown,
  sameOrigin: boolean
): OpenCard | null {
  if (!SPEC.SAME_ORIGIN_ONLY || !sameOrigin) return null
  const d = (data ?? {}) as Record<string, unknown>
  if (d.v !== SPEC.MSG_V || d.type !== SPEC.MSG_TYPE) return null
  if (d.kind !== SPEC.MSG_KIND) return null
  const number = Number(d.number)
  if (!numberOk(number)) return null
  const repo = ourRepo(d.repo)
  if (!repo) return null
  const title =
    typeof d.title === 'string' ? d.title.slice(0, SPEC.TITLE_MAX) : undefined
  const column =
    typeof d.column === 'string' ? d.column.slice(0, 24) : undefined
  return card(repo, number, { title, column })
}

/**
 * A card's GitHub anchor -- https://github.com/gHashTag/t27/issues/5382 --
 * as a card, or null for every other link (a PR, someone else's repository,
 * a spec page). Only issues: a card IS an issue.
 */
export function cardFromHref(href: unknown): OpenCard | null {
  let url: URL
  try {
    url = new URL(String(href ?? ''))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
  const m = /^\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/.exec(url.pathname)
  if (!m || !NUMBER_RE.test(m[2])) return null
  const repo = ourRepo(m[1])
  const number = Number(m[2])
  return repo && numberOk(number) ? card(repo, number) : null
}

/**
 * A tapped card anchor as a card WITH its title and column, read from the
 * board's own drawing (owner, 2026-10-03: "why is the task's name not
 * visible?"). The board as shipped posts no `open-card`, so the anchor is the
 * only way a card opens -- and an href carries a number, not a name. The
 * anchor's `title` attribute holds the whole title (the drawn `<strong>` is
 * clamped by CSS); the column is the `is-<name>` class of the card's column.
 */
export function cardFromAnchor(a: Element | null | undefined): OpenCard | null {
  if (!a) return null
  const found = cardFromHref(a.getAttribute('href'))
  if (!found) return null
  const raw =
    a.getAttribute('title') || a.querySelector('strong')?.textContent || ''
  const title = raw.replace(/\s+/g, ' ').trim().slice(0, SPEC.TITLE_MAX)
  const col = a.closest('[class*="-column"]')
  const named = col
    ? Array.from(col.classList)
        .map(c => /^is-([a-z]{1,24})$/.exec(c)?.[1])
        .find(Boolean)
    : undefined
  return {
    ...found,
    ...(title ? { title } : {}),
    ...(named ? { column: named } : {}),
  }
}

/**
 * The card the address names: ?card=5382, with ?repo= only when it is not
 * the board's own repository (`boardRepo`, REPO_FROM_BOARD). A number with
 * no repository anywhere still opens -- as `#5382`, which the server
 * resolves against the board it reads.
 */
export function cardFromSearch(
  search: string,
  boardRepo?: string | null
): OpenCard | null {
  const q = new URLSearchParams(search)
  const raw = q.get(SPEC.CARD_PARAM)
  if (!raw || !NUMBER_RE.test(raw)) return null
  const number = Number(raw)
  if (!numberOk(number)) return null
  const named = q.get(SPEC.REPO_PARAM)
  const repo = named ? ourRepo(named) : boardRepo ? ourRepo(boardRepo) : null
  if (named && !repo) return null
  if (repo) return card(repo, number)
  return { task: `${SPEC.NUMBER_SEP}${number}`, repo: '', number }
}

/** The address with this card open (or none, `open` null). */
export function searchWithCard(
  search: string,
  open: OpenCard | null,
  boardRepo?: string | null
): string {
  const q = new URLSearchParams(search)
  q.delete(SPEC.CARD_PARAM)
  q.delete(SPEC.REPO_PARAM)
  if (open) {
    q.set(SPEC.CARD_PARAM, String(open.number))
    const own = boardRepo ? ourRepo(boardRepo) : null
    if (open.repo && open.repo !== own) q.set(SPEC.REPO_PARAM, open.repo)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * The board rewrites its own hash and knows nothing of ?card=, so the path
 * it asks for (lib/hive.ts gamePathFor) is given back the card the person
 * has open: the sheet stays where it is while the board moves under it.
 */
export function keepCard(to: string, current: string): string {
  const cur = new URLSearchParams(current.split('?')[1] ?? '')
  const cardNo = cur.get(SPEC.CARD_PARAM)
  if (!cardNo) return to
  const [path, query = ''] = to.split('?')
  const q = new URLSearchParams(query)
  q.set(SPEC.CARD_PARAM, cardNo)
  const repo = cur.get(SPEC.REPO_PARAM)
  if (repo) q.set(SPEC.REPO_PARAM, repo)
  return `${path}?${q.toString()}`
}

/** The board's frame never sees the app's own ?card= / ?repo=. */
export function withoutCard(search: string): string {
  const q = new URLSearchParams(search)
  q.delete(SPEC.CARD_PARAM)
  q.delete(SPEC.REPO_PARAM)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const CARD_SHEET = {
  openDetent: SPEC.OPEN_DETENT as 'peek' | 'half' | 'full',
  historyLimit: SPEC.HISTORY_LIMIT,
  historyDoor: SPEC.HISTORY_DOOR,
  statusDoor: SPEC.STATUS_DOOR,
  field: SPEC.FIELD,
  touchPx: SPEC.TOUCH_TARGET_PX,
}

/**
 * What the history answer adds to the card that is open, or null when it adds
 * nothing (so the caller does not re-render for the same card): the full key
 * the server resolved a bare `#5382` to (`thread`), and the board's title and
 * column (`card`, render task-thread.ts taskCard).
 */
export function cardFromHistory(
  body: unknown,
  open: OpenCard
): OpenCard | null {
  const b = (body ?? {}) as { thread?: unknown; card?: unknown }
  const thread = String(b.thread ?? '')
  const key = thread.startsWith(SPEC.THREAD_PREFIX)
    ? thread.slice(SPEC.THREAD_PREFIX.length)
    : ''
  const at = key.lastIndexOf(SPEC.NUMBER_SEP)
  const repo = at > 0 ? ourRepo(key.slice(0, at)) : null
  const number = Number(key.slice(at + 1))
  if (!repo || number !== open.number) return null
  const c = (b.card ?? {}) as Record<string, unknown>
  const title =
    typeof c.title === 'string' && c.title
      ? c.title.slice(0, SPEC.TITLE_MAX)
      : open.title
  const column =
    typeof c.column === 'string' && c.column
      ? c.column.slice(0, 24)
      : open.column
  const next = card(repo, number, { title, column })
  return next.task === open.task &&
    next.title === open.title &&
    next.column === open.column
    ? null
    : next
}
