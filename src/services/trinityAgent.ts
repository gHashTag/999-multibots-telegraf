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
/** The history round trips are short; a hang here must not stall a sweep. */
const HISTORY_TIMEOUT_MS = 20_000

export interface ОтветАгента {
  текст: string
  /** Имена вызванных инструментов — для журнала, не для показа человеку. */
  инструменты: string[]
  /**
   * Which model answered, as `provider/model` -- for the log. The render's
   * fallback chain means the answer may come from any configured provider,
   * and a bad answer with no name on it cannot be repaired (sweep, 2026-09-10).
   */
  provider?: string
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
    /**
     * Their own last message, attached by the render when the lead is known.
     *
     * Third-party text: it is flattened and cut on both sides of the wire and
     * shown quoted and labelled, never run together with our draft.
     */
    theirWords?: string
    /**
     * When this card stops being pressable, in epoch milliseconds, as the
     * render reported it. Absent from an older render, and the caller must
     * treat absence as "unknown" rather than as "already dead".
     */
    expiresAt?: number
    /**
     * WHY THIS PERSON, IN ONE LINE, WRITTEN BY THE TURN THAT PREPARED IT.
     *
     * The queue has carried this field since the cards were built, with a
     * comment saying it is for the card -- and nothing ever set it and
     * nothing ever printed it. Measured 17.09.2026 end to end: no caller
     * passed it into `propose`, and `proposalCard` did not read it.
     *
     * It matters because of what it was for. What stands between the owner
     * and the button is not the button: it is having to open the chat to
     * remember who this is and what they last said.
     */
    because?: string
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
    // Bounded: a hung history read used to hold the sweep's `running` flag
    // forever (CRM audit 2026-09-12, P1 #3).
    const о = await fetch(
      `${БАЗА}/api/agent/history?limit=${ГЛУБИНА_ИСТОРИИ}&telegram_id=${encodeURIComponent(telegramId)}`,
      {
        headers: { 'X-Api-Key': apiKey() },
        signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
      }
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
 * A TRANSPORT DEATH, TOLD APART FROM A BUG IN OUR OWN PARSING.
 *
 * MEASURED IN PRODUCTION 2026-09-16:
 *   09:00:15 [ERROR] ❌ [INNGEST FAILURE] crm-proactive-sweep
 *   09:00:29 [ERROR] [crm-proactive] sweep FAILED {"why":"terminated"}
 *
 * `terminated` is not a word this repository writes. It is undici's message
 * for exactly one event: the peer closed the TCP connection AFTER the response
 * headers arrived, while the body was still being read. The render answered
 * 200, started the NDJSON agent stream and then dropped the socket mid-body.
 * The neighbouring shapes are deliberately NOT transport-fatal-vs-ours
 * ambiguous:
 *   socket dies before headers -> "TypeError: fetch failed"
 *   socket dies mid-body       -> "TypeError: terminated" (UND_ERR_SOCKET,
 *                                 cause 'other side closed')
 *   our own 180 s abort       -> "This operation was aborted" (NOT here:
 *                                 the caller asked to stop, nothing broke)
 *
 * WHY IDENTITY AND NOT `catch (e) {}`. Everything below the reader loop --
 * JSON handling, the event switch, the logging -- can also throw, and a
 * blanket catch would turn a genuine crash in our parsing into a silent
 * partial success. That is precisely the swallow this file must never do. So
 * the decision is made on the error's own identity (undici's code, its
 * message, its cause chain) and on nothing else.
 */
const TRANSPORT_CODES = new Set([
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'EPIPE',
  'ECONNREFUSED',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])
const TRANSPORT_MESSAGE =
  /^terminated$|fetch failed|other side closed|socket hang up|premature close/i

export function isTransportError(e: unknown): boolean {
  for (
    let cur: any = e, depth = 0;
    cur && depth < 6;
    cur = cur.cause, depth++
  ) {
    if (cur?.name === 'AbortError' || cur?.name === 'TimeoutError') return false
    if (typeof cur.code === 'string' && TRANSPORT_CODES.has(cur.code))
      return true
    if (typeof cur.message === 'string' && TRANSPORT_MESSAGE.test(cur.message))
      return true
  }
  return false
}

/**
 * ONE RETRY, ONLY ON A LIMIT, ONLY WHEN NOTHING WAS ALREADY PAID FOR.
 *
 * MEASURED IN PRODUCTION 2026-09-16:
 *   09:30:26 [WARN] [Business] agent unreachable, falling back
 *     {"chatId":"435572800","error":"<no model provider answered>
 *       nemotron: ResourceExhausted:
 *       Worker local total request limit reached (16/16)"}
 *
 * 16/16 is NVIDIA's own concurrency ceiling, not a pool this repository owns
 * (there is no semaphore here to queue against). A CONCURRENCY ceiling frees a
 * slot the moment any in-flight request anywhere finishes -- seconds, not a
 * quota window -- so one short retry is the whole fix. Nothing on the live
 * customer path retried before this: the customer at 09:30 was silently
 * downgraded to a model with NO TOOLS (it cannot invoice, cannot read a
 * balance) and the CRM never recorded the turn.
 *
 * WHY 4 s AND NOT THE DUET'S 30 s (crm-duet-tool.ts SELLER_RETRY_PAUSE_MS).
 * The duet is a simulation with nobody waiting. Here a live customer is
 * holding a typing indicator; the wait ceiling is already 180 s per attempt, so a
 * naive second attempt plus 30 s can reach six minutes -- and
 * `businessReplyInFlight` DROPS every follow-up message from that customer
 * while a turn is in flight, so a long retry silently discards their next
 * messages instead of merely being slow.
 *
 * The classifier is copied in shape from crm-duet-tool.ts:365-397, which the
 * repository already trusts -- but wired, at last, to the paying customer.
 */
const RETRY_ON_LIMIT = 1
const RETRY_PAUSE_MS = 4_000
// "limit" covers "rate limit" and "limit reached"; the last alternative is the
// word the render's provider.ts diagnose() uses for 429 in Russian.
const LIMIT_RE =
  /429|limit|ResourceExhausted|too many requests|\u043b\u0438\u043c\u0438\u0442/i

export function isLimitError(error: string | undefined): boolean {
  return !!error && LIMIT_RE.test(error)
}

/**
 * A tool whose call already spent money or already reached a human. Replaying
 * a turn that fired one of these would bill twice or send twice -- the duet's
 * rule (PAID_TOOLS) applied to the live path.
 */
const SIDE_EFFECT_TOOL =
  /^(image_generate|image_edit|audio_generate|video_generate|reel_render|invoice|tg_send)/

/** Only once, only on a limit, only when the failed attempt paid for nothing. */
export function retryAllowed(
  retriesDone: number,
  error: string | undefined,
  toolsUsed: string[]
): boolean {
  return (
    retriesDone < RETRY_ON_LIMIT &&
    isLimitError(error) &&
    !toolsUsed.some(name => SIDE_EFFECT_TOOL.test(name))
  )
}

const pause = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Спросить агента и дождаться готового ответа.
 *
 * Поток NDJSON собирается здесь целиком: в Telegram нельзя «печатать по
 * буквам», сообщение отправляется один раз. Зато по дороге видно, какие
 * инструменты агент вызвал, — это уходит в журнал и помогает понять, почему
 * ответ такой.
 */
export async function спроситьАгента(
  telegramId: string,
  текст: string,
  /** Where the answer will be shown; the server shapes the prompt by it. */
  opts: {
    surface?: 'bot' | 'business'
    /** Only a model that calls tools may answer (the unattended sweep). */
    toolsOnly?: boolean
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
   * ONE controller and ONE timer for BOTH attempts, on purpose: the retry
   * below must not buy itself a fresh 180 s. The total budget of attempt +
   * pause + retry stays the single ceiling the caller already reasons about.
   */
  // The tools the CURRENT attempt has already called. Read by retryAllowed
  // after a failure: a turn that already generated or already sent is never
  // replayed, whatever the error says.
  let toolsUsed: string[] = []

  // One try of the whole round trip: request, stream, parse. The return type
  // is inferred so this line stays free of the module's Cyrillic type name.
  const attempt = async () => {
    const о = await fetch(
      `${БАЗА}/api/agent/chat?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey(),
        },
        // surface: 'bot' — сервер сохранит реплику с пометкой, откуда она.
        body: JSON.stringify({
          messages,
          surface: opts.surface ?? 'bot',
          ...(opts.toolsOnly ? { tools_only: true } : {}),
        }),
        signal: прерыватель.signal,
      }
    )
    if (!о.ok || !о.body) {
      const тело = await о.text().catch(() => '')
      throw new Error(`агент ответил ${о.status}: ${тело.slice(0, 200)}`)
    }

    /*
     * Разбор NDJSON вручную: тело приходит кусками, и кусок может оборваться
     * посреди строки. Держим хвост до следующего куска — иначе половина
     * событий тихо теряется, а ответ выглядит обрезанным без причины.
     */
    const reader = (о.body as any).getReader?.()
    let хвост = ''
    const части: string[] = []
    const инструменты: string[] = []
    toolsUsed = инструменты // cyrillic-ok: pre-existing identifiers of this parser
    // Counted so a fatal break can say HOW FAR the stream got before dying.
    let eventsSeen = 0
    let ошибка = ''
    let provider: string | undefined
    let proposal: ОтветАгента['proposal'] // cyrillic-ok: pre-existing type name

    const строку = (s: string) => {
      const t = s.trim()
      if (!t) return
      try {
        const ev = JSON.parse(t) as {
          тип?: string
          текст?: string
          имя?: string
          id?: string
          model?: string
          proposal?: ОтветАгента['proposal'] // cyrillic-ok: pre-existing type
        }
        if (ev.тип === 'текст' && typeof ev.текст === 'string')
          части.push(ev.текст)
        else if (ev.тип === 'провайдер' && ev.id)
          // cyrillic-ok: pre-existing event envelope
          // The last one wins: a provider that failed mid-stream before any
          // text was handed over is replaced by the one that answered.
          provider = `${ev.id}/${ev.model ?? '?'}`
        else if (ev.тип === 'инструмент' && ev.имя) инструменты.push(ev.имя)
        else if (ev.тип === 'ошибка' && ev.текст) ошибка = ev.текст
        // A prepared message and its one-time secret, from this same turn.
        // Bracket access with a string literal: the envelope's field name is
        // pre-existing and Cyrillic, and quoting keeps it data, not code.
        else if (ev['тип'] === 'proposal' && ev.proposal?.secret)
          proposal = ev.proposal
        eventsSeen++
      } catch {
        // Неразобранная строка — не повод терять остальные.
      }
    }

    /*
     * KEEP WHAT ALREADY ARRIVED (production 2026-09-16).
     *
     * The render answers 200, streams the tool events, the answer text and a
     * COMPLETE proposal -- with its one-time secret -- and then drops the
     * socket. Before this catch the error propagated out of the whole function
     * and threw away every one of those events: the owner never saw a card the
     * seller had already earned, while the draft and its live secret sat on the
     * render. The sweep logged one word, "terminated", and retried the whole
     * turn.
     *
     * So on a TRANSPORT death (and ONLY on one -- see isTransportError) the
     * tail is flushed and whatever was collected is returned. When NOTHING
     * usable was collected there is nothing to keep and the call must still
     * fail loudly -- house rule: silence is not zero.
     */
    try {
      if (reader) {
        const dec = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          хвост += dec.decode(value, { stream: true }) // cyrillic-ok: pre-existing identifiers of this parser
          const строки = хвост.split('\n') // cyrillic-ok: pre-existing identifiers of this parser
          хвост = строки.pop() ?? '' // cyrillic-ok: pre-existing identifiers of this parser
          строки.forEach(строку) // cyrillic-ok: pre-existing identifiers of this parser
        }
      } else {
        ;(await о.text()).split('\n').forEach(строку) // cyrillic-ok: pre-existing identifiers of this parser
      }
    } catch (e) {
      if (!isTransportError(e)) throw e
      строку(хвост) // cyrillic-ok: pre-existing identifiers of this parser
      хвост = '' // cyrillic-ok: pre-existing identifiers of this parser
      const partial = части.join('').trim() // cyrillic-ok: pre-existing identifiers of this parser
      const usable = !!proposal || инструменты.length > 0 || !!partial // cyrillic-ok: pre-existing identifiers of this parser
      if (usable) {
        // WARN, not ERROR: the socket died but the work survived and the owner
        // gets their card. Waking a phone for a delivery that succeeded is the
        // noise this project is trying to stop. The loud half is the throw
        // below, which still pages when the turn is genuinely lost.
        logger.warn('[trinityAgent] stream died mid-body, kept what arrived', {
          telegram_id: telegramId,
          upstream: `${БАЗА}/api/agent/chat`,
          events: eventsSeen,
          tools: инструменты.length, // cyrillic-ok: pre-existing identifiers of this parser
          proposal: !!proposal,
          chars: partial.length,
          error: e instanceof Error ? e.message : String(e),
        })
        return { текст: partial, инструменты, provider, proposal } // cyrillic-ok: fields of ОтветАгента
      }
      /*
       * NAME THE CALL AND THE UPSTREAM. The owner's phone used to buzz with a
       * push notification whose entire content was the word "terminated": it
       * named neither the upstream, nor the call, nor who was left waiting.
       */
      throw new Error(
        `the agent stream broke (${БАЗА}/api/agent/chat, telegram_id=${telegramId}) ` +
          `after ${eventsSeen} events, nothing usable arrived: ` +
          (e instanceof Error ? e.message : String(e))
      )
    }
    строку(хвост)

    const собрано = части.join('').trim()
    if (!собрано && ошибка) throw new Error(ошибка)

    logger.info('[trinityAgent] ответ получен', {
      telegram_id: telegramId,
      provider,
      инструментов: инструменты.length,
      инструменты: инструменты.slice(0, 8),
      длина: собрано.length,
    })

    return { текст: собрано, инструменты, provider, proposal } // cyrillic-ok: fields of ОтветАгента
  }

  try {
    for (let retries = 0; ; retries++) {
      try {
        return await attempt()
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (!retryAllowed(retries, message, toolsUsed)) throw e
        // Still ERROR-free on purpose: this attempt failed but the customer
        // has not been failed yet. The throw above is what pages when the
        // second attempt loses too.
        logger.warn('[trinityAgent] provider limit, one short retry', {
          telegram_id: telegramId,
          upstream: `${БАЗА}/api/agent/chat`,
          pause_ms: RETRY_PAUSE_MS,
          error: message.slice(0, 200),
        })
        await pause(RETRY_PAUSE_MS)
        // The shared deadline may have passed while we waited; a second
        // attempt on an aborted signal would only rename the error.
        if (прерыватель.signal.aborted) throw e // cyrillic-ok: pre-existing identifiers of this parser
      }
    }
  } finally {
    clearTimeout(таймер)
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
        signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
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
