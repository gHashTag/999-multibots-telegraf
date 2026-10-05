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

// ---- spec v2: typing, one speaker on the all tag, follow-ups, /stop, /mute ----

/** Telegram shows "typing" for ~5 s; a turn takes up to a minute. */
export const typingDue = (sinceLastMs: number): boolean =>
  sinceLastMs >= SPEC.TYPING_REFRESH_MS

/** rank: the agent's place in the best-fit order for this message, from 0. */
export const speaksOnAll = (rank: number): boolean =>
  rank < SPEC.ALL_FIRST_SPEAKERS

/** A person's next message in the same topic goes to the last agent, untagged. */
export const followsUp = (
  fromBot: boolean,
  samePerson: boolean,
  sameThread: boolean,
  ageMs: number
): boolean =>
  !fromBot && samePerson && sameThread && ageMs < SPEC.FOLLOW_UP_WINDOW_MS

export const stopped = (sinceStopMs: number): boolean =>
  sinceStopMs < SPEC.STOP_WINDOW_MS

/** A stop cuts bot-to-bot turns only; a person is always heard. */
export const mayAnswerAfterStop = (
  fromBot: boolean,
  sinceStopMs: number
): boolean => !fromBot || !stopped(sinceStopMs)

export const muted = (sinceMuteMs: number): boolean =>
  sinceMuteMs < SPEC.MUTE_MS

/** A muted agent still answers its own tag. */
export const heardWhileMuted = (
  tagged: boolean,
  sinceMuteMs: number
): boolean => tagged || !muted(sinceMuteMs)

// ---- spec v3: reactions, briefs, a deleted topic, /summary ----

/** The answer counts whether or not the chat accepts reactions. */
export const turnOk = (answerSent: boolean, _reactionOk: boolean): boolean =>
  answerSent

/** A failed turn takes the "seen" mark away. */
export const keepsSeenMark = (answerSent: boolean): boolean => answerSent

/** 0 none, 1 the group's brief, 2 the topic's. The narrower one wins. */
export function briefSource(
  hasTopicBrief: boolean,
  hasGroupBrief: boolean
): 0 | 1 | 2 {
  if (hasTopicBrief) return 2
  if (hasGroupBrief) return 1
  return 0
}

/** An empty brief fits: it clears the brief. */
export const briefFits = (chars: number): boolean =>
  chars <= SPEC.MAX_BRIEF_CHARS

export const maySetBrief = (isAdmin: boolean, fromBot: boolean): boolean =>
  isAdmin && !fromBot

/** A missing or stale topic is recreated, at most once per cooldown. */
export const recreateTopic = (
  stored: boolean,
  threadFound: boolean,
  sinceLastTryMs: number
): boolean =>
  (!stored || !threadFound) && sinceLastTryMs >= SPEC.TOPIC_RECREATE_COOLDOWN_MS

/** How many logged messages a /summary reads. */
export function summaryCount(asked: number): number {
  if (asked === 0) return SPEC.SUMMARY_DEFAULT
  if (asked > SPEC.SUMMARY_LOG_SIZE) return SPEC.SUMMARY_LOG_SIZE
  return asked
}
