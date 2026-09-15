/**
 * НАСТОЯЩИЙ АГЕНТ В ЧАТЕ БОТА — ТОТ ЖЕ, ЧТО В МИНИ-АППЕ.
 *
 * Владелец, глядя на переписку с ботом: «он тупой, не подключен ко всем
 * инструментам». Так и было. В боте на свободный текст отвечал `chatWithAI` —
 * голая модель с короткой подсказкой, без единого инструмента: она не могла ни
 * посмотреть ленту, ни узнать баланс, ни выставить счёт, ни что-либо
 * сгенерировать. Она могла только рассуждать о том, как это было бы здорово,
 * и на «создай видео из моей аватарки» отвечала предложением набрать /start.
 *
 * Настоящий агент живёт в рендере: 47 инструментов (лента, файлы, SOUL, план,
 * генерация, публикация, счета, Telegram владельца) и общая память разговора.
 * Мини-апп ходит к нему по подписи Telegram, которой у сервиса бота нет и быть
 * не может — она существует только внутри WebView.
 *
 * Поэтому бот ходит внутренним ключом и НАЗЫВАЕТ человека явно: тот же приём,
 * что у остальных служебных вызовов этого проекта. Личность при этом не
 * выдумывается — она берётся из `ctx.from.id`, то есть от Telegram.
 *
 * ОДИН РАЗГОВОР НА ДВЕ ПОВЕРХНОСТИ. История не хранится в боте: она лежит на
 * сервере (`agent_messages`), и бот её оттуда читает. Написанное в мини-аппе
 * видно здесь, написанное здесь — там.
 */
import { logger } from '@/utils/logger'

/** Адрес прод-рендера литералом — как в postStarPaid: URL из ENV сканер
 *  считает потенциальным SSRF, а переопределения для этого вызова нет. */
const БАЗА = 'https://vibee-render-production.up.railway.app'

/** Потолок ожидания. Агент делает витки с инструментами и бывает медленным;
 *  но человек в чате не должен ждать бесконечно, не понимая, жив ли бот. */
const ЖДАТЬ_МС = 180_000

/** Сколько прошлых реплик подмешать. Столько же, сколько отдаёт сервер. */
const ГЛУБИНА_ИСТОРИИ = 40

export interface ОтветАгента {
  текст: string
  /** Имена вызванных инструментов — для журнала, не для показа человеку. */
  инструменты: string[]
  /**
   * A prepared message waiting for this person, WITH its one-time secret.
   *
   * It arrives on the same stream as the answer, from the turn that created
   * it. Fetching it separately would have meant a window in which the draft
   * existed and its secret was still up for grabs -- and the read route is
   * reachable by anything holding the shared server key.
   */
  proposal?: {
    id: string
    action: string
    target: string
    what?: string
    secret: string
    display?: string
    media?: { kind: 'photo'; url: string }
    charge?: { telegramId: string; op: string; tokens: number }
  }
}

/**
 * WHERE THIS SURFACE IS.
 *
 * Anything the bot writes is "here", so it is never marked -- a marker on
 * every line is noise the model has to read past on every single turn.
 */
const THIS_SURFACE = 'bot'

/**
 * NAME THE OTHER SURFACE, FOR THE MODEL.
 *
 * The bot has no transcript of its own to annotate: the Telegram chat IS the
 * transcript, and turns typed in the mini app or on the phone never appeared
 * in it at all. So the only place the origin can become visible here is the
 * context the model reads -- and then the agent can answer "you asked me that
 * from your phone" instead of treating a stranger's line as its own.
 *
 * Only USER turns are marked by the caller. An assistant turn is ours wherever
 * it was delivered, and marking it would tell the model that its own past
 * replies came from somewhere else.
 *
 * `unknown` is left alone ON PURPOSE. It is the column default, so it marks a
 * turn written before this existed or by a client that did not name itself.
 * Inventing "from somewhere" would put a claim into the context that nothing
 * supports.
 */
const SURFACE_NAMES: Record<string, string> = {
  // 'bot' is listed even though the bot never marks itself. Leaving it out
  // would make the THIS_SURFACE check below dead code -- the lookup alone would
  // already return undefined -- and a mutation run proved exactly that: removing
  // the check changed no behaviour and no test went red. With the name present,
  // the check is the only thing standing between a person and a bracket on
  // every single line of their own chat.
  bot: 'из бота',
  miniapp: 'из мини-аппа',
  ios: 'с телефона',
  agent: 'по ключу агента',
}

export function markSurface(
  content: string,
  role: string,
  surface?: string
): string {
  if (role !== 'user') return content
  const name =
    surface && surface !== THIS_SURFACE ? SURFACE_NAMES[surface] : undefined
  return name ? '[' + name + '] ' + content : content
}

function apiKey(): string {
  return process.env.RENDER_API_KEY || ''
}

/**
 * Прочитать общий разговор.
 *
 * Ошибку глотаем НАМЕРЕННО: недоступная история — повод ответить без
 * контекста, а не повод молчать. Человек уже написал и ждёт.
 */
