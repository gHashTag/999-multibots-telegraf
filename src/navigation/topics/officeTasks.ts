/**
 * THE OFFICE KEEPS ITS TASKS (spec bot-neuro-office.t27 v5, issue #3901).
 *
 * A group chat forgets what people agreed to do; Teams Facilitator keeps
 * action items. In an office, `/todo <text>` puts a task on the room's list
 * with an owner -- the person the command replies to, else the person it
 * names (@username), else the sender. `/todos` shows the open ones, oldest
 * first, `/done <id>` closes one: only its owner, its author or an admin of
 * the group. Elsewhere the commands say where they work.
 *
 * The numbers and rules are the spec's (src/spec/bot-neuro-office.gen.ts);
 * src/spec/bot-neuro-office.test.ts runs every test of the spec against
 * the functions below.
 */
import { Pool } from 'pg'
import type { Telegraf } from 'telegraf'
import * as OFFICE from '@/spec/bot-neuro-office.gen'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { isOffice, speakerName } from './office'

/** spec may_track: tasks are kept in an office only. */
export function mayTrack(office: boolean): boolean {
  return office
}

/** spec task_chars: a task is cut to TASK_TEXT_MAX_CHARS. */
export function taskChars(chars: number): number {
  return chars > OFFICE.TASK_TEXT_MAX_CHARS ? OFFICE.TASK_TEXT_MAX_CHARS : chars
}

/** spec owner_source: a reply wins, then a mention, then the sender. */
export function ownerSource(hasReply: boolean, hasMention: boolean): number {
  if (hasReply) return OFFICE.OWNER_FROM_REPLY
  if (hasMention) return OFFICE.OWNER_FROM_MENTION
  return OFFICE.OWNER_FROM_SENDER
}

/** spec may_close: the owner, the author or an admin. */
export function mayClose(
  isOwner: boolean,
  isAuthor: boolean,
  isAdmin: boolean
): boolean {
  return isOwner || isAuthor || isAdmin
}

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export const OFFICE_TASKS_TABLE = `CREATE TABLE IF NOT EXISTS office_tasks (
  id bigserial PRIMARY KEY,
  bot_username text NOT NULL,
  chat_id bigint NOT NULL,
  text text NOT NULL,
  owner_id bigint,
  owner_name text NOT NULL,
  author_id bigint NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
)`

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) return null
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', error => {
    logger.error('[office-tasks] pool error', { error: error.message })
  })
  return pool
}

/** Tests only: inject a database, or with null forget it and any pool. */
export function setOfficeTasksDbForTests(d: Db | null): void {
  injected = d
  if (d === null) pool = null
  schemaReady = null
}

async function ready(): Promise<Db | null> {
  const d = db()
  if (!d) return null
  if (!schemaReady) {
    schemaReady = d
      .query(OFFICE_TASKS_TABLE)
      .then(() => undefined)
      .catch(e => {
        schemaReady = null
        throw e
      })
  }
  await schemaReady
  return d
}

/**
 * A real reply to a person's message. In a forum topic every message
 * "replies" to the topic's first service message; that is no person.
 */
export function repliedPerson(message: any): any | null {
  const r = message?.reply_to_message
  if (!r || r.forum_topic_created) return null
  if (message?.is_topic_message && r.message_id === message.message_thread_id)
    return null
  return r.from && !r.from.is_bot ? r.from : null
}

/** The first @username the command names, without the @. */
export function mentionedName(message: any): string | null {
  const text: string = message?.text ?? ''
  for (const e of message?.entities ?? []) {
    if (e.type === 'mention')
      return text.slice(e.offset + 1, e.offset + e.length) || null
  }
  return null
}

/** The task text: the command's words, without the command and the mention. */
export function taskText(message: any): string {
  const raw = String(message?.text ?? '')
    .replace(/^\/\w+(@\w+)?\s*/, '')
    .replace(/@\w+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...raw]
  return chars.slice(0, taskChars(chars.length)).join('')
}

/** Who owns a new task, as the spec orders it. */
export function ownerOf(message: any): { id: number | null; name: string } {
  const reply = repliedPerson(message)
  const mention = mentionedName(message)
  switch (ownerSource(reply !== null, mention !== null)) {
    case OFFICE.OWNER_FROM_REPLY:
      return { id: Number(reply.id), name: speakerName(reply) }
    case OFFICE.OWNER_FROM_MENTION:
      return { id: null, name: `@${mention}` }
    default:
      return { id: Number(message.from.id), name: speakerName(message.from) }
  }
}

const say = (isRu: boolean, ru: string, en: string) => (isRu ? ru : en)

async function notAnOffice(ctx: any, isRu: boolean): Promise<boolean> {
  const office = await isOffice(ctx)
  if (mayTrack(office)) return false
  await ctx
    .reply(
      say(
        isRu,
        'Задачи ведутся в нейроофисе: в группе с темами после /office.',
        'Tasks are kept in a neuro-office: a group with topics after /office.'
      )
    )
    .catch(() => undefined)
  return true
}

