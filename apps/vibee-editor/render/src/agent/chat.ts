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
import { resolveProvider } from './provider'

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

const SYSTEM = `Ты — агент внутри приложения Trinity S³AI для создания рилсов.

Ты не советчик, а исполнитель: у тебя есть инструменты, которые ДЕЙСТВИТЕЛЬНО
читают и меняют состояние приложения. Прежде чем утверждать что-либо о ленте,
файлах, шаблонах или счётчиках — вызови инструмент и посмотри. Не придумывай
названий, идентификаторов и ссылок: их возвращают инструменты.

Как работать:
- Сначала посмотри, потом говори. Один-два вызова инструментов почти всегда
  лучше, чем догадка.
- Если задача составная — выполняй по шагам и говори, что делаешь.
- Если инструмента не хватает — скажи прямо, какого именно. Не делай вид,
  что сделал.

Правила проекта, обязательные:
- К каждому видео идёт текст поста с хештегами. Инструмент публикации сам
  отклонит текст без хештегов — это канон, а не придирка.
- Название компании пишется ровно так: Trinity S³AI.
- Платных генераций у тебя пока НЕТ: списание баланса в сервисе не
  реализовано, и открывать бесплатный доступ к платным провайдерам нельзя.
  Если человек просит сгенерировать — объясни это честно.

Отвечай по-русски, коротко, числами из инструментов, а не примерными.`

async function* streamModel(
  messages: ChatMessage[]
): AsyncGenerator<
  | { kind: 'reasoning'; text: string }
  | { kind: 'content'; text: string }
  | { kind: 'done'; message: any }
> {
  const p = resolveProvider()
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

  const r = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok || !r.body) {
    // Тело ОБЯЗАТЕЛЬНО в сообщении: голый код не отличает протухший ключ от
    // исчерпанной квоты, и диагноз по логам становится невозможен.
    const t = await r.text().catch(() => '')
    throw new Error(`${p.id} ответил ${r.status}: ${t.slice(0, 400)}`)
  }

  const reader = (r.body as any).getReader()
  const decoder = new TextDecoder()
  let buf = ''
  // Собираем сообщение целиком параллельно потоку: вызовы инструментов
  // приходят кусками и нужны в собранном виде.
  const acc: any = { role: 'assistant', content: '', tool_calls: [] }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const payload = s.slice(5).trim()
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
        acc.reasoning = (acc.reasoning || '') + d.reasoning_content
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
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
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
    } catch (e) {
      yield { тип: 'ошибка', текст: String(e).slice(0, 500) }
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
      const tool = TOOLS_BY_NAME.get(имя)
      if (!tool) {
        значение = { ошибка: `инструмента ${имя} не существует` }
      } else {
        try {
          значение = await tool.handler(
            call.function.arguments ? JSON.parse(call.function.arguments) : {},
            ctx
          )
        } catch (e) {
          значение = { ошибка: String(e).slice(0, 400) }
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
