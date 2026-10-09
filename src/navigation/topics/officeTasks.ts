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
 * v7 (issue #3912): the agent proposes tasks. An answer in an office that
 * gives a person work carries `[[todo:Name|what]]`; the bot strips the
 * markers and puts a button per proposal under the answer. Only a person's
 * press makes a task, within the day, once -- the presser is its author.
 *
 * The numbers and rules are the spec's (src/spec/bot-neuro-office.gen.ts);
 * src/spec/bot-neuro-office.test.ts runs every test of the spec against
 * the functions below.
 */
import { Pool } from 'pg'
import type { Telegraf } from 'telegraf'
import * as OFFICE from '@/spec/bot-neuro-office.gen'
import * as TEAM from '@/spec/bot-agent-team.gen'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { isOffice, memberNamedFirst, speakerName } from './office'

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

/** spec task_from_answer: an answer alone never makes a task. */
export function taskFromAnswer(pressed: boolean): boolean {
  return pressed || !OFFICE.AGENT_TASK_NEEDS_PRESS
}

/** spec may_propose: proposals are made in an office only. */
export function mayPropose(office: boolean): boolean {
  return office
}

/** spec proposal_ok: a person's name and the work, within bounds. */
export function proposalOk(
  nameChars: number,
  textChars: number,
  namesMember: boolean
): boolean {
  return (
    nameChars > 0 &&
    nameChars <= OFFICE.SPEAKER_NAME_MAX_CHARS &&
    textChars > 0 &&
    textChars <= OFFICE.TASK_TEXT_MAX_CHARS &&
    !namesMember
  )
}

/** spec proposals_kept: at most PROPOSALS_PER_ANSWER_MAX buttons. */
export function proposalsKept(proposed: number): number {
  return proposed > OFFICE.PROPOSALS_PER_ANSWER_MAX
    ? OFFICE.PROPOSALS_PER_ANSWER_MAX
    : proposed
}

/** spec may_take: a person, within the day, once. */
export function mayTake(
  ageHours: number,
  taken: boolean,
  presserIsBot: boolean
): boolean {
  return ageHours < OFFICE.PROPOSAL_TTL_HOURS && !taken && !presserIsBot
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
      .then(() => d.query(OFFICE_PROPOSALS_TABLE))
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

/**
 * The room's open tasks, oldest first, at most OPEN_TASKS_SHOWN_MAX, one
 * line each ("#3 Anna: draft the mockup"). No database: none.
 */
export async function openTasks(
  ctx: any
): Promise<{ count: number; text: string }> {
  const d = await ready()
  if (!d) return { count: 0, text: '' }
  const { rows } = await d.query(
    'SELECT id, text, owner_name FROM office_tasks WHERE bot_username = $1 AND chat_id = $2 AND NOT done ORDER BY id LIMIT $3',
    [
      String(ctx.botInfo?.username ?? ''),
      Number(ctx.chat.id),
      OFFICE.OPEN_TASKS_SHOWN_MAX,
    ]
  )
  return {
    count: rows.length,
    text: rows.map(r => `#${r.id} ${r.owner_name}: ${r.text}`).join('\n'),
  }
}

/** /todos: the room's open tasks, oldest first. */
export async function listTasks(ctx: any): Promise<number> {
  const isRu = isRussianFromState(ctx as any)
  if (await notAnOffice(ctx, isRu)) return 0
  const open = await openTasks(ctx)
  if (!(await ready())) return 0
  await ctx.reply(
    open.count ? open.text : say(isRu, 'Открытых задач нет.', 'No open tasks.')
  )
  return open.count
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

/** The marker an office answer proposes a task with: `[[todo:Name|what]]`. */
export const TODO_MARKER = /\[\[todo:([^\]|\n]{0,200})\|([^\]\n]{0,1000})\]\]/gi

export interface Proposal {
  name: string
  text: string
}

/**
 * The answer without its task markers, and the proposals worth a button:
 * a person's name and the work within the spec's bounds, never a team
 * member, at most PROPOSALS_PER_ANSWER_MAX. Markers are stripped from every
 * answer, kept or not: a marker is not words for people.
 */
export function officeProposals(answer: string): {
  text: string
  items: Proposal[]
} {
  const raw = String(answer ?? '')
  const found: Proposal[] = []
  for (const m of raw.matchAll(TODO_MARKER)) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const text = m[2].replace(/\s+/g, ' ').trim()
    const member = memberNamedFirst(name) < TEAM.TEAM_SIZE
    if (proposalOk([...name].length, [...text].length, member))
      found.push({ name, text })
  }
  const text = raw
    .replace(TODO_MARKER, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, items: found.slice(0, proposalsKept(found.length)) }
}

/** The callback a proposal's button sends. */
export const PROPOSAL_PREFIX = 'otp:'

const BUTTON_TEXT_MAX = 60

