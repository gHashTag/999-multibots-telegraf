/**
 * /vip -- the owner records a club month paid in cash, from Telegram.
 *
 * The month is written by the render's tool `club_cash_month` (see
 * services/clubCash.ts for why /mcp and the server key). This command is only
 * the owner's hand on that lever:
 *
 *   /vip 6716532024              month starting today (UTC), tokens credited
 *   /vip 6716532024 2026-09-25   month starting that day (must join/await)
 *   /vip 6716532024 <by-hand>    tokens of this month were handed out already
 *                                 (the word itself is BY_HAND_WORD below)
 *
 * Why a button, like /inngest_probe: the command is cheap to type by accident
 * and opens the club plus a month of tokens. The card shows the person's
 * CURRENT club state before anything is written; nothing reaches the render
 * until the press. The render still has the final word -- it refuses anyone
 * but the platform owner and the keepers, by the verified caller's id.
 */
import type { Telegraf } from 'telegraf'
import { Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { requireAdmin, isAdmin } from '@/middleware/adminOnly'
import { logger } from '@/utils/logger'
import {
  recordCashClubMonth,
  logCashMonth,
  ClubUnavailableError,
  type CashMonth,
} from '@/services/clubCash'
import { fetchClubStatus, type ClubStatus } from '@/services/clubMembership'

export const VIP_GO_PREFIX = 'vip:go:'
export const VIP_CANCEL = 'vip:cancel'

/** A confirmation older than this is not a confirmation anymore. */
const PENDING_TTL_MS = 10 * 60 * 1000

/** The word the owner types to say the month's tokens were handed out by hand. */
const BY_HAND_WORD = 'вручную'

interface Pending {
  by: number
  member: string
  start?: string
  byHand: boolean
  since: number
}

const pending = new Map<string, Pending>()

/** Test seam: forget every pending confirmation. */
export function resetVipPendingForTests(): void {
  pending.clear()
}

function textOf(ctx: MyContext): string {
  return ctx.message && 'text' in ctx.message ? ctx.message.text : ''
}

const isTelegramId = (s: string): boolean => /^\d{5,15}$/.test(s)

/** A day the render may accept, or null. The render re-validates anyway. */
function maybeDay(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : s
}

function statusLine(s: ClubStatus | null): string {
  if (!s) return 'Статус клуба узнать не удалось.'
  if (s.active) {
    const base = s.granted ? `участник (${s.granted})` : 'оплаченный месяц идёт'
    return `Клуб активен: ${base}, до ${s.until} (осталось ${s.daysLeft} дн.).`
  }
  if (s.guestEnded) {
    return `Гостевой пропуск закончился ${s.guestEnded.slice(0, 10)}; клуба сейчас нет.`
  }
  return 'Клуба сейчас нет.'
}

function dayWord(start: string | undefined): string {
  return start ? `с ${start}` : `с сегодняшнего дня (UTC)`
}

/**
 * The card shown before the press. Everything on it comes from the render;
 * a status failure dims one line but does not take the button away -- the
 * record call is independent of the status call.
 */
async function showVipCard(
  ctx: MyContext,
  p: Pending,
  goAction: string,
  statusOf: typeof fetchClubStatus
): Promise<void> {
  let status: ClubStatus | null = null
  try {
    status = await statusOf(p.member)
  } catch {
    status = null
  }
  const tokens = status
    ? `${status.tokensPerPeriod} (по прейскуранту клуба)`
    : '—'
  const lines = [
    'VIP: месяц клуба, оплаченный наличными',
    `Участник: ${p.member}`,
    `Старт: ${dayWord(p.start)}`,
    `Токены месяца: ${tokens}`,
    statusLine(status),
  ]
  if (p.byHand) {
    lines.push(
      'Токены этого месяца уже выданы вручную — повторно начислены не будут.'
    )
  }
  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Записать месяц', goAction),
        Markup.button.callback('Отмена', VIP_CANCEL),
      ],
    ])
  )
}

let nonceCounter = 0
function nonce(): string {
  nonceCounter += 1
  return `${Date.now().toString(36)}${nonceCounter}`
}

