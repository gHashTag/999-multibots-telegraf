import {
  KIE_ENDPOINT,
  KIE_MODELS,
  состояниеИзОтвета,
  type KieModel,
} from './kie-models'

/**
 * Submitting a real KieAI job — the part that DOES cost money.
 *
 * Everything in kie-models.ts was discovered with empty payloads that KieAI
 * rejects before billing. This module is the opposite: it sends a complete
 * request, and a complete request creates a job and spends credits.
 *
 * So the guards below are not defensive habit, they are the point:
 *
 *   a paused or unknown model never reaches the network — the provider would
 *   charge nothing but the caller would wait for a result that cannot come;
 *
 *   a request missing a field the model declared is refused HERE, by us, using
 *   the contract the API itself stated during probing. Letting it through would
 *   spend the call to be told what we already knew.
 *
 * Both checks are free. The request they prevent is not.
 */

// ПРОВЕРЕНО ЖИВЫМ ЗАПРОСОМ: адрес состояния — recordInfo. По taskStatus
// KieAI отвечает 404, то есть опрос НИКОГДА не увидел бы готовое задание:
// цикл крутился бы до таймаута на успешно созданной работе, за которую уже
// заплачено. Найдено при первом же настоящем прогоне липсинка.
const СТАТУС = 'https://api.kie.ai/api/v1/jobs/recordInfo'

export interface ЗапускРезультат {
  taskId?: string
  /** Why nothing was sent. Present exactly when taskId is absent. */
  отказ?: string
  /** Whose word the refusal is: ours before the call, or KieAI's after it. */
  чейОтказ?: 'наш' | 'kie'
}

export function модельПоId(id: string): KieModel | undefined {
  return KIE_MODELS.find(m => m.id === id)
}

/**
 * Checks a request against the model's own declared contract.
 *
 * Returns the reason, or null when the request may go. The field names come
 * from what KieAI itself demanded during probing, so this cannot drift into
 * inventing requirements the API does not have.
 */
export function чегоНеХватает(
  m: KieModel,
  input: Record<string, unknown>
): string | null {
  if (m.state === 'paused') {
    return `«${m.title}» приостановлена у провайдера — запрос не отправлен, кредиты не потрачены.`
  }
  if (m.state === 'unknown') {
    return `KieAI не знает модель «${m.id}».`
  }
  const нет = m.needs.filter(п => {
    const v = input[п]
    return (
      v === undefined ||
      v === null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0)
    )
  })
  if (нет.length > 0) {
    return `Не хватает: ${нет.join(', ')}. Это требование самой модели — запрос не отправлен.`
  }
  return null
}

/**
 * Sends a real job. Spends credits when it returns a taskId.
 *
 * `чейОтказ` matters more than it looks: a refusal of ours means nothing was
 * charged and the caller should fix the request, while a refusal from KieAI
 * means the call happened. Collapsing the two would make it impossible to tell
 * a wasted call from a prevented one.
 */
export async function запустить(
  modelId: string,
  input: Record<string, unknown>,
  ключ = process.env.KIE_AI_API_KEY
): Promise<ЗапускРезультат> {
  const m = модельПоId(modelId)
  if (!m) {
    return { отказ: `Модель «${modelId}» не в реестре.`, чейОтказ: 'наш' }
  }
  if (!ключ) {
    /**
     * Состояние сервиса, а не сбой запроса, и названо так же.
     *
     * Осторожно с вызовом: значение по умолчанию читает окружение, поэтому
     * передать `undefined` — НЕ способ сказать «ключа нет»: подставится
     * переменная. Отсутствие выражается пустой строкой. Тест на это ловил
     * ровно эту разницу и был прав.
     */
    return { отказ: 'KIE_AI_API_KEY не задан.', чейОтказ: 'наш' }
  }

  const мешает = чегоНеХватает(m, input)
  if (мешает) return { отказ: мешает, чейОтказ: 'наш' }

  const fetchResponse = await fetch(KIE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ключ}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: m.id, input }),
  })
  const responseJson = (await fetchResponse.json()) as {
    code?: number
    msg?: string
    data?: { taskId?: string }
  }

  if (responseJson.data?.taskId) return { taskId: responseJson.data.taskId }

  // Если KieAI отказал — передаём ЕГО слово целиком. Пересказ («ошибка
  // генерации») лишил бы читателя того единственного, что различает паузу,
  // нехватку поля и неизвестное имя: они приходят под одним кодом.
  return {
    ['отказ']: responseJson.msg ?? 'KieAI ответил без сообщения',
    чейОтказ: 'kie',
  }
}

