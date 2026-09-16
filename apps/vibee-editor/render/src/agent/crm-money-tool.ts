/**
 * THE MONEY FUNNEL, WHICH NOBODY COULD SEE.
 *
 * The daily summary counts touches and sends. It says nothing about invoices,
 * and invoices are where a sale either happens or dies: minted, then paid, or
 * killed as a draft that was replaced, expired or cancelled.
 *
 * Found by needing it: measuring whether the seller converts meant reading
 * `token_invoices` directly, and the database lives on Railway's private
 * network -- unreachable from a laptop, deliberately. A number the owner
 * cannot ask for is a number nobody will look at.
 *
 * Read-only, owner-gated, aggregates only. It returns counts and reasons, not
 * people: a funnel is about the shape, and names belong to the tools that
 * already show one person at a time.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireOwner } from './telegram-tools'
import { ensureInvoiceColumns } from './token-invoice'

const DEFAULT_DAYS = 30
const MAX_DAYS = 365

const clampDays = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0
    ? Math.min(MAX_DAYS, Math.floor(n))
    : DEFAULT_DAYS
}

export const CRM_MONEY_TOOLS: AgentTool[] = [
  {
    name: 'crm_money',
    description:
      `Воронка денег за окно: сколько счетов выписано, сколько оплачено, сколько умерло черновиком и почему. ` +
      `Бесплатно, ничего не меняет, имён не показывает — только числа. ` +
      `Зови, когда спрашивают «сколько мы заработали», «доходят ли счета», «почему не платят».`,
    parameters: {
      type: 'object',
      properties: {
        days: {
          // promise-checked: clampDays in this file holds both numbers
          description: `окно в днях (по умолчанию ${DEFAULT_DAYS}, максимум ${MAX_DAYS})`,
          type: 'number',
        },
      },
      additionalProperties: false,
    },
    async handler(a: Record<string, unknown>, ctx?: ToolContext) {
      requireOwner(ctx)
      const pool = ctx?.pool as
        | { query: (q: string, p?: unknown[]) => Promise<{ rows: any[] }> }
        | undefined
      if (!pool) return { ok: false, why: 'память недоступна' }
      const days = clampDays(a?.days)
      try {
        await ensureInvoiceColumns(pool as never)
        /*
         * WHOSE INVOICES -- SAID PLAINLY, NOT FAKED.
         *
         * `token_invoices` has no owner column. Every row names the PERSON it
         * was written for (`telegram_id`), and nothing records who sold it.
         * So this counts the whole table, and `whose_invoices` says so.
         *
         * Today that is exactly right: one owner mints. The day a second one
         * does, this number becomes two funnels added together -- and the fix
         * is a column on the table, not a filter invented here. Writing a
         * scope that does not scope would be worse than none: the caller
         * would believe it.
         */
        const r = await pool.query(
          `SELECT count(*)::int AS minted,
                  count(*) FILTER (WHERE redeemed)::int AS paid,
                  count(*) FILTER (WHERE NOT redeemed AND cancelled_at IS NOT NULL)::int AS died,
                  count(*) FILTER (WHERE NOT redeemed AND cancelled_at IS NULL)::int AS waiting,
                  coalesce(sum(stars) FILTER (WHERE redeemed), 0)::int AS stars_paid,
                  coalesce(sum(tokens) FILTER (WHERE redeemed), 0)::int AS tokens_issued
             FROM token_invoices
            WHERE created_at > now() - ($1 || ' days')::interval`,
          [String(days)]
        )
        const why = await pool.query(
          `SELECT coalesce(cancel_reason, 'без причины') AS reason, count(*)::int AS how_many
             FROM token_invoices
            WHERE cancelled_at IS NOT NULL
              AND created_at > now() - ($1 || ' days')::interval
            GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
          [String(days)]
        )
        return {
          window_days: days,
          ...(r.rows?.[0] ?? {}),
          why_died: why.rows ?? [],
          whose_invoices:
            'все счета сервиса: в таблице нет колонки владельца. Пока минтит один ' +
            'владелец — это его воронка; для второго нужна колонка, а не фильтр здесь.',
          how_to_read:
            'выписано = счетов создано; оплачено = деньги пришли; умерло = черновик заменён, ' +
            'истёк или отменён до отправки; ждут = ссылка жива, человек ещё не заплатил.',
        }
      } catch (e) {
        return {
          ok: false,
          why: e instanceof Error ? e.message.slice(0, 120) : 'не прочиталось',
        }
      }
    },
  },
]
