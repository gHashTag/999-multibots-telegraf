import type { LocalizedText } from './agent-marketplace'
import { MARKETPLACE_ECONOMY, marketplaceAgentById } from './agent-marketplace'

const CREATOR_SHARE = `${MARKETPLACE_ECONOMY.creatorBps / 100}%`

/**
 * THE AGENT PACKAGES -- what a person buys on the Agent Market.
 *
 * Owner, 2026-09-30: packages, each agent living in a Telegram bot of its own.
 *
 * Owner, 2026-10-03: ONE price for every package -- a single recurring
 * Telegram Stars subscription of 10000 Stars per 30 days (AGENT_SUBSCRIPTION
 * below). No package carries a price of its own; the dollar figure shown
 * anywhere is derived from the Stars at STAR_PRICE_USD (10000 x 0.016 = $160).
 * The fourth package, TRI DEV, is a developer agent that solves GitHub issues
 * remotely and answers with a t27.ai/term cast and a pull request.
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
export type AgentPackageId = 'manager' | 'blogger' | 'twin' | 'tridev'

export interface AgentPackage {
  id: AgentPackageId
  icon: string
  name: LocalizedText
  /** One sentence: the result the person gets. */
  promise: LocalizedText
  /**
   * The part of the month that is the agent's token allowance, USD: what the
   * month's replies and media run on. Always below the one package price
   * (AGENT_PACKAGE_USD); the rest is the team's work on the agent and its bot.
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
   * The farm bot a buyer talks to for this package. Absent for the Developer
   * Agent and TRI DEV, which live in a bot of the buyer's own, created
   * through /mybot.
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
  {
    id: 'tridev',
    icon: '▽',
    name: { en: 'TRI DEV', ru: 'TRI DEV' },
    promise: {
      en: 'A developer agent in your own bot: send a GitHub issue, get back a pull request and a recording of the work at t27.ai/term.',
      ru: 'Агент-разработчик в вашем собственном боте: отправьте задачу из GitHub — получите pull request и запись работы на t27.ai/term.',
    },
    allowanceUsd: 50,
    includes: [
      {
        en: 'a separate bot in your name',
        ru: 'отдельный бот на ваше имя',
      },
      {
        en: '/task with a GitHub issue link or plain text',
        ru: '/task со ссылкой на задачу GitHub или текстом',
      },
      {
        en: 'a pull request and a t27.ai/term cast per task',
        ru: 'pull request и запись t27.ai/term на каждую задачу',
      },
      { en: 'only you can give it tasks', ru: 'задачи даёте только вы' },
    ],
    media: false,
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
 * Inside Telegram a digital good is sold for Stars only. Every package is one
 * Telegram Stars subscription: AGENT_SUBSCRIPTION.stars every
 * AGENT_SUBSCRIPTION.periodSeconds, renewed by Telegram until the person
 * cancels it. The dollar figure is derived at ONE rate: what a person pays
 * Telegram for one Star, the same number the bot prices every generation with
 * (src/price/constants STAR_COST_USD; agent-packages.test.ts fails the day the
 * two differ). Nothing below is typed by hand twice -- a price change is a
 * change of AGENT_SUBSCRIPTION, and the dollars follow.
 */
export const STAR_PRICE_USD = 0.016

/** Dollars to whole Stars, rounded up so nothing is sold below its price. */
export function starsForUsd(usd: number): number {
  // Rounded to a millionth first: 100 / 0.016 is 6250.000000000001 in floats.
  return Math.ceil(Math.round((usd / STAR_PRICE_USD) * 1e6) / 1e6)
}

/** Whole Stars to dollars at STAR_PRICE_USD, to the cent. */
export function usdForStars(stars: number): number {
  return Math.round(stars * STAR_PRICE_USD * 100) / 100
}

/**
 * The most a Telegram Stars subscription may charge per period (Bot API,
 * createInvoiceLink: `subscription_period` prices are capped at 10000).
 */
export const STARS_SUBSCRIPTION_MAX = 10_000

/**
 * The one price of every agent package: a Telegram Stars subscription at the
 * cap, renewed every 30 days (the only subscription period the Bot API takes).
 */
export const AGENT_SUBSCRIPTION = {
  stars: STARS_SUBSCRIPTION_MAX,
  periodSeconds: 2_592_000,
} as const

/** The one package price in dollars, derived: 10000 x 0.016 = 160. */
export const AGENT_PACKAGE_USD = usdForStars(AGENT_SUBSCRIPTION.stars)

/** What one month of a package costs in Stars -- the same for every package. */
export function agentPackageStars(_pkg: AgentPackage): number {
  return AGENT_SUBSCRIPTION.stars
}

/** What one month of a package costs in dollars, derived from the Stars. */
export function agentPackageUsd(pkg: AgentPackage): number {
  return usdForStars(agentPackageStars(pkg))
}

/**
 * How a package's month is charged. Every package is a Telegram Stars
 * subscription ('month'). 'once' -- a one-off invoice paying 30 days -- is no
 * longer sold, but stays a valid payload so a charge minted before the switch
 * is still booked.
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
