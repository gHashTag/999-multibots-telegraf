/**
 * THE NEURO-OFFICE'S RENDER HALF (spec bot-office-crm.t27, issues #3912, #3913).
 *
 * Owner, 2026-10-09: "the agent sets tasks itself" and "is the office linked
 * to the clients' CRM? if not, link it". Measured that day: not linked. The
 * CRM knew a client's group (crm_client_groups), the office in that group
 * kept its tasks (office_tasks, written by the bot into this same Postgres),
 * and nothing read one from the other.
 *
 * Three things, each a rule of the spec:
 *
 *   - An office turn of the bot is taught the task marker `[[todo:Name|what]]`
 *     (teaches_task_marker). The bot turns each into a button; only a
 *     person's press makes a task (bot-neuro-office.t27 v7).
 *   - The owner's client card lists the open tasks of the client's office:
 *     what the team agreed about this client, in the client's thread
 *     (client_card_lists_tasks, at most CLIENT_CARD_TASKS_MAX).
 *   - The link runs one way: a room turn never carries a client's card
 *     (ROOM_SEES_CLIENT_CARD). The client may sit in that very room.
 *   - v2 (#3919): from the client's thread the owner's agent puts a task
 *     proposal into the client's office (`crm_office_task`, may_assign). The
 *     office's own bot posts it with the bot's `otp:<id>` button, and a
 *     person there makes it a task by pressing (ASSIGN_IS_PROPOSAL).
 *
 * The numbers come from the spec's t27c gen-ts output and every rule is the
 * spec's own compiled body (bot-office-crm.logic.ts, scripts/t27-logic.mjs);
 * none is restated here.
 */
import * as SPEC from '../spec/bot-office-crm.gen'
import type { AgentTool, ToolContext } from './tools'
import {
  assignedIsTask,
  assignOk,
  cardTasksShown,
  clientCardListsTasks,
  mayAssign,
  roomGetsClientCard,
  teachesTaskMarker,
} from '../spec/bot-office-crm.logic'

// The spec's rules, compiled from bot-office-crm.t27 (never retyped here).
export {
  assignedIsTask,
  assignOk,
  cardTasksShown,
  clientCardListsTasks,
  mayAssign,
  roomGetsClientCard,
  teachesTaskMarker,
}

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

/**
 * What an office turn is taught. The parser is the bot's (officeTasks.ts
 * officeProposals): a name up to 64 characters, the work up to 300, never a
 * member of the team -- a colleague takes work by being named first on a
 * line (hand-off), not by a task.
 */
export const OFFICE_TASK_MARKERS =
  '\n\nЗАДАЧИ ОФИСА. Ты отвечаешь в нейроофисе — группе, где работают люди. ' + // cyrillic-ok: prompt copy
  'Если твой ответ поручает работу ЧЕЛОВЕКУ из комнаты («Аня делает макет к ' + // cyrillic-ok: prompt copy
  'пятнице»), добавь в конце ответа маркер [[todo:Имя|что сделать]] — по одному ' + // cyrillic-ok: prompt copy
  'на поручение, не больше трёх. Имя — как человека зовут в комнате или его ' + // cyrillic-ok: prompt copy
  '@username; что сделать — коротко, до 300 символов. Бот покажет кнопку, и ' + // cyrillic-ok: prompt copy
  'задачей это станет, только когда человек нажмёт: сам ты задачу не ставишь. ' + // cyrillic-ok: prompt copy
  'Коллегам по команде (Казначей, Режиссёр и другим) маркер не ставь — их зови ' + // cyrillic-ok: prompt copy
  'по имени в начале строки. Нет поручения — нет маркера.' // cyrillic-ok: prompt copy

export interface OfficeTask {
  id: number
  text: string
  owner_name: string
}

/**
 * The open tasks of the office in a group, oldest first, at most the card's
 * bound, with how many are open in all. Never throws: no office there, or no
 * table yet, is no tasks.
 */