function proposalLabel(p: Proposal): string {
  const label = `📌 ${p.name}: ${p.text}`
  const chars = [...label]
  return chars.length > BUTTON_TEXT_MAX
    ? chars.slice(0, BUTTON_TEXT_MAX - 1).join('') + '…'
    : label
}

/**
 * The proposals of an answer as buttons under it, in an office only. Each
 * is stored first, so a press after a restart still finds it. Never throws:
 * a proposal that could not be offered leaves the answer as it was.
 */
export async function proposeTasks(
  ctx: any,
  items: readonly Proposal[]
): Promise<number> {
  try {
    if (!items.length) return 0
    if (!mayPropose(await isOffice(ctx))) return 0
    const d = await ready()
    if (!d) return 0
    const rows: any[][] = []
    for (const p of items) {
      const { rows: made } = await d.query(
        'INSERT INTO office_task_proposals (bot_username, chat_id, text, owner_name) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          String(ctx.botInfo?.username ?? ''),
          Number(ctx.chat.id),
          p.text,
          p.name,
        ]
      )
      rows.push([
        {
          text: proposalLabel(p),
          callback_data: `${PROPOSAL_PREFIX}${made[0].id}`,
        },
      ])
    }
    const isRu = isRussianFromState(ctx as any)
    await ctx.reply(
      say(
        isRu,
        'Записать задачи? Нажмите — и задача в списке /todos.',
        'Make these tasks? Press one and it is on the /todos list.'
      ),
      { reply_markup: { inline_keyboard: rows } }
    )
    return rows.length
  } catch (e) {
    logger.warn('[office-tasks] proposals not offered', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return 0
  }
}

/** The keyboard without the pressed button; none left -- no keyboard. */
function withoutButton(message: any, data: string): any {
  const rows = (message?.reply_markup?.inline_keyboard ?? [])
    .map((row: any[]) => row.filter(b => b?.callback_data !== data))
    .filter((row: any[]) => row.length > 0)
  return rows.length ? { inline_keyboard: rows } : undefined
}

/**
 * A press on a proposal: the presser makes it a task (spec may_take), and
 * the button goes. Taken or stale, the button goes too, and the room is
 * told only when it is stale -- a taken one already has its task line.
 */
export async function takeProposal(
  ctx: any
): Promise<'taken' | 'stale' | 'gone' | 'refused'> {
  await ctx.answerCbQuery().catch(() => undefined)
  const data = String(ctx.callbackQuery?.data ?? '')
  const id = Number(data.slice(PROPOSAL_PREFIX.length))
  const d = await ready()
  if (!d || !Number.isSafeInteger(id) || id <= 0) return 'refused'
  const isRu = isRussianFromState(ctx as any)
  const dropButton = () =>
    ctx
      .editMessageReplyMarkup(withoutButton(ctx.callbackQuery?.message, data))
      .catch(() => undefined)
  const { rows } = await d.query(
    'SELECT id, text, owner_name, taken_at, EXTRACT(EPOCH FROM (now() - created_at)) / 3600 AS age_hours FROM office_task_proposals WHERE id = $1 AND bot_username = $2 AND chat_id = $3',
    [id, String(ctx.botInfo?.username ?? ''), Number(ctx.chat?.id)]
  )
  const p = rows[0]
  if (!p) {
    await dropButton()
    return 'gone'
  }
  const presserIsBot = ctx.from?.is_bot === true
  const taken = p.taken_at !== null && p.taken_at !== undefined
  const age = Math.floor(Number(p.age_hours))
  if (!mayTake(age, taken, presserIsBot)) {
    if (presserIsBot) return 'refused'
    await dropButton()
    if (taken) return 'gone'
    await ctx.reply(
      say(
        isRu,
        `Предложение устарело. Если задача ещё нужна: /todo ${p.text}`,
        `That proposal is stale. If the task still stands: /todo ${p.text}`
      )
    )
    return 'stale'
  }
  const { rows: won } = await d.query(
    'UPDATE office_task_proposals SET taken_by = $2, taken_at = now() WHERE id = $1 AND taken_at IS NULL RETURNING id',
    [id, Number(ctx.from.id)]
  )
  if (!taskFromAnswer(won.length > 0)) {
    await dropButton()
    return 'gone'
  }
  const { rows: made } = await d.query(
    'INSERT INTO office_tasks (bot_username, chat_id, text, owner_id, owner_name, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [
      String(ctx.botInfo?.username ?? ''),
      Number(ctx.chat.id),
      p.text,
      null,
      p.owner_name,
      Number(ctx.from.id),
    ]
  )
  await dropButton()
  const by = speakerName(ctx.from)
  await ctx.reply(
    say(
      isRu,
      `Задача #${made[0].id} — ${p.owner_name}: ${p.text} (записал(а) ${by})`,
      `Task #${made[0].id} — ${p.owner_name}: ${p.text} (by ${by})`
    )
  )
  return 'taken'
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
  bot.action(/^otp:\d+$/, guard('take', takeProposal))
}
