/**
 * TRI DEV -- A MANAGED BOT THAT TAKES DEVELOPMENT TASKS FROM ITS OWNER.
 *
 * The package (agent-packages.ts, id 'tridev') is a bot of the buyer's own,
 * made through /mybot. It does not talk to clients: its owner sends `/task`
 * with a GitHub issue link or plain text, the task goes to the TRI DEV runner,
 * and the runner calls back with a pull request and a recording of the work at
 * t27.ai/term. Nobody but the owner can give it a task.
 *
 * The runner is NOT part of this repository. Its address is
 * TRI_DEV_DISPATCH_URL and its key TRI_DEV_DISPATCH_TOKEN; with no address the
 * owner is told plainly that the runner is not connected yet, and no task is
 * pretended to be taken. The key is sent in the Authorization header and is
 * never logged, never echoed, never stored.
 *
 * The jobs a bot sent are kept IN MEMORY, for /status only: a restart forgets
 * them. The runner's callback does not depend on that list -- it names the bot
 * and the chat, and it is checked against the bot's owner.
 */

import { randomUUID } from 'node:crypto'
import { logger } from '@/utils/logger'

export const TRI_DEV_PACKAGE = 'tridev'

/** The only place a cast may point to. */
export const TRI_DEV_CAST_PREFIX = 'https://t27.ai/term/'

const isRu = (language?: string) => (language ?? 'ru').startsWith('ru')

/** A cast link the owner may be sent: https://t27.ai/term/... and nothing else. */
export function isValidCastUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false
  if (!url.startsWith(TRI_DEV_CAST_PREFIX) || /\s/.test(url)) return false
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      u.hostname === 't27.ai' &&
      u.port === '' &&
      u.username === '' &&
      u.password === '' &&
      u.pathname.startsWith('/term/') &&
      u.pathname.length > '/term/'.length
    )
  } catch {
    return false
  }
}

const PR_URL =
  /^https:\/\/github\.com\/[\w.-]{1,100}\/[\w.-]{1,100}\/pull\/\d{1,10}$/

/** A pull request link the owner may be sent: a github.com PR and nothing else. */
export function isValidPrUrl(url: unknown): url is string {
  return typeof url === 'string' && PR_URL.test(url)
}

const ISSUE_URL =
  /https:\/\/github\.com\/([\w.-]{1,100})\/([\w.-]{1,100})\/issues\/(\d{1,10})/

export interface TriDevTask {
  task: string
  issueUrl?: string
  repo?: string
}

/** The words after /task, with the issue and its repository when one is linked. */
export function parseTaskCommand(text: string): TriDevTask | null {
  const task = text.replace(/^\/task(@\w+)?/i, '').trim()
  if (!task) return null
  if (task.length > 4000) return null
  const m = ISSUE_URL.exec(task)
  if (!m) return { task }
  return {
    task,
    issueUrl: `https://github.com/${m[1]}/${m[2]}/issues/${m[3]}`,
    repo: `${m[1]}/${m[2]}`,
  }
}

export type TriDevStatus =
  | 'sent'
  | 'accepted'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'

export const CALLBACK_STATUSES: readonly TriDevStatus[] = [
  'accepted',
  'running',
  'done',
  'failed',
  'cancelled',
]

export interface TriDevJob {
  jobId: string
  botId: number
  ownerId: number
  chatId: number
  task: string
  issueUrl?: string
  repo?: string
  language?: string
  status: TriDevStatus
  prUrl?: string
  castUrl?: string
  summary?: string
  at: number
  updatedAt: number
}

const JOBS_PER_BOT = 20
const jobs = new Map<number, TriDevJob[]>()

/** For tests: forget every job. */
export function clearTriDevJobs(): void {
  jobs.clear()
}

function remember(job: TriDevJob): void {
  const list = jobs.get(job.botId) ?? []
  list.unshift(job)
  jobs.set(job.botId, list.slice(0, JOBS_PER_BOT))
}

