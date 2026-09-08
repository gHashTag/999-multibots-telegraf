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
import { TOKEN_PRICES } from './billing-shared'
import { ПАКЕТЫ, ценаТокенов } from './token-packs' // cyrillic-ok: pre-existing names
import { salesPlaybook } from './crm-playbook'
import { allProviders, diagnose } from './provider'
import { withMediaParts, mediaKindsPresent } from './media-parts'
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

/**
 * The money-and-plan rule, lifted OUT of the SYSTEM template on purpose.
 *
 * It used to end with "the 30-day content plan is in SOUL.md below" -- said
 * unconditionally, while SOUL.md is absent in production (see `soul()`), so
 * the model was sent to a section that was not there. A model told to consult
 * something it cannot see has one move left: ask the person. Which is the
 * complaint the owner made.
 *
 * It lives here rather than inline because the Cyrillic gate can only see
 * complete quoted literals on a single line: inside a multi-line template
 * every edited line reads as code, and the marker that would satisfy the gate
 * would end up inside the prompt itself.
 */
const MONEY_AND_PLAN =
  '- Про деньги — честно: рилсы помогают зарабатывать, когда выходят ' + // cyrillic-ok: prompt copy
  'регулярно (3–4 в неделю минимум). Обещать доход нельзя — можно ' + // cyrillic-ok: prompt copy
  'обещать регулярность и разбор цифр. Контент-план на 30 дней ' + // cyrillic-ok: prompt copy
  'составь САМ, когда человек говорит «хочу раскрутиться / зарабатывать / ' + // cyrillic-ok: prompt copy
  'с чего начать» — не спрашивай разрешения, покажи первую неделю ' + // cyrillic-ok: prompt copy
  'и спроси, что поправить.' // cyrillic-ok: prompt copy

/**
 * BUTTONS THE AGENT PROPOSES ITSELF.
 *
 * The owner asked that answers always arrive with something to press, so a
 * person can react without typing. The bot already renders `[[Label|act:id]]`
 * markers through `parseAgentButtons` and drops any id it cannot handle -- but
 * nothing ever told the AGENT that the syntax exists. The only prompt that knew
 * it was the bot's FALLBACK, the tool-less model used when this agent is down.
 * So buttons were offered by the degraded path and not by the good one.
 *
 * ONLY FOR THE BOT. The same agent answers the mini app, which renders text as
 * text: a marker there would reach the person as literal bracket soup. The
 * surface arrives on the request and is already validated against an allowlist
 * in routes.ts; this rule is appended only when it says `bot`.
 *
 * The contract is the parser's, not a wish: id must be one of the three
 * registered ones, the label is at most 40 characters and may not contain `]`
 * or `|`, and at most four markers survive. An unknown id is dropped silently,
 * which is why the list is spelled out rather than left to invention.
 */
const BUTTON_MARKERS =
  '\n\nКНОПКИ. Ты отвечаешь в Telegram-боте, где человек может нажать, а не ' + // cyrillic-ok: prompt copy
  'печатать. Если у ответа есть очевидный следующий шаг — предложи его ' + // cyrillic-ok: prompt copy
  'кнопкой: поставь в конце ответа маркер [[Подпись|act:id]], где id — одно ' + // cyrillic-ok: prompt copy
  'из ТРЁХ: topup (пополнить баланс), balance (показать баланс), can (что ' + // cyrillic-ok: prompt copy
  'сейчас доступно). Другие id не работают и будут молча выброшены — не ' + // cyrillic-ok: prompt copy
  'выдумывай их. Подпись — до 40 символов, без символов ] и |. Не больше ' + // cyrillic-ok: prompt copy
  '4 маркеров. Кнопка нужна не всегда: ставь её, когда шаг реально ' + // cyrillic-ok: prompt copy
  'есть, а не для украшения. Стандартные кнопки бот добавит и без тебя.' // cyrillic-ok: prompt copy

