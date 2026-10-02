/**
 * WHERE THE APP OPENS, as pure rules: which remembered paths may be restored,
 * which of them are conversations, and which screen wins on launch. Kept apart
 * from the components that apply them (components/Navigation/RouteMemory.tsx)
 * so a module of components exports only components.
 */

/**
 * Where a person may be taken back to.
 *
 * The list is EXPLICIT, not "everything but the service routes", because of
 * the `/:username` route: it catches any single segment, so garbage in storage
 * would render as a profile page. The profile comes back by the canonical
 * `/profile` -- see the entry below.
 */
const RESTORABLE = [
  /^\/feed(\/|$)/,
  /^\/chat(\/|$)/,
  /^\/agents(\/|$)/,
  /^\/editor(\/|$)/,
  /^\/generate(\/|$)/,
  /^\/templates(\/|$)/,
  /^\/search(\/|$)/,
  /^\/blog(\/|$)/,
  /^\/learn(\/|$)/,
  /^\/profile(\/|$)/,
  /*
   * The CRM and every conversation in it. Missing, a person who spent the
   * evening answering clients was sent back to the sales page on /agents
   * they had last passed through (owner, 2026-10-02).
   */
  /^\/crm(\/|$)/,
]

export function isRestorable(path: string): boolean {
  return RESTORABLE.some(re => re.test(path))
}

/** Where the root goes when nothing is remembered. */
export const HOME = '/feed'

/**
 * A CONVERSATION: the agent's own chat, a client's chat in the CRM, a group,
 * a specialist at work. The last one is remembered on its own, beside the
 * last screen.
 */
const CONVERSATION = [
  /^\/chat$/,
  /^\/crm\/[^/]+\/chat$/,
  /^\/crm\/g\/[^/]+\/chat$/,
  /^\/agents\/[^/]+\/work$/,
]

export function isConversation(path: string): boolean {
  return CONVERSATION.some(re => re.test(path))
}

/**
 * Screens a person passes THROUGH rather than stays on: the feed everyone
 * lands on, and the agents page that sells. Owner, 2026-10-02: "if the user
 * chose agents, do not show the sales screen again; keep the last
 * conversation with a client or the agent". When the remembered screen is
 * one of these and there is a conversation, the conversation wins.
 */
const PASSED_THROUGH = new Set(['/feed', '/agents'])

/** Where a greeted person goes back to: see PASSED_THROUGH. */
export function resumeTarget(
  remembered: string | null,
  lastChat: string | null
): string {
  const screen = remembered && isRestorable(remembered) ? remembered : null
  const chat = lastChat && isConversation(lastChat) ? lastChat : null
  if (screen && !PASSED_THROUGH.has(screen)) return screen
  return chat ?? screen ?? HOME
}

/** The last conversation and when it was opened, as kept in CloudStorage. */
export interface ChatMark {
  path: string
  at: number
}

/**
 * The CloudStorage key. Telegram allows only `A-Za-z0-9_-`, so it cannot be
 * the localStorage key.
 */
export const CLOUD_LAST_CHAT = 'vibee_last_chat'

export function encodeChatMark(mark: ChatMark): string {
  return JSON.stringify(mark)
}

/** Whatever CloudStorage held, or null: it is another device's word, unchecked. */
export function decodeChatMark(
  raw: string | null | undefined
): ChatMark | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<ChatMark>
    if (typeof v.path !== 'string' || !isConversation(v.path)) return null
    if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null
    return { path: v.path, at: v.at }
  } catch {
    return null
  }
}

/**
 * THE CONVERSATION FROM ANOTHER DEVICE, OR NOTHING.
 *
 * localStorage lives on one device. A person who answered a client on the
 * phone and opened the app on the desktop landed on the feed or the sales
 * page there. CloudStorage answers only after launch, so the launch redirect
 * cannot wait for it; this decides, once the answer arrives, whether to move.
 *
 * It moves only when the person is still where the launch put them, that
 * place is one they pass through or an older conversation restored from this
 * device, and the cloud's conversation is newer than this device's. A person who already tapped somewhere is never pulled away.
 */
export function cloudResume(input: {
  landed: string
  current: string
  localAt: number
  cloud: ChatMark | null
}): string | null {
  const { landed, current, localAt, cloud } = input
  if (!cloud || current !== landed) return null
  if (!PASSED_THROUGH.has(landed) && !isConversation(landed)) return null
  if (cloud.at <= localAt || cloud.path === landed) return null
  return cloud.path
}
