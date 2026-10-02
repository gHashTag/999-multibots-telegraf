/**
 * THE QUEEN'S NEXT BEST ACTION TO EARN -- ONE PERSON, THEIR OWN DATA.
 *
 * Owner, 2026-10-02: in god mode the Queen speeds up earning for everyone who
 * connects to her. Slice 1 of docs/architecture/queen-god-mode-growth.md:
 * a read-only recommendation, computed from the caller's own bot, CRM
 * audience, open invoices and payers in the live wallet.
 *
 * Spec of record: gHashTag/t27 specs/automation/queen-growth.t27, vendored in
 * src/spec/ with its generated numbers; src/spec/queen-growth.test.ts runs
 * every test of the spec against the functions below.
 *
 * HARD RULES (constants in the spec, each with a test):
 *  - nothing is sent to anyone: the tool returns a suggestion, the person acts;
 *  - no sum is promised: only what the wallet already MEASURED is shown;
 *  - money comes from token_ledger (crmRevenue), never the payments_v2 archive;
 *  - only the person themself reads their recommendation -- no keeper override.
 */
import * as SPEC from '../spec/queen-growth.gen'
import { crmRevenue, ownerAudience } from './crm-revenue-tool'
import { botsOwnedBy } from './hive-tools'
import type { AgentTool, ToolContext } from './tools'

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

/** spec may_read */
export function mayRead(
  identified: boolean,
  subjectIsCaller: boolean
): boolean {
  return identified && subjectIsCaller
}

/** spec invoice_open */
export function invoiceOpen(
  redeemed: boolean,
  cancelled: boolean,
  ageDays: number
): boolean {
  return !redeemed && !cancelled && ageDays <= SPEC.INVOICE_OPEN_DAYS
}

export interface GrowthFacts {
  walletKnown: boolean
  bots: number
  audience: number
  openInvoices: number
  paying: number
  payingInWindow: number
}

/** spec next_action: the first that holds wins. */
export function nextAction(f: GrowthFacts): number {
  if (!f.walletKnown) return SPEC.ACT_UNKNOWN
  if (f.bots === 0) return SPEC.ACT_CONNECT_BOT
  if (f.audience === 0) return SPEC.ACT_FIRST_CONTACTS
  if (f.openInvoices > 0) return SPEC.ACT_FOLLOW_UP_INVOICE
  if (f.paying === 0) return SPEC.ACT_FIRST_OFFER
  if (f.payingInWindow === 0) return SPEC.ACT_WIN_BACK
  if (f.paying < SPEC.REFERRAL_MIN_PAYING) return SPEC.ACT_NEXT_OFFER
  return SPEC.ACT_ASK_REFERRAL
}

/** What each action says. Text is the host's; the order is the spec's. */
export const ACTIONS: Record<
  number,
  { key: string; say: string; how: string }
> = {
  [SPEC.ACT_UNKNOWN]: {
    key: 'unknown',
    say: 'Кошелёк сейчас не читается — совет не дам, чтобы не гадать.',
    how: 'Спросите позже; это не ноль продаж, а незнание.',
  },
  [SPEC.ACT_CONNECT_BOT]: {
    key: 'connect_bot',
    say: 'Подключите своего бота-продавца — без него клиентам некуда прийти.',
    how: 'Подключение владельца в два нажатия в приложении.',
  },
  [SPEC.ACT_FIRST_CONTACTS]: {
    key: 'first_contacts',
    say: 'Бот есть, а людей в CRM нет. Поделитесь ссылкой на бота там, где вас уже знают.',
    how: 'Ссылку публикуете вы сами; Королева ничего не рассылает.',
  },
  [SPEC.ACT_FOLLOW_UP_INVOICE]: {
    key: 'follow_up_invoice',
    say: 'Есть неоплаченный счёт. Спросите человека, что мешает, — новый счёт не выставляйте.',
    how: 'Черновик вопроса — в CRM; отправляете вы, каждое сообщение по вашему «да».',
  },
  [SPEC.ACT_FIRST_OFFER]: {
    key: 'first_offer',
    say: 'Люди есть, оплат ещё нет. Сделайте первое предложение самому тёплому контакту.',
    how: 'crm_offer готовит счёт; уходит он только после вашего подтверждения.',
  },
  [SPEC.ACT_WIN_BACK]: {
    key: 'win_back',
    say: `Платили раньше, но не за последние ${SPEC.WINDOW_DAYS} дней. Напомните о себе тем, кто уже покупал.`,
    how: 'Подарок-рилс или личный вопрос — отправка только по вашему «да».',
  },
  [SPEC.ACT_NEXT_OFFER]: {
    key: 'next_offer',
    say: 'Продажи идут. Следующее предложение — следующему тёплому контакту.',
    how: 'Лучше один точный адресат, чем рассылка всем.',
  },
  [SPEC.ACT_ASK_REFERRAL]: {
    key: 'ask_referral',
    say: `У вас ${SPEC.REFERRAL_MIN_PAYING}+ платящих клиента. Спросите довольных, кому ещё это поможет.`,
    how: 'Просьба о рекомендации — от вас лично, без обещаний вознаграждения.',
  },
}