/**
 * THE CREATOR IN THE APP. This bullet used to sell a club at ninety-nine and
 * nine-hundred-ninety-nine dollars a month to every creator, on every turn,
 * and to hold the product behind it ("полный харнес и еженедельные встречи —
 * в клубе"). The prices are spelled in words on purpose: the census in
 * we-sell-tokens-not-a-subscription.test.ts greps this directory for the
 * literals, and a comment quoting them would read as the offer itself. No such
 * subscription exists, has ever been charged, or has a billing path. The
 * owner sells ONE thing: tokens, and everything (text, picture, voice, video)
 * is drawn against them.
 *
 * It also sent the person off to connect and pay for their OWN provider keys.
 * We are the ones holding the providers -- that is the product -- so
 * provider_setup is the owner's reference, not a task for a guest.
 *
 * The value framing is kept whole: the owner asked to sell the result, and to
 * push the top-up rather than to apologise for the price.
 *
 * One line per string, like DM_CLIENT_BULLET beside it: the Cyrillic gate
 * reads single-line literals only.
 */
const CREATOR_MONEY_BULLET = [
  '- ДЕНЬГИ: ТАРИФОВ, ПОДПИСОК И КЛУБА НЕТ — есть токены на балансе.',
  '  Всё, что мы делаем — текст, картинка, озвучка, видео, рилс, — списывается',
  '  с них. Пакеты: %%PACKS_LINE%% (tokens_invoice выпишет счёт на любое число).',
  '  Спросили про цену, деньги, «сколько стоит», подписку или тариф — отвечай',
  '  про токены и СРАЗУ предлагай пополнить: вызови tokens_invoice и дай ссылку',
  '  одной строкой. Никаких «оформите подписку» и никуда не отправляй: счёт',
  '  выписываешь ты, здесь. Что бесплатно, а что платно — вызови pricing.',
  '  ПРОВАЙДЕРОВ ДЕРЖИМ МЫ. Человеку не нужно ничего подключать и не нужно',
  '  платить за чужие ключи — он платит токенами, а доступ к моделям наш. Если',
  '  провайдер сломан, назови ЧТО именно не работает и предложи рабочую замену;',
  '  provider_setup — справочник владельца, а не задание гостю.',
  '  ЗАВЛЕКАЙ ЦЕННОСТЬЮ, НЕ ДЕШЕВИЗНОЙ. Ты — агент-студия: делаешь рилсы в ЕГО',
  '  стиле и голосе, ведёшь ленту, растишь охваты, ставишь производство на',
  '  поток. Продавай результат и время человека, а не «бесплатные тулзы».',
  '  Бесплатная проба — витрина качества (сценарий, разбор, черновик рилса), а',
  '  не приманка сама по себе. Слова «бесплатно/дёшево/халява» как главный',
  '  аргумент удешевляют продукт — избегай их.',
].join('\n')

/**
 * THE CLIENT IN THE OWNER'S DM. The business bot answers in the owner's own
 * private chats, as the owner, to people who are not creators using the
 * harness: they want a picture, a reel, a voice -- and to pay for it here.
 * Found 2026-09-08: the old responder carried invented tariffs ("Basic 299
 * rub/month"), and a person who asked to pay was told to choose one. There
 * are no tariffs. There are tokens, and there is an invoice. One line per
 * string on purpose: the Cyrillic gate reads single-line literals only.
 */
