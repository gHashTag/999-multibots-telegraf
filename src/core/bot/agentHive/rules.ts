/**
 * WHO IN THE HIVE ANSWERS WHOM -- the spec's own compiled rules.
 *
 * gHashTag/t27 specs/automation/agent-hive-group.t27 is the spec of record.
 * Its fn bodies run here from agent-hive-group.logic.ts (scripts/t27-logic.mjs:
 * t27c gen -> zig -> wasm); its numbers come from the generated module. Until
 * 2026-10-09 this file retyped every rule by hand (owner: "logic in .t27 and
 * in no other way"). What stays here is plumbing: a time that never happened
 * (Infinity) or a count from a person's words fits the spec's u32 before the
 * call, and the text matchers below, which the spec does not describe.
 *
 * Telegram gives bots no loop protection: with Bot-to-Bot Communication Mode
 * on, two agents that answer each other would do it forever. The chain depth
 * and the cooldown below are the only thing that stops them.
 */

import * as SPEC from '@/spec/agent-hive-group.gen'
import * as L from '@/spec/agent-hive-group.logic'

/** A number the spec reads as u32: Infinity ("never") is its largest value. */
const u32 = (v: number): number =>
  Number.isNaN(v) ? 0 : Math.min(Math.max(0, Math.floor(v)), 0xffffffff)

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
// t27-plumbing: unpacks the record into the compiled spec fn addressed
export const addressed = (a: Addressing): boolean =>
  L.addressed(a.tagged, a.allTag, a.replyToMe, a.ownTopic, a.fromBot)

/** depth: bot messages already standing between this one and the person. */
// t27-plumbing: the compiled spec fn chain_open, the depth as u32
export const chainOpen = (depth: number): boolean => L.chainOpen(u32(depth))

// t27-plumbing: the compiled spec fn cooled, the time as u32
export const cooled = (sinceLastMs: number): boolean =>
  L.cooled(u32(sinceLastMs))

/** A person is always answered; a bot only inside the chain and the cooldown. */
// t27-plumbing: the compiled spec fn may_answer, numbers as u32
export const mayAnswer = (
  fromBot: boolean,
  depth: number,
  sinceLastMs: number
): boolean => L.mayAnswer(fromBot, u32(depth), u32(sinceLastMs))

// t27-plumbing: the compiled spec fn claim_fresh, the age as u32
export const claimFresh = (ageMs: number): boolean => L.claimFresh(u32(ageMs))

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
// t27-plumbing: the compiled spec fn typing_due, the time as u32
export const typingDue = (sinceLastMs: number): boolean =>
  L.typingDue(u32(sinceLastMs))

/** rank: the agent's place in the best-fit order for this message, from 0. */
// t27-plumbing: the compiled spec fn speaks_on_all, the rank as u32
export const speaksOnAll = (rank: number): boolean => L.speaksOnAll(u32(rank))

/** A person's next message in the same topic goes to the last agent, untagged. */
// t27-plumbing: the compiled spec fn follows_up, the age as u32
export const followsUp = (
  fromBot: boolean,
  samePerson: boolean,
  sameThread: boolean,
  ageMs: number
): boolean => L.followsUp(fromBot, samePerson, sameThread, u32(ageMs))

// t27-plumbing: the compiled spec fn stopped, the time as u32
export const stopped = (sinceStopMs: number): boolean =>
  L.stopped(u32(sinceStopMs))

/** A stop cuts bot-to-bot turns only; a person is always heard. */
// t27-plumbing: the compiled spec fn may_answer_after_stop, the time as u32
export const mayAnswerAfterStop = (
  fromBot: boolean,
  sinceStopMs: number
): boolean => L.mayAnswerAfterStop(fromBot, u32(sinceStopMs))

// t27-plumbing: the compiled spec fn muted, the time as u32
export const muted = (sinceMuteMs: number): boolean => L.muted(u32(sinceMuteMs))

/** A muted agent still answers its own tag. */
// t27-plumbing: the compiled spec fn heard_while_muted, the time as u32
export const heardWhileMuted = (
  tagged: boolean,
  sinceMuteMs: number
): boolean => L.heardWhileMuted(tagged, u32(sinceMuteMs))

// ---- spec v3: reactions, briefs, a deleted topic, /summary ----

/** The answer counts whether or not the chat accepts reactions. */
export const turnOk = L.turnOk

/** A failed turn takes the "seen" mark away. */
export const keepsSeenMark = L.keepsSeenMark

/** 0 none, 1 the group's brief, 2 the topic's. The narrower one wins. */
export const briefSource = (
  hasTopicBrief: boolean,
  hasGroupBrief: boolean
): 0 | 1 | 2 => L.briefSource(hasTopicBrief, hasGroupBrief) as 0 | 1 | 2

/** An empty brief fits: it clears the brief. */
// t27-plumbing: the compiled spec fn brief_fits, the length as u32
export const briefFits = (chars: number): boolean => L.briefFits(u32(chars))

export const maySetBrief = L.maySetBrief

/** A missing or stale topic is recreated, at most once per cooldown. */
// t27-plumbing: the compiled spec fn recreate_topic, the time as u32
export const recreateTopic = (
  stored: boolean,
  threadFound: boolean,
  sinceLastTryMs: number
): boolean => L.recreateTopic(stored, threadFound, u32(sinceLastTryMs))

/** How many logged messages a /summary reads. */
export const summaryCount = (asked: number): number =>
  L.summaryCount(u32(asked))

// ---- spec v4: hand-off in private, bot to bot ----

export const dmHeard = L.dmHeard
export const dmRunsTurn = L.dmRunsTurn
export const dmCarries = L.dmCarries
// t27-plumbing: the compiled spec fn dm_tag_ok, the kind and the time as u32
export const dmTagOk = (kind: number, sinceAskMs: number): boolean =>
  L.dmTagOk(Math.min(u32(kind), 255), u32(sinceAskMs))
export const dmHandoffsSent = (asked: number): number =>
  L.dmHandoffsSent(u32(asked))
