/**
 * THE INNGEST FUNCTION CATALOGUE AS AGENT TOOLS -- KEEPER-ONLY.
 *
 * Owner, 2026-09-13: "add every function from <inngest>/functions to the
 * agent as tools". The self-hosted Inngest server holds two apps: `t27-queen`
 * (cron contracts and t27/trinity skills, ~59 functions) and
 * `telegram-bot-client` (the bot's workflows, ~55 functions incl. failure
 * handlers). That is more than a hundred functions, and the list changes with
 * every deploy.
 *
 * WHY FIVE TOOLS AND NOT A HUNDRED
 *
 * One tool per function would be a hundred tool schemas in every model turn
 * (the tool list is sent on each call, see `toOpenAITools`) and would be
 * stale the moment somebody registers a new cron. Instead the catalogue is
 * READ LIVE from the server (`inngest_functions`), and one tool invokes any
 * function by app + id (`inngest_invoke`). Runs are read and cancelled by id.
 * Every function is reachable; none is hard-coded.
 *
 * KEEPER-ONLY, LIKE `hive_queen`
 *
 * Function names carry file paths, line numbers and internal engineering
 * state; a run's output carries other people's telegram ids. The agent chat
 * is the same screen for a bot owner and an ordinary user, so the refusal
 * names the role (hive/roles.ts) rather than saying "forbidden".
 *
 * TRANSPORT
 *
 * REST API v2 (`/api/v2/...`) with `Authorization: Bearer INNGEST_SIGNING_KEY`
 * -- the server accepts the plain key or its sha256. The key comes from the
 * process env only; nothing here reads Railway or a token file. Without the
 * key the catalogue still lists functions through the dev GraphQL endpoint
 * (`/v0/gql`, which the server exposes unauthenticated), and every tool that
 * needs the key says so instead of returning an empty list: silence and
 * "nothing there" look identical and mean opposite things.
 *
 * GUARDED FUNCTIONS
 *
 * Invoking `broadcast/*` (a message to everybody), `payment/*` (credits
 * balances) or `training/*` / `model/*` (paid GPU minutes) from a chat turn is
 * one hallucinated argument away from real damage. Those are refused here and
 * pointed to the Inngest dashboard; the pattern is exported so a test can
 * pin it and the owner can widen it deliberately.
 */

import { visibilityOf } from '../hive/roles'
import { botsOwnedBy } from './hive-tools'
import type { AgentTool, ToolContext } from './tools'

export const DEFAULT_INNGEST_BASE_URL =
  'https://inngestinngest-production-c468.up.railway.app'

/** Event-name prefixes (and function-name words) that `inngest_invoke` refuses. */
export const GUARDED_TRIGGERS = /^(broadcast|payment|training|model)\//i
export const GUARDED_NAMES = /broadcast|payment|training/i

export function inngestBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.INNGEST_BASE_URL ||
    env.INNGEST_URL ||
    DEFAULT_INNGEST_BASE_URL
  ).replace(/\/+$/, '')
}

function signingKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.INNGEST_SIGNING_KEY || '').trim()
}

export type InngestTrigger = { type: 'EVENT' | 'CRON' | string; value: string }
export type InngestFunction = {
  id: string
  name: string
  slug?: string
  triggers: InngestTrigger[]
  is_failure_handler: boolean
}
export type InngestApp = {
  id: string
  name: string
  url?: string
  functions: InngestFunction[]
}

/** Which fetch to use -- injectable so tests never touch the network. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

export interface InngestDeps {
  fetch?: FetchLike
  env?: NodeJS.ProcessEnv
}

class InngestError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

const noKeyMessage =
  'INNGEST_SIGNING_KEY is not set on this service, so the Inngest REST API v2 ' +
  'answers 401. Set the variable (the same key the bot uses) and redeploy; ' +
  'until then only inngest_functions works, through the public dev GraphQL.'

async function restV2<T>(
  path: string,
  deps: InngestDeps,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const env = deps.env ?? process.env
  const key = signingKey(env)
  if (!key) throw new InngestError(noKeyMessage, 401)
  const f: FetchLike = deps.fetch ?? (fetch as unknown as FetchLike)
  const res = await f(`${inngestBaseUrl(env)}/api/v2${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init?.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new InngestError(
      `Inngest REST v2 ${init?.method ?? 'GET'} ${path} replied ${res.status}: ${text.slice(0, 300)}`,
      res.status
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new InngestError(`Inngest REST v2 ${path} returned non-JSON`)
  }
}

function markFunction(f: {
  id: string
  name: string
  slug?: string
  triggers?: InngestTrigger[]
}): InngestFunction {
  return {
    id: f.id,
    name: f.name,
    ...(f.slug ? { slug: f.slug } : {}),
    triggers: f.triggers ?? [],
    is_failure_handler:
      /\(failure\)\s*$/i.test(f.name) ||
      (f.triggers ?? []).some(t => t.value === 'inngest/function.failed'),
  }
}

/**
 * The catalogue through the dev GraphQL: the same query the dashboard's
 * /functions page runs. Public on the server as deployed (measured
 * 2026-09-13); listed here as the no-key fallback, not as a recommendation.
 */
