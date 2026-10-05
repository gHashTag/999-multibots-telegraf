/**
 * WHO IN THE HIVE ANSWERS WHOM -- written in t27 first.
 *
 * gHashTag/t27 specs/automation/agent-hive-group.t27 is the spec of record;
 * its numbers come from the generated module and nothing here restates them.
 * src/spec/agent-hive-group.test.ts runs every test of the spec against these
 * functions.
 *
 * Telegram gives bots no loop protection: with Bot-to-Bot Communication Mode
 * on, two agents that answer each other would do it forever. The chain depth
 * and the cooldown below are the only thing that stops them.
 */

import * as SPEC from '@/spec/agent-hive-group.gen'

export interface Addressing {
  /** The message names this bot: @username, or a text mention of it. */
  tagged: boolean
  /** The message calls every agent of the hive at once. */
  allTag: boolean
  /** The message replies to one of this bot's messages. */
  replyToMe: boolean
  /** The message was written in this agent's own topic of the hive. */
  ownTopic: boolean
  /** The author is a bot (another agent, or the manager). */
  fromBot: boolean
}

/** A person by tag, all tag, reply or the agent's topic; a bot by tag or reply. */
export const addressed = (a: Addressing): boolean =>
  a.tagged || a.replyToMe || (!a.fromBot && (a.allTag || a.ownTopic))

/** depth: bot messages already standing between this one and the person. */
export const chainOpen = (depth: number): boolean => depth < SPEC.MAX_BOT_DEPTH

export const cooled = (sinceLastMs: number): boolean =>
  sinceLastMs >= SPEC.BOT_REPLY_COOLDOWN_MS

/** A person is always answered; a bot only inside the chain and the cooldown. */
export const mayAnswer = (
  fromBot: boolean,
  depth: number,
  sinceLastMs: number
): boolean => !fromBot || (chainOpen(depth) && cooled(sinceLastMs))

export const claimFresh = (ageMs: number): boolean => ageMs < SPEC.CLAIM_TTL_MS

/** The username suggested for an agent's bot: t27_<agent id>_bot. */
export const agentBotUsername = (agentId: string): string =>
  `${SPEC.BOT_USERNAME_PREFIX}${agentId}${SPEC.BOT_USERNAME_SUFFIX}`

/** The agent id a suggested username carries, or null. */
export function agentIdOfUsername(username: string): string | null {
  const u = username.toLowerCase()
  const pre = SPEC.BOT_USERNAME_PREFIX.toLowerCase()
  const suf = SPEC.BOT_USERNAME_SUFFIX.toLowerCase()
  if (!u.startsWith(pre) || !u.endsWith(suf)) return null
  const id = u.slice(pre.length, u.length - suf.length)
  return id || null
}

/*
 * The all tag, and its Russian twin: the owner writes both. Bounded by a
 * non-word character so "@allies" is not a call to everybody.
 */
const ALL_TAGS = [SPEC.ALL_TAG, '@все']

export function callsAll(text: string): boolean {
  const t = text.toLowerCase()
  return ALL_TAGS.some(tag => {
    for (let i = t.indexOf(tag); i >= 0; i = t.indexOf(tag, i + 1)) {
      const next = t.charAt(i + tag.length)
      if (!next || !/[\p{L}\p{N}_]/u.test(next)) return true
    }
    return false
  })
}

export interface Entity {
  type: string
  offset: number
  length: number
  user?: { id: number }
}

/** Does the text name this bot: an @mention entity or a text mention. */
export function mentions(
  text: string,
  entities: readonly Entity[] | undefined,
  me: { id: number; username: string }
): boolean {
  const want = `@${me.username}`.toLowerCase()
  for (const e of entities ?? []) {
    if (e.type === 'text_mention' && e.user?.id === me.id) return true
    if (
      e.type === 'mention' &&
      text.slice(e.offset, e.offset + e.length).toLowerCase() === want
    )
      return true
  }
  return false
}
