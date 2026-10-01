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
