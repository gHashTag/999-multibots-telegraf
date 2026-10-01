import type { LocalizedText } from './agent-marketplace'
import { MARKETPLACE_ECONOMY, marketplaceAgentById } from './agent-marketplace'

const CREATOR_SHARE = `${MARKETPLACE_ECONOMY.creatorBps / 100}%`

/**
 * THE THREE AGENT PACKAGES -- what a person buys on the Agent Market.
 *
 * Owner, 2026-09-30: three packages -- a Telegram agent for $100, a blogger
 * agent for $150, the person's own agent for $200 -- sold as setup plus a
 * monthly fee (the first month is inside the setup), each agent living in a
 * Telegram bot of its own that the team sets up for the client.
 *
 * Names follow one pattern, "<Role> Agent" and its Russian mirror (owner's pick,
 * 2026-09-30): what is sold is an agent, and the role says what it does.
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
  /** One-time setup, USD. The first month is included. */
  setupUsd: number
  /** Monthly fee from the second month, USD. */
  monthlyUsd: number
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
   * The farm bot a buyer talks to for this package. Absent for the Twin Agent,
   * which lives in a bot of the buyer's own, created through /mybot.
   */
  bot?: string
}

export const AGENT_PACKAGES: readonly AgentPackage[] = [
  {
    id: 'manager',
    icon: '◎',
    name: { en: 'Manager Agent', ru: 'Агент-менеджер' },
    promise: {
      en: 'Your own Telegram bot that answers clients around the clock in your voice and brings the leads to your CRM.',
      ru: 'Собственный Telegram-бот, который круглосуточно отвечает клиентам в вашем тоне и приносит заявки в CRM.',
    },
    setupUsd: 100,
    monthlyUsd: 15,
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
    name: { en: 'Blogger Agent', ru: 'Агент-блогер' },
    promise: {
      en: 'Reels with your face and voice, a content plan and publishing — the blogger agent working for your channel.',
      ru: 'Рилсы с вашим лицом и голосом, контент-план и публикации — агент-блогер работает на ваш канал.',
    },
    setupUsd: 150,
    monthlyUsd: 35,
    includes: [
      { en: 'everything in Manager Agent', ru: 'всё из «Агента-менеджера»' },
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
    name: { en: 'Twin Agent', ru: 'Агент-двойник' },
    promise: {
      en: 'Your own agent: your character, voice, face and skills in a bot of its own — ready to be listed on the market.',
      ru: 'Ваш собственный агент: ваш характер, голос, лицо и навыки в отдельном боте — готов к выходу на рынок агентов.',
    },
    setupUsd: 200,
    monthlyUsd: 50,
    includes: [
      { en: 'everything in Blogger Agent', ru: 'всё из «Агента-блогера»' },
      { en: 'your own skills and tools', ru: 'ваши навыки и инструменты' },
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
 * `setupUsd` / `monthlyUsd`, and the Stars follow.
 */
export const STAR_PRICE_USD = 0.016

/** Dollars to whole Stars, rounded up so a package is never sold below its price. */
export function starsForUsd(usd: number): number {
  // Rounded to a millionth first: 100 / 0.016 is 6250.000000000001 in floats.
  return Math.ceil(Math.round((usd / STAR_PRICE_USD) * 1e6) / 1e6)
}

/** What a package's launch (first month included) and each next month cost in Stars. */
export function agentPackageStars(pkg: AgentPackage): {
  setup: number
  month: number
} {
  return {
    setup: starsForUsd(pkg.setupUsd),
    month: starsForUsd(pkg.monthlyUsd),
  }
}

/**
 * Which charge an invoice is: the launch (one payment, the first month
 * included) or the month (a Telegram Stars subscription, renewed by Telegram
 * every 30 days until the person cancels it).
 */
export type AgentPackageCharge = 'setup' | 'month'

/**
 * The invoice payload: `agentpkg:<id>:<setup|month>:<telegram_id>`. The render
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
  const m = /^agentpkg:([a-z]{2,20}):(setup|month):(\d{5,15})$/.exec(
    String(payload ?? '')
  )
  if (!m) return null
  const pkg = agentPackageById(m[1])
  return pkg
    ? { pkg, charge: m[2] as AgentPackageCharge, telegramId: m[3] }
    : null
}