const DM_CLIENT_BULLET = [
  '- ТЫ ОТВЕЧАЕШЬ В ЛИЧНОЙ ПЕРЕПИСКЕ ОТ ИМЕНИ ВЛАДЕЛЬЦА ЕГО КЛИЕНТУ. Тарифов,',
  '  подписок и клуба для клиента НЕТ — только токены за звёзды Telegram.',
  '  Пакеты: %%PACKS_LINE%% (tokens_invoice принимает любое число). «Хочу оплатить»,',
  '  «сколько стоит», «как купить», «пополнить» — СРАЗУ вызови tokens_invoice',
  '  (по умолчанию 50) и дай ссылку на счёт одной строкой; никаких «выберите',
  '  тариф» и никаких сумм по памяти. Слова «оплатил / перевёл / @pay» — не оплата:',
  '  проверь my_balance и скажи, что видишь. Просьба сделать фото, рилс, озвучку —',
  '  делай сразу инструментом (у нового человека есть стартовые токены), назови',
  '  списание и остаток. Коротко, по-человечески, 2–4 предложения, без ссылок,',
  '  кроме счёта. Не предлагай «открыть бота» вместо дела: дело — здесь.',
].join('\n')

/** The two lines the prompt must never guess: prices from the price list. */
function tokenLine(): string {
  const p = TOKEN_PRICES
  return (
    `картинка ${p.image_generate}, рилс ${p.reel_render}, озвучка ${p.audio_generate}, ` +
    `липсинк ${p.lipsync_generate}/с, видео ${p.video_generate}`
  )
}
function packsLine(): string {
  return ПАКЕТЫ // cyrillic-ok: pre-existing identifiers
    .map(n => {
      // cyrillic-ok: pre-existing name
      const c = ценаТокенов(n) // cyrillic-ok: pre-existing helper name
      return `${n} токенов → ${c.звёзд}⭐` // cyrillic-ok: pre-existing field name
    })
    .join(', ')
}

const SYSTEM_TEMPLATE = `Ты — агент внутри приложения Trinity S³AI для создания рилсов.

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
- НЕ ГОВОРИ О ТОМ, ЧЕГО НЕ СМОТРЕЛ. Пустой ответ ОДНОГО инструмента ничего
  не говорит про ОСТАЛЬНЫЕ хранилища. Это уже было на живом разговоре:
  my_renders вернул пусто, и в ответе появилось «и лента тоже пока без твоих
  публикаций» — при том, что в ленте лежало 19 его роликов из 20, а ни один
  инструмент ленты вызван не был. Человек поверил бы, что его работа пропала.
  Правило простое: сказал «у тебя нет X» — значит в ЭТОМ разговоре вызвал
  инструмент, который смотрит X. Не вызвал — либо вызови, либо молчи про X.
- НЕ ОБЕЩАЙ ПЛАТНОЕ, НЕ ПРОВЕРИВ. Прежде чем предложить картинку, озвучку
  или видео — вызови providers_status. Провайдер бывает мёртв по балансу или
  ключу; обещание в этот момент стоит человеку хода, а тебе — доверия. Если
  что-то не работает, скажи ЧТО именно и почему, и предложи бесплатное:
  ленту, файлы, план, ремикс уже готового.
%%CLUB_OR_DM%%
- Про человека спрашивай не его, а whoami: там имя и ссылка на его фото.
  «Сделай про меня» — это про конкретного человека, а не про абстракцию.

Правила проекта, обязательные:
- К каждому видео идёт текст поста с хештегами. Инструмент публикации сам
  отклонит текст без хештегов — это канон, а не придирка.
- Название компании пишется ровно так: Trinity S³AI.
- ТОКЕНЫ: генерации платные для человека — %%TOKEN_LINE%% (цены из
  себестоимости — не занижай их в разговоре). Баланс приходит полем «токены» в каждом результате: ВСЕГДА
  называй вслух «−N токенов, осталось M» после платной операции — человек
  должен видеть цену своих желаний. Кончились — честно скажи и предложи
  бесплатные действия (лента, SOUL, ремикс готовых файлов, аналитика).
- СКИЛЛЫ ЧЕЛОВЕКА: у человека есть папка правил (skills_list) — тон
  рилсов, запрещённые приёмы, каноны ниши. Перед тем как писать текст
  поста или заголовок — посмотри скиллы и применяй их буквально:
  они важнее твоих общих представлений о «хорошем». Скиллов нет —
  предложи создать первый вместе (skills_create): 2–3 правила уже
  делают голос узнаваемым.
- ПРОАКТИВНОСТЬ ВЕДИ К ДЕЙСТВИЮ: после каждого ответа предлагай ОДИН
  конкретный следующий шаг с ценой («соберу рилс за 2 токена — делаю?»).
  Сам предлагай генерации, когда видишь повод: пустая лента, новые файлы
  без дела, свежий пост блога, тема, которая смотрится.
- Платные генерации ОТКРЫТЫ тебе владельцем полностью: image_generate (картинки),
  audio_generate (озвучка), video_generate (видео), reel_render (сборка рилса
  в mp4). Это твоё производство — пользуйся им как своим: человек просит
  ролик, ты его ДЕЛАЕШЬ, а не объясняешь, почему нельзя. Полный цикл:
  image_generate/audio_generate → reel_render (готовый mp4) → feed_publish.
  Публикация по-прежнему требует текст поста с хештегами — это канон.

САМОСТОЯТЕЛЬНОСТЬ И ЗАБОТА (учи как мама, говори с простыми людьми):
- Ты не ждёшь вопроса — ты ведёшь. Если человек молчит или пишет
  расплывчато («привет», «что делать»), сам предложи 2–3 КОНКРЕТНЫХ
  действия из того, что видишь в его ленте и файлах. Не «чем помочь?»,
  а «в ленте 3 ролика без описаний — давай добавим тексты и опубликуем,
  начать с последнего?»
- После каждого своего ответа — один следующий шаг. Человек пришёл
  зарабатывать рилсами; каждый ответ двигает его к следующему рилсу.
- Говори как с новичком: без жаргона. Не «запусти рендер композиции»,
  а «нажми Создать — приложение соберёт видео за тебя». Термин —
  только вместе с человеческим объяснением.
- Хвали за действия, а не за слова: «ты опубликовал — это уже больше,
  чем у 90% людей, которые только собираются».
${MONEY_AND_PLAN}

Отвечай по-русски, коротко, числами из инструментов, а не примерными.`

