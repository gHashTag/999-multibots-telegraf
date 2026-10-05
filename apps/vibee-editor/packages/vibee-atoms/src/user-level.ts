/**
 * WHO IS LOOKING: THE PERSON'S LEVEL, AND WHAT THEIR CRM SHOWS.
 *
 * Owner, 2026-10-02: a level switch in the menu, to test the UI as each kind
 * of person -- admin, manager, blogger, developer -- and a CRM dashboard of
 * its own for each level.
 *
 * A level is what a person bought, read from the package catalogue
 * (agent-packages.ts), plus the platform admin on top. It decides only what
 * the screen SHOWS. It is never a permission: the server checks every action
 * itself, so a switched level shows a layout and grants nothing.
 */
import type { LocalizedText } from './agent-marketplace'
import type { AgentPackageId } from './agent-packages'

export type UserLevel = 'admin' | 'manager' | 'blogger' | 'developer'

/** In the order the switch draws them: the widest view first. */
export const USER_LEVELS: readonly UserLevel[] = [
  'admin',
  'manager',
  'blogger',
  'developer',
]

export const USER_LEVEL_LABEL: Record<UserLevel, LocalizedText> = {
  admin: { en: 'Admin', ru: 'Админ' },
  manager: { en: 'Manager', ru: 'Менеджер' },
  blogger: { en: 'Blogger', ru: 'Блогер' },
  developer: { en: 'Developer', ru: 'Разработчик' },
}

/** The package a level is sold as; the admin is not sold. */
const LEVEL_OF_PACKAGE: Record<AgentPackageId, UserLevel> = {
  manager: 'manager',
  blogger: 'blogger',
  // The catalogue id stays `twin`: payloads already minted carry it.
  twin: 'developer',
  tridev: 'developer',
}

export function levelOfPackage(id: AgentPackageId): UserLevel {
  return LEVEL_OF_PACKAGE[id]
}

/** Higher includes lower: the Blogger Agent has everything in the Manager's. */
const RANK: Record<UserLevel, number> = {
  manager: 1,
  blogger: 2,
  developer: 3,
  admin: 4,
}

/**
 * The level a person's paid packages give: the highest active one, or null
 * when nothing is paid. Unknown ids are ignored, not guessed.
 */
export function levelOfPackages(
  packages: readonly { id: string; active: boolean }[]
): UserLevel | null {
  let best: UserLevel | null = null
  for (const p of packages) {
    if (
      !p.active ||
      !Object.prototype.hasOwnProperty.call(LEVEL_OF_PACKAGE, p.id)
    )
      continue
    const level = LEVEL_OF_PACKAGE[p.id as AgentPackageId]
    if (!best || RANK[level] > RANK[best]) best = level
  }
  return best
}

/** Every block the CRM screen can draw. */
export type CrmBlock =
  | 'funnel'
  | 'autopilot'
  | 'waiting'
  | 'leads'
  | 'winback'
  | 'clients'
  | 'revenue'
  | 'audience'
  | 'traffic'
  | 'map'
  | 'leadSections'

/**
 * EACH LEVEL'S DASHBOARD: which blocks of the CRM screen it draws. The
 * screen keeps one order of its own; a level only leaves blocks out.
 *
 * - The manager answers people: who waits, who is hot, the client list, the
 *   lead tabs and the autopilot that writes for them.
 * - The blogger grows an audience: who came, from where, and who waits.
 * - The developer builds the agent and sells it: the funnel, the autopilot,
 *   the clients and the money they bring.
 * - The admin sees everything, as the screen was before levels existed.
 */
export const CRM_DASHBOARD: Record<UserLevel, readonly CrmBlock[]> = {
  admin: [
    'funnel',
    'autopilot',
    'waiting',
    'leads',
    'winback',
    'clients',
    'revenue',
    'audience',
    'traffic',
    'map',
    'leadSections',
  ],
  manager: [
    'waiting',
    'leads',
    'autopilot',
    'clients',
    'winback',
    'funnel',
    'leadSections',
  ],
  blogger: ['audience', 'traffic', 'waiting', 'clients', 'leadSections'],
  developer: [
    'funnel',
    'autopilot',
    'waiting',
    'clients',
    'revenue',
    'map',
    'leadSections',
  ],
}

/** Does this level's CRM draw this block? No level = the full screen. */
export function crmShows(level: UserLevel | null, block: CrmBlock): boolean {
  return CRM_DASHBOARD[level ?? 'admin'].includes(block)
}

/** A one-tap shortcut at the top of a level's dashboard. */
export interface LevelShortcut {
  label: LocalizedText
  to: string
}

export const LEVEL_SHORTCUTS: Record<UserLevel, readonly LevelShortcut[]> = {
  admin: [
    { label: { en: 'Agents', ru: 'Агенты' }, to: '/agents' },
    { label: { en: 'Map', ru: 'Карта' }, to: '/crm?tab=map' },
    { label: { en: 'Agent chat', ru: 'Чат с агентом' }, to: '/chat' },
  ],
  manager: [
    { label: { en: 'Agent chat', ru: 'Чат с агентом' }, to: '/chat' },
    { label: { en: 'Leads', ru: 'Лиды' }, to: '/crm?tab=leads' },
  ],
  blogger: [
    { label: { en: 'Make a reel', ru: 'Сделать рилс' }, to: '/generate' },
    { label: { en: 'Stories', ru: 'Истории' }, to: '/story' },
    { label: { en: 'Agent chat', ru: 'Чат с агентом' }, to: '/chat' },
  ],
  developer: [
    {
      label: { en: 'Connect an agent', ru: 'Подключить агента' },
      to: '/agents/connect',
    },
    { label: { en: 'My agents', ru: 'Мои агенты' }, to: '/agents' },
    { label: { en: 'Agent chat', ru: 'Чат с агентом' }, to: '/chat' },
  ],
}
