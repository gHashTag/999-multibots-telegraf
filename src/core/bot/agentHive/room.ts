/**
 * WHAT A HIVE ROOM REMEMBERS BETWEEN TURNS.
 *
 * Spec of record: agent-hive-group.t27 v2 and v3. The rules themselves are in
 * rules.ts; this file holds only the state they read:
 *
 *   /stop      when a person last stopped the bot-to-bot talk in a chat
 *   /mute      when a topic (or one agent in it) was muted
 *   follow-up  which agent last answered a person in a topic, and when
 *   /summary   a bounded log of every topic (SUMMARY_LOG_SIZE lines)
 *   /brief     the standing briefs, read through from the database
 *   recreate   when an agent last tried to remake its deleted topic
 *
 * Every agent bot runs in the manager's process (managed bots are launched by
 * it), so one in-memory copy is enough, as chain.ts already does for depth.
 * A redeploy forgets stops, mutes and follow-ups: each lasts minutes, and a
 * forgotten one fails open to the v1 rules, never to a silent agent. The
 * briefs are the only thing that must survive, so they live in Postgres.
 */

import * as SPEC from '@/spec/agent-hive-group.gen'
import { logger } from '@/utils/logger'
import { hiveBriefs, setHiveBrief } from '@/core/bot/managedBots/store'
import { briefSource } from './rules'

/** Thread 0 is the group as a whole (the General topic, or no topic). */
export const threadKey = (thread: number | undefined): number => thread ?? 0

const stops = new Map<number, number>()
const mutes = new Map<string, number>()
const lastAnswers = new Map<string, { botId: number; at: number }>()
const logs = new Map<string, { who: string; text: string }[]>()
const recreateTries = new Map<number, number>()
const briefCache = new Map<number, Map<number, string>>()

const topicKey = (chat: number, thread: number | undefined) =>
  `${chat}:${threadKey(thread)}`

// ---- /stop ----

export function noteStop(chat: number, now = Date.now()): void {
  stops.set(chat, now)
}

/** Milliseconds since the last /stop in this chat; Infinity if none. */
export function sinceStop(chat: number, now = Date.now()): number {
  const at = stops.get(chat)
  return at === undefined ? Infinity : now - at
}

// ---- /mute ----

/** Mute a topic for every agent (botId undefined) or for one agent. */
export function noteMute(
  chat: number,
  thread: number | undefined,
  botId?: number,
  now = Date.now()
): void {
  mutes.set(`${topicKey(chat, thread)}:${botId ?? '*'}`, now)
}

/** Milliseconds since this agent was muted in this topic; Infinity if not. */
export function sinceMute(
  chat: number,
  thread: number | undefined,
  botId: number,
  now = Date.now()
): number {
  const own = mutes.get(`${topicKey(chat, thread)}:${botId}`)
  const all = mutes.get(`${topicKey(chat, thread)}:*`)
  const at = Math.max(own ?? -Infinity, all ?? -Infinity)
  return at === -Infinity ? Infinity : now - at
}

// ---- follow-ups ----

const answerKey = (chat: number, thread: number | undefined, person: number) =>
  `${topicKey(chat, thread)}:${person}`

/** An agent answered this person in this topic. */
export function noteAnswered(
  chat: number,
  thread: number | undefined,
  person: number,
  botId: number,
  now = Date.now()
): void {
  lastAnswers.set(answerKey(chat, thread, person), { botId, at: now })
}

/**
 * The age of this agent's last answer to this person in this topic, or
 * Infinity when the last answer there was another agent's (or none).
 */
export function sinceMyAnswer(
  chat: number,
  thread: number | undefined,
  person: number,
  botId: number,
  now = Date.now()
): number {
  const last = lastAnswers.get(answerKey(chat, thread, person))
  return last && last.botId === botId ? now - last.at : Infinity
}

// ---- /summary log ----

/** One line of a topic's log, deduplicated by message across agent bots. */
const seen = new Set<string>()
export function logLine(
  chat: number,
  thread: number | undefined,
  messageId: number,
  who: string,
  text: string
): void {
  const id = `${chat}:${messageId}`
  if (!text || seen.has(id)) return
  seen.add(id)
  if (seen.size > SPEC.SUMMARY_LOG_SIZE * 50) seen.clear()
  const key = topicKey(chat, thread)
  const log = logs.get(key) ?? []
  log.push({ who, text: text.slice(0, 1000) })
  while (log.length > SPEC.SUMMARY_LOG_SIZE) log.shift()
  logs.set(key, log)
}

/** The last `count` lines of a topic, oldest first. */
export function lastLines(
  chat: number,
  thread: number | undefined,
  count: number
): { who: string; text: string }[] {
  const log = logs.get(topicKey(chat, thread)) ?? []
  return log.slice(-count)
}

// ---- deleted topics ----

export function sinceRecreateTry(botId: number, now = Date.now()): number {
  const at = recreateTries.get(botId)
  return at === undefined ? Infinity : now - at
}

export function noteRecreateTry(botId: number, now = Date.now()): void {
  recreateTries.set(botId, now)
}

// ---- /brief ----

async function briefsOf(chat: number): Promise<Map<number, string>> {
  const held = briefCache.get(chat)
  if (held) return held
  try {
    const read = await hiveBriefs(chat)
    briefCache.set(chat, read)
    return read
  } catch (e) {
    // No database: no brief, and the next turn asks again.
    logger.debug('[agent-hive] briefs not read', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return new Map()
  }
}

/** The brief a turn in this topic carries: the topic's, else the group's. */
export async function briefFor(
  chat: number,
  thread: number | undefined
): Promise<string> {
  const all = await briefsOf(chat)
  const topic = thread !== undefined ? all.get(thread) : undefined
  const source = briefSource(Boolean(topic), Boolean(all.get(0)))
  if (source === 2) return topic!
  if (source === 1) return all.get(0)!
  return ''
}

/** Store a brief (empty clears it). Throws when the database refuses. */
export async function saveBrief(
  chat: number,
  thread: number | undefined,
  brief: string,
  setBy: number
): Promise<void> {
  await setHiveBrief(chat, threadKey(thread), brief, setBy)
  const all = briefCache.get(chat)
  if (all) {
    if (brief) all.set(threadKey(thread), brief)
    else all.delete(threadKey(thread))
  }
}

/** For tests. */
export function clearRoom(): void {
  stops.clear()
  mutes.clear()
  lastAnswers.clear()
  logs.clear()
  seen.clear()
  recreateTries.clear()
  briefCache.clear()
}
