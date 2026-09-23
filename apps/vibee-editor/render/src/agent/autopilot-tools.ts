/**
 * THE AUTOPILOT SWITCH, READ AND THROWN FROM THE APP.
 *
 * The switch itself lives in the bot (`src/services/crmAutopilot.ts`): one row
 * per owner in `crm_autopilot`, a window that expires, a daily cap, and a rule
 * that a database which cannot answer means OFF. This module is the same row
 * seen from the render, so the Mini App can show the state and flip it without
 * a second source of truth.
 *
 * THE TABLE AND THE STATEMENTS ARE THE BOT'S STRINGS, BYTE FOR BYTE. The bot's
 * parity test compares the two files, the way `assistant-opt-out.ts` is pinned
 * against its own twin: two copies that drift are worse than one copy in the
 * wrong place, because the drift is invisible until somebody's message leaves
 * without a press.
 *
 * WHAT THIS DOES NOT DO. It does not send anything and it does not decide
 * whether a particular card may go: that decision stays in the bot, at the one
 * place a card reaches the owner (`pushCard`), where the budget is taken in a
 * single statement. Here you may only look, switch on for a while, and switch
 * off.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

/** How long one press of the switch lasts. The bot's constant. */
export const AUTOPILOT_HOURS = 8
/** How many automatic sends one owner gets in a calendar day (UTC). */
export const AUTOPILOT_DAILY_CAP = 20

export const AUTOPILOT_TABLE = `CREATE TABLE IF NOT EXISTS crm_autopilot (
  owner_id text PRIMARY KEY,
  until timestamptz NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  sent_today integer NOT NULL DEFAULT 0,
  turned_on_at timestamptz NOT NULL DEFAULT now(),
  turned_off_at timestamptz,
  scope text NOT NULL DEFAULT 'all'
)`

export const AUTOPILOT_SCOPE_COLUMN = `ALTER TABLE crm_autopilot
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all'`

export const AUTOPILOT_LEADS_TABLE = `CREATE TABLE IF NOT EXISTS crm_autopilot_leads (
  owner_id text NOT NULL,
  lead_id text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, lead_id)
)`

export const AUTOPILOT_LEAD_ADD = `INSERT INTO crm_autopilot_leads (owner_id, lead_id)
  VALUES ($1, $2) ON CONFLICT DO NOTHING`

export const AUTOPILOT_LEAD_REMOVE = `DELETE FROM crm_autopilot_leads
  WHERE owner_id = $1 AND lead_id = $2`

export const AUTOPILOT_LEAD_LIST = `SELECT lead_id FROM crm_autopilot_leads
  WHERE owner_id = $1 ORDER BY added_at DESC`

export const AUTOPILOT_READ = `SELECT until, day, sent_today, scope
  FROM crm_autopilot WHERE owner_id = $1`

export const AUTOPILOT_ON = `INSERT INTO crm_autopilot
  (owner_id, until, day, sent_today, turned_on_at, turned_off_at, scope)
  VALUES ($1, now() + ($2 || ' hours')::interval,
          (now() AT TIME ZONE 'utc')::date, 0, now(), NULL, $3)
  ON CONFLICT (owner_id) DO UPDATE SET
    until = now() + ($2 || ' hours')::interval,
    day = (now() AT TIME ZONE 'utc')::date,
    sent_today = 0,
    turned_on_at = now(),
    turned_off_at = NULL,
    scope = $3
  RETURNING until, scope`

export const AUTOPILOT_OFF = `UPDATE crm_autopilot
  SET until = now() - interval '1 second', turned_off_at = now()
  WHERE owner_id = $1
  RETURNING owner_id`