/** The most recent jobs of one bot, newest first. */
export function recentJobs(botId: number, limit = 5): TriDevJob[] {
  return (jobs.get(botId) ?? []).slice(0, limit)
}

/** Record what the runner reported; null when the job is not known here. */
export function updateJob(
  botId: number,
  jobId: string,
  patch: Partial<Pick<TriDevJob, 'status' | 'prUrl' | 'castUrl' | 'summary'>>,
  now = Date.now()
): TriDevJob | null {
  const job = (jobs.get(botId) ?? []).find(j => j.jobId === jobId)
  if (!job) return null
  Object.assign(job, patch, { updatedAt: now })
  return job
}

export interface DispatchConfig {
  url?: string
  token?: string
}

/** Where the runner is, read from the environment at the moment of use. */
export function dispatchConfig(
  env: Record<string, string | undefined> = process.env
): DispatchConfig {
  return {
    url: env.TRI_DEV_DISPATCH_URL?.trim() || undefined,
    token: env.TRI_DEV_DISPATCH_TOKEN?.trim() || undefined,
  }
}

export type DispatchResult =
  | { ok: true; job: TriDevJob }
  | { ok: false; reason: 'not-connected' | 'refused' | 'unreachable' }

export interface DispatchDeps {
  config?: DispatchConfig
  fetch?: typeof fetch
  now?: number
}

const JOB_ID = /^[\w.:-]{1,100}$/

/**
 * Hand one task to the runner: POST {url}/jobs with
 * {botId, ownerId, chatId, task, repo?, issueUrl?}.
 *
 * Fails closed: no address, or an address with no key, is "not connected" --
 * a task is never sent unauthenticated, and never reported as taken when it
 * was not.
 */
