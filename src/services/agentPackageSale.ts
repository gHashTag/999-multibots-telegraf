/**
 * AN AGENT PACKAGE, PAID IN STARS, AS THE BOT SEES IT.
 *
 * The render sells the three packages (render/src/agent/agent-package-sale.ts):
 * it mints the invoice with the cashier bot's token and books every charge
 * from that cashier's own Stars ledger, once per transaction. The cashier is
 * polled by this service, so the `successful_payment` of a launch and of every
 * monthly renewal lands here -- and, exactly as with the club, nothing is
 * written here. The bot asks the render to book now, tells the person, tells
 * the team, and pays the person's agent bot forward when it can tell which
 * bot that is.
 *
 * Prices and names are never written here: the catalogue lives in
 * apps/vibee-editor/packages/vibee-atoms/src/agent-packages.ts, and the bot
 * carries only the ids (AGENT_PACKAGE_IDS, pinned to the catalogue by a test).
 */
import { AGENT_PACKAGE_IDS } from '@/services/agentPackageOrder'
import {
  callCashier,
  ClubUnavailableError,
  type ClubCallOptions,
} from '@/services/clubMembership'

/**
 * 'month' is a Telegram Stars subscription; 'once' is a one-off invoice for
 * one month, for a package priced above the subscription cap.
 */
export type AgentPackageCharge = 'month' | 'once'

export interface AgentPackageChargePayload {
  packageId: string
  charge: AgentPackageCharge
  telegramId: string
}

/** Same shape the render mints: `agentpkg:<id>:<month|once>:<telegram_id>`. */
const PAYLOAD = /^agentpkg:([a-z]{2,20}):(month|once):(\d{5,15})$/

/** The charge a payment payload is for, or null when it is not a package. */
export function parseAgentPackageChargePayload(
  payload: unknown
): AgentPackageChargePayload | null {
  const m = PAYLOAD.exec(String(payload ?? ''))
  if (!m || !(AGENT_PACKAGE_IDS as readonly string[]).includes(m[1])) {
    return null
  }
  return {
    packageId: m[1],
    charge: m[2] as AgentPackageCharge,
    telegramId: m[3],
  }
}

/**
 * Whether the package's agent makes media. The Manager Agent is text only
 * (owner, 2026-09-30: a CRM agent gets no reels); the other two make media.
 */
export function packageMakesMedia(packageId: string): boolean {
  return packageId !== 'manager'
}

export interface BookedPackagePeriod {
  telegramId: string
  packageId: string
  charge: AgentPackageCharge
  stars: number
  starTxId: string
  until: string
}

export interface AgentPackageVerdict {
  /** Charges THIS call booked; one the hourly sweep booked first is not here. */
  booked: BookedPackagePeriod[]
  /** The package's paid period end (ISO), when it is running. */
  until: string | null
  active: boolean
}

/** Ask the render to book this person's package charges now. */
export async function confirmAgentPackagePayment(
  telegramId: string,
  packageId: string,
  opts: ClubCallOptions = {}
): Promise<AgentPackageVerdict> {
  const b = await callCashier(
    '/api/agents/packages/verify',
    'POST',
    telegramId,
    opts
  )
  if (!Array.isArray(b.booked) || !Array.isArray(b.packages)) {
    throw new ClubUnavailableError('the cashier sent no booking')
  }
  const standing = (b.packages as Record<string, unknown>[]).find(
    p => p.id === packageId
  )
  return {
    booked: (b.booked as BookedPackagePeriod[]).filter(
      x => x.packageId === packageId
    ),
    until: typeof standing?.until === 'string' ? standing.until : null,
    active: standing?.active === true,
  }
}

export type AgentPackageInvoice =
  | { kind: 'invoice'; link: string; charge: AgentPackageCharge; stars: number }
  | { kind: 'subscribed' }

/** Ask the cashier for this person's next charge of a package. */
export async function requestAgentPackageInvoice(
  telegramId: string,
  packageId: string,
  opts: ClubCallOptions = {}
): Promise<AgentPackageInvoice> {
  const b = await callCashier(
    '/api/agents/packages/invoice',
    'POST',
    telegramId,
    opts,
    { package: packageId }
  )
  if (b.already_subscribed) return { kind: 'subscribed' }
  const link = typeof b.link === 'string' ? b.link : ''
  const stars = Number(b.stars)
  if (
    !b.ok ||
    !/^https:\/\/t\.me\//.test(link) ||
    (b.charge !== 'month' && b.charge !== 'once') ||
    !Number.isFinite(stars) ||
    stars <= 0
  ) {
    throw new ClubUnavailableError(
      `the cashier minted no package link: ${String(b.error ?? '').slice(0, 120)}`
    )
  }
  return { kind: 'invoice', link, charge: b.charge, stars }
}
