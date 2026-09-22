import { Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { track } from '@/services/trackEvent'
import {
  confirmClubPayment,
  parseClubPayload,
  logClubFailure,
  type ClubCallOptions,
} from '@/services/clubMembership'
import { actionButton } from '@/navigation/helpers/actionButtons'
import { buildMiniAppUrl } from '@/navigation/config/miniApp.config'

/**
 * A CLUB CHARGE ARRIVED AT THE BOT. THE RENDER BOOKS IT; THE BOT ONLY SAYS SO.
 *
 * The club invoice is minted by the render with the cashier bot's token, and
 * the cashier is polled HERE (src/index.ts), so the `successful_payment` of
 * every club month -- the first and each renewal Telegram makes by itself --
 * lands in this service.
 *
 * Before this branch existed that payment fell through to the generic Stars
 * top-up below it: `club:10000:<id>` matched no retired tier, so it was taken
 * for a top-up of 10 000 stars -- a new row in payments_v2 (the archive nobody
 * may write to since 2026-09-20) and 10 000 tokens credited to the live
 * wallet, on top of the 2 571 the render credits for the same charge. The club
 * had never been paid for (0 of 8 invoices), which is the only reason nobody
 * was ever handed 12 571 tokens for 10 000 stars.
 *
 * So: nothing is written here. The render books the charge -- idempotent on
 * the Stars transaction id, tokens through the ledger -- when asked now, and on
 * its hourly sweep if asking fails. The person is told the truth either way.
 */
export async function handleClubPayment(
  ctx: MyContext,
  payment: {
    payload: string
    chargeId: string
    totalAmount: number
    recurring?: boolean
  },
  opts: ClubCallOptions = {}
): Promise<boolean> {
  const club = parseClubPayload(payment.payload)
  if (!club) return false

  const isRu = isRussianFromState(ctx)
  // The payer is who the render books, whoever the link was minted for.
  const payer = String(ctx.from?.id ?? club.telegramId)
  void track(ctx as any, 'club_paid', {
    stars: payment.totalAmount,
    renewal: payment.recurring === true,
    charge: payment.chargeId,
  })
  logger.info('[club] charge received', {
    telegramId: payer,
    stars: payment.totalAmount,
    renewal: payment.recurring === true,
  })

  const keyboard = Markup.inlineKeyboard([
    ...(ctx.chat?.type === 'private'
      ? [
          [
            Markup.button.webApp(
              isRu ? '🎬 Настроить двойника' : '🎬 Set up your twin',
              buildMiniAppUrl('club')
            ),
          ],
        ]
      : []),
    [actionButton('balance', isRu), actionButton('human', isRu)],
  ])

  try {
    const booked = await confirmClubPayment(payer, opts)
    if (booked.active) {
      const until = booked.until
        ? new Date(booked.until).toLocaleDateString(isRu ? 'ru-RU' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })
        : null
      // Only what THIS booking credited: a charge the hourly sweep booked
      // first was announced by nobody, but it is not credited twice either.
      const tokens = booked.credited
      const lines = isRu
        ? [
            '⭐ Добро пожаловать в клуб!',
            until ? 'Он открыт до ' + until + '.' : '',
            tokens ? '\n\nНа баланс начислено ' + tokens + ' токенов.' : '',
          ]
        : [
            '⭐ Welcome to the club!',
            until ? 'It is open until ' + until + '.' : '',
            tokens ? '\n\n' + tokens + ' tokens are on your balance.' : '',
          ]
      await ctx.reply(
        lines[0] + (lines[1] ? ' ' + lines[1] : '') + lines[2],
        keyboard
      )
      return true
    }
    logger.warn('[club] charge not yet visible to the cashier', {
      telegramId: payer,
      charge: payment.chargeId,
    })
  } catch (e) {
    logClubFailure('booking', payer, e)
  }
  // The money is Telegram's word; the booking follows within the hour.
  await ctx.reply(
    isRu
      ? '⭐ Оплата клуба получена. Клуб и токены откроются в течение часа — если нет, нажмите «Позвать человека».'
      : '⭐ Club payment received. The club and your tokens open within the hour — if not, press "Talk to a person".',
    keyboard
  )
  return true
}
