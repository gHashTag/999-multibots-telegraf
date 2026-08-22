import { logger } from '@/utils/logger'
import { StageName, StageError } from './types'

/**
 * Тонкий клиент Replicate для завода.
 *
 * Зачем свой, а не пакет `replicate`: заводу нужны ровно две вещи, которых у
 * пакета нет из коробки, и обе куплены болью.
 *
 * 1. РЕТРАЙ ТРАНЗИЕНТНЫХ ОТКАЗОВ. bytedance/omni-human регулярно отдаёт
 *    `Failed to upload /tmp/…` и ByteDance `InvalidTimestamp: The Signature of
 *    the request is expired`. Это не ошибка входа: тот же запрос проходит со
 *    второго-третьего раза, и упавшие прогоны НЕ тарифицируются. Без ретрая
 *    сборка рилса из четырёх планов падала в трёх прогонах из четырёх.
 * 2. УСТОЙЧИВЫЙ РАЗБОР ОТВЕТА. В поле logs приходят управляющие символы, и
 *    строгий JSON.parse на них спотыкается.
 */

const API = 'https://api.replicate.com/v1'

/** Отказы, после которых имеет смысл повторить тот же запрос. */
const TRANSIENT = [
  'failed to upload',
  'invalidtimestamp',
  'signature of the request is expired',
  'internal error',
  'service unavailable',
  'timeout',
]

const isTransient = (msg: string): boolean => {
  const m = msg.toLowerCase()
  return TRANSIENT.some(t => m.includes(t))
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN
  if (!t) {
    throw new Error(
      'REPLICATE_API_TOKEN не задан. Завод без него не работает: все стадии платные и идут через Replicate.'
    )
  }
  return t
}

/**
 * JSON.parse спотыкается на сырых управляющих символах: Replicate кладёт их в
 * поле logs (прогресс-бары моделей). Вычищаем диапазон 0x00-0x1F — между
 * токенами пробелы необязательны, а внутри строк управляющие символы и так
 * невалидны, поэтому удаление ничего не ломает.
 */
function parseLoose<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    // eslint-disable-next-line no-control-regex
    return JSON.parse(raw.replace(/[\u0000-\u001F]/g, ' ')) as T
  }
}

interface Prediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: unknown
  error?: string | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const raw = await res.text()
  if (!res.ok) {
    // Тело ответа несёт причину отказа — без него «HTTP 422» не диагностируется.
    throw new Error(`Replicate ${res.status} ${path}: ${raw.slice(0, 400)}`)
  }
  return parseLoose<T>(raw)
}

export interface RunOptions {
  /** Стадия — только для сообщений об ошибке. */
  stage: StageName
  /** Сколько раз повторить транзиентный отказ. Упавшие прогоны не платные. */
  attempts?: number
  /** Потолок ожидания одного прогона. omni-human на 26 с аудио идёт ~8-12 мин. */
  timeoutMs?: number
  pollMs?: number
}

/**
 * Запускает модель и ждёт результат. Возвращает output как есть: у одних
 * моделей это строка-URL, у других объект.
 */
export async function runModel(
  model: string,
  input: Record<string, unknown>,
  opts: RunOptions
): Promise<unknown> {
  const attempts = opts.attempts ?? 3
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000
  const pollMs = opts.pollMs ?? 5000

  let lastError = ''

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Официальные модели зовутся по имени, дообученные версии — по хэшу.
    const isVersion = /^[0-9a-f]{40,}$/i.test(model)
    const started = await api<Prediction>(
      isVersion ? '/predictions' : `/models/${model}/predictions`,
      {
        method: 'POST',
        body: JSON.stringify(isVersion ? { version: model, input } : { input }),
      }
    )

    const deadline = Date.now() + timeoutMs
    let pred = started

    while (pred.status === 'starting' || pred.status === 'processing') {
      if (Date.now() > deadline) {
        throw new StageError(
          opts.stage,
          `${model}: прогон ${pred.id} не завершился за ${Math.round(timeoutMs / 60000)} мин`
        )
      }
      await sleep(pollMs)
      pred = await api<Prediction>(`/predictions/${pred.id}`)
    }

    if (pred.status === 'succeeded') {
      if (pred.output === undefined || pred.output === null) {
        throw new StageError(opts.stage, `${model}: пустой output у ${pred.id}`)
      }
      return pred.output
    }

    lastError = pred.error || pred.status
    if (!isTransient(lastError) || attempt === attempts) break

    logger.warn('[contentFactory] транзиентный отказ Replicate, повтор', {
      model,
      attempt,
      attempts,
      error: lastError.slice(0, 200),
    })
    await sleep(3000 * attempt)
  }

  throw new StageError(
    opts.stage,
    `${model} не отработал за ${attempts} попыт(ки): ${lastError.slice(0, 300)}`,
    isTransient(lastError)
  )
}

/** Первый URL из output: модели отдают то строку, то массив строк. */
export function firstUrl(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0]
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    for (const key of ['video', 'audio', 'output', 'url']) {
      const v = o[key]
      if (typeof v === 'string') return v
    }
  }
  throw new Error(`В output нет URL: ${JSON.stringify(output).slice(0, 200)}`)
}