export async function officeTasksFor(
  pool: Pool,
  chatId: string
): Promise<{ tasks: OfficeTask[]; open: number }> {
  if (!/^-\d{5,20}$/.test(String(chatId))) return { tasks: [], open: 0 }
  try {
    const r = await pool.query(
      `SELECT id, text, owner_name, count(*) OVER () AS open
         FROM office_tasks
        WHERE chat_id = $1 AND NOT done
        ORDER BY id
        LIMIT $2`,
      [String(chatId), SPEC.CLIENT_CARD_TASKS_MAX]
    )
    const rows = r.rows ?? []
    return {
      open: rows.length ? Number(rows[0].open) : 0,
      tasks: rows.map(x => ({
        id: Number(x.id),
        text: String(x.text),
        owner_name: String(x.owner_name),
      })),
    }
  } catch {
    return { tasks: [], open: 0 }
  }
}

/**
 * One line for the client's card: the team's open tasks about this client,
 * from the office in the client's group. Empty when the card lists none.
 */
export function officeTasksLine(
  groupBound: boolean,
  found: { tasks: readonly OfficeTask[]; open: number }
): string {
  if (!clientCardListsTasks(groupBound, found.open)) return ''
  const shown = found.tasks.slice(0, cardTasksShown(found.open))
  const more = found.open - shown.length
  return (
    'Задачи офиса в группе клиента (' + // cyrillic-ok: prompt copy
    found.open +
    ' открыто): ' + // cyrillic-ok: prompt copy
    shown.map(t => `#${t.id} ${t.owner_name}: ${t.text}`).join('; ') +
    (more > 0 ? `; и ещё ${more} — /todos в группе` : '') + // cyrillic-ok: prompt copy
    '.'
  )
}

/**
 * The bot's table, byte for byte (src/navigation/topics/officeTasks.ts
 * OFFICE_PROPOSALS_TABLE; a test holds them equal): the render writes the
 * row, the bot's press reads it.
 */
export const OFFICE_PROPOSALS_TABLE = `CREATE TABLE IF NOT EXISTS office_task_proposals (
  id bigserial PRIMARY KEY,
  bot_username text NOT NULL,
  chat_id bigint NOT NULL,
  text text NOT NULL,
  owner_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  taken_by bigint,
  taken_at timestamptz
)`

/** The bot's callback for a proposal (officeTasks.ts PROPOSAL_PREFIX). */
export const PROPOSAL_PREFIX = 'otp:'

/**
 * The office running in a group: its bot and the channel to post in -- the
 * Agent's channel when there is one, else the first. None: no office there.
 */
export async function officeIn(
  pool: Pool,
  chatId: string
): Promise<{ bot: string; thread: number } | null> {
  if (!/^-\d{5,20}$/.test(String(chatId))) return null
  try {
    const r = await pool.query(
      `SELECT bot_username, thread_id FROM bot_topic_tabs
        WHERE telegram_id = $1 AND thread_id > 0
        ORDER BY (kind = 'agent') DESC, thread_id
        LIMIT 1`,
      [String(chatId)]
    )
    const x = r.rows?.[0]
    return x
      ? { bot: String(x.bot_username), thread: Number(x.thread_id) }
      : null
  } catch {
    return null
  }
}

export interface AssignDeps {
  isSeller(ctx?: ToolContext): Promise<boolean>
  groupOf(
    pool: Pool,
    owner: string,
    lead: string
  ): Promise<{ chat_id: string } | null>
  tokenOf(bot: string): Promise<string | null>
  send(
    token: string,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; description?: string }>
}

const say = (en: boolean, ru: string, eng: string) => (en ? eng : ru)

/**
 * crm_office_task: the owner's word in a client's thread becomes a proposal
 * in the client's office, posted by the office's bot with the bot's button.
 * Every refusal says what is missing. Nothing becomes a task here.
 */