/** What the owner reads for each shape the cashier answers with. */
export function renderCashMonthAnswer(a: CashMonth): string {
  if (a.ok === true) {
    const head =
      a.recorded === 'now'
        ? '✅ Месяц клуба записан.'
        : 'Этот месяц уже был записан — ничего не удвоено.'
    const lines = [
      head,
      `Участник: ${a.telegram_id}`,
      `Клуб открыт до: ${String(a.until).slice(0, 10)}`,
      `Токены месяца: ${a.tokens}` +
        (a.tokens_by_hand
          ? ' (выданы вручную раньше, повторно не начислялись)'
          : a.credited
            ? ' — зачислены'
            : ' — не зачислены'),
    ]
    if (a.credit_note) lines.push(a.credit_note)
    return lines.join('\n')
  }
  const lines = [`Не записано: ${a.error}`]
  if (a.next_start)
    lines.push(`Следующий месяц можно начать с ${a.next_start}.`)
  if (a.tokens_given_by_hand?.length) {
    const seen = a.tokens_given_by_hand
      .map(g => `${g.ref} (+${g.tokens})`)
      .join(', ')
    lines.push(
      `Найдены ручные выдачи: ${seen}. Если это токены этого месяца — повторите команду со словом «${BY_HAND_WORD}».`
    )
  }
  return lines.join('\n')
}

export interface VipRecorder {
  (
    by: string,
    member: string,
    opts?: { start?: string; byHand?: boolean }
  ): Promise<CashMonth>
}

export function setupVipCommand(
  bot: Telegraf<MyContext>,
  recorder: VipRecorder = (by, member, opts) =>
    recordCashClubMonth(by, member, opts ?? {}),
  statusOf: typeof fetchClubStatus = fetchClubStatus
): void {
  bot.command('vip', requireAdmin(), async ctx => {
    const by = ctx.from?.id
    if (!by) return
    const usage =
      'Как выдать VIP-месяц клуба:\n' +
      '/vip <telegram_id> — месяц с сегодняшнего дня, токены начислит кассир\n' +
      '/vip <telegram_id> ГГГГ-ММ-ДД — месяц с указанного дня\n' +
      `/vip <telegram_id> ${BY_HAND_WORD} — токены месяца уже выданы вручную`
    const words = textOf(ctx).split(/\s+/).slice(1)
    const byHand = words.includes(BY_HAND_WORD)
    const args = words.filter(w => w !== BY_HAND_WORD)
    if (args.length === 0 || !isTelegramId(args[0])) {
      await ctx.reply(usage)
      return
    }
    const member = args[0]
    let start: string | undefined
    if (args.length > 1) {
      const day = maybeDay(args[1])
      if (day === null) {
        await ctx.reply(
          `День не разобран: ${args[1]}. Формат: ГГГГ-ММ-ДД.\n\n${usage}`
        )
        return
      }
      start = day
    }
    if (args.length > 2) {
      await ctx.reply(`Лишний аргумент: ${args[2]}.\n\n${usage}`)
      return
    }
    // Drop confirmations nobody pressed; a fresh card invalidates nothing.
    const now = Date.now()
    for (const [k, v] of pending)
      if (now - v.since > PENDING_TTL_MS) pending.delete(k)
    const key = nonce()
    pending.set(key, { by, member, start, byHand, since: now })
    await showVipCard(
      ctx,
      pending.get(key)!,
      `${VIP_GO_PREFIX}${key}`,
      statusOf
    )
  })

  bot.action(VIP_CANCEL, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    await ctx.editMessageText('Отменено.').catch(() => undefined)
  })

  bot.action(new RegExp(`^${VIP_GO_PREFIX}`), async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    const key = (
      ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : ''
    ).slice(VIP_GO_PREFIX.length)
    const p = pending.get(key)
    if (!p || Date.now() - p.since > PENDING_TTL_MS) {
      pending.delete(key)
      await ctx
        .editMessageText('Подтверждение устарело. Наберите команду заново.')
        .catch(() => undefined)
      return
    }
    const presser = ctx.from?.id
    if (!presser || !isAdmin(presser) || presser !== p.by) {
      await ctx.reply('❌ Нажать может только тот, кто вызвал команду.')
      return
    }
    pending.delete(key) // a second press of the same card is not a new command
    try {
      const answer = await recorder(String(presser), p.member, {
        start: p.start,
        byHand: p.byHand,
      })
      logCashMonth(String(presser), p.member, answer)
      logger.info('[vip] cash month answered', {
        by: presser,
        member: p.member,
        ok: answer.ok,
      })
      const text = renderCashMonthAnswer(answer)
      await ctx.editMessageText(text).catch(() => ctx.reply(text))
    } catch (e) {
      const msg =
        e instanceof ClubUnavailableError
          ? `Кассир клуба недоступен: ${e.message}`
          : `Не получилось: ${e instanceof Error ? e.message : String(e)}`
      logger.error('[vip] cash month call failed', {
        by: presser,
        member: p.member,
        error: msg,
      })
      await ctx.editMessageText(msg).catch(() => ctx.reply(msg))
    }
  })
}
