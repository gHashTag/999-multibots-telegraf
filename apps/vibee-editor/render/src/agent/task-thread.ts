import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * A CARD ON THE GAME'S KANBAN IS A CONVERSATION (owner, 2026-10-01: "tap any
 * card and a chat with the agent opens, with its history, so any task can be
 * written to and carried on; synchronised with all A2A agents").
 *
 * Spec of record: gHashTag/t27 specs/automation/kanban-card-chat.t27. Every
 * number and name here is imported from its generated module; this file only
 * holds what a spec cannot -- parsing a string, reading the board.
 *
 * The thread is `task:<owner>/<repo>#<n>` in agent_messages, keyed like every
 * other thread by the PERSON's telegram_id: two people talking about the same
 * card never read each other, and every agent the person brings -- the app's
 * sheet, `tri card`, an outside agent over A2A -- reads and writes the same
 * rows.
 */

export interface TaskRef {
  /** owner/name, owner spelled as the spec spells it. */
  repo: string
  number: number
}

/** A repository name GitHub could have; the owner is checked separately. */
const NAME_RE = /^[A-Za-z0-9_.-]+$/
const NUMBER_RE = /^[1-9]\d*$/

export function numberOk(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= SPEC.NUMBER_MAX
}

export function repoOk(ownerIsOurs: boolean, nameLen: number): boolean {
  return ownerIsOurs && nameLen >= 1 && nameLen <= SPEC.REPO_NAME_MAX
}

/** Only a specialist may come along; a client, a room or a ?c= may not. */
export function combines(
  hasClient: boolean,
  hasRoom: boolean,
  hasConversation: boolean
): boolean {
  return !hasClient && !hasRoom && !hasConversation
}

export function noteLen(available: number): number {
  return Math.min(available, SPEC.NOTE_MAX)
}

export function a2aTurns(stored: number): number {
  return Math.min(stored, SPEC.A2A_HISTORY_TURNS)
}

/**
 * "gHashTag/t27#5382", "t27#5382" (the owner is ours), "#5382" or "5382"
 * (the board's own repository: `boardRepo`, REPO_FROM_BOARD). Anything else
 * is null -- refused, never guessed.
 */
export function parseTask(raw: unknown, boardRepo?: string): TaskRef | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const text = String(raw).trim()
  if (!text || text.length > 160) return null
  const at = text.lastIndexOf(SPEC.NUMBER_SEP)
  const repoPart = at >= 0 ? text.slice(0, at) : ''
  const numberPart = at >= 0 ? text.slice(at + 1) : text
  if (!NUMBER_RE.test(numberPart)) return null
  const number = Number(numberPart)
  if (!numberOk(number)) return null
  let repo = repoPart || (SPEC.REPO_FROM_BOARD ? (boardRepo ?? '') : '')
  if (!repo) return null
  if (!repo.includes('/')) repo = `${SPEC.TASK_OWNER}/${repo}`
  const [owner, name, extra] = repo.split('/')
  if (extra !== undefined || !name || !NAME_RE.test(name)) return null
  // GitHub owners are case-insensitive; the key is spelled one way.
  const ours = owner.toLowerCase() === SPEC.TASK_OWNER.toLowerCase()
  if (!repoOk(ours, name.length)) return null
  return { repo: `${SPEC.TASK_OWNER}/${name}`, number }
}

/** Does the text name a repository, or only a number? */
export function namesRepo(raw: unknown): boolean {
  const text = String(raw ?? '')
  const at = text.lastIndexOf(SPEC.NUMBER_SEP)
  return at > 0
}

export function taskThread(task: TaskRef): string {
  return `${SPEC.THREAD_PREFIX}${task.repo}${SPEC.NUMBER_SEP}${task.number}`
}

/** The task a thread key names, or null for any other thread. */
export function taskOfThread(thread: unknown): TaskRef | null {
  const text = String(thread ?? '')
  if (!text.startsWith(SPEC.THREAD_PREFIX)) return null
  const rest = text.slice(SPEC.THREAD_PREFIX.length)
  if (!namesRepo(rest)) return null
  return parseTask(rest)
}

export function isTaskThread(thread: string): boolean {
  return thread.startsWith(SPEC.THREAD_PREFIX)
}

export function taskLabel(task: TaskRef): string {
  return `${task.repo}${SPEC.NUMBER_SEP}${task.number}`
}

/** The board's repository, for a bare number; null when the board is silent. */
export async function boardRepo(): Promise<string | null> {
  try {
    const { queenIndex } = await import('../hive/queen-client')
    const { repo } = await queenIndex(SPEC.BOARD_CACHE_S * 1000)
    return repo || null
  } catch {
    return null
  }
}