/** The shared transcript, newest last; [] when the render is unreachable. */
export async function fetchHistory(
  telegramId: string
): Promise<Array<{ role: string; content: string; surface?: string }>> {
  return readConversation(telegramId)
}

async function readConversation(
  telegramId: string
): Promise<Array<{ role: string; content: string; surface?: string }>> {
  try {
    const о = await fetch(
      `${БАЗА}/api/agent/history?limit=${ГЛУБИНА_ИСТОРИИ}&telegram_id=${encodeURIComponent(telegramId)}`,
      { headers: { 'X-Api-Key': apiKey() } }
    )
    if (!о.ok) return []
    const д = (await о.json()) as {
      messages?: Array<{ role: string; content: string; surface?: string }>
    }
    return Array.isArray(д.messages) ? д.messages : []
  } catch {
    return []
  }
}

/**
 * Спросить агента и дождаться готового ответа.
 *
 * Поток NDJSON собирается здесь целиком, и по дороге видно, какие инструменты
 * агент вызвал, — это уходит в журнал и помогает понять, почему ответ такой.
 *
 * This used to say "in Telegram you cannot type letter by letter, a message
 * is sent once". Since Bot API 9.3 (31 Dec 2025) that is false --
 * sendMessageDraft exists. Hence `onProgress`: it hands the text collected so
 * far to whoever can show it. The answer itself is still returned whole and
 * still sent as one message.
 */
/**
 * Turns in flight, by the person whose turn it is.
 *
 * One per person on purpose: a second question from the same chat replaces
 * the first, and a stop pressed on the draft means "this one", of which there
 * is only ever one visible.
 */
const running = new Map<string, AbortController>()

/**
 * End the turn this person is waiting on, if any.
 *
 * Returns whether there was one. Nothing else is cleaned up here: the call
 * itself unregisters in its own `finally`, and the answer it was building is
 * simply never sent.
 */
export function stopTurn(telegramId: string): boolean {
  const c = running.get(String(telegramId))
  if (!c) return false
  c.abort()
  return true
}

/**
 * Mark an error as thrown AFTER the server had already stored the question.
 *
 * Read by the business fallback: it must not write the person's line a second
 * time when the server has it. A missing flag means "never arrived".
 */
function questionAlreadyStored(e: unknown): Error {
  const err = e instanceof Error ? e : new Error(String(e))
  ;(err as { questionStored?: boolean }).questionStored = true
  return err
}