/** /todo <text>: a task on the room's list, with its owner. */
export async function addTask(ctx: any): Promise<'added' | 'refused'> {
  const isRu = isRussianFromState(ctx as any)
  if (await notAnOffice(ctx, isRu)) return 'refused'
  const text = taskText(ctx.message)
  if (!text) {
    await ctx.reply(
      say(
        isRu,
        'Напишите задачу после команды: /todo подготовить макет. Ответом на сообщение человека — задача ему.',
        'Write the task after the command: /todo draft the mockup. As a reply to someone, the task is theirs.'
      )
    )
    return 'refused'
  }
  const d = await ready()
  if (!d) {
    await ctx.reply(
      say(
        isRu,
        'Список задач сейчас недоступен.',
        'The task list is not available just now.'
      )
    )
    return 'refused'
  }
  const owner = ownerOf(ctx.message)
  const { rows } = await d.query(
    'INSERT INTO office_tasks (bot_username, chat_id, text, owner_id, owner_name, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [
      String(ctx.botInfo?.username ?? ''),
      Number(ctx.chat.id),
      text,
      owner.id,
      owner.name,
      Number(ctx.from.id),
    ]
  )
  await ctx.reply(
    say(
      isRu,
      `Задача #${rows[0].id} — ${owner.name}: ${text}`,
      `Task #${rows[0].id} — ${owner.name}: ${text}`
    )
  )
  return 'added'
}

/** /todos: the room's open tasks, oldest first. */
export async function listTasks(ctx: any): Promise<number> {
  const isRu = isRussianFromState(ctx as any)
  if (await notAnOffice(ctx, isRu)) return 0
  const d = await ready()
  if (!d) return 0
  const { rows } = await d.query(
    'SELECT id, text, owner_name FROM office_tasks WHERE bot_username = $1 AND chat_id = $2 AND NOT done ORDER BY id LIMIT $3',
    [
      String(ctx.botInfo?.username ?? ''),
      Number(ctx.chat.id),
      OFFICE.OPEN_TASKS_SHOWN_MAX,
    ]
  )
  await ctx.reply(
    rows.length
      ? rows.map(r => `#${r.id} ${r.owner_name}: ${r.text}`).join('\n')
      : say(isRu, 'Открытых задач нет.', 'No open tasks.')
  )
  return rows.length
}

/** /done <id>: close a task -- its owner, its author or an admin. */
export async function closeTask(
  ctx: any
): Promise<'closed' | 'refused' | 'missing'> {
  const isRu = isRussianFromState(ctx as any)
  if (await notAnOffice(ctx, isRu)) return 'refused'
  const id = Number(
    String(ctx.message?.text ?? '').match(/^\/\w+(?:@\w+)?\s+#?(\d+)/)?.[1]
  )
  const d = await ready()
  if (!d || !Number.isSafeInteger(id) || id <= 0) {
    await ctx.reply(
      say(isRu, 'Номер задачи: /done 12', 'The task number: /done 12')
    )
    return 'missing'
  }
  const { rows } = await d.query(
    'SELECT id, owner_id, owner_name, author_id FROM office_tasks WHERE id = $1 AND bot_username = $2 AND chat_id = $3 AND NOT done',
    [id, String(ctx.botInfo?.username ?? ''), Number(ctx.chat.id)]
  )
  const task = rows[0]
  if (!task) {
    await ctx.reply(
      say(isRu, `Открытой задачи #${id} нет.`, `There is no open task #${id}.`)
    )
    return 'missing'
  }
  const me = ctx.from
  const isOwner =
    (task.owner_id !== null && Number(task.owner_id) === Number(me.id)) ||
    (!!me.username && task.owner_name === `@${me.username}`)
  const isAuthor = Number(task.author_id) === Number(me.id)
  let isAdmin = false
  if (!isOwner && !isAuthor) {
    try {
      const m: any = await ctx.telegram.getChatMember(ctx.chat.id, me.id)
      isAdmin = m?.status === 'creator' || m?.status === 'administrator'
    } catch {
      isAdmin = false
    }
  }
  if (!mayClose(isOwner, isAuthor, isAdmin)) {
    await ctx.reply(
      say(
        isRu,
        `Задачу #${id} закрывает ${task.owner_name}, автор или админ.`,
        `Task #${id} is closed by ${task.owner_name}, its author or an admin.`
      )
    )
    return 'refused'
  }
  await d.query(
    'UPDATE office_tasks SET done = true, done_at = now() WHERE id = $1',
    [id]
  )
  await ctx.reply(say(isRu, `Готово: задача #${id}.`, `Done: task #${id}.`))
  return 'closed'
}

/** /todo, /todos, /done. Each answers; a failure is said, never silence. */
export function registerOfficeTasks(bot: Telegraf<any>): void {
  const guard =
    (name: string, run: (ctx: any) => Promise<unknown>) => async (ctx: any) => {
      try {
        await run(ctx)
      } catch (e) {
        logger.warn('[office-tasks] command failed', {
          command: name,
          error: e instanceof Error ? e.message.slice(0, 120) : String(e),
        })
        const isRu = isRussianFromState(ctx as any)
        await ctx
          .reply(
            say(
              isRu,
              'Не вышло, попробуйте ещё раз.',
              'That did not work, try again.'
            )
          )
          .catch(() => undefined)
      }
    }
  bot.command('todo', guard('todo', addTask))
  bot.command('todos', guard('todos', listTasks))
  bot.command('done', guard('done', closeTask))
}
