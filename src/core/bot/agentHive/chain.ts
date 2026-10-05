/**
 * THE BOT CHAIN, COUNTED.
 *
 * Every agent bot runs in this one process (managed bots are launched by the
 * manager), so one map is enough to know how deep a conversation between
 * bots already is: each message an agent sends is remembered with its depth,
 * and a bot message replying to a remembered one is one deeper.
 *
 * human (0) -> A (1) -> B (2) -> C (3), and nobody answers C: rules.ts
 * chainOpen. A bot message we know nothing about counts from its parent, or
 * as the first of a chain.
 */

const MAX_REMEMBERED = 5_000

const depthOf = new Map<string, number>()
const lastBotAnswer = new Map<number, number>()

const key = (chatId: number, messageId: number) => `${chatId}:${messageId}`

/** The depth of an incoming message: 0 for a person. */
export function depthOfIncoming(m: {
  chatId: number
  messageId: number
  fromBot: boolean
  replyToMessageId?: number
}): number {
  if (!m.fromBot) return 0
  const known = depthOf.get(key(m.chatId, m.messageId))
  if (known !== undefined) return known
  const parent =
    m.replyToMessageId !== undefined
      ? depthOf.get(key(m.chatId, m.replyToMessageId))
      : undefined
  return (parent ?? 0) + 1
}

/** Remember a message an agent just sent, one deeper than what it answered. */
export function noteSent(
  chatId: number,
  messageId: number,
  depth: number
): void {
  depthOf.set(key(chatId, messageId), depth)
  if (depthOf.size > MAX_REMEMBERED) {
    const oldest = depthOf.keys().next().value
    if (oldest !== undefined) depthOf.delete(oldest)
  }
}

/** Milliseconds since this bot last answered a bot; Infinity if never. */
export function sinceLastBotAnswer(botId: number, now = Date.now()): number {
  const last = lastBotAnswer.get(botId)
  return last === undefined ? Infinity : now - last
}

export function noteBotAnswer(botId: number, now = Date.now()): void {
  lastBotAnswer.set(botId, now)
}

/** For tests. */
export function clearChain(): void {
  depthOf.clear()
  lastBotAnswer.clear()
}
