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
 *
 * The numbers come from the spec's t27c gen-ts output; each rule is written
 * once here and src/spec/bot-office-crm.test.ts runs every test of the spec
 * against it.
 */
import * as SPEC from '../spec/bot-office-crm.gen'

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

/** spec teaches_task_marker: an office turn of the bot, never the sweep. */
export function teachesTaskMarker(
  office: boolean,
  surfaceBot: boolean,
  toolsOnly: boolean
): boolean {
  return office && surfaceBot && !toolsOnly
}

/** spec client_card_lists_tasks: a bound group with open tasks. */
export function clientCardListsTasks(
  groupBound: boolean,
  openTasks: number
): boolean {
  return SPEC.CLIENT_CARD_SHOWS_OFFICE_TASKS && groupBound && openTasks > 0
}

/** spec card_tasks_shown: at most CLIENT_CARD_TASKS_MAX. */
export function cardTasksShown(openTasks: number): number {
  return openTasks > SPEC.CLIENT_CARD_TASKS_MAX
    ? SPEC.CLIENT_CARD_TASKS_MAX
    : openTasks
}

/** spec room_gets_client_card: never in a room. */
export function roomGetsClientCard(room: boolean): boolean {
  return !room || SPEC.ROOM_SEES_CLIENT_CARD
}

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
