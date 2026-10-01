import { EventEmitter } from 'node:events'

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
