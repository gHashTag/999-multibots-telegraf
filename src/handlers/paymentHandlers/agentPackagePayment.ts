import type { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { track } from '@/services/trackEvent'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logClubFailure, type ClubCallOptions } from '@/services/clubMembership'
import {
  confirmAgentPackagePayment,
  packageMakesMedia,
  parseAgentPackageChargePayload,
  type AgentPackageVerdict,
} from '@/services/agentPackageSale'
import { extendManagedBot, managedBotsOf } from '@/core/bot/managedBots/store'

/** Days one charge pays for: every charge is one month. */
export const PACKAGE_PERIOD_DAYS = 30

export interface AgentPackagePaymentDeps {
  cashier?: ClubCallOptions
  botsOf?: typeof managedBotsOf
  extend?: typeof extendManagedBot
}

/**
 * AN AGENT PACKAGE CHARGE ARRIVED AT THE BOT. THE RENDER BOOKS IT.
 *
 * Payload `agentpkg:<id>:<month|once>:<id>`, minted by the render. As with
 * the club, nothing is written here -- this branch exists so the charge does
 * not fall into the generic Stars top-up below it and become spendable tokens.
 *
 * What the bot adds is the agent bot. The render books the period; the bot is
 * what runs on it (managed_bots.paid_until). When this call booked the charge
 * and the payer owns exactly one agent bot, that bot is paid forward here. In
 * every other case -- the hourly sweep booked it first, no bot yet, several
 * bots -- the team is told to do it with /agentbot, so a paid month is never
 * silently lost and never credited twice.
 */
export async function handleAgentPackagePayment(
  ctx: MyContext,
  payment: {
    payload: string
    chargeId: string
    totalAmount: number
    recurring?: boolean
  },
  deps: AgentPackagePaymentDeps = {}
): Promise<boolean> {
  const sale = parseAgentPackageChargePayload(payment.payload)
  if (!sale) return false

  const isRu = isRussianFromState(ctx)
  const payer = String(ctx.from?.id ?? sale.telegramId)
  void track(ctx as any, 'agent_package_paid', {
    package: sale.packageId,
    charge: sale.charge,
    stars: payment.totalAmount,
    renewal: payment.recurring === true,
  })
  logger.info('[agent-package] charge received', {
    telegramId: payer,
    package: sale.packageId,
    charge: sale.charge,
    stars: payment.totalAmount,
  })

  let verdict: AgentPackageVerdict | null = null
  try {
    verdict = await confirmAgentPackagePayment(
      payer,
      sale.packageId,
      deps.cashier
    )
  } catch (e) {
    logClubFailure('agent-package booking', payer, e)
  }

  let botNote = 'agent bot: extend by hand with /agentbot'
  if (verdict && verdict.booked.length > 0) {
    try {
      const bots = await (deps.botsOf ?? managedBotsOf)(Number(payer))
      if (bots.length === 1) {
        const extended = await (deps.extend ?? extendManagedBot)(
          bots[0].botUsername,
          PACKAGE_PERIOD_DAYS * verdict.booked.length,
          packageMakesMedia(sale.packageId)
        )
        if (extended) {
          botNote = `agent bot @${extended.botUsername} paid until ${extended.paidUntil.toISOString().slice(0, 10)}`
        }
      } else {
        botNote = `agent bot: payer owns ${bots.length}, extend by hand with /agentbot`
      }
    } catch (e) {
      logger.error('[agent-package] agent bot not extended', {
        telegramId: payer,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  } else if (verdict) {
    botNote = 'already booked by the sweep: check the agent bot with /agentbot'
  } else {
    botNote =
      'render did not answer: the hourly sweep books it; extend with /agentbot'
  }

  const who = ctx.from?.username
    ? `@${ctx.from.username}`
    : (ctx.from?.first_name ?? '—')
  const note = [
    `⭐ Agent package paid: ${sale.packageId} (${sale.charge})`,
    `Stars: ${payment.totalAmount}${payment.recurring ? ' (renewal)' : ''}`,
    `From: ${who} (tg://user?id=${payer})`,
    verdict?.until ? `Paid until: ${verdict.until.slice(0, 10)}` : null,
    botNote,
  ]
    .filter(Boolean)
    .join('\n')
  for (const admin of ADMIN_IDS_ARRAY) {
    try {
      await ctx.telegram.sendMessage(admin, note)
    } catch (e) {
      logger.warn('[agent-package] admin not reached', {
        admin,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const until =
    verdict?.active && verdict.until
      ? new Date(verdict.until).toLocaleDateString(isRu ? 'ru-RU' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : null
  const renewal = payment.recurring === true
  await ctx.reply(
    isRu
      ? (renewal
          ? '⭐ Подписка продлена — ещё месяц работы агента оплачен!'
          : '⭐ Месяц работы агента оплачен!\n\nЕсли бот агента ещё не настроен, команда напишет вам здесь.') +
          (until
            ? `\n\nАгент оплачен до ${until}.`
            : '\n\nОплата отразится в течение часа.')
      : (renewal
          ? '⭐ Your subscription renewed — another month of your agent is paid!'
          : '⭐ A month of your agent is paid!\n\nIf the agent bot is not set up yet, the team will write to you here.') +
          (until
            ? `\n\nYour agent is paid until ${until}.`
            : '\n\nThe payment shows up within the hour.')
  )
  return true
}
