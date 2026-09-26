/**
 * ONE ROOM WHERE THE AGENT WORKS WITH PEOPLE, NOT ONLY WHEN NAMED.
 *
 * Owner, 2026-09-24: "why is the bot not talking to her in the chat -- I want
 * the agent to start helping her there".
 *
 * It was not broken. It was obeying HIS OWN rule from 2026-09-20
 * (groupAddressing.ts): in a room with other people the bot speaks only when
 * spoken to -- a reply to it, its @name, or a command. That rule exists
 * because five paying clients share a group with him, and an answer nobody
 * asked for lands in front of all five.
 *
 * Both things are true at once, so the switch is PER ROOM. The rule stays
 * whole everywhere it was written for; a group named here becomes one where
 * the agent works with whoever writes.
 *
 * AN ENVIRONMENT VARIABLE, like the club's guest list (club-guests.ts), and
 * for the same reason: the owner adds or removes a room in the Railway
 * dashboard without a deploy, and the list is visible to him in one place
 * rather than hidden in a table only code can read.
 *
 * WHAT TURNING IT ON MEANS, said plainly: in that room the agent answers
 * ordinary messages from anybody present. It is the right thing for a room
 * he opened to work with one person, and the wrong thing for a room where
 * clients read each other -- which is why it is never a default.
 */

/** `-100123,-100456` -- ids as Telegram gives them, commas or spaces. */
export function conciergeChats(
  env: NodeJS.ProcessEnv = process.env
): Set<string> {
  const raw = String(env.GROUP_CONCIERGE_CHATS ?? '')
  return new Set(
    raw
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => /^-?\d{5,20}$/.test(s))
  )
}

/**
 * Is this the room the owner opened for the agent?
 *
 * A private chat is never one of these: one person writing to the bot alone
 * is addressing it by definition, and saying otherwise here would only make
 * two answers to the same question.
 */
export function isConciergeChat(
  chatId: unknown,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const id = String(chatId ?? '').trim()
  if (!id || !id.startsWith('-')) return false
  return conciergeChats(env).has(id)
}
