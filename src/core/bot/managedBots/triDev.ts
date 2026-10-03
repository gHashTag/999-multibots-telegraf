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
 *
 * The bot also serves the club's services to its owner (2026-10-03):
 *   /task     a development task           -> runner job {kind: 'task'}
 *   /bench    an RTL design on a live board -> runner job {kind: 'bench'}
 *   /teardown the latest teardown of published numbers (TRI_DEV_TEARDOWN_URLS,
 *             else the blog index -- never an invented link)
 *   /early    the private club channel (TRI_DEV_CLUB_CHANNEL_URL, else "not
 *             configured")
 *   /flow     the open toolchain, static text
 * Every runner job has one generic shape: {kind, botId, ownerId, chatId, ...}.
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

export type TriDevJobKind = 'task' | 'bench'

/**
 * Where a design for /bench may live: public code hosts the runner can clone
 * or fetch from. Anything else is refused before it is sent.
 */
const BENCH_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'gitlab.com',
  'codeberg.org',
])

/** An https link to a repository or a file on a public code host. */
export function isValidBenchUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500 || /\s/.test(url))
    return false
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      BENCH_HOSTS.has(u.hostname) &&
      u.port === '' &&
      u.username === '' &&
      u.password === '' &&
      u.pathname.split('/').filter(Boolean).length >= 2
    )
  } catch {
    return false
  }
}

export interface TriDevBench {
  target: string
  repo?: string
  note?: string
}

const GITHUB_REPO = /^https:\/\/github\.com\/([\w.-]{1,100})\/([\w.-]{1,100})/

