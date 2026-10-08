/**
 * A PERSON'S TEAM OF AGENTS IN THE PRIVATE CHAT.
 *
 * Spec of record: bot-agent-team.t27 (gHashTag/t27#7855). Owner, 2026-10-08:
 * "as soon as a person enters the bot, chats with agents are made for his
 * interests; each agent has its own chat, named after its profession -- a
 * team of agents, not folders", after OpenAI's dots: one persistent agent per
 * job.
 *
 * So /start no longer lays out every tab at once. The Agent, the generalist,
 * is on every team from the first /start (TEAM_CORE); a member whose screen the
 * person's link named (`?start=app_story` brings the Director) joins with it.
 * Every other member is offered: one button each under the Agent tab's first
 * message and under /team, and a press makes that one tab, whose agent then
 * introduces itself there. A tab the person already has is always looked
 * after and never taken away by these rules.
 *
 * What each member leads with, and that every member still has every tool,
 * is the render's half (render src/agent/profession.ts).
 *
 * src/spec/bot-agent-team.test.ts runs every test of the spec against this.
 */
import * as TEAM from '@/spec/bot-agent-team.gen'
import * as TABS_SPEC from '@/spec/bot-topic-tabs.gen'

/** spec joins_at_start: the core, or the member the person's link named. */
export const joinsAtStart = (index: number, namedByLink: boolean): boolean =>
  index < TEAM.TEAM_CORE || namedByLink

/** spec tended: a stored tab is looked after; a new one only when it joins. */
export const tended = (stored: boolean, joins: boolean): boolean =>
  stored || joins

/** spec offered: a member not on the team, never the core. */
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

/** The callback a hire button carries: `team:<kind>`. */
export const HIRE_PREFIX = 'team:'

/**
 * The kinds that join at /start: the core, and the member whose screen the
 * link the person came by names (bot-topic-tabs TAB_ROUTES).
 */
export function startingKinds(linkRoute?: string | null): string[] {
  return TABS_SPEC.TAB_KEYS.filter((_, i) =>
    joinsAtStart(i, !!linkRoute && TABS_SPEC.TAB_ROUTES[i] === linkRoute)
  )
}

/** The kinds offered to a person whose team holds `onTeam`, in tab order. */
export function offeredKinds(onTeam: Iterable<string>): string[] {
  const have = new Set(onTeam)
  return TABS_SPEC.TAB_KEYS.filter((kind, i) => offered(i, have.has(kind)))
}

/** A member a hire press may name: offered when it is not on the team. */
export function hireable(kind: string): boolean {
  const i = (TABS_SPEC.TAB_KEYS as readonly string[]).indexOf(kind)
  return i >= 0 && offered(i, false)
}

/**
 * One button per offered member, HIRE_BUTTONS_PER_ROW to a row. `nameOf` is
 * the tab's title in the person's language (emoji included). An empty list
 * when the whole team is there.
 */
export function hireRows(
  kinds: readonly string[],
  nameOf: (kind: string) => string
): { text: string; callback_data: string }[][] {
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < kinds.length; i += TEAM.HIRE_BUTTONS_PER_ROW) {
    rows.push(
      kinds.slice(i, i + TEAM.HIRE_BUTTONS_PER_ROW).map(kind => ({
        text: `+ ${nameOf(kind)}`,
        callback_data: `${HIRE_PREFIX}${kind}`,
      }))
    )
  }
  return rows
}