type Pool = {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

const ready = new WeakSet<object>()

async function ensure(pool: Pool): Promise<void> {
  if (ready.has(pool as object)) return
  await pool.query(AUTOPILOT_TABLE)
  await pool.query(AUTOPILOT_SCOPE_COLUMN)
  await pool.query(AUTOPILOT_LEADS_TABLE)
  ready.add(pool as object)
}

export type AutopilotScope = 'all' | 'chosen'

export interface AutopilotView {
  on: boolean
  /** Whom it may write to by itself: everybody, or the people he picked. */
  scope: AutopilotScope
  /** How many are picked. 0 with `chosen` means nothing sends by itself. */
  chosen: number
  /** ISO, absent when it is off. */
  until?: string
  /** Minutes left in the window; 0 when off. */
  minutes_left: number
  sent_today: number
  left_today: number
  cap: number
  hours: number
}

const OFF = (): AutopilotView => ({
  on: false,
  scope: 'all',
  chosen: 0,
  minutes_left: 0,
  sent_today: 0,
  left_today: AUTOPILOT_DAILY_CAP,
  cap: AUTOPILOT_DAILY_CAP,
  hours: AUTOPILOT_HOURS,
})

/**
 * The state, as the app shows it. THROWS when the database cannot answer:
 * a screen that says "off" because a query failed teaches the owner that the
 * switch is off when it may not be, and he would find out from a message that
 * left without him.
 */
export async function autopilotView(
  pool: Pool,
  owner: string,
  now = Date.now()
): Promise<AutopilotView> {
  await ensure(pool)
  const r = await pool.query(AUTOPILOT_READ, [String(owner)])
  const row = (r.rows ?? [])[0]
  if (!row) return OFF()
  const until = new Date(row.until).getTime()
  const on = until > now
  const today = new Date(now).toISOString().slice(0, 10)
  const sameDay = String(row.day).slice(0, 10) === today
  const sent = sameDay ? Number(row.sent_today) || 0 : 0
  const scope: AutopilotScope = row.scope === 'chosen' ? 'chosen' : 'all'
  let chosen = 0
  if (scope === 'chosen') {
    const list = await pool.query(AUTOPILOT_LEAD_LIST, [String(owner)])
    chosen = (list.rows ?? []).length
  }
  return {
    on,
    scope,
    chosen,
    ...(on ? { until: new Date(until).toISOString() } : {}),
    minutes_left: on ? Math.max(0, Math.round((until - now) / 60_000)) : 0,
    sent_today: sent,
    left_today: Math.max(0, AUTOPILOT_DAILY_CAP - sent),
    cap: AUTOPILOT_DAILY_CAP,
    hours: AUTOPILOT_HOURS,
  }
}

export const AUTOPILOT_TOOLS: AgentTool[] = [
  {
    name: 'autopilot_status',
    description:
      'Включён ли автопилот у тебя: до какого времени, сколько автоотправок ' +
      'осталось сегодня и каков суточный потолок. ЧИТАЮЩИЙ, ничего не меняет.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      return autopilotView(ctx?.pool as never, String(ctx?.telegramId ?? ''))
    },
  },
  {
    name: 'autopilot_set',
    description:
      'Включить автопилот на несколько часов или выключить. Пока он включён, ' +
      'подготовленные карточки уходят клиенту сами, и о каждой отправке ' +
      'приходит отчёт с кнопкой «Выключить». Окно само гаснет, суточный ' +
      'потолок ограничивает число автоотправок. on=false выключает сразу.',
    parameters: {
      type: 'object',
      properties: {
        on: { type: 'boolean', description: 'включить (true) или выключить' },
        hours: {
          type: 'number',
          description: `на сколько часов включить (1..24, по умолчанию ${AUTOPILOT_HOURS})`,
        },
        scope: {
          type: 'string',
          enum: ['all', 'chosen'],
          description:
            'кому можно писать самому: all — всем, кому обход нарисовал ' +
            'карточку; chosen — только выбранным людям (autopilot_lead)',
        },
      },
      required: ['on'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const pool = ctx?.pool as never as Pool
      const owner = String(ctx?.telegramId ?? '')
      await ensure(pool)
      if (a?.on !== true) {
        await pool.query(AUTOPILOT_OFF, [owner])
        return { ...(await autopilotView(pool, owner)), changed: true }
      }
      /*
       * A window longer than a day would outlive the daily cap it is bounded
       * by, and a window of zero is a switch that does nothing while claiming
       * to be on. Both are silently corrected rather than refused: the person
       * pressed a switch, not typed a number.
       */
      const raw = Number(a?.hours)
      const hours = Number.isFinite(raw)
        ? Math.min(24, Math.max(1, Math.round(raw)))
        : AUTOPILOT_HOURS
      const scope = a?.scope === 'chosen' ? 'chosen' : 'all'
      await pool.query(AUTOPILOT_ON, [owner, String(hours), scope])
      return { ...(await autopilotView(pool, owner)), changed: true }
    },
  },
]

/**
 * PICKING A PERSON IS THE OWNER'S ACT, LIKE THE SWITCH ITSELF.
 *
 * Adding somebody to this list decides that messages may go to THEM without a
 * press, so it belongs in `DIRECT_CALL_ONLY` beside `autopilot_set`: a model
 * turn that has read a client's message must not be able to add that client.
 */
AUTOPILOT_TOOLS.push({
  name: 'autopilot_lead',
  description:
    'Кому можно писать на автопилоте, когда режим ограничен выбранными: ' +
    'on=true добавляет человека, on=false убирает. Прямой вызов владельца.',
  parameters: {
    type: 'object',
    properties: {
      lead: { type: 'string', description: 'telegram_id человека' },
      on: { type: 'boolean', description: 'добавить (true) или убрать' },
    },
    required: ['lead', 'on'],
    additionalProperties: false,
  },
  async handler(a: Record<string, any>, ctx?: ToolContext) {
    await requireSeller(ctx)
    const owner = String(ctx?.telegramId ?? '')
    const lead = String(a?.lead ?? '').trim()
    if (!/^\d{5,15}$/.test(lead))
      throw new Error('lead: telegram_id человека, только цифры')
    const pool = ctx?.pool as never as Pool
    await ensure(pool)
    await pool.query(
      a?.on === true ? AUTOPILOT_LEAD_ADD : AUTOPILOT_LEAD_REMOVE,
      [owner, lead]
    )
    // The view already carries `chosen` (how many are picked); saying it
    // twice with two different meanings is how a screen learns to lie.
    return {
      lead,
      picked: a?.on === true,
      ...(await autopilotView(pool, owner)),
    }
  },
})

/** Whom the owner picked, for the screen that shows a tick per client. */
export async function chosenLeads(
  pool: Pool,
  owner: string
): Promise<string[]> {
  await ensure(pool)
  const r = await pool.query(AUTOPILOT_LEAD_LIST, [String(owner)])
  return (r.rows ?? []).map(x => String(x.lead_id))
}

AUTOPILOT_TOOLS.push({
  name: 'autopilot_leads',
  description: 'Кого владелец выбрал для автопилота. Читающий.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  async handler(_a: Record<string, any>, ctx?: ToolContext) {
    await requireSeller(ctx)
    const leads = await chosenLeads(
      ctx?.pool as never,
      String(ctx?.telegramId ?? '')
    )
    return { leads, count: leads.length }
  },
})
