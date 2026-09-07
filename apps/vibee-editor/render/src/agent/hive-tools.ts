/**
 * THE HIVE PULSE IN THE AGENT CHAT -- "WHAT IS HAPPENING RIGHT NOW".
 *
 * Owner, 2026-09-07: "show me the bot logs right in the agent chat! the pulse
 * of the project! so I can react in time".
 *
 * WHY AN AGENT TOOL AND NOT A NEW SCREEN
 *
 * The agent chat already exists everywhere: in the bot, in the Mini App and in
 * the iPhone app. A tool appears in all three at once, the same day. A new
 * screen would have to be drawn three times, and on the phone it would arrive
 * through an App Store release.
 *
 * The second reason matters more. trios holds two append-only journals --
 * `gardener_decisions` and `railway_audit_events` -- and both have zero
 * readers. A journal with no screen attached is not "waiting for its moment":
 * it is dead from day one. So the reader ships with the writer.
 *
 * THIS IS NOT "THE BOT LOGS"
 *
 * A raw log cannot be piped in here, and not out of tidiness. Logs carry the
 * telegram ids, sums and prompts of 2380 people belonging to sixteen bot
 * owners, and the agent chat is the SAME screen for a bot owner and for an
 * ordinary user.
 *
 * The pulse returns EVENTS, and every event already knows who may see it
 * (`visibilityOf` from `hive/roles.ts`). To a keeper this looks like
 * "everything", and the difference shows up exactly once -- when a bot owner
 * opens their pulse and does not see the neighbours.
 */

import { visibilityOf, botFilter } from '../hive/roles'
import { feed, pulse } from '../hive/journal'
import type { AgentTool, ToolContext } from './tools'

/**
 * A person's bots come from `avatars`, by the same query as in the CRM.
 *
 * A second source of ownership would drift from the first, and the drift would
 * show up as "I cannot see my own bot" or, worse, "I can see somebody else's".
 */
async function botsOwnedBy(telegramId: string): Promise<string[]> {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY || ''
  if (!url || !key) return []
  const res = await fetch(
    `${url}/rest/v1/avatars?select=bot_name&telegram_id=eq.${encodeURIComponent(
      telegramId
    )}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  if (!res.ok) throw new Error(`avatars replied ${res.status}`)
  const rows = (await res.json()) as Array<{ bot_name: string | null }>
  return rows.map(r => (r.bot_name || '').trim()).filter(Boolean)
}

async function visibilityFor(ctx?: ToolContext) {
  const who = ctx ? String(ctx.telegramId ?? '') : ''
  if (!who) {
    // Identity comes from the signature, never from an argument: an argument
    // states who the caller would like to appear to be.
    throw new Error(
      'Пульс показывает события людей и требует подтверждённой личности'
    )
  }
  return visibilityOf(who, { botsOwnedBy })
}

/** A human name for the scope, so a one-bot owner does not read it as the farm. */
function scopeLabel(v: Awaited<ReturnType<typeof visibilityFor>>): string {
  const f = botFilter(v)
  if (f === null) return 'вся ферма (вы смотритель улья)'
  if (f.length === 0) return 'только ваши собственные события'
  return `ваши события и события ботов: ${f.join(', ')}`
}

export const HIVE_TOOLS: AgentTool[] = [
  {
    name: 'hive_pulse',
    description:
      'Пульс проекта: что происходило за последние сутки — входы, оплаты, ' +
      'создание контента, публикации, тревоги. Отвечает на «как дела у проекта ' +
      'прямо сейчас» числами, а не догадками. Бесплатно, ничего не меняет. ' +
      'Начинай с неё, когда спрашивают про состояние проекта, логи или события.',
    parameters: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'Окно в часах. По умолчанию 24, максимум 720 (месяц).',
        },
      },
    },
    async handler(a: any, ctx?: ToolContext) {
      const v = await visibilityFor(ctx)
      const p = await pulse(ctx!.pool, v, { hours: Number(a?.hours) || 24 })
      return {
        scope: scopeLabel(v),
        hours: p.hours,
        total: p.total,
        alarms: p.alarms,
        by_kind: Object.fromEntries(p.byKind.map(k => [k.kind, k.count])),
        how_to_read:
          'Тревога — это то, на что стоит посмотреть сегодня: подбор кода ко ' +
          'входу, оплата без получателя, подделанная подпись. Остальное — ' +
          'обычная жизнь проекта. Ноль событий значит тишину, а не поломку.',
      }
    },
  },
  {
    name: 'hive_events',
    description:
      'Последние события проекта построчно: что, у кого, когда. ' +
      'Бери, когда пульс показал тревогу и нужно увидеть, что именно случилось.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Сколько последних событий. По умолчанию 20, максимум 200.',
        },
        alarms_only: {
          type: 'boolean',
          description: 'Показать только то, на что стоит посмотреть сегодня.',
        },
      },
    },
    async handler(a: any, ctx?: ToolContext) {
      const v = await visibilityFor(ctx)
      const limit = Math.min(Math.max(1, Number(a?.limit) || 20), 200)
      // Alarms are few, so when filtering we take a wide slice and pick from
      // it. A separate "alarms only" query would introduce a second visibility
      // condition over the same data, and two conditions will drift one day --
      // towards "showed too much".
      const rows = await feed(ctx!.pool, v, {
        limit: a?.alarms_only ? 200 : limit,
      })
      const picked = a?.alarms_only
        ? rows.filter(r => r.severity === 'alarm').slice(0, limit)
        : rows
      return {
        scope: scopeLabel(v),
        events: picked.map(r => ({
          at: r.at,
          kind: r.kind,
          who: r.who ?? '(никого — событие без субъекта)',
          bot: r.bot ?? '(вне бота)',
          amount: r.amount ?? undefined,
          note: r.what ?? undefined,
          severity: r.severity,
        })),
        how_to_read:
          'Событие без субъекта — попытка со стороны: подбор кода, подделанная ' +
          'подпись платежа. Такие видны только смотрителю улья.',
      }
    },
  },
]

export const HIVE_TOOLS_INTERNALS_FOR_TESTS = { scopeLabel, botsOwnedBy }