/** Проверить готовность задания. Опрос не тратит кредиты. */
export async function состояниеЗадания(
  taskId: string,
  ключ = process.env.KIE_AI_API_KEY
): Promise<{
  готово: boolean
  url?: string
  отказ?: string
  /** Kie's own failure code (`failCode`), as a string, when it gave one. */
  failCode?: string
}> {
  if (!ключ) return { готово: false, отказ: 'KIE_AI_API_KEY не задан.' }
  const fetchResponse = await fetch(
    `${СТАТУС}?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${ключ}` } }
  )
  const responseJson = (await fetchResponse.json()) as {
    msg?: string
    data?: {
      state?: string
      resultUrls?: string[]
      resultJson?: string
      failMsg?: string
      failCode?: string | number | null
    }
  }
  let resultJsonUrls: string[] = []
  if (responseJson.data?.resultJson) {
    try {
      const parsed = JSON.parse(responseJson.data.resultJson) as {
        resultUrls?: unknown
      }
      if (Array.isArray(parsed.resultUrls)) {
        resultJsonUrls = parsed.resultUrls.filter(
          (value): value is string => typeof value === 'string'
        )
      }
    } catch {
      // A malformed provider payload is not success; polling can continue.
    }
  }
  const url = responseJson.data?.resultUrls?.[0] ?? resultJsonUrls[0]
  if (url) return { готово: true, url } // cyrillic-ok
  if (
    responseJson.data?.state === 'fail' ||
    responseJson.data?.state === 'failed'
  ) {
    const failCode = responseJson.data.failCode
    return {
      готово: false, // cyrillic-ok
      ['отказ']:
        responseJson.data.failMsg ?? responseJson.msg ?? 'задание не выполнено',
      ...(failCode !== undefined && failCode !== null && String(failCode)
        ? { failCode: String(failCode) }
        : {}),
    }
  }
  return { готово: false } // cyrillic-ok
}

export { состояниеИзОтвета }

/**
 * A Kie task that Kie itself marked failed (`state: fail`), with Kie's words.
 *
 * The message carries the task id, `failCode` and `failMsg`, so the line the
 * route logs says WHY -- on 2026-10-05 three lipsync failures in a row logged
 * only "Generation failed. Please try again later." and no code, which left
 * nothing to triage.
 */
export class KieTaskFailed extends Error {
  readonly taskId: string
  readonly failCode?: string
  readonly failMsg: string
  readonly transient: boolean
  constructor(taskId: string, failMsg: string, failCode?: string) {
    super(`Kie task ${taskId} failed (failCode ${failCode ?? '-'}): ${failMsg}`)
    this.name = 'KieTaskFailed'
    this.taskId = taskId
    this.failCode = failCode
    this.failMsg = failMsg
    this.transient = isTransientKieFailure(failCode, failMsg)
  }
}

/*
 * Kie's codes (docs.kie.ai, "status codes"): 400 content policy, 401 auth,
 * 402 credits, 404 not found, 422 validation, 408 upstream silent for 10 min,
 * 429/433 rate limit, 455 maintenance, 500 server error, 501 "generation
 * failed". The task's failCode is sometimes one of these numbers and
 * sometimes a word ("GENERATION_FAILED"), so the message decides as well.
 */
