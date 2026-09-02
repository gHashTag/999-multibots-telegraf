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
): Promise<{ готово: boolean; url?: string; отказ?: string }> {
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
    return {
      готово: false, // cyrillic-ok
      ['отказ']:
        responseJson.data.failMsg ?? responseJson.msg ?? 'задание не выполнено',
    }
  }
  return { готово: false } // cyrillic-ok
}

export { состояниеИзОтвета }