export async function listFunctionsGql(
  deps: InngestDeps = {}
): Promise<InngestApp[]> {
  const env = deps.env ?? process.env
  const f: FetchLike = deps.fetch ?? (fetch as unknown as FetchLike)
  const res = await f(`${inngestBaseUrl(env)}/v0/gql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        '{ apps { id name url functions { id name slug triggers { type value } } } }',
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new InngestError(`Inngest /v0/gql replied ${res.status}`, res.status)
  }
  const body = JSON.parse(text) as {
    data?: { apps?: Array<InngestApp & { functions: InngestFunction[] }> }
    errors?: Array<{ message: string }>
  }
  if (body.errors?.length) {
    throw new InngestError(`Inngest /v0/gql: ${body.errors[0].message}`)
  }
  return (body.data?.apps ?? []).map(a => ({
    id: a.id,
    name: a.name,
    ...(a.url ? { url: a.url } : {}),
    functions: (a.functions ?? []).map(markFunction),
  }))
}

/**
 * REST v2 envelope: `data`, `metadata` (fetched_at) and `page`
 * ({has_more, cursor, limit}). Protobuf JSON may spell the page fields in
 * either case, so both are read (pkg/api/v2/endpoints_runs.go `runsPage`).
 */
type V2Page = {
  has_more?: boolean
  hasMore?: boolean
  cursor?: string
  limit?: number
}
type V2List<T> = {
  data: T[]
  page?: V2Page
  metadata?: Record<string, unknown>
}

function pageOf(list: V2List<unknown>): { has_more: boolean; cursor?: string } {
  const p = list.page ?? {}
  const more = p.has_more === true || p.hasMore === true
  return { has_more: more, ...(more && p.cursor ? { cursor: p.cursor } : {}) }
}

/** The catalogue through REST v2 (needs the key). App ids are the user-defined ones. */
export async function listFunctionsRest(
  deps: InngestDeps = {}
): Promise<InngestApp[]> {
  const apps = await restV2<
    V2List<{ id: string; name?: string; url?: string }>
  >('/apps?limit=100', deps)
  const out: InngestApp[] = []
  for (const a of apps.data ?? []) {
    const fns: InngestFunction[] = []
    let cursor: string | undefined
    do {
      const page = await restV2<
        V2List<{
          id: string
          name: string
          slug?: string
          triggers?: InngestTrigger[]
        }>
      >(
        `/apps/${encodeURIComponent(a.id)}/functions?limit=100` +
          (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
        deps
      )
      fns.push(...(page.data ?? []).map(markFunction))
      cursor = pageOf(page).cursor
    } while (cursor)
    out.push({
      id: a.id,
      name: a.name ?? a.id,
      ...(a.url ? { url: a.url } : {}),
      functions: fns,
    })
  }
  return out
}

/** REST when the key is there, GraphQL otherwise; says which one it used. */
export async function listFunctions(
  deps: InngestDeps = {}
): Promise<{ source: 'rest' | 'gql'; apps: InngestApp[] }> {
  const env = deps.env ?? process.env
  // With a key configured there is no fallback: a wrong key must not
  // silently degrade into the public listing, or the owner reads "works"
  // and never learns the key is wrong.
  if (signingKey(env)) {
    return { source: 'rest', apps: await listFunctionsRest(deps) }
  }
  return { source: 'gql', apps: await listFunctionsGql(deps) }
}

export function filterCatalogue(
  apps: InngestApp[],
  opts: { app?: string; match?: string; include_failure_handlers?: boolean }
): InngestApp[] {
  const needle = (opts.match || '').trim().toLowerCase()
  const appNeedle = (opts.app || '').trim().toLowerCase()
  return apps
    .filter(
      a =>
        !appNeedle ||
        a.id.toLowerCase() === appNeedle ||
        a.name.toLowerCase() === appNeedle
    )
    .map(a => ({
      ...a,
      functions: a.functions.filter(f => {
        if (!opts.include_failure_handlers && f.is_failure_handler) return false
        if (!needle) return true
        const hay = [
          f.id,
          f.name,
          f.slug ?? '',
          ...f.triggers.map(t => t.value),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      }),
    }))
}

export function isGuarded(
  f: Pick<InngestFunction, 'name' | 'triggers'>
): boolean {
  return (
    GUARDED_NAMES.test(f.name) ||
    f.triggers.some(t => t.type === 'EVENT' && GUARDED_TRIGGERS.test(t.value))
  )
}

async function requireKeeper(ctx?: ToolContext, what = 'Функции Inngest') {
  const who = ctx ? String(ctx.telegramId ?? '') : ''
  if (!who) {
    throw new Error(`${what} требуют подтверждённой личности вызывающего`)
  }
  const v = await visibilityOf(who, { botsOwnedBy })
  if (v.role !== 'keeper') {
    throw new Error(
      `${what} — внутреннее состояние платформы (пути файлов, задачи, ` +
        'чужие запуски), и это видно только смотрителю улья.'
    )
  }
}

/** Resolve "app + function" the way a person types it: id, slug or exact name. */
async function resolveFunction(
  app: string,
  fn: string,
  deps: InngestDeps
): Promise<{ app: InngestApp; fn: InngestFunction }> {
  const { apps } = await listFunctions(deps)
  const a = apps.find(
    x =>
      x.id.toLowerCase() === app.trim().toLowerCase() ||
      x.name.toLowerCase() === app.trim().toLowerCase()
  )
  if (!a) {
    throw new Error(
      `Приложение «${app}» не найдено. Есть: ${apps.map(x => x.name).join(', ')}`
    )
  }
  const q = fn.trim().toLowerCase()
  const prefix = `${a.id.toLowerCase()}-`
  const f = a.functions.find(
    x =>
      x.id.toLowerCase() === q ||
      (x.slug ?? '').toLowerCase() === q ||
      (x.slug ?? '').toLowerCase() === prefix + q ||
      x.name.toLowerCase() === q ||
      x.triggers.some(t => t.type === 'EVENT' && t.value.toLowerCase() === q)
  )
  if (!f) {
    throw new Error(
      `Функция «${fn}» не найдена в ${a.name}. Позовите inngest_functions с match, чтобы найти id.`
    )
  }
  return { app: a, fn: f }
}

export function makeInngestTools(deps: InngestDeps = {}): AgentTool[] {
  return [
    {
      name: 'inngest_functions',
      description:
        'КАТАЛОГ ФУНКЦИЙ INNGEST (живой, с сервера): оба приложения — t27-queen ' +
        '(cron-контракты и t27/trinity-скилы) и telegram-bot-client (воркфлоу ' +
        'бота). У каждой функции id, имя и триггеры (событие или cron). ' +
        'Без аргументов — всё без обработчиков падений; match — подстрока по ' +
        'имени/id/событию; app — только одно приложение. Только смотритель. Бесплатно.',
      parameters: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
            description:
              'id или имя приложения (t27-queen, telegram-bot-client)',
          },
          match: {
            type: 'string',
            description: 'подстрока: skill/, cron/, render, crm …',
          },
          include_failure_handlers: {
            type: 'boolean',
            description: 'показать и «(failure)»-обработчики; по умолчанию нет',
          },
        },
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireKeeper(ctx)
        const { source, apps } = await listFunctions(deps)
        const shown = filterCatalogue(apps, {
          app: a?.app,
          match: a?.match,
          include_failure_handlers: a?.include_failure_handlers === true,
        })
        const total = apps.reduce((n, x) => n + x.functions.length, 0)
        return {
          base: inngestBaseUrl(deps.env),
          source,
          total_functions: total,
          shown: shown.reduce((n, x) => n + x.functions.length, 0),
          apps: shown.map(x => ({
            id: x.id,
            name: x.name,
            url: x.url,
            functions: x.functions.map(f => ({
              id: f.id,
              name: f.name,
              slug: f.slug,
              triggers: f.triggers.map(t => `${t.type}:${t.value}`),
              guarded: isGuarded(f),
            })),
          })),
          how_to_read:
            'source=gql — ключа INNGEST_SIGNING_KEY на этом сервисе нет, каталог ' +
            'прочитан через публичный dev-GraphQL; запуски и вызовы так не работают. ' +
            'guarded=true — вызов из чата запрещён (рассылка, платежи, обучение).',
        }
      },
    },
    {
      name: 'inngest_runs',
      description:
        'ЗАПУСКИ INNGEST: последние прогоны — всего сервера или одной функции ' +
        '(app + function), с фильтром по статусу (QUEUED, RUNNING, COMPLETED, ' +
        'FAILED, CANCELLED). Только смотритель. Бесплатно.',
      parameters: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
            description: 'id приложения; вместе с function',
          },
          function: { type: 'string', description: 'id/slug/имя функции' },
          status: {
            type: 'string',
            description:
              'QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED, можно несколько через запятую',
          },
          limit: { type: 'number', description: 'сколько, по умолчанию 20' },
        },
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireKeeper(ctx, 'Запуски Inngest')
        const limit = Math.min(Math.max(Number(a?.limit) || 20, 1), 100)
        const qs = new URLSearchParams({ limit: String(limit), order: 'DESC' })
        // The server accepts QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED, upper-case
        // (endpoints_runs.go runStatusesFromAPI); people type them lower-case.
        for (const st of String(a?.status ?? '')
          .split(/[,\s]+/)
          .filter(Boolean)) {
          qs.append('status', st.toUpperCase())
        }
        let path = `/runs?${qs}`
        if (a?.app && a?.function) {
          const { app, fn } = await resolveFunction(a.app, a.function, deps)
          path = `/apps/${encodeURIComponent(app.id)}/functions/${encodeURIComponent(fn.id)}/runs?${qs}`
        }
        const page = await restV2<V2List<Record<string, unknown>>>(path, deps)
        return { runs: page.data ?? [], ...pageOf(page) }
      },
    },
    {
      name: 'inngest_run',
      description:
        'ОДИН ЗАПУСК INNGEST по run_id: статус, вывод и (trace=true) шаги с ' +
        'ошибками. Только смотритель. Бесплатно.',
      parameters: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'id запуска (ULID)' },
          trace: { type: 'boolean', description: 'добавить трассу шагов' },
        },
        required: ['run_id'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireKeeper(ctx, 'Запуски Inngest')
        const id = encodeURIComponent(String(a?.run_id ?? '').trim())
        if (!id) throw new Error('run_id пуст')
        const run = await restV2<unknown>(
          `/runs/${id}?includeOutput=true`,
          deps
        )
        const trace =
          a?.trace === true
            ? await restV2<unknown>(
                `/runs/${id}/trace?includeOutput=true`,
                deps
              )
            : undefined
        return { run, ...(trace !== undefined ? { trace } : {}) }
      },
    },
    {
      name: 'inngest_invoke',
      description:
        'ЗАПУСТИТЬ ФУНКЦИЮ INNGEST: любую из каталога по app + function (id, slug ' +
        'или событие) с JSON-данными события. Так дёргают t27/trinity-скилы ' +
        '(skill/…/*.run) и cron-контракты (cron/…/*.tick) вне расписания. ' +
        'Рассылки, платежи и обучение моделей отсюда НЕ запускаются (guarded). ' +
        'Только смотритель. Бесплатно для нас; функция может тратить своё.',
      parameters: {
        type: 'object',
        properties: {
          app: { type: 'string', description: 'id приложения' },
          function: {
            type: 'string',
            description: 'id/slug/имя функции или её событие',
          },
          data: {
            type: 'object',
            description: 'данные события (event.data), по умолчанию {}',
            additionalProperties: true,
          },
        },
        required: ['app', 'function'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireKeeper(ctx, 'Вызовы функций Inngest')
        const { app, fn } = await resolveFunction(
          String(a.app),
          String(a.function),
          deps
        )
        if (isGuarded(fn)) {
          return {
            invoked: false,
            function: fn.name,
            why:
              'Эта функция рассылает, списывает или обучает — из чата её не ' +
              'запускаем. Запуск только из панели Inngest руками владельца.',
            dashboard: `${inngestBaseUrl(deps.env)}/functions`,
          }
        }
        const data =
          a?.data && typeof a.data === 'object' && !Array.isArray(a.data)
            ? a.data
            : {}
        const res = await restV2<Record<string, unknown>>(
          `/apps/${encodeURIComponent(app.id)}/functions/${encodeURIComponent(fn.id)}/invoke`,
          deps,
          { method: 'POST', body: { data } }
        )
        const d = (res.data ?? {}) as Record<string, unknown>
        return {
          invoked: true,
          app: app.name,
          function: fn.name,
          run_id: d.run_id ?? d.runId,
          result: res,
          how_to_read:
            'Вызов принят сервером; это не значит, что функция завершилась. ' +
            'Статус — inngest_run по run_id.',
        }
      },
    },
    {
      name: 'inngest_cancel',
      description:
        'ОТМЕНИТЬ ЗАПУСК INNGEST по run_id. Только смотритель. Бесплатно.',
      parameters: {
        type: 'object',
        properties: { run_id: { type: 'string', description: 'id запуска' } },
        required: ['run_id'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireKeeper(ctx, 'Запуски Inngest')
        const id = encodeURIComponent(String(a?.run_id ?? '').trim())
        if (!id) throw new Error('run_id пуст')
        const res = await restV2<unknown>(`/runs/${id}/cancel`, deps, {
          method: 'POST',
          body: {},
        })
        return { cancelled: true, run_id: a.run_id, result: res }
      },
    },
  ]
}

export const INNGEST_TOOLS: AgentTool[] = makeInngestTools()