const PERMANENT_CODES = new Set([
  '400',
  '401',
  '402',
  '403',
  '404',
  '413',
  '415',
  '422',
])
const TRANSIENT_CODES = new Set([
  '408',
  '429',
  '433',
  '455',
  '500',
  '502',
  '503',
  '504',
])
/** The input or the picture is the problem: the same request fails again. */
const PERMANENT_WORDS =
  /content|policy|sensitive|nsfw|violat|prohibit|moderat|invalid|required|unsupported|not support|\bformat\b|too (long|large|short|big)|exceed|no face|face not|detect|parameter|illegal|credit|balance|unauthori/i
/** Kie's side was busy or broke: the same request may well pass. */
const TRANSIENT_WORDS =
  /try again later|internal error|server error|time ?out|timed out|temporar|busy|overload|unavailable|rate limit|network|maintenance/i

/**
 * Is a failed task worth ONE more identical attempt?
 *
 * Content and validation failures are never retried: a second identical
 * request gets the same refusal and only doubles the wait. Anything the
 * classifier does not recognise is treated as permanent -- a retry is the
 * exception that needs a reason, not the default.
 */
export function isTransientKieFailure(
  failCode: string | undefined,
  failMsg: string | undefined
): boolean {
  const code = String(failCode ?? '').trim()
  const msg = String(failMsg ?? '')
  if (PERMANENT_CODES.has(code) || PERMANENT_WORDS.test(msg)) return false
  return TRANSIENT_CODES.has(code) || TRANSIENT_WORDS.test(msg)
}

export interface RunKieJobOptions {
  /** Polls in total, across the first task and the retry. */
  attempts?: number
  intervalMs?: number
  /**
   * Start the task once more when Kie fails it for a transient reason. The
   * retry spends the polls the first task left, never more, so a caller that
   * waits exactly `attempts * intervalMs` is not outlived by it; and it is
   * skipped when fewer than half of the polls are left.
   */
  retryTransientOnce?: boolean
}

export interface RunKieJobDeps {
  start: typeof запустить // cyrillic-ok: the module's existing export
  state: typeof состояниеЗадания // cyrillic-ok: the module's existing export
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

const DEFAULT_DEPS: RunKieJobDeps = {
  start: (model, input) => запустить(model, input), // cyrillic-ok: existing export
  state: taskId => состояниеЗадания(taskId), // cyrillic-ok: existing export
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  log: line => console.warn(line),
}

/**
 * Start a Kie task and wait for its result. Kie only -- there is no other
 * provider on this path, and a retry is the same model with the same input.
 */
export async function runKieJob(
  model: string,
  input: Record<string, unknown>,
  options: RunKieJobOptions = {},
  deps: Partial<RunKieJobDeps> = {}
): Promise<{ url: string; taskId: string }> {
  const d = { ...DEFAULT_DEPS, ...deps }
  const attempts = options.attempts ?? 100
  const intervalMs = options.intervalMs ?? 3_000
  let used = 0
  let retried = false

  for (;;) {
    const started = await d.start(model, input)
    if (!started.taskId) {
      throw new Error(started['отказ'] || 'Kie.ai не принял задачу')
    }
    let failure: KieTaskFailed | undefined
    while (used < attempts) {
      used += 1
      await d.sleep(intervalMs)
      const state = await d.state(started.taskId)
      if (state.url) return { url: state.url, taskId: started.taskId }
      if (state['отказ']) {
        failure = new KieTaskFailed(
          started.taskId,
          state['отказ'],
          state.failCode
        )
        break
      }
    }
    if (!failure) {
      throw new Error(
        `Kie.ai ещё выполняет задачу ${started.taskId}; повторная генерация может списать кредиты снова`
      )
    }
    const left = attempts - used
    const retry =
      options.retryTransientOnce === true &&
      !retried &&
      failure.transient &&
      left >= Math.ceil(attempts / 2)
    d.log(
      `[Kie] ${model}: task ${failure.taskId} failed, failCode=${failure.failCode ?? '-'} ` +
        `failMsg=${JSON.stringify(failure.failMsg)} transient=${failure.transient} ` +
        (retry ? `-- retrying once (${left} polls left)` : '-- not retried')
    )
    if (!retry) throw failure
    retried = true
  }
}