/** /bench <RTL repo or file link> [what to measure]. */
export function parseBenchCommand(text: string): TriDevBench | null {
  const rest = text.replace(/^\/bench(@\w+)?/i, '').trim()
  if (!rest || rest.length > 4000) return null
  const [target, ...words] = rest.split(/\s+/)
  if (!isValidBenchUrl(target)) return null
  const m = GITHUB_REPO.exec(target)
  const note = words.join(' ').trim()
  return {
    target,
    ...(m ? { repo: `${m[1]}/${m[2].replace(/\.git$/, '')}` } : {}),
    ...(note ? { note } : {}),
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
  kind: TriDevJobKind
  botId: number
  ownerId: number
  chatId: number
  /** What was asked: the task text, or the design link of a bench run. */
  task: string
  issueUrl?: string
  repo?: string
  language?: string
  status: TriDevStatus
  prUrl?: string
  castUrl?: string
  summary?: string
  measurement?: string
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
  patch: Partial<
    Pick<TriDevJob, 'status' | 'prUrl' | 'castUrl' | 'summary' | 'measurement'>
  >,
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
  /** Where /teardown and /early read their links; process.env by default. */
  env?: Record<string, string | undefined>
}

/** One job for the runner. The payload past `kind` depends on the kind. */
export type TriDevJobInput = {
  botId: number
  ownerId: number
  chatId: number
  language?: string
} & (({ kind: 'task' } & TriDevTask) | ({ kind: 'bench' } & TriDevBench))

const JOB_ID = /^[\w.:-]{1,100}$/

/**
 * Hand one job to the runner: POST {url}/jobs with the generic shape
 *   {kind: 'task', botId, ownerId, chatId, task, repo?, issueUrl?}
 *   {kind: 'bench', botId, ownerId, chatId, target, repo?, note?}
 *
 * Fails closed: no address, or an address with no key, is "not connected" --
 * a job is never sent unauthenticated, and never reported as taken when it
 * was not.
 */
export async function dispatchTriDevJob(
  input: TriDevJobInput,
  deps: DispatchDeps = {}
): Promise<DispatchResult> {
  const config = deps.config ?? dispatchConfig(deps.env)
  if (!config.url) return { ok: false, reason: 'not-connected' }
  if (!config.token) {
    logger.warn(
      '[tri-dev] TRI_DEV_DISPATCH_URL is set without TRI_DEV_DISPATCH_TOKEN; not dispatching'
    )
    return { ok: false, reason: 'not-connected' }
  }
  const who = {
    kind: input.kind,
    botId: input.botId,
    ownerId: input.ownerId,
    chatId: input.chatId,
  }
  const body =
    input.kind === 'bench'
      ? {
          ...who,
          target: input.target,
          ...(input.repo ? { repo: input.repo } : {}),
          ...(input.note ? { note: input.note } : {}),
        }
      : {
          ...who,
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
      kind: input.kind,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: 'unreachable' }
  }
  if (!response.ok) {
    logger.warn('[tri-dev] runner refused the job', {
      bot: input.botId,
      kind: input.kind,
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
    kind: input.kind,
    botId: input.botId,
    ownerId: input.ownerId,
    chatId: input.chatId,
    task: input.kind === 'bench' ? input.target : input.task,
    ...(input.kind === 'task' && input.issueUrl
      ? { issueUrl: input.issueUrl }
      : {}),
    ...(input.repo ? { repo: input.repo } : {}),
    ...(input.language ? { language: input.language } : {}),
    status: 'sent',
    at: now,
    updatedAt: now,
  }
  remember(job)
  logger.info('[tri-dev] job dispatched', {
    bot: input.botId,
    kind: input.kind,
    job: job.jobId,
    repo: input.repo ?? null,
  })
  return { ok: true, job }
}

/** The blog index: where teardowns are published when no list is configured. */
export const TRI_DEV_BLOG_URL = 'https://t27.ai/#/blog'

const isHttpsUrl = (url: string): boolean => {
  if (url.length > 500 || /\s/.test(url)) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

/**
 * The latest teardown: the first https link of TRI_DEV_TEARDOWN_URLS
 * (comma-separated, newest first), or null when none is configured -- then the
 * owner is pointed at the blog index, not at a made-up article.
 */
export function latestTeardownUrl(
  env: Record<string, string | undefined> = process.env
): string | null {
  const list = (env.TRI_DEV_TEARDOWN_URLS ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)
  return list.find(isHttpsUrl) ?? null
}

/**
 * The private club channel: TRI_DEV_CLUB_CHANNEL_URL when it is a t.me link,
 * else null ("not configured"). The link is never logged.
 */
export function clubChannelUrl(
  env: Record<string, string | undefined> = process.env
): string | null {
  const url = env.TRI_DEV_CLUB_CHANNEL_URL?.trim()
  if (!url) return null
  try {
    const u = new URL(url)
    if (
      isHttpsUrl(url) &&
      u.hostname === 't.me' &&
      u.port === '' &&
      u.pathname.length > 1
    )
      return url
  } catch {
    // falls through to the warning
  }
  logger.warn('[tri-dev] TRI_DEV_CLUB_CHANNEL_URL is not a https://t.me link')
  return null
}

export const TRI_DEV_COPY = {
  ru: {
    help: 'Я TRI DEV — агент-разработчик.\n\n/task <ссылка на задачу GitHub или текст> — дать задачу\n/bench <ссылка на RTL: репозиторий или файл> — свой стенд: прогон на живой плате Artix-7\n/teardown — последний разбор опубликованных цифр\n/early — право первым проверить: закрытый канал клуба\n/flow — открытый маршрут без Vivado\n/status — последние задачи\n/help — эта справка\n\nЗа задачу вы получите pull request, за прогон — измерение; к обоим — запись работы на t27.ai/term.',
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
    benchUsage:
      'Пришлите ссылку на RTL после /bench: репозиторий или файл на GitHub, GitLab или Codeberg. Например:\n/bench https://github.com/owner/repo',
    benchAccepted: (jobId: string) =>
      `Прогон на плате отправлен ✅\nНомер: ${jobId}\nКогда плата отработает, я пришлю измерение и запись работы.`,
    teardown: (url: string) => `Последний разбор опубликованных цифр: ${url}`,
    teardownIndex: (url: string) =>
      `Отдельная ссылка на последний разбор не настроена. Все разборы опубликованных цифр — в блоге: ${url}`,
    early: (url: string) =>
      `Право первым проверить — в закрытом канале клуба: ${url}`,
    earlyNotConfigured:
      'Закрытый канал клуба ещё не настроен. Как только его подключат, /early пришлёт ссылку.',
    flow: 'Открытый маршрут, без Vivado: yosys (синтез) → nextpnr-xilinx (размещение и трассировка) → prjxray (битстрим) → openFPGALoader (прошивка). Всё открыто и повторяемо: каждый шаг можно запустить заново и получить тот же результат.',
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
    benchResult: (status: string, summary?: string) =>
      `TRI DEV: прогон на плате — ${status}.${summary ? `\n${summary}` : ''}`,
    pr: 'Pull request',
    measurement: 'Измерение',
    cast: 'Запись работы',
  },
  en: {
    help: "I'm TRI DEV, a developer agent.\n\n/task <GitHub issue link or text> — give me a task\n/bench <RTL link: a repository or a file> — your own bench: a run on a live Artix-7 board\n/teardown — the latest teardown of published numbers\n/early — first right to check: the private club channel\n/flow — the open flow, no Vivado\n/status — recent tasks\n/help — this help\n\nA task gets you a pull request, a bench run a measurement; both come with a recording of the work at t27.ai/term.",
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
    benchUsage:
      'Send an RTL link after /bench: a repository or a file on GitHub, GitLab or Codeberg. For example:\n/bench https://github.com/owner/repo',
    benchAccepted: (jobId: string) =>
      `Board run sent ✅\nJob: ${jobId}\nWhen the board is done I'll send the measurement and the recording of the work.`,
    teardown: (url: string) =>
      `The latest teardown of published numbers: ${url}`,
    teardownIndex: (url: string) =>
      `No link to the latest teardown is configured. All the teardowns of published numbers are on the blog: ${url}`,
    early: (url: string) =>
      `First right to check is in the private club channel: ${url}`,
    earlyNotConfigured:
      'The private club channel is not configured yet. /early will send the link as soon as it is.',
    flow: 'The open flow, no Vivado: yosys (synthesis) → nextpnr-xilinx (place and route) → prjxray (bitstream) → openFPGALoader (programming). All open and repeatable: every step can be run again for the same result.',
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
    benchResult: (status: string, summary?: string) =>
      `TRI DEV: board run ${status}.${summary ? `\n${summary}` : ''}`,
    pr: 'Pull request',
    measurement: 'Measurement',
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
    kind?: TriDevJobKind
    prUrl?: string
    castUrl?: string
    summary?: string
    measurement?: string
  },
  language?: string
): string {
  const copy = copyOf(language)
  const head = report.kind === 'bench' ? copy.benchResult : copy.result
  return [
    head(copy.status[report.status], report.summary?.slice(0, 1000)),
    report.measurement
      ? `${copy.measurement}: ${report.measurement.slice(0, 1000)}`
      : null,
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
 * agent model: the bot is its owner's inbox for the club's services, not a
 * chat. /teardown and /flow are public facts; /task, /bench and /early are
 * what the subscription pays for, so they need a running paid period.
 */
export async function replyToTriDev(
  ctx: TriDevContext,
  deps: DispatchDeps = {}
): Promise<string> {
  const copy = copyOf(ctx.language)
  if (ctx.fromId !== ctx.ownerId) return copy.ownerOnly
  const text = ctx.text?.trim() ?? ''
  const command = /^\/(\w+)(@\w+)?/.exec(text)?.[1]?.toLowerCase()
  const env = deps.env ?? process.env
  switch (command) {
    case 'status':
      return statusText(ctx.botId, ctx.language)
    case 'flow':
      return copy.flow
    case 'teardown': {
      const url = latestTeardownUrl(env)
      return url ? copy.teardown(url) : copy.teardownIndex(TRI_DEV_BLOG_URL)
    }
    case 'early': {
      if (!ctx.paid) return copy.unpaid(ctx.renewUrl)
      const url = clubChannelUrl(env)
      return url ? copy.early(url) : copy.earlyNotConfigured
    }
    case 'task':
    case 'bench':
      break
    default:
      return copy.help
  }
  if (!ctx.paid) return copy.unpaid(ctx.renewUrl)
  const who = {
    botId: ctx.botId,
    ownerId: ctx.ownerId,
    chatId: ctx.chatId,
    language: ctx.language,
  }
  let input: TriDevJobInput
  if (command === 'bench') {
    const bench = parseBenchCommand(text)
    if (!bench) return copy.benchUsage
    input = { ...who, kind: 'bench', ...bench }
  } else {
    const task = parseTaskCommand(text)
    if (!task) return copy.usage
    input = { ...who, kind: 'task', ...task }
  }
  const sent = await dispatchTriDevJob(input, deps)
  if ('reason' in sent) {
    if (sent.reason === 'not-connected') return copy.notConnected
    return sent.reason === 'refused' ? copy.refused : copy.unreachable
  }
  return input.kind === 'bench'
    ? copy.benchAccepted(sent.job.jobId)
    : copy.accepted(sent.job.jobId)
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
    {
      command: 'bench',
      description: 'Свой стенд: RTL на живой плате Artix-7',
    },
    { command: 'teardown', description: 'Разбор опубликованных цифр' },
    { command: 'early', description: 'Право первым проверить: канал клуба' },
    { command: 'flow', description: 'Открытый маршрут без Vivado' },
    { command: 'status', description: 'Последние задачи' },
    { command: 'help', description: 'Что умеет бот' },
  ],
  en: [
    {
      command: 'task',
      description: 'Give a task: a GitHub issue link or text',
    },
    {
      command: 'bench',
      description: 'Your own bench: RTL on a live Artix-7 board',
    },
    { command: 'teardown', description: 'Teardowns of published numbers' },
    { command: 'early', description: 'First right to check: the club channel' },
    { command: 'flow', description: 'The open flow, no Vivado' },
    { command: 'status', description: 'Recent tasks' },
    { command: 'help', description: 'What the bot does' },
  ],
} as const

export const TRI_DEV_DESCRIPTION = {
  ru: {
    description:
      'TRI DEV — агент-разработчик и услуги клуба. /task — задача из GitHub → pull request; /bench — ваш RTL на живой плате Artix-7 → измерение; к обоим — запись работы на t27.ai/term. Плюс разборы опубликованных цифр, закрытый канал клуба и открытый маршрут без Vivado. Команды даёт только владелец бота.',
    short: 'Агент-разработчик: задача из GitHub → pull request',
  },
  en: {
    description:
      'TRI DEV is a developer agent and the club services. /task: a GitHub issue to a pull request; /bench: your RTL on a live Artix-7 board to a measurement; both come with a recording at t27.ai/term. Plus teardowns of published numbers, the private club channel and the open flow with no Vivado. Only the bot owner can use it.',
    short: 'Developer agent: GitHub issue → pull request',
  },
} as const