/**
 * Parse with the board's repository when the text names none. Async only
 * because the board may have to be read; a full key never waits for it.
 */
export async function resolveTask(raw: unknown): Promise<TaskRef | null> {
  if (namesRepo(raw)) return parseTask(raw)
  return parseTask(raw, (await boardRepo()) ?? undefined)
}

/**
 * WHAT THE AGENT IS TOLD ABOUT THE CARD. The board's words are FOREIGN text:
 * whoever opened the issue wrote its title, so it reaches the model fenced
 * (NOTE_FENCED) by the same `foreignText` every other stranger's words use.
 * The board down, or the card not on it, the note still names the task and
 * says what it does not know (NOTE_WITHOUT_BOARD). A title that is just the
 * number is called untitled (UNTITLED_SAYS_SO).
 */
export async function taskNote(
  task: TaskRef,
  read: () => Promise<{
    repo: string
    cards: Map<
      number,
      {
        title: string
        column: string
        criteria?: number
        needs: string[]
      }
    >
  }> = async () =>
    (await import('../hive/queen-client')).queenIndex(SPEC.BOARD_CACHE_S * 1000)
): Promise<string> {
  const key = taskLabel(task)
  const head = `The person opened the card ${key} on the game's kanban and is talking about THAT task. Work on it, report what you did, and keep to it unless they change the subject. https://github.com/${task.repo}/issues/${task.number}`
  let facts: string
  try {
    const board = await read()
    const card =
      board.repo.toLowerCase() === task.repo.toLowerCase()
        ? board.cards.get(task.number)
        : undefined
    if (!card) {
      facts = `The board (${board.repo || 'unknown repository'}) does not list this card; nothing about it is known here beyond its number.`
    } else {
      const untitled =
        SPEC.UNTITLED_SAYS_SO &&
        (!card.title || card.title === `#${task.number}`)
      // The title is bounded on its own: a long one must not push the
      // column and what the issue lacks out of the note.
      facts = [
        untitled
          ? 'title: (untitled on the board)'
          : `title: ${card.title.slice(0, SPEC.TITLE_MAX)}`,
        `column: ${card.column}`,
        card.criteria === undefined
          ? ''
          : `acceptance criteria declared: ${card.criteria}`,
        card.needs.length
          ? `the issue still lacks: ${card.needs.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
  } catch {
    facts =
      'The board did not answer; nothing about this card is known here beyond its number.'
  }
  const { foreignText } = await import('./telegram-tools')
  const body = SPEC.NOTE_FENCED
    ? foreignText(facts, { limit: noteLen(facts.length) })
    : facts.slice(0, noteLen(facts.length))
  return `\n\nTHE TASK (${key}):\n${head}\n${body}`
}

/**
 * THE TASK AN A2A MESSAGE CONTINUES: `message.metadata.task` (A2A_META_KEY),
 * or a contextId that is the thread key itself (A2A_CONTEXT_IS_THREAD). In
 * A2A 1.0 the context is the conversation and every run is its own task, so
 * a contextId of `task:gHashTag/t27#5382` is exactly "this card's thread".
 * Null when the message names no task -- the call then runs as it always did.
 */
export async function a2aTask(message: unknown): Promise<TaskRef | null> {
  const m = (message ?? {}) as {
    metadata?: Record<string, unknown>
    contextId?: unknown
  }
  const named = m.metadata?.[SPEC.A2A_META_KEY]
  if (named != null && named !== '') return resolveTask(named)
  if (SPEC.A2A_CONTEXT_IS_THREAD) return taskOfThread(m.contextId)
  return null
}

/**
 * What the board calls the card, for the sheet's header: title (empty when
 * the board has only the number -- UNTITLED_SAYS_SO, the app words it) and
 * column. Null when the board is silent or does not list the card; the sheet
 * still opens, titled by its number.
 */
export async function taskCard(
  task: TaskRef,
  read: () => Promise<{
    repo: string
    cards: Map<number, { title: string; column: string }>
  }> = async () =>
    (await import('../hive/queen-client')).queenIndex(SPEC.BOARD_CACHE_S * 1000)
): Promise<{
  repo: string
  number: number
  title: string
  column: string
} | null> {
  try {
    const board = await read()
    if (board.repo.toLowerCase() !== task.repo.toLowerCase()) return null
    const card = board.cards.get(task.number)
    if (!card) return null
    const untitled = !card.title || card.title === `#${task.number}`
    return {
      repo: task.repo,
      number: task.number,
      title: untitled ? '' : card.title.slice(0, SPEC.TITLE_MAX),
      column: card.column,
    }
  } catch {
    return null
  }
}
