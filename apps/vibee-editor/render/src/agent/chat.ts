/**
 * Петля агента: сообщение → модель → вызовы инструментов → ответ.
 *
 * Инструменты берутся из ЕДИНОГО реестра (./tools). Тот же реестр отдаётся
 * наружу по MCP, поэтому чат и внешний клиент не могут разойтись в том, что
 * агент умеет. Расхождение рукописного списка возможностей с реализацией в
 * этом проекте уже случалось: GET /compositions обещал шесть шаблонов при
 * одном существующем.
 *
 * ЧТО ЗДЕСЬ СДЕЛАНО НАРОЧНО.
 *
 * 1. СОБЫТИЯ, А НЕ ОДИН ОТВЕТ. Петля отдаёт поток: размышление, намерение
 *    вызвать инструмент, результат вызова, текст. Человек видит РАБОТУ, а не
 *    крутящийся кружок. Для агента это не украшение: вызов инструмента может
 *    идти секунды, и без потока интерфейс неотличим от зависшего.
 * 2. ПРЕДЕЛ ВИТКОВ. Зацикленная модель тратит деньги владельца молча.
 *    Достигнутый предел сообщается человеку, а не прячется.
 * 3. ОШИБКА ИНСТРУМЕНТА ВОЗВРАЩАЕТСЯ МОДЕЛИ. Она способна исправить аргументы
 *    и повторить; ронять весь запрос из-за одного неудачного вызова значит
 *    показывать пятисотку там, где был связный ответ.
 */
import { TOOLS_BY_NAME, toOpenAITools, type ToolContext } from './tools'
import { executeSafeAgentTool } from './access'
import { allProviders, diagnose } from './provider'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_STEPS = 8

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

/** Событие потока. Клиент рисует их по мере поступления. */
export type AgentEvent =
  | { тип: 'размышление'; текст: string }
  | { тип: 'текст'; текст: string }
  | { тип: 'инструмент'; имя: string; аргументы: string }
  | { тип: 'результат'; имя: string; значение: unknown; мс: number }
  | { тип: 'готово'; витков: number; обрыв?: string }
  | { тип: 'ошибка'; текст: string }

const SYSTEM = `Ты — SAFE BETA агент внутри Trinity S³AI.

Доступны ровно три инструмента:
- whoami — прочитать подтверждённую личность текущего владельца;
- feed_stats — прочитать статистику только его ленты;
- content_plan_prepare — сохранить только приватный черновик контент-плана.

Платные операции, генерация, рендер, публикация, изменение доступов, выдача
ключей, approvals и квот НЕДОСТУПНЫ в SAFE BETA. Ни переменная окружения, ни
подтверждение пользователя не снимают этот запрет. Если человек просит такое
действие, честно скажи, что оно недоступно, и не утверждай, что выполнил его.

Сначала читай факты инструментом, затем отвечай. telegram_id никогда не бери
из аргументов: личность уже подтверждена сервером. Название компании пишется
ровно так: Trinity S³AI. Отвечай по-русски, коротко и без выдуманных чисел.`

/**
 * SOUL.md — голос владельца (см. корень репо). Один файл настраивает тон
 * чата и черновиков контент-плана. Читается лениво и один раз: файл редкий,
 * а читать его
 * на каждый заход диалога — трата. Кандидаты путей покрывают локальный
 * запуск из исходников и Railway, где репо лежит целиком.
 */
let soulCache: string | null | undefined
function soul(): string | null {
  if (soulCache !== undefined) return soulCache
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.SOUL_MD_PATH,
    join(here, '../../../../../../SOUL.md'),
    join(process.cwd(), 'SOUL.md'),
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8').trim()
      if (text) {
        soulCache = text
        return soulCache
      }
    } catch {
      // файла нет по этому пути — пробуем следующий
    }
  }
  console.warn('[agent] SOUL.md не найден, агент говорит без голоса владельца')
  soulCache = null
  return null
}

function systemPrompt(): string {
  const s = soul()
  if (!s) return SYSTEM
  return (
    SYSTEM +
    '\n\nГОЛОС ВЛАДЕЛЬЦА (SOUL.md). Когда готовишь идеи и черновик ' +
    'контент-плана — делай это голосом ниже: измерение вместо ' +
    'прилагательного, границы честно, ретракции без страха. В обычных ' +
    'ответах оставайся собой — кратким исполнителем.\n\n' +
    s
  )
}

async function* streamModel(
  messages: ChatMessage[]
): AsyncGenerator<
  | { kind: 'reasoning'; text: string }
  | { kind: 'content'; text: string }
  | { kind: 'done'; message: any }
