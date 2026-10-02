/**
 * THE AGENTS TAB OPENS THE CHAT YOU LEFT, NOT THE MARKET (owner, 2026-10-02).
 *
 * The tab's address is /agents -- the market of agents -- and every press of
 * it landed there, so a person who talks to one client or one agent all day
 * walked through the market each time they came back. The owner, in one
 * line: the market is shown once; after that the tab returns to the chat he
 * was in -- his own, an agent's, or the one about a client.
 *
 * Two facts are kept, nothing else: whether the market has been seen, and
 * the last chat address with its `?c=` conversation. Storage may be missing
 * altogether (a third-party frame, a private window); then the tab simply
 * keeps its old address.
 */
import { isConversationId } from '@/lib/conversations'

const SEEN_KEY = 'vibee.chatTab.marketSeen'
const LAST_KEY = 'vibee.chatTab.last'

/** The market itself. */
export const MARKET = '/agents'
/** Where the tab goes once the market was seen and no chat was opened yet. */
export const OWN_CHAT = '/chat'

/**
 * A chat this tab may return to: the own thread, an agent's thread, a
 * client's thread. Anything else -- a dashboard, the market, a profile -- is
 * not a chat and is never stored.
 */
const CHAT_PATH = /^\/(?:chat|agents\/[a-z0-9-]+\/work|crm\/\d{5,15}\/chat)$/

export function chatAddress(pathname: string, search = ''): string | null {
  if (!CHAT_PATH.test(pathname)) return null
  // Only the conversation travels with the address; other query is dropped.
  const c = new URLSearchParams(search).get('c')
  return isConversationId(c) ? `${pathname}?c=${c}` : pathname
}

export interface ChatTabMemory {
  seen: boolean
  last: string | null
}

/** Where the tab leads from the page open now. */
export function chatTabHref(
  here: { pathname: string; search?: string },
  memory: ChatTabMemory
): string {
  // Inside a chat the tab stays on it, conversation and all.
  const current = chatAddress(here.pathname, here.search)
  if (current) return current
  if (!memory.seen) return MARKET
  return memory.last ?? OWN_CHAT
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readChatTabMemory(): ChatTabMemory {
  const s = storage()
  try {
    const last = s?.getItem(LAST_KEY) ?? null
    const valid =
      last !== null && chatAddress(...splitAddress(last)) === last ? last : null
    return { seen: s?.getItem(SEEN_KEY) === '1', last: valid }
  } catch {
    return { seen: false, last: null }
  }
}

function splitAddress(address: string): [string, string] {
  const q = address.indexOf('?')
  return q < 0 ? [address, ''] : [address.slice(0, q), address.slice(q)]
}

/** Called on every navigation: the market marks itself seen, a chat is kept. */
export function rememberChatTab(pathname: string, search = ''): void {
  const s = storage()
  if (!s) return
  try {
    if (pathname === MARKET) s.setItem(SEEN_KEY, '1')
    const chat = chatAddress(pathname, search)
    if (chat) {
      // Reaching a chat at all means the market is no longer news.
      s.setItem(SEEN_KEY, '1')
      s.setItem(LAST_KEY, chat)
    }
  } catch {
    // A full quota is no reason to break navigation.
  }
}
