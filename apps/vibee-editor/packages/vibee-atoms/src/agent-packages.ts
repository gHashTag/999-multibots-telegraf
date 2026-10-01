import type { LocalizedText } from './agent-marketplace'
import { MARKETPLACE_ECONOMY, marketplaceAgentById } from './agent-marketplace'

const CREATOR_SHARE = `${MARKETPLACE_ECONOMY.creatorBps / 100}%`

/**
 * THE THREE AGENT PACKAGES -- what a person buys on the Agent Market.
 *
 * Owner, 2026-09-30: three packages, each agent living in a Telegram bot of
 * its own that the team sets up for the client.
 *
 * Owner, 2026-10-01: the price is MONTHLY, every month, no separate launch
 * fee -- and the third package is the Developer Agent. Owner, 2026-10-02:
 * the Blogger Agent is 10000 Stars, exactly the subscription cap, so the
 * prices are 6250 / 10000 / 12500 Stars (= $100 / $160 / $200). Names follow one pattern, "<Role>
 * Agent" and its Russian mirror, the role word followed by "agent".
 *
 * One home for the catalogue: the welcome screen and the market screen both
 * read it, and the bot's order link carries only the id (`agentpkg_<id>`),
 * so no second copy of a name or a price exists anywhere.
 *
 * Every promise below names a thing the platform already does (the agent
 * chat, SOUL, face_speak, story reels, the CRM, Telegram tools). The market
 * payout is described as it is -- designed, not active -- because
 * MARKETPLACE_ECONOMY.active is false.
 */
export type AgentPackageId = 'manager' | 'blogger' | 'twin'

export interface AgentPackage {
  id: AgentPackageId
  icon: string
  name: LocalizedText
  /** One sentence: the result the person gets. */
  promise: LocalizedText
  /** The price of one month, USD. Charged every month, from the first. */
  monthlyUsd: number
  /**
   * The part of the month that is the agent's token allowance, USD: what the
   * month's replies and media run on. The rest of the price is the team's
   * work on the agent and its bot.
   */
  allowanceUsd: number
  includes: readonly LocalizedText[]
  /** The live specialist a person can try before paying, if there is one. */
  agentId?: string
  popular?: boolean
  /**
   * Whether the package makes media (reels, face, voice). The Manager Agent is
   * a text model for the CRM and nothing else: its month is spent on replies.
   */
  media: boolean
  /**
   * The farm bot a buyer talks to for this package. Absent for the Developer Agent,
   * which lives in a bot of the buyer's own, created through /mybot.
   */
  bot?: string
}

export const AGENT_PACKAGES: readonly AgentPackage[] = [
  {
    id: 'manager',
    icon: '◎',
    name: { en: 'Manager Agent', ru: 'Менеджер агент' },
    promise: {
      en: 'Your own Telegram bot that answers clients around the clock in your voice and brings the leads to your CRM.',
      ru: 'Собственный Telegram-бот, который круглосуточно отвечает клиентам в вашем тоне и приносит заявки в CRM.',
    },
    monthlyUsd: 100,
    allowanceUsd: 15,
    includes: [
      { en: 'a separate bot in your name', ru: 'отдельный бот на ваше имя' },
      {
        en: 'character and rules from your SOUL',
        ru: 'характер и правила из вашего SOUL',
      },
      { en: 'leads in the CRM', ru: 'заявки в CRM' },
      { en: 'set up by the team', ru: 'настройка командой' },
    ],
    media: false,
    bot: 't27ai_bot',
  },
  {
    id: 'blogger',
    icon: '✦',
    name: { en: 'Blogger Agent', ru: 'Блогер агент' },
    promise: {
      en: 'Reels with your face and voice, a content plan and publishing — the blogger agent working for your channel.',
      ru: 'Рилсы с вашим лицом и голосом, контент-план и публикации — агент-блогер работает на ваш канал.',
    },
    monthlyUsd: 160,
    allowanceUsd: 35,
    includes: [
      { en: 'everything in Manager Agent', ru: 'всё из «Менеджер агента»' },
      { en: 'your face and voice clone', ru: 'клон лица и голоса' },
      { en: 'story reels on any topic', ru: 'рилсы-истории на любую тему' },
      { en: 'EN/RU posts with receipts', ru: 'посты EN/RU с подтверждениями' },
    ],
    agentId: 'blogger',
    popular: true,
    media: true,
    bot: 'neuro_blogger_bot',
  },
  {
    id: 'twin',
    icon: '◈',
    name: { en: 'Developer Agent', ru: 'Разработчик агент' },
    promise: {
      en: 'An agent the team develops for your task: your character, voice, face, skills and tools in a bot of its own — ready to be listed on the market.',
      ru: 'Агент, которого команда разрабатывает под вашу задачу: ваш характер, голос, лицо, навыки и инструменты в отдельном боте — готов к выходу на рынок агентов.',
    },
    monthlyUsd: 200,
    allowanceUsd: 50,
    includes: [
      { en: 'everything in Blogger Agent', ru: 'всё из «Блогер агента»' },
      {
        en: 'skills and tools developed for your task',
        ru: 'навыки и инструменты под вашу задачу',
      },
      {
        en: `a market listing — ${CREATOR_SHARE} to you once payouts open`,
        ru: `место на рынке — ${CREATOR_SHARE} вам, когда откроются выплаты`,
      },
      { en: 'acceptance on your account', ru: 'приёмка на вашем аккаунте' },
    ],
    media: true,
  },
]

