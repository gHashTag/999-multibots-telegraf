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
  id?: number
  role: string
  content: string
  surface?: string
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
 * A validated empty response means the shared conversation was cleared.
 * Missing or malformed responses are rejected before reaching this function.
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
  if (!server.length && local.every(message => message.id === 'welcome'))
    return false
  return JSON.stringify(adoptHistory(server, local)) !== JSON.stringify(local)
}

function renderedTurn(turn: ServerTurn, index: number): Message {
  const id = `server-${turn.id ?? index}`
  const attachments: NonNullable<Message['attachments']> = []
  const text = turn.content
    .split('\n')
    .filter(line => {
      const match = line.match(
        /^\[attached (image|video|audio|file): (.*); mime=(.*); url=(.*)\]$/
      )
      if (!match || !/^(https?:\/\/|\/(?!\/))/.test(match[4])) return true
      attachments.push({
        id: `${id}-attachment-${attachments.length}`,
        kind: match[1] as 'image' | 'video' | 'audio' | 'file',
        name: match[2],
        mimeType: match[3],
        url: match[4],
      })
      return false
    })
    .join('\n')
    .trim()
  return {
    id,
    role: turn.role === 'user' ? 'user' : 'assistant',
    text,
    ...(turn.surface ? { surface: turn.surface } : {}),
    ...(attachments.length ? { attachments } : {}),
  }
}

/**
 * Turn the server's transcript into what the page renders.
 *
 * Database ids survive changes to the history window. Matching local turns
 * keep tool traces and actions, which the server currently does not persist.
 * Each local match is consumed once so repeated identical messages stay distinct.
 */
export function adoptHistory(
  server: ServerTurn[],
  local: Message[] = []
): Message[] {
  const available = new Set(local)
  return server.map((turn, index) => {
    const rendered = renderedTurn(turn, index)
    const match = [...available].find(
      message =>
        message.role === rendered.role &&
        (message.id === rendered.id ||
          (!message.id.startsWith('server-') &&
            message.text.replace(/\s/g, '') ===
              rendered.text.replace(/\s/g, '') &&
            JSON.stringify(message.attachments?.map(a => a.url) ?? []) ===
              JSON.stringify(rendered.attachments?.map(a => a.url) ?? [])))
    )
    if (!match) return rendered
    available.delete(match)
    return {
      ...match,
      ...rendered,
      ...(match.text.replace(/\s/g, '') === rendered.text.replace(/\s/g, '')
        ? { text: match.text }
        : {}),
      ...(match.attachments?.length ? { attachments: match.attachments } : {}),
    }
  })
}

/**
 * Read the messages array out of whatever the endpoint returned.
 *
 * Written as its own function because the failure it guards against is silent:
 * a 500 body, an HTML error page from a proxy, or a shape change would
 * otherwise become `undefined.length` inside the effect, and the catch there
 * swallows errors on purpose.
 */
export function turnsFromResponse(body: unknown): ServerTurn[] | null {
  const response = body as { ok?: boolean; messages?: unknown } | null
  if (response?.ok !== true || !Array.isArray(response.messages)) return null
  if (
    !response.messages.every(
      m =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
  )
    return null
  return response.messages as ServerTurn[]
}