/** Open invoices the person has issued; null when the table cannot be read. */
async function openInvoices(pool: Pool, owner: string): Promise<number | null> {
  try {
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM token_invoices
        WHERE owner_id = $1 AND redeemed = false AND cancelled_at IS NULL
          AND created_at > now() - make_interval(days => $2)`,
      [owner, SPEC.INVOICE_OPEN_DAYS]
    )
    return Number(r.rows[0]?.n) || 0
  } catch {
    return null
  }
}

/** Payers within the window, from the live wallet only. */
async function payingInWindow(
  pool: Pool,
  audience: Set<string>
): Promise<number | null> {
  if (!audience.size) return 0
  try {
    const r = await pool.query(
      `SELECT count(DISTINCT telegram_id)::int AS n FROM token_ledger
        WHERE kind = 'purchase' AND delta > 0
          AND created_at > now() - make_interval(days => $2)
          AND telegram_id = ANY($1::text[])`,
      [[...audience], SPEC.WINDOW_DAYS]
    )
    return Number(r.rows[0]?.n) || 0
  } catch {
    return null
  }
}

export interface Growth {
  action: string
  code: number
  say: string
  how: string
  measured: {
    bots: number
    audience: number | null
    open_invoices: number | null
    paying_clients: number | null
    paying_last_window: number | null
    stars_last_window: number | null
    window_days: number
  }
  sends_messages: false
  promises_earnings: false
}

export async function growthFor(
  pool: Pool,
  owner: string,
  bots: (id: string) => Promise<string[]> = botsOwnedBy
): Promise<Growth> {
  const [botList, audience, revenue, invoices] = await Promise.all([
    bots(owner).catch(() => [] as string[]),
    ownerAudience(pool, owner),
    crmRevenue(pool, owner),
    openInvoices(pool, owner),
  ])
  const inWindow = audience ? await payingInWindow(pool, audience) : null
  const walletKnown =
    revenue.paying_clients !== null && inWindow !== null && audience !== null
  const code = nextAction({
    walletKnown,
    bots: botList.length,
    audience: audience?.size ?? 0,
    openInvoices: invoices ?? 0,
    paying: revenue.paying_clients ?? 0,
    payingInWindow: inWindow ?? 0,
  })
  const a = ACTIONS[code]
  return {
    action: a.key,
    code,
    say: a.say,
    how: a.how,
    measured: {
      bots: botList.length,
      audience: audience ? audience.size : null,
      open_invoices: invoices,
      paying_clients: revenue.paying_clients,
      paying_last_window: inWindow,
      stars_last_window: revenue.last_30d,
      window_days: SPEC.WINDOW_DAYS,
    },
    sends_messages: SPEC.SENDS_MESSAGES as false,
    promises_earnings: SPEC.PROMISES_EARNINGS as false,
  }
}

export const QUEEN_GROWTH_TOOLS: AgentTool[] = [
  {
    name: SPEC.TOOL,
    description:
      'Следующий шаг к заработку для ЭТОГО человека: из его бота, CRM, ' +
      'открытых счетов и оплат в живом кошельке. Только чтение, ничего не ' +
      'отправляет и не обещает сумм. Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_a: unknown, ctx?: ToolContext) {
      const me = String(ctx?.telegramId ?? '').trim()
      // The refusal comes before the read. The subject is always the caller.
      if (!mayRead(Boolean(me), true))
        throw new Error('Не знаю, кто спрашивает: совет — только про себя.')
      if (!ctx?.pool) throw new Error('База недоступна.')
      return growthFor(ctx.pool as never, me)
    },
  },
]
