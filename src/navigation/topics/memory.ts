/**
 * WHICH CONVERSATION A TURN IN THE PRIVATE CHAT JOINS.
 *
 * Spec of record: bot-agent-memory.t27 (gHashTag/t27#7824). Owner, 2026-10-08:
 * "check that the chats are in sync in the bot and in the mini-app, and that
 * the session keeps every exchange with the client -- now it resets and starts
 * over, this is a bug".
 *
 * THE BUG. Every Telegram thread of the private chat had its own memory,
 * `topic<thread id>`. A message written outside the tabs opens a new thread,
 * so each such message began a conversation with no past -- and none of it was
 * the conversation the mini-app shows (`self`, the base one).
 *
 * NOW. The Agent tab and every thread that is not a fixed tab speak in the
 * base conversation, the one the mini-app opens. Each other fixed tab keeps
 * its own memory under its KIND (`tabreels`), not its thread id, so a tab
 * deleted and made again, or the same tab in another bot, finds what it had.
 * A thread whose tab cannot be looked up joins the base too: a missing record
 * never starts a conversation from nothing.
 *
 * Two rules are the spec's functions, mirrored one for one; the third,
 * reads_again, lives where the history is read (services/trinityAgent.ts).
 * src/spec/bot-agent-memory.test.ts runs every test of the spec against both.
 */
import * as SPEC from '@/spec/bot-agent-memory.gen'
import { TAB_KEYS } from '@/spec/bot-topic-tabs.gen'
import { knownTabs } from './tabs'
import { logger } from '@/utils/logger'

/** spec joins_base: only a fixed tab other than the Agent tab has its own memory. */
export const joinsBase = (isFixedTab: boolean, tabIndex: number): boolean =>
  !isFixedTab || tabIndex === SPEC.BASE_TAB_INDEX

/** spec memory_moves: a new thread id keeps the memory; only a new kind moves it. */
export const memoryMoves = (
  kindChanged: boolean,
  _threadChanged: boolean
): boolean => kindChanged

/**
 * The conversation of a fixed tab of this kind; undefined for the base one.
 * An unknown kind is no fixed tab, so it joins the base.
 */
export function conversationOfTab(
  kind: string | undefined
): string | undefined {
  const index =
    kind === undefined ? -1 : (TAB_KEYS as readonly string[]).indexOf(kind)
  if (joinsBase(index >= 0, index)) return undefined
  // Every kind of the tab table makes a valid render conversation id; the
  // binding test checks each one against trinityAgent CONVERSATION_ID_RE.
  return `${SPEC.TAB_MEMORY_PREFIX}${kind}`
}

/**
 * The conversation a private-chat turn joins: undefined (the base, which the
 * mini-app shows) unless the update sits in one of this person's fixed tabs
 * other than the Agent tab. The tab is looked up from memory first
 * (engine.ts held), so a message in a known tab costs no database read.
 * Never throws.
 */
export async function agentConversationIn(
  ctx: any
): Promise<string | undefined> {
  const threadId = ctx?.state?.topicThreadId as number | undefined
  if (threadId === undefined) return undefined
  if (ctx?.chat?.type !== 'private') return undefined
  const bot = String(ctx?.botInfo?.username ?? '')
  const person = Number(ctx?.from?.id)
  if (!bot || !Number.isInteger(person) || person <= 0) return undefined
  try {
    const rows = await knownTabs(bot, person)
    const tab = rows?.find(row => row.thread_id === threadId)
    return conversationOfTab(tab?.kind)
  } catch (e) {
    logger.debug('[agent-memory] tab not looked up; the base conversation', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return undefined
  }
}