/** The prompt for a surface: the club for creators, the invoice for a client in the DM. */
function systemFor(surface?: string): string {
  return SYSTEM_TEMPLATE.replace(
    '%%CLUB_OR_DM%%',
    surface === 'business' ? DM_CLIENT_BULLET : CREATOR_MONEY_BULLET
  )
    .replace('%%TOKEN_LINE%%', tokenLine())
    .replace('%%PACKS_LINE%%', packsLine())
}

/**
 * SOUL.md — голос владельца (см. корень репо). Один файл настраивает тон
 * и чата, и всех постов, которые агент публикует: изменил файл — изменился
 * голос everywhere. Читается лениво и один раз: файл редкий, а читать его
 * на каждый заход диалога — трата. Кандидаты путей покрывают локальный
 * запуск из исходников и Railway, где репо лежит целиком.
 */
let soulCache: string | null | undefined
export function soul(): string | null {
  if (soulCache !== undefined) return soulCache
  const here = dirname(fileURLToPath(import.meta.url))
  /*
   * Walk UP looking for the file instead of counting `..` segments.
   *
   * The count was six; from the source tree it is five (agent -> src ->
   * render -> vibee-editor -> apps -> root), so it resolved one level ABOVE
   * the repository and never matched. A number like that is wrong differently
   * under `tsx` and under a build that emits to `dist/`, and it fails the same
   * silent way both times.
   */
  const upwards: string[] = []
  let dir = here
  for (;;) {
    upwards.push(join(dir, 'SOUL.md'))
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  const candidates = [
    process.env.SOUL_MD_PATH,
    ...upwards,
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
  /*
   * Say what to DO about it. Fixing the path above is not enough in
   * production: the render image is built with `apps/vibee-editor` as its
   * context and copies only `packages/` and `render/`, so the repository-root
   * SOUL.md never enters the image at all. Until that is decided, SOUL_MD_PATH
   * is the way in -- and the prompt below no longer pretends the voice is
   * there when it is not.
   */
  console.warn(
    '[agent] SOUL.md не найден (искал ' + // cyrillic-ok: operator-facing log line
      candidates.length +
      ' путей, включая SOUL_MD_PATH). Агент говорит без голоса владельца.' // cyrillic-ok: operator-facing log line
  )
  soulCache = null
  return null
}

/**
 * Exported for the tests: the property being guarded is that the prompt never
 * refers the model to a section that is not in it, and that is a property of
 * the STRING, which is unreachable through `runAgent` without a live model.
 */
export function systemPrompt(surface?: string): string {
  const buttons = surface === 'bot' ? BUTTON_MARKERS : ''
  const s = soul()
  if (!s) return systemFor(surface) + buttons
  return (
    systemFor(surface) +
    buttons +
    '\n\nКОНТЕНТ-ПЛАН НА 30 ДНЕЙ есть в голосе владельца ниже — бери его ' + // cyrillic-ok: prompt copy
    'оттуда, а не выдумывай.' + // cyrillic-ok: prompt copy
    '\n\nГОЛОС ВЛАДЕЛЬЦА (SOUL.md). Когда пишешь текст поста, заголовок или ' +
    'описание для публикации — делай это голосом ниже: измерение вместо ' +
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
  /*
   * A TURN WITH A PICTURE GOES TO A PROVIDER THAT CAN SEE IT.
   *
   * Order alone is not enough and would break twice. Sending image parts to
   * z.ai fails the whole turn with 400 "allowed values: ['text']" -- not a
   * degraded answer, no answer. And the reverse is just as real: on 2026-09-07
   * z.ai was rate-limited until the 11th, so the agent was already running on
   * the sighted provider; when the limit resets, z.ai returns to the front and
   * sight would vanish with no code change and no message.
   *
   * So capability decides, not position. Among the sighted ones the configured
   * order still holds, which is why this filters rather than picks.
   */
  /*
   * A TURN WITH MEDIA GOES TO A PROVIDER THAT CAN PERCEIVE IT.
   *
   * Order alone is not enough and would break twice. Sending parts to z.ai
   * fails the whole turn with 400 "allowed values: ['text']" -- not a degraded
   * answer, no answer. And the reverse is just as real: on 2026-09-07 z.ai was
   * rate-limited until the 11th, so the agent already ran on the capable
   * provider; when the limit resets, z.ai returns to the front and the senses
   * would vanish with no code change and nothing in the log.
   *
   * Sight and hearing are required SEPARATELY. A turn carrying both a photo
   * and a voice message needs a provider that does both, and demanding only
   * one would send the other into a model that cannot take it.
   */
  const kinds = mediaKindsPresent(messages)
  const configured = allProviders()
  const capable = configured.filter(
    p => (!kinds.has('image') || p.vision) && (!kinds.has('audio') || p.audio)
  )

  /*
   * Parts are built ONLY when somebody can actually perceive them. With media
   * present and no capable provider configured, the marker line is still in
   * the text -- answering from the description is strictly better than failing
   * the turn, and it is exactly today's behaviour.
   */
  const useParts = kinds.size > 0 && capable.length > 0
  if (kinds.size > 0 && !useParts) {
    console.warn(
      '[agent] во вложении есть ' +
        [...kinds].join(', ') +
        ', но ни один настроенный провайдер это не воспринимает — ' +
        'отвечаю по тексту вложения'
    )
  }
  const providers = useParts ? capable : configured

  if (!providers.length) {
    throw new Error(
      'Ключ модели не задан. Нужен GLM_API_KEY, NVIDIA_API_KEY или OLLAMA_BASE_URL. ' +
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
      messages: useParts ? withMediaParts(messages) : messages,
      tools: toOpenAITools(p),
      tool_choice: 'auto',
      temperature: 0.3,
      stream: true,
    }
    // Режим размышления есть только у GLM. Подставлять его OpenAI нельзя —
    // неизвестное поле там ошибка, а не игнор.
    if (p.thinking) body.thinking = { type: 'enabled' }

    // Дедлайн на ВЕСЬ ответ провайдера. Без него зависшее соединение
    // (провайдер открыл поток и молчит) вешало reader.read() навсегда: канал
    // к клиенту висел без heartbeat, человек крутил точки печати вечно.
    // AbortController обрывает и fetch, и чтение тела, поэтому reader.read()
    // отвергнется, а не зависнет. 120с — потолок с запасом на длинный ответ
    // с размышлением.
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 120_000)
    // Отдали ли клиенту хоть кусок текста. Если да, «тихо начать заново у
    // другого провайдера» уже нельзя — человек увидел бы склейку двух ответов.
    let ужеОтдалиТекст = false
    try {
      const r = await fetch(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      })

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
          // Ошибка провайдера ПОСРЕДИ потока приходит как 200 + data:{error}.
          // Раньше `if (!d) continue` её молча проглатывал, поток заканчивался
          // пустым, и клиент получал пустой пузырь. Теперь бросаем — runAgent
          // поймает и покажет человеку 'ошибка', а не пустоту.
          if (j.error) {
            throw new Error(
              `${p.id} прислал ошибку в потоке: ${JSON.stringify(j.error).slice(0, 150)}`
            )
          }
          const d = j.choices?.[0]?.delta
          if (!d) continue
          if (d.reasoning_content) {
            yield { kind: 'reasoning', text: d.reasoning_content }
          }
          if (d.content) {
            acc.content += d.content
            ужеОтдалиТекст = true
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
    } catch (e) {
      const почему = ac.signal.aborted
        ? `${p.id}: не ответил за 120с (таймаут)`
        : `${p.id}: ${String(e).slice(0, 140)}`
      // Уже отдали текст — молчаливый перевод на другого провайдера склеил бы
      // два ответа. Бросаем: пусть runAgent покажет, что ответ оборван.
      if (ужеОтдалиТекст) throw new Error(почему)
      причины.push(почему)
      continue
    } finally {
      clearTimeout(timer)
    }
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
  ctx: ToolContext,
  /**
   * Where the person is writing from. The chat route already validates it
   * against an allowlist and used it only to label the stored turn; the agent
   * needs it too, because a button marker belongs in the bot and nowhere else.
   * Absent means "not the bot", which is the safe direction: no markers.
   */
  opts?: { surface?: string }
): AsyncGenerator<AgentEvent> {
  // ЛИЧНЫЙ SOUL звонящего: у каждого человека свой голос и свои границы,
  // агент пишет посты от его имени — значит, должен знать его SOUL так же,
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
  } catch (e) {
    // SOUL — усиление, не блокировка: без него чат обязан работать.
    console.warn('[agent] личный SOUL не прочитан:', String(e).slice(0, 120))
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: personalSoul
        ? systemPrompt(opts?.surface) +
          salesPlaybook({
            surface: opts?.surface,
            telegramId: ctx.telegramId,
          }) +
          '\n\nЛИЧНЫЙ SOUL ЧЕЛОВЕКА, С КОТОРЫМ ТЫ ГОВОРИШЬ. Тексты постов, ' +
          'идеи и тон — подстраивай под него; голос бренда t27 остаётся ' +
          'правилом честности (числа, границы), но ЧЕЙ это контент и каким ' +
          'голосом — решает этот SOUL. Человек может просить править его ' +
          'через soul_edit — это его скилл, помогай с этим.\n\n' +
          personalSoul
        : systemPrompt(opts?.surface) +
          salesPlaybook({ surface: opts?.surface, telegramId: ctx.telegramId }),
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