export function agentPackageById(id: unknown): AgentPackage | null {
  const key = String(id ?? '')
    .trim()
    .toLowerCase()
  return AGENT_PACKAGES.find(pkg => pkg.id === key) ?? null
}

/** The live specialist behind a package, when a person can try it now. */
export function tryableAgentOf(pkg: AgentPackage): string | null {
  if (!pkg.agentId) return null
  return marketplaceAgentById(pkg.agentId)?.status === 'live'
    ? pkg.agentId
    : null
}

/**
 * The bot's /start payload that turns a press into an order: the bot answers
 * the person and tells the team (src/services/agentPackageOrder.ts). Only
 * the id travels; the bot does not keep a second copy of this catalogue.
 */
export const AGENT_PACKAGE_START_PREFIX = 'agentpkg_'

export const AGENT_PACKAGE_ORDER_BOT = 't27ai_bot'

export function agentPackageOrderUrl(pkg: AgentPackage): string {
  return `https://t.me/${AGENT_PACKAGE_ORDER_BOT}?start=${AGENT_PACKAGE_START_PREFIX}${pkg.id}`
}

/**
 * PAYING FOR A PACKAGE IN TELEGRAM STARS.
 *
 * Inside Telegram a digital good is sold for Stars only, so the dollar prices
 * above are charged in Stars at ONE rate: what a person pays Telegram for one
 * Star, the same number the bot prices every generation with
 * (src/price/constants STAR_COST_USD; agent-packages.test.ts fails the day the
 * two differ). Nothing below is typed by hand -- a price change is a change of
 * `monthlyUsd`, and the Stars follow.
 */
export const STAR_PRICE_USD = 0.016

/** Dollars to whole Stars, rounded up so a package is never sold below its price. */
export function starsForUsd(usd: number): number {
  // Rounded to a millionth first: 100 / 0.016 is 6250.000000000001 in floats.
  return Math.ceil(Math.round((usd / STAR_PRICE_USD) * 1e6) / 1e6)
}

/** What one month of a package costs in Stars. */
export function agentPackageStars(pkg: AgentPackage): number {
  return starsForUsd(pkg.monthlyUsd)
}

/**
 * The most a Telegram Stars subscription may charge per period (Bot API,
 * createInvoiceLink: `subscription_period` prices are capped at 10000).
 */
export const STARS_SUBSCRIPTION_MAX = 10_000

/**
 * How a package's month is charged. Under the subscription cap it is a
 * Telegram Stars subscription ('month'), renewed by Telegram every 30 days
 * until the person cancels it. Above the cap Telegram refuses a subscription,
 * so the month is a one-off invoice ('once') that pays 30 days and is bought
 * again each month -- the Developer Agent at 12500 Stars.
 */
export type AgentPackageCharge = 'month' | 'once'

export function agentPackageCharge(pkg: AgentPackage): AgentPackageCharge {
  return agentPackageStars(pkg) <= STARS_SUBSCRIPTION_MAX ? 'month' : 'once'
}

/**
 * The invoice payload: `agentpkg:<id>:<month|once>:<telegram_id>`. The render
 * mints it (render/src/agent/agent-package-sale.ts), Telegram returns it on
 * every charge -- renewals included -- and the bot routes the payment by it
 * (src/handlers/paymentHandlers/agentPackagePayment.ts).
 */
export function agentPackagePayload(
  id: AgentPackageId,
  charge: AgentPackageCharge,
  telegramId: string
): string {
  return `agentpkg:${id}:${charge}:${telegramId}`
}

export function parseAgentPackagePayload(payload: unknown): {
  pkg: AgentPackage
  charge: AgentPackageCharge
  telegramId: string
} | null {
  const m = /^agentpkg:([a-z]{2,20}):(month|once):(\d{5,15})$/.exec(
    String(payload ?? '')
  )
  if (!m) return null
  const pkg = agentPackageById(m[1])
  return pkg
    ? { pkg, charge: m[2] as AgentPackageCharge, telegramId: m[3] }
    : null
}