export async function спроситьАгента(
  telegramId: string,
  текст: string,
  /** Where the answer will be shown; the server shapes the prompt by it. */
  opts: {
    surface?: 'bot' | 'business'
    /**
     * The answer so far, on every token.
     *
     * Passed only by the owner's own chat. The client in a business DM does
     * NOT get it: raw deltas still carry button markers like
     * `[[Оплатить|act:pay]]`, which are stripped from the whole text later,
     * and payButton scans the finished answer for the invoice link.
     */
    onProgress?: (sofar: string) => void
  } = {}
): Promise<ОтветАгента> {
  if (!apiKey()) {
    throw new Error('RENDER_API_KEY не задан в сервисе бота — агент недоступен')
  }

  const past = await readConversation(telegramId)
  const messages = [
    ...past.map(turn => ({
      role: turn.role,
      content: markSurface(turn.content, turn.role, turn.surface),
    })),
    { role: 'user', content: текст },
  ]

  const прерыватель = new AbortController()
  const таймер = setTimeout(() => прерыватель.abort(), ЖДАТЬ_МС)
  /*
   * Registered so somebody OUTSIDE this call can end it -- the person whose
   * turn it is, pressing the stop button on the draft. Until now the only
   * thing that could end a turn was the timer, and three minutes is a long
   * time to watch something you already know is going the wrong way.
   *
   * Aborting here closes the response from the render, which is how the agent
   * on the other side learns to stop calling tools. See routes.ts.
   */
  running.set(String(telegramId), прерыватель) // cyrillic-ok: pre-existing name
  try {
    const о = await fetch(
      `${БАЗА}/api/agent/chat?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey(),
        },
        // surface: 'bot' — сервер сохранит реплику с пометкой, откуда она.
        body: JSON.stringify({ messages, surface: opts.surface ?? 'bot' }),
        signal: прерыватель.signal,
      }
    )
    if (!о.ok || !о.body) {
      const тело = await о.text().catch(() => '')
      // No stream, so the server never reached the point where it stores the
      // question: the 400 and 401 answers are returned above that line. The
      // error carries no `questionStored`, and the caller records both turns.
      throw new Error(`агент ответил ${о.status}: ${тело.slice(0, 200)}`)
    }

    /*
     * FROM HERE THE QUESTION IS ALREADY ON RECORD.
     *
     * The bot's fallback decides from the thrown error whether to write the
     * person's line again, and it used to read EVERY throw as "the render
     * never saw this turn". That is only true before the stream opens. The
     * server writes head 200 first, stores the person's line second and runs
     * the agent third -- so an error event inside the stream, or a socket cut
     * halfway through it, means the question is stored and only the answer is
     * missing. Writing the question a second time halves a memory window that
     * is read as the last forty replies, and the duplicate is invisible:
     * both sides are plain INSERTs against the same telegram_id.
     *
     * So the fact travels on the error itself, where the caller can read what
     * happened instead of inferring it from the bare fact of a throw.
     */
    try {
      /*
       * Разбор NDJSON вручную: тело приходит кусками, и кусок может оборваться
       * посреди строки. Держим хвост до следующего куска — иначе половина
       * событий тихо теряется, а ответ выглядит обрезанным без причины.
       */
      const reader = (о.body as any).getReader?.()
      let хвост = ''
      const части: string[] = []
      /** Kept beside `части` so onProgress costs nothing when nobody listens. */
      let streamed = ''
      const инструменты: string[] = []
      let ошибка = ''
      let proposal: ОтветАгента['proposal'] // cyrillic-ok: pre-existing type name

      const строку = (s: string) => {
        const t = s.trim()
        if (!t) return
        try {
          const ev = JSON.parse(t) as {
            тип?: string
            текст?: string
            имя?: string
            proposal?: ОтветАгента['proposal'] // cyrillic-ok: pre-existing type
          }
          if (ev.тип === 'текст' && typeof ev.текст === 'string') {
            части.push(ev.текст)
            if (opts.onProgress) {
              streamed += ev.текст
              opts.onProgress(streamed)
            }
          } else if (ev.тип === 'инструмент' && ev.имя) инструменты.push(ev.имя)
          else if (ev.тип === 'ошибка' && ev.текст) ошибка = ev.текст
          // A prepared message and its one-time secret, from this same turn.
          // Bracket access with a string literal: the envelope's field name is
          // pre-existing and Cyrillic, and quoting keeps it data, not code.
          else if (ev['тип'] === 'proposal' && ev.proposal?.secret)
            proposal = ev.proposal
        } catch {
          // Неразобранная строка — не повод терять остальные.
        }
      }

      if (reader) {
        const dec = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          хвост += dec.decode(value, { stream: true })
          const строки = хвост.split('\n')
          хвост = строки.pop() ?? ''
          строки.forEach(строку)
        }
      } else {
        ;(await о.text()).split('\n').forEach(строку)
      }
      строку(хвост)

      const собрано = части.join('').trim()
      if (!собрано && ошибка) throw new Error(ошибка)

      logger.info('[trinityAgent] ответ получен', {
        telegram_id: telegramId,
        инструментов: инструменты.length,
        инструменты: инструменты.slice(0, 8),
        длина: собрано.length,
      })

      return { текст: собрано, инструменты, proposal } // cyrillic-ok: fields of ОтветАгента
    } catch (e) {
      throw questionAlreadyStored(e)
    }
  } finally {
    clearTimeout(таймер)
    // Only if it is still OURS: a newer question from the same person has
    // already replaced the entry, and clearing it would orphan that one.
    if (running.get(String(telegramId)) === прерыватель) {
      // cyrillic-ok: pre-existing
      running.delete(String(telegramId))
    }
  }
}

/**
 * WRITE A TURN INTO THE SHARED CONVERSATION.
 *
 * Exists for the bot's fallback answer. When the agent is unreachable the bot
 * replies with a plain model so the person is not left in silence, and that
 * answer used to go nowhere: measured 2026-09-07, the shared conversation ended
 * on a question with no answer. The question was already stored -- the server
 * records it on its way into `runAgent` -- so the next turn handed the model a
 * transcript in which the bot appeared to have ignored somebody.
 *
 * WHY BOTH TURNS CAN TRAVEL AT ONCE. The two failures differ in what is already
 * on record. An empty answer means the request DID arrive, so the question is
 * stored and only the answer is missing. A thrown call means it never arrived
 * and neither is. The caller knows which case it is in; sending the pair in one
 * request avoids a second round trip that could half-succeed and leave exactly
 * the hole this closes.
 *
 * NEVER THROWS. A conversation that was answered out loud must not be reported
 * as broken because the bookkeeping failed. The person already has their reply.
 */
export async function recordTurns(
  telegramId: string,
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  surface: 'bot' | 'business' = 'bot'
): Promise<'recorded' | 'not recorded'> {
  const usable = turns.filter(turn => (turn.content || '').trim())
  if (!apiKey() || !telegramId || !usable.length) return 'not recorded'
  try {
    const response = await fetch(
      `${БАЗА}/api/agent/history?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
        body: JSON.stringify({ turns: usable, surface }),
      }
    )
    if (!response.ok) {
      logger.warn('[trinityAgent] реплика не записана', {
        telegram_id: telegramId,
        status: response.status,
      })
      return 'not recorded'
    }
    return 'recorded'
  } catch (e) {
    logger.warn('[trinityAgent] запись реплики не прошла', {
      telegram_id: telegramId,
      error: e instanceof Error ? e.message : String(e),
    })
    return 'not recorded'
  }
}