export async function dispatchTriDevTask(
  input: {
    botId: number
    ownerId: number
    chatId: number
    language?: string
  } & TriDevTask,
  deps: DispatchDeps = {}
): Promise<DispatchResult> {
  const config = deps.config ?? dispatchConfig()
  if (!config.url) return { ok: false, reason: 'not-connected' }
  if (!config.token) {
    logger.warn(
      '[tri-dev] TRI_DEV_DISPATCH_URL is set without TRI_DEV_DISPATCH_TOKEN; not dispatching'
    )
    return { ok: false, reason: 'not-connected' }
  }
  const body = {
    botId: input.botId,
    ownerId: input.ownerId,
    chatId: input.chatId,
    task: input.task,
    ...(input.repo ? { repo: input.repo } : {}),
    ...(input.issueUrl ? { issueUrl: input.issueUrl } : {}),
  }
  let response: Response
  try {
    response = await (deps.fetch ?? fetch)(
      `${config.url.replace(/\/+$/, '')}/jobs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }
    )
  } catch (error) {
    logger.warn('[tri-dev] runner unreachable', {
      bot: input.botId,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: 'unreachable' }
  }
  if (!response.ok) {
    logger.warn('[tri-dev] runner refused the task', {
      bot: input.botId,
      status: response.status,
    })
    return { ok: false, reason: 'refused' }
  }
  const answer = (await response.json().catch(() => ({}))) as {
    jobId?: unknown
  }
  const now = deps.now ?? Date.now()
  const job: TriDevJob = {
    jobId:
      typeof answer.jobId === 'string' && JOB_ID.test(answer.jobId)
        ? answer.jobId
        : `local-${randomUUID()}`,
    botId: input.botId,
    ownerId: input.ownerId,
    chatId: input.chatId,
    task: input.task,
    ...(input.issueUrl ? { issueUrl: input.issueUrl } : {}),
    ...(input.repo ? { repo: input.repo } : {}),
    ...(input.language ? { language: input.language } : {}),
    status: 'sent',
    at: now,
    updatedAt: now,
  }
  remember(job)
  logger.info('[tri-dev] task dispatched', {
    bot: input.botId,
    job: job.jobId,
    repo: input.repo ?? null,
  })
  return { ok: true, job }
}

export const TRI_DEV_COPY = {
  ru: {
    help: 'Я TRI DEV — агент-разработчик.\n\n/task <ссылка на задачу GitHub или текст> — дать задачу\n/status — последние задачи\n/help — эта справка\n\nЗа каждую задачу вы получите pull request и запись работы на t27.ai/term.',
    ownerOnly: 'Задачи этому боту даёт только его владелец.',
    usage:
      'Напишите задачу после /task: ссылку на задачу GitHub или текст. Например:\n/task https://github.com/owner/repo/issues/1',
    notConnected:
      'Исполнитель TRI DEV ещё не подключён, поэтому задачу я не принял. Как только его подключат, /task заработает.',
    refused:
      'Исполнитель TRI DEV не принял задачу. Попробуйте ещё раз чуть позже.',
    unreachable:
      'Исполнитель TRI DEV сейчас не отвечает, задача не отправлена. Попробуйте ещё раз чуть позже.',
    unpaid: (renew: string) =>
      `Оплаченный срок бота закончился, задачи не принимаются. Продлить: ${renew}`,
    accepted: (jobId: string) =>
      `Задача отправлена исполнителю ✅\nНомер: ${jobId}\nКогда будет результат, я пришлю pull request и запись работы.`,
    none: 'Задач пока не было.',
    statusTitle: 'Последние задачи (список хранится до перезапуска):',
    status: {
      sent: 'отправлена',
      accepted: 'принята',
      running: 'в работе',
      done: 'готова',
      failed: 'не удалась',
      cancelled: 'отменена',
    } as Record<TriDevStatus, string>,
    result: (status: string, summary?: string) =>
      `TRI DEV: задача ${status}.${summary ? `\n${summary}` : ''}`,
    pr: 'Pull request',
    cast: 'Запись работы',
  },
  en: {
    help: "I'm TRI DEV, a developer agent.\n\n/task <GitHub issue link or text> — give me a task\n/status — recent tasks\n/help — this help\n\nFor every task you get a pull request and a recording of the work at t27.ai/term.",
    ownerOnly: 'Only the owner of this bot can give it tasks.',
    usage:
      'Write the task after /task: a GitHub issue link or text. For example:\n/task https://github.com/owner/repo/issues/1',
    notConnected:
      'The TRI DEV runner is not connected yet, so I did not take the task. /task will work as soon as it is connected.',
    refused:
      'The TRI DEV runner did not take the task. Please try again later.',
    unreachable:
      'The TRI DEV runner is not answering; the task was not sent. Please try again later.',
    unpaid: (renew: string) =>
      `The bot's paid period is over, so it takes no tasks. Renew: ${renew}`,
    accepted: (jobId: string) =>
      `Task sent to the runner ✅\nJob: ${jobId}\nWhen it is done I'll send the pull request and the recording of the work.`,
    none: 'No tasks yet.',
    statusTitle: 'Recent tasks (kept until the next restart):',
    status: {
      sent: 'sent',
      accepted: 'accepted',
      running: 'running',
      done: 'done',
      failed: 'failed',
      cancelled: 'cancelled',
    } as Record<TriDevStatus, string>,
    result: (status: string, summary?: string) =>
      `TRI DEV: task ${status}.${summary ? `\n${summary}` : ''}`,
    pr: 'Pull request',
    cast: 'Recording',
  },
} as const

export const copyOf = (language?: string) =>
  isRu(language) ? TRI_DEV_COPY.ru : TRI_DEV_COPY.en

/** The /status text for one bot. */
export function statusText(botId: number, language?: string): string {
  const copy = copyOf(language)
  const list = recentJobs(botId)
  if (!list.length) return copy.none
  return [
    copy.statusTitle,
    ...list.map(j => {
      const links = [j.prUrl, j.castUrl].filter(Boolean).join(' ')
      return `• ${copy.status[j.status]} — ${j.task.slice(0, 80)}${links ? `\n  ${links}` : ''}`
    }),
  ].join('\n')
}

/** What the owner is told when the runner reports on a job. */
export function resultText(
  report: {
    status: TriDevStatus
    prUrl?: string
    castUrl?: string
    summary?: string
  },
  language?: string
): string {
  const copy = copyOf(language)
  return [
    copy.result(copy.status[report.status], report.summary?.slice(0, 1000)),
    report.prUrl ? `${copy.pr}: ${report.prUrl}` : null,
    report.castUrl ? `${copy.cast}: ${report.castUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export interface TriDevContext {
  botId: number
  ownerId: number
  fromId: number
  chatId: number
  language?: string
  text?: string
  /** Whether the bot's paid period (or trial) is running. */
  paid: boolean
  renewUrl: string
}

/**
 * One message to a TRI DEV bot, to the text that goes back. Never asks the
 * agent model: the bot is a task inbox for its owner, not a chat.
 */
export async function replyToTriDev(
  ctx: TriDevContext,
  deps: DispatchDeps = {}
): Promise<string> {
  const copy = copyOf(ctx.language)
  if (ctx.fromId !== ctx.ownerId) return copy.ownerOnly
  const text = ctx.text?.trim() ?? ''
  const command = /^\/(\w+)(@\w+)?/.exec(text)?.[1]?.toLowerCase()
  if (command === 'status') return statusText(ctx.botId, ctx.language)
  if (command !== 'task') return copy.help
  if (!ctx.paid) return copy.unpaid(ctx.renewUrl)
  const parsed = parseTaskCommand(text)
  if (!parsed) return copy.usage
  const sent = await dispatchTriDevTask(
    {
      botId: ctx.botId,
      ownerId: ctx.ownerId,
      chatId: ctx.chatId,
      language: ctx.language,
      ...parsed,
    },
    deps
  )
  if ('reason' in sent) {
    if (sent.reason === 'not-connected') return copy.notConnected
    return sent.reason === 'refused' ? copy.refused : copy.unreachable
  }
  return copy.accepted(sent.job.jobId)
}

/**
 * The TRI DEV bots running in this process: how to reach each one's owner.
 * The callback route sends through the bot itself -- the owner has written to
 * it, so it may write back.
 */
export interface TriDevBotHandle {
  ownerId: number
  send: (chatId: number, text: string) => Promise<unknown>
}

const triDevBots = new Map<number, TriDevBotHandle>()

export function registerTriDevBot(
  botId: number,
  handle: TriDevBotHandle
): void {
  triDevBots.set(botId, handle)
}

export function unregisterTriDevBot(botId: number): void {
  triDevBots.delete(botId)
}

export function triDevBot(botId: number): TriDevBotHandle | undefined {
  return triDevBots.get(botId)
}

/** For tests: forget every registered bot. */
export function clearTriDevBots(): void {
  triDevBots.clear()
}

/** The commands a TRI DEV bot shows in Telegram's menu, per language. */
export const TRI_DEV_COMMANDS = {
  ru: [
    {
      command: 'task',
      description: 'Дать задачу: ссылка на GitHub issue или текст',
    },
    { command: 'status', description: 'Последние задачи' },
    { command: 'help', description: 'Что умеет бот' },
  ],
  en: [
    {
      command: 'task',
      description: 'Give a task: a GitHub issue link or text',
    },
    { command: 'status', description: 'Recent tasks' },
    { command: 'help', description: 'What the bot does' },
  ],
} as const

export const TRI_DEV_DESCRIPTION = {
  ru: {
    description:
      'TRI DEV — агент-разработчик. Отправьте /task со ссылкой на задачу GitHub или текстом — получите pull request и запись работы на t27.ai/term. Задачи даёт только владелец бота.',
    short: 'Агент-разработчик: задача из GitHub → pull request',
  },
  en: {
    description:
      'TRI DEV is a developer agent. Send /task with a GitHub issue link or text and get back a pull request and a recording of the work at t27.ai/term. Only the bot owner can give it tasks.',
    short: 'Developer agent: GitHub issue → pull request',
  },
} as const
