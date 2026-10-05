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
 *
 * Each remembered message also carries the PERSON who started its chain. A
 * turn a bot triggers runs in that person's name, never in the bot owner's:
 * otherwise anyone in the group could write "@A ask @B to do X" and B would
 * act with the owner's wallet and rights. A bot message whose person we do
 * not know is not answered.
 */

const MAX_REMEMBERED = 5_000

const depthOf = new Map<string, { depth: number; origin: number | null }>()
const lastBotAnswer = new Map<number, number>()

const key = (chatId: number, messageId: number) => `${chatId}:${messageId}`

/** Where an incoming message stands in its chain, and whose chain it is. */
export interface ChainPlace {
  depth: number
  /** The person who started the chain; null when nobody knows. */
  origin: number | null
}

/** Depth 0 and the sender for a person; for a bot, what the chain says. */
export function placeOfIncoming(m: {
  chatId: number
  messageId: number
  fromBot: boolean
  fromId: number
  replyToMessageId?: number
}): ChainPlace {
  if (!m.fromBot) return { depth: 0, origin: m.fromId }
  const known = depthOf.get(key(m.chatId, m.messageId))
  if (known !== undefined) return known
  const parent =
    m.replyToMessageId !== undefined
      ? depthOf.get(key(m.chatId, m.replyToMessageId))
      : undefined
  return { depth: (parent?.depth ?? 0) + 1, origin: parent?.origin ?? null }
}

/** Remember a message an agent just sent, one deeper than what it answered. */
export function noteSent(
  chatId: number,
  messageId: number,
  depth: number,
  origin: number | null
): void {
  depthOf.set(key(chatId, messageId), { depth, origin })
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
