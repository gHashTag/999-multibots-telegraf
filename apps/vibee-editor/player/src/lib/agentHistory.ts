import type { Message } from '@/atoms/agentChat'

/**
 * KEEPING THE MINI APP'S VIEW OF THE SHARED CONVERSATION FRESH.
 *
 * The page used to fetch history exactly once, on mount, with an empty
 * dependency list. That was enough when the mini app was the only place a
 * person talked to the agent. It is not enough now: the bot, the phone and this
 * page all read and write one `agent_messages` table, so a turn written in the
 * bot while this tab sits open never appeared here -- and, worse, never reached
 * the model, because the next request carries THIS page's transcript.
 *
 * The symptom is subtle and reads as the agent being stupid: you tell the bot
 * something, switch to the app, ask a follow-up, and the agent has no idea what
 * you are talking about.
 *
 * The decision is separated from the fetching so it can be tested without a
 * network, a DOM or a React tree -- the page itself has none of that harness.
 */

export interface ServerTurn {
  role: string
  content: string
}

/**
 * Should the fetched history replace what is on screen?
 *
 * WHY `busy` COMES FIRST. While an answer is streaming, the store holds a
 * half-written assistant message that `sendToAgent` keeps patching by id.
 * Replacing the list mid-stream would drop the partial answer in front of the
 * person AND leave the stream writing into an id that no longer exists, so the
 * rest of the reply would vanish silently. A refresh can always wait; a reply
 * in flight cannot be recovered.
 *
 * WHY AN EMPTY SERVER ANSWER CHANGES NOTHING. Empty means "the server has
 * nothing for this person yet", not "the conversation was cleared". Treating it
 * as authoritative would wipe a visible chat on the first request after a
 * deploy, or whenever the history endpoint has a bad minute.
 *
 * WHY IDENTICAL HISTORY IS SKIPPED. This runs on every tab focus. Rebuilding
 * the list with fresh ids on each focus makes React remount every bubble --
 * a visible flicker, and any scroll position lost, in exchange for nothing.
 */
export function shouldAdoptHistory({
  server,
  local,
  busy,
}: {
  server: ServerTurn[]
  local: Message[]
  busy: boolean
}): boolean {
  if (busy) return false
  if (!server.length) return false
  /*
   * A SHORTER SERVER TRANSCRIPT IS NOT AUTHORITATIVE.
   *
   * If the page shows more turns than the server has, the page holds something
   * the server does not -- a reply whose recording failed, or a turn that has
   * not landed yet. Adopting would delete an answer the person has already
   * read, off their screen, with no way to get it back. Being one turn stale
   * costs nothing by comparison.
   *
   * Found by mutation: with the length check removed the tests stayed green,
   * because every case they covered had the server equal or longer.
   */
  if (server.length < local.length) return false
  return !sameConversation(server, local)
}

/**
 * Compared position by position over the SERVER transcript.
 *
 * There is deliberately no length check here. The caller has already refused a
 * server transcript shorter than the page, so by this point the server is equal
 * or longer -- and if it is longer, the walk runs past the end of `local` and
 * the missing entry answers false on its own. A length check would be dead
 * code, and a mutation run proved it: removing it changed no behaviour and no
 * test went red.
 */
function sameConversation(server: ServerTurn[], local: Message[]): boolean {
  return server.every((turn, i) => {
    const mine = local[i]
    if (!mine) return false
    const role = turn.role === 'user' ? 'user' : 'assistant'
    return role === mine.role && String(turn.content ?? '') === mine.text
  })
}

/**
 * Turn the server's transcript into what the page renders.
 *
 * Ids are positional and stable for a given transcript, which is what lets
 * `sameConversation` short-circuit a repeat refresh into no work at all.
 */
export function adoptHistory(server: ServerTurn[]): Message[] {
  return server.map((turn, i) => ({
    id: `server-${i}`,
    role: turn.role === 'user' ? 'user' : 'assistant',
    text: String(turn.content ?? ''),
  }))
}

/**
 * Read the messages array out of whatever the endpoint returned.
 *
 * Written as its own function because the failure it guards against is silent:
 * a 500 body, an HTML error page from a proxy, or a shape change would
 * otherwise become `undefined.length` inside the effect, and the catch there
 * swallows errors on purpose.
 */
export function turnsFromResponse(body: unknown): ServerTurn[] {
  const messages = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(messages)) return []
  return messages
    .filter(
      (m): m is ServerTurn =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as ServerTurn).content === 'string'
    )
    .map(m => ({
      role: String(m.role ?? 'assistant'),
      content: String(m.content),
    }))
}