> {
  const providers = allProviders()
  if (!providers.length) {
    throw new Error(
      'Ключ модели не задан. Нужен GLM_API_KEY или OPENAI_API_KEY. ' +
        'Взять: railway variables --kv | grep -E "GLM_API_KEY|OPENAI_API_KEY"'
    )
  }

  // Перебираем настроенных провайдеров: заданный ключ ещё не значит рабочий.
  // Собираем ПРИЧИНЫ отказа по каждому — иначе владелец увидит «не отвечает»
  // и не узнает, что дело в нулевом балансе или протухшем ключе.
  const причины: string[] = []
  for (const p of providers) {
    const body: Record<string, unknown> = {
      model: p.model,
      messages,
      tools: toOpenAITools(),
      tool_choice: 'auto',
      temperature: 0.3,
      stream: true,
    }
    // Режим размышления есть только у GLM. Подставлять его OpenAI нельзя —
    // неизвестное поле там ошибка, а не игнор.
    if (p.thinking) body.thinking = { type: 'enabled' }

    let r: Response
    try {
      r = await fetch(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      причины.push(`${p.id}: network_error`)
      continue
    }

    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '')
      причины.push(diagnose(p.id, r.status, t))
      continue
    }

    const reader = (r.body as any).getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const acc: any = { role: 'assistant', content: '', tool_calls: [] }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const str = line.trim()
        if (!str.startsWith('data:')) continue
        const payload = str.slice(5).trim()
        if (payload === '[DONE]') continue
        let j: any
        try {
          j = JSON.parse(payload)
        } catch {
          continue
        }
        const d = j.choices?.[0]?.delta
        if (!d) continue
        if (d.reasoning_content) {
          yield { kind: 'reasoning', text: d.reasoning_content }
        }
        if (d.content) {
          acc.content += d.content
          yield { kind: 'content', text: d.content }
        }
        if (d.tool_calls) {
          for (const tc of d.tool_calls) {
            const i = tc.index ?? 0
            acc.tool_calls[i] ??= {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            }
            if (tc.id) acc.tool_calls[i].id = tc.id
            if (tc.function?.name)
              acc.tool_calls[i].function.name += tc.function.name
            if (tc.function?.arguments)
              acc.tool_calls[i].function.arguments += tc.function.arguments
          }
        }
      }
    }
    if (!acc.tool_calls.length) delete acc.tool_calls
    yield { kind: 'done', message: acc }
    return
  }

  throw new Error(
    'Ни один провайдер модели не ответил.\n' +
      причины.map(c => '  • ' + c).join('\n')
  )
}

/**
 * Один заход агента, потоком событий.
 *
 * История передаётся целиком: серверная сессия пережила бы перезапуск хуже,
 * чем клиент переживёт повторную отправку, а перезапуски здесь регулярны.
 */
export async function* runAgent(
  history: ChatMessage[],
  ctx: ToolContext
): AsyncGenerator<AgentEvent> {
  // ЛИЧНЫЙ SOUL звонящего: у каждого человека свой голос и свои границы,
  // агент готовит его черновики — значит, должен знать его SOUL так же,
  // как голос владельца. Нет SOUL — работает на общем голосе бренда.
  let personalSoul: string | null = null
  try {
    await ctx.pool.query(
      `CREATE TABLE IF NOT EXISTS user_soul (
         telegram_id text PRIMARY KEY,
         content     text NOT NULL,
         updated_at  timestamptz NOT NULL DEFAULT now()
       )`
    )
    const r = await ctx.pool.query(
      `SELECT content FROM user_soul WHERE telegram_id = $1`,
      [ctx.telegramId]
    )
    personalSoul = r.rows[0]?.content ?? null
  } catch {
    // SOUL — усиление, не блокировка: без него чат обязан работать.
    console.warn('[agent] personal_soul_read_failed')
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: personalSoul
        ? systemPrompt() +
          '\n\nЛИЧНЫЙ SOUL ЧЕЛОВЕКА, С КОТОРЫМ ТЫ ГОВОРИШЬ. Тексты постов, ' +
          'идеи и тон — подстраивай под него; голос бренда t27 остаётся ' +
          'правилом честности (числа, границы), но ЧЕЙ это контент и каким ' +
          'голосом — решает этот SOUL. В SAFE BETA SOUL доступен только как ' +
          'контекст; изменение SOUL недоступно.\n\n' +
          personalSoul
        : systemPrompt(),
    },
    ...history,
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    let assistant: any = null
    try {
      for await (const ev of streamModel(messages)) {
        if (ev.kind === 'reasoning')
          yield { тип: 'размышление', текст: ev.text }
        else if (ev.kind === 'content') yield { тип: 'текст', текст: ev.text }
        else assistant = ev.message
      }
    } catch {
      yield {
        тип: 'ошибка',
        текст: 'SAFE_BETA_MODEL_UNAVAILABLE: детали ошибки скрыты.',
      }
      return
    }
    if (!assistant) {
      yield { тип: 'ошибка', текст: 'модель не вернула сообщение' }
      return
    }

    if (!assistant.tool_calls?.length) {
      yield { тип: 'готово', витков: step + 1 }
      return
    }

    messages.push(assistant)

    for (const call of assistant.tool_calls) {
      const имя = call.function.name
      yield {
        тип: 'инструмент',
        имя,
        аргументы: call.function.arguments || '{}',
      }
      const t0 = Date.now()
      let значение: unknown
      try {
        const args = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {}
        const execution = await executeSafeAgentTool(имя, args, ctx, name =>
          TOOLS_BY_NAME.get(name)
        )
        значение = execution.ok
          ? execution.value
          : { ошибка: execution.error, код: execution.code }
      } catch {
        значение = {
          ошибка: 'SAFE_BETA_TOOL_FAILED: детали ошибки скрыты.',
        }
      }
      yield { тип: 'результат', имя, значение, мс: Date.now() - t0 }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: имя,
        content: JSON.stringify(значение),
      })
    }
  }

  yield {
    тип: 'готово',
    витков: MAX_STEPS,
    обрыв: `достигнут предел ${MAX_STEPS} витков вызова инструментов`,
  }
}
