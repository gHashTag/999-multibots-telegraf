/**
 * THE AGENT PACKAGES, AS THE PUBLIC CATALOGUE ENDPOINT SERVES THEM.
 *
 * The catalogue lives in ONE place
 * (apps/vibee-editor/packages/vibee-atoms/src/agent-packages.ts), and the bot
 * cannot import it (tsconfig rootDir is ./src). This is a mirror of the few
 * fields GET /api/agents/packages answers with, and NOT a second home:
 * agentPackageCatalogue.test.ts imports the catalogue itself and fails on the
 * first id, title, Stars, dollar figure or order link that differs.
 *
 * One price for every package (owner, 2026-10-03): a Telegram Stars
 * subscription at the cap, 10000 Stars every 30 days. The dollars are derived
 * from the Stars at STAR_COST_USD, never typed.
 */
import { STAR_COST_USD } from '@/price/constants'
import { AGENT_PACKAGE_IDS } from '@/services/agentPackageOrder'

/** The most a Telegram Stars subscription may charge per period. */
export const STARS_SUBSCRIPTION_MAX = 10_000

/** The one package price: the subscription cap, every 30 days. */
export const AGENT_SUBSCRIPTION = {
  stars: STARS_SUBSCRIPTION_MAX,
  periodSeconds: 2_592_000,
} as const

export type AgentPackageCatalogueId = (typeof AGENT_PACKAGE_IDS)[number]

const TITLES: Record<AgentPackageCatalogueId, { en: string; ru: string }> = {
  manager: { en: 'Manager Agent', ru: 'Менеджер агент' },
  blogger: { en: 'Blogger Agent', ru: 'Блогер агент' },
  twin: { en: 'Developer Agent', ru: 'Разработчик агент' },
  tridev: { en: 'TRI DEV', ru: 'TRI DEV' },
}

/** The bot a package order opens, with `?start=agentpkg_<id>`. */
export const AGENT_PACKAGE_ORDER_BOT = 't27ai_bot'

export interface AgentPackageEntry {
  id: AgentPackageCatalogueId
  title: { en: string; ru: string }
  /** Dollars a month, derived from `stars`. */
  usd: number
  /** Stars a month. */
  stars: number
  /** Every package is a Telegram Stars subscription. */
  chargeKind: 'month'
  periodSeconds: number
  orderUrl: string
}

const usdForStars = (stars: number): number =>
  Math.round(stars * STAR_COST_USD * 100) / 100

/** The catalogue, in the order the mini app shows it. */
export function agentPackageCatalogue(): AgentPackageEntry[] {
  return AGENT_PACKAGE_IDS.map(id => ({
    id,
    title: { ...TITLES[id] },
    usd: usdForStars(AGENT_SUBSCRIPTION.stars),
    stars: AGENT_SUBSCRIPTION.stars,
    chargeKind: 'month' as const,
    periodSeconds: AGENT_SUBSCRIPTION.periodSeconds,
    orderUrl: `https://t.me/${AGENT_PACKAGE_ORDER_BOT}?start=agentpkg_${id}`,
  }))
}