export async function assignToOffice(
  a: Record<string, any>,
  ctx: ToolContext | undefined,
  deps: AssignDeps
): Promise<Record<string, unknown>> {
  const owner = String(ctx?.telegramId ?? '')
  const lead = String(a?.client ?? '').trim()
  const name = String(a?.name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const text = String(a?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const en = a?.lang === 'en'
  if (!/^\d{5,15}$/.test(lead))
    throw new Error('client: a Telegram id of a person')
  if (!assignOk([...name].length, [...text].length))
    throw new Error(
      `name: 1-${SPEC.ASSIGN_NAME_MAX_CHARS} characters, text: 1-${SPEC.ASSIGN_TEXT_MAX_CHARS}`
    )
  const seller = await deps.isSeller(ctx)
  const clientDm = ctx?.surface === 'business'
  const pool = ctx!.pool as Pool
  const group =
    seller && !clientDm ? await deps.groupOf(pool, owner, lead) : null
  const office = group ? await officeIn(pool, group.chat_id) : null
  if (!mayAssign(seller, clientDm, group !== null, office !== null)) {
    if (!seller || clientDm)
      throw new Error(
        'Задачи в офис клиента ставит владелец из своего треда клиента.' // cyrillic-ok: refusal the model relays
      )
    throw new Error(
      group
        ? 'В группе клиента нет нейроофиса: там нужно прислать /office (группа с темами, бот — админ).' // cyrillic-ok: refusal the model relays
        : 'У клиента нет привязанной группы: привяжите её через crm_client_group.' // cyrillic-ok: refusal the model relays
    )
  }
  const token = await deps.tokenOf(office!.bot)
  if (!token)
    throw new Error(
      `Бот офиса @${office!.bot} не отвечает сейчас: задача не выложена.` // cyrillic-ok: refusal the model relays
    )
  await pool.query(OFFICE_PROPOSALS_TABLE)
  const made = await pool.query(
    'INSERT INTO office_task_proposals (bot_username, chat_id, text, owner_name) VALUES ($1, $2, $3, $4) RETURNING id',
    [office!.bot, group!.chat_id, text, name]
  )
  const id = Number(made.rows[0].id)
  const label = `📌 ${name}: ${text}`
  const sent = await deps.send(token, {
    chat_id: group!.chat_id,
    message_thread_id: office!.thread,
    text: say(
      en,
      `${label}\nЗадача от владельца. Нажмите — и она в списке /todos.`, // cyrillic-ok: the office's copy
      `${label}\nA task from the owner. Press it and it is on the /todos list.`
    ),
    reply_markup: {
      inline_keyboard: [
        [
          {
            text:
              [...label].length > 60
                ? [...label].slice(0, 59).join('') + '…'
                : label,
            callback_data: `${PROPOSAL_PREFIX}${id}`,
          },
        ],
      ],
    },
  })
  if (!sent.ok) {
    await pool
      .query('DELETE FROM office_task_proposals WHERE id = $1', [id])
      .catch(() => undefined)
    throw new Error(
      `Telegram не принял сообщение в офис: ${String(sent.description ?? '').slice(0, 120)}` // cyrillic-ok: refusal the model relays
    )
  }
  return {
    proposed: id,
    group: group!.chat_id,
    office_bot: office!.bot,
    is_task: assignedIsTask(false),
    note: 'posted as a proposal: it becomes a task when a person in the office presses it',
  }
}

export const OFFICE_CRM_TOOLS: AgentTool[] = [
  {
    name: 'crm_office_task',
    description:
      "Put a task for a person of the team into the CLIENT'S office (the forum group bound to the client, where /office runs): the office's bot posts it with a button, and it becomes a task only when somebody there presses it. Use when the owner, in a client's thread, says who should do what for this client. Everyone in that group sees the post, the client too if they are a member.",
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'telegram id of the client' },
        name: {
          type: 'string',
          description: 'who: a name or @username, up to 64',
        },
        text: { type: 'string', description: 'what to do, up to 300' },
        lang: { type: 'string', enum: ['ru', 'en'] },
      },
      required: ['client', 'name', 'text'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      const [
        { isSeller },
        { clientGroupFor },
        { tokenForBot },
        { telegramApiFor },
      ] = await Promise.all([
        import('./telegram-tools'),
        import('./crm-client-group'),
        import('./bot-farm'),
        import('../telegram-api'),
      ])
      return assignToOffice(a, ctx, {
        isSeller,
        groupOf: (pool, owner, lead) =>
          clientGroupFor(pool as never, owner, lead),
        tokenOf: async bot => (await tokenForBot(bot))?.token ?? null,
        send: async (token, body) => {
          const r = await fetch(`${telegramApiFor(token)}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          return (await r.json()) as { ok: boolean; description?: string }
        },
      })
    },
  },
]
