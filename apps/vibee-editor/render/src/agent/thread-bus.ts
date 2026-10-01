import { EventEmitter } from 'node:events'
import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * "A turn was written into this thread" -- inside one process.
 *
 * Every write into agent_messages goes through one function
 * (conversation.ts), which announces here after its INSERT; an open live
 * stream (thread-live.ts) listening on the same (person, thread) reads the
 * new rows at once. A turn written by ANOTHER replica is not announced here:
 * the stream's own recheck (LIVE_RECHECK_S) finds it. The bus is a shortcut,
 * never the only way a turn arrives.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0)

const keyOf = (telegramId: string, thread: string) =>
  `${telegramId}\u0000${thread}`

export function announceTurn(telegramId: string, thread: string): void {
  bus.emit(keyOf(String(telegramId), thread))
}

/** Listen for turns in one thread; returns the function that stops listening. */
export function onTurn(
  telegramId: string,
  thread: string,
  listener: () => void
): () => void {
  const key = keyOf(String(telegramId), thread)
  bus.on(key, listener)
  return () => {
    bus.off(key, listener)
  }
}

/**
 * THE AGENT AT WORK (spec kanban-card-chat.t27 v6, S19).
 *
 * While a turn runs, the open sheet hears what the agent is doing: a kind
 * (WORK_THINKING, WORK_TOOL, WORK_WRITING, WORK_DONE) and, for a tool, its
 * name. Names only (WORK_NAMES_ONLY): the thinking text and the tool's
 * arguments never reach this bus. Not stored (WORK_STORED = false): a sheet
 * on another replica does not hear it, and still gets the answer by the
 * stream's recheck.
 */
export interface Work {
  kind: number
  name?: string
}

const workKey = (telegramId: string, thread: string) =>
  `work\u0000${keyOf(telegramId, thread)}`

/** The last work heard in a thread and when, so a sheet opened mid-turn sees it. */
const current = new Map<string, { work: Work; at: number }>()

export function announceWork(
  telegramId: string,
  thread: string,
  work: Work
): void {
  const key = workKey(String(telegramId), thread)
  if (work.kind === SPEC.WORK_DONE) current.delete(key)
  else current.set(key, { work, at: Date.now() })
  bus.emit(key, work)
}

/** Listen for work in one thread; returns the function that stops listening. */
export function onWork(
  telegramId: string,
  thread: string,
  listener: (work: Work) => void
): () => void {
  const key = workKey(String(telegramId), thread)
  bus.on(key, listener)
  return () => {
    bus.off(key, listener)
  }
}

/** The running work in a thread, if it was heard less than WORK_IDLE_S ago. */
export function workNow(
  telegramId: string,
  thread: string,
  now = Date.now()
): Work | null {
  const key = workKey(String(telegramId), thread)
  const seen = current.get(key)
  if (!seen) return null
  if (!workShown(seen.work.kind, (now - seen.at) / 1000)) {
    current.delete(key)
    return null
  }
  return seen.work
}

/** A kind goes out only when it changes; a tool also when its name changes. */
export function workSend(
  last: number,
  kind: number,
  sameName: boolean
): boolean {
  return kind !== last || (kind === SPEC.WORK_TOOL && !sameName)
}

/** A running kind heard less than WORK_IDLE_S ago is shown. */
export function workShown(kind: number, quietS: number): boolean {
  return (
    kind !== SPEC.WORK_NONE &&
    kind !== SPEC.WORK_DONE &&
    quietS < SPEC.WORK_IDLE_S
  )
}

/** A tool's name as the sheet may show it: an identifier, or nothing. */
function toolName(name: unknown): string | undefined {
  const s = typeof name === 'string' ? name : ''
  return /^[A-Za-z0-9_.:-]+$/.test(s) && s.length <= SPEC.WORK_NAME_MAX
    ? s
    : undefined
}

/**
 * One agent event as work, or null for an event that says nothing about it
 * (the turn id, the provider, a tool's result). Reads the kind and a tool's
 * name; the words are never read, so they cannot leak.
 */
export function workOf(ev: unknown): Work | null {
  const e = (ev ?? {}) as Record<string, unknown>
  switch (e['тип']) {
    case 'размышление':
      return { kind: SPEC.WORK_THINKING }
    case 'инструмент':
    case 'ждём': {
      const name = toolName(e['имя'])
      return name ? { kind: SPEC.WORK_TOOL, name } : { kind: SPEC.WORK_TOOL }
    }
    case 'текст':
      return { kind: SPEC.WORK_WRITING }
    case 'готово':
    case 'ошибка':
      return { kind: SPEC.WORK_DONE }
    default:
      return null
  }
}

/**
 * Pass a turn's events through unchanged and announce its work in a card's
 * `thread`.
 * The end is announced however the turn ends -- answered, thrown, or the
 * caller gone -- so no sheet is left showing a turn that is over.
 */
export async function* announcingWork<T>(
  events: AsyncGenerator<T>,
  telegramId: string,
  thread: string
): AsyncGenerator<T> {
  // Only a card's thread has a sheet listening (S19); others pass untouched.
  if (!thread.startsWith(SPEC.THREAD_PREFIX)) return yield* events
  let last: Work = { kind: SPEC.WORK_NONE }
  try {
    for await (const ev of events) {
      const work = workOf(ev)
      if (work && workSend(last.kind, work.kind, work.name === last.name)) {
        last = work
        announceWork(telegramId, thread, work)
      }
      yield ev
    }
  } finally {
    if (last.kind !== SPEC.WORK_DONE)
      announceWork(telegramId, thread, { kind: SPEC.WORK_DONE })
  }
}
