/**
 * EACH MEMBER OF A PERSON'S TEAM HAS A TRADE -- AND EVERY TOOL.
 *
 * Spec of record: bot-agent-team.t27 (gHashTag/t27#7855). Owner, 2026-10-08:
 * "each agent its own chat, named after its profession, with its own skills
 * and tools", and the same hour: "give the agents access to every spec and
 * every tool". So a trade decides what a member LEADS with, never what it
 * may use: the Director is told that reels, lip-sync and pictures are its
 * work and which tools those are, and it still has the balance, the browser
 * and the spec bank when the person asks for them (EVERY_TOOL_FOR_EVERY_MEMBER).
 *
 * The member is known from the conversation the bot sends: a fixed tab other
 * than the Agent's keeps its memory under `tab<kind>` (bot-agent-memory.t27),
 * so `tabreels` is the Director's tab. The Agent tab, any other thread, a
 * group and the mini-app speak to the generalist and get no trade (has_trade).
 *
 * The bot's half -- who is on the team, the hire buttons -- is
 * src/navigation/topics/team.ts. src/spec/bot-agent-team.test.ts runs every
 * test of the spec against this file.
 */
import * as TEAM from '../spec/bot-agent-team.gen'
import * as TABS_SPEC from '../spec/bot-topic-tabs.gen'

/**
 * The prefix of a fixed tab's conversation (bot-agent-memory.t27
 * TAB_MEMORY_PREFIX; that spec is vendored in the bot, which writes the id).
 */
export const TAB_CONVERSATION_PREFIX = 'tab'

/** spec joins_at_start (the bot decides it; mirrored for the binding test). */
export const joinsAtStart = (index: number, namedByLink: boolean): boolean =>
  index < TEAM.TEAM_CORE || namedByLink

/** spec tended. */
export const tended = (stored: boolean, joins: boolean): boolean =>
  stored || joins

/** spec offered. */
export const offered = (index: number, onTeam: boolean): boolean =>
  index >= TEAM.TEAM_CORE && index < TEAM.TEAM_SIZE && !onTeam

/** spec app_lists: the app lists the team; every member when the bot has no tabs. */
export const appLists = (onTeam: boolean, botHasTabs: boolean): boolean =>
  onTeam || !botHasTabs

/** spec app_hire_makes_tab: a hire in the app makes the member's tab in the bot. */
export const appHireMakesTab = (
  offeredNow: boolean,
  botHasTabs: boolean
): boolean => offeredNow && botHasTabs

/** spec tool_shown: every tool for every member, its trade first. */
export const toolShown = (everyTool: boolean, inTrade: boolean): boolean =>
  everyTool || inTrade

/** spec leads_with: a member names its trade's tools as its own. */
export const leadsWith = (scopeAll: boolean, inTrade: boolean): boolean =>
  !scopeAll && inTrade

/** spec has_trade: only a fixed tab other than the Agent's. */
export const hasTrade = (fixedTab: boolean, base: boolean): boolean =>
  fixedTab && !base

/** Is this tool in a trade written as names and `prefix_` words? */
export function inTrade(tool: string, scope: string): boolean {
  if (scope === TEAM.TOOL_SCOPE_ALL) return true
  return scope
    .split(' ')
    .filter(Boolean)
    .some(w => (w.endsWith('_') ? tool.startsWith(w) : tool === w))
}

/** The member index of a conversation id, or -1 for the generalist. */
export function memberOfConversation(conversation?: string | null): number {
  const c = String(conversation ?? '')
  if (!c.startsWith(TAB_CONVERSATION_PREFIX)) return -1
  const i = (TABS_SPEC.TAB_KEYS as readonly string[]).indexOf(
    c.slice(TAB_CONVERSATION_PREFIX.length)
  )
  return hasTrade(i >= 0, i >= 0 && i < TEAM.TEAM_CORE) ? i : -1
}

/** The tools of the registry a member leads with, in registry order. */
export function leadTools(index: number, names: readonly string[]): string[] {
  const scope = TEAM.TEAM_LEAD_TOOLS[index] ?? TEAM.TOOL_SCOPE_ALL
  return names.filter(n =>
    leadsWith(scope === TEAM.TOOL_SCOPE_ALL, inTrade(n, scope))
  )
}

/**
 * The tools a member is shown: every one (EVERY_TOOL_FOR_EVERY_MEMBER). A
 * trade adds nothing to deny; it is here so that a spec turning the flag off
 * would narrow the list in one place.
 */
export function shownTools(index: number, names: readonly string[]): string[] {
  const scope = TEAM.TEAM_LEAD_TOOLS[index] ?? TEAM.TOOL_SCOPE_ALL
  return names.filter(n =>
    toolShown(TEAM.EVERY_TOOL_FOR_EVERY_MEMBER, inTrade(n, scope))
  )
}

/** Interface text: each member's trade in its own words. */
const TRADE_RU: Record<string, { who: string; work: string }> = {
  // cyrillic-ok: interface copy of the prompt
  reels: { who: 'РЕЖИССЁР', work: 'рилсы, липсинк, фото и видео, публикации' }, // cyrillic-ok: prompt copy
  browser: { who: 'ШТУРМАН', work: 'браузер человека и поиск в сети' }, // cyrillic-ok: prompt copy
  mybot: {
    who: 'КОНСТРУКТОР',
    work: 'собственный бот человека, его вкладки, скиллы и проекты',
  }, // cyrillic-ok: prompt copy
  wallet: { who: 'КАЗНАЧЕЙ', work: 'баланс токенов, пополнение, клуб и цены' }, // cyrillic-ok: prompt copy
  hive: { who: 'КОРОЛЕВА УЛЬЯ', work: 'задачи, доска, пчёлы, планы и поломки' }, // cyrillic-ok: prompt copy
}

/**
 * The block a member's turn carries in its system prompt, or '' for the
 * generalist. `names` is the registry's tool names.
 */
export function professionSection(
  conversation: string | null | undefined,
  names: readonly string[]
): string {
  const i = memberOfConversation(conversation)
  if (i < 0) return ''
  const kind = TABS_SPEC.TAB_KEYS[i]
  const trade = TRADE_RU[kind]
  if (!trade) return ''
  const lead = leadTools(i, names)
  return (
    `\n\nТЫ — ${trade.who} В КОМАНДЕ АГЕНТОВ ЧЕЛОВЕКА, и это твоя вкладка в его чате. ` + // cyrillic-ok: prompt copy
    `Твоё ремесло: ${trade.work}. ` + // cyrillic-ok: prompt copy
    (lead.length
      ? `Твои инструменты в первую очередь: ${lead.join(', ')}. ` // cyrillic-ok: prompt copy
      : '') +
    'Но все остальные инструменты тоже твои: о чём бы ни попросили, делай сам, ' + // cyrillic-ok: prompt copy
    'а не отсылай. Если долгая работа целиком в ремесле коллеги, сделай, что просили, ' + // cyrillic-ok: prompt copy
    'и одной фразой скажи, что у него есть своя вкладка (/team — позвать в команду). ' + // cyrillic-ok: prompt copy
    'Любое правило, число и порог проекта сверяй со спекой: t27_specs.' // cyrillic-ok: prompt copy
  )
}
