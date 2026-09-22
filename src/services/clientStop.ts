/**
 * A CLIENT WHO ASKS THE ASSISTANT TO STOP IS HEARD BEFORE ANY MODEL IS ASKED.
 *
 * Measured 2026-09-22 while preparing club offers: the owner's closest
 * clients were worn out by the assistant that answers as the owner in his
 * Telegram Business DMs -- the same pitch again, voice notes left hanging, an
 * echo loop -- and one of them asked, in plain words, for it to be switched
 * off. Nothing in the code recognised that. The only silence the assistant
 * knew was the owner's own takeover (30 minutes, in process memory, gone on
 * every deploy), so the request was answered by the very machine it asked to
 * stop, as a normal turn.
 *
 * This module is the ear. It decides one thing -- "is this message a request
 * to stop the automatic replies?" -- and it decides it WITHOUT a model, for
 * two reasons that outlive any particular model:
 *
 *  - the decision must be the same every time the same words arrive. A model
 *    that is right nineteen times and talks back on the twentieth has failed
 *    the one client who needed it;
 *  - the model is the thing being complained about. Asking it whether it is
 *    being told to go away puts the defendant on the bench.
 *
 * THE BIAS IS DELIBERATE. A false positive costs little: the owner is told
 * once, sees the client's words, and turns the assistant back on with one
 * press. A false negative is the harm this exists to end -- a person who said
 * "stop" and got another automatic reply. So the phrase lists lean wide, and
 * only these shapes are carved out, each because it is common and clearly not
 * a request about THIS assistant:
 *
 *  1. negation of the verb, up to four words back in the same clause -- "don't
 *     turn off the bot", "I'm not asking you to switch it off", "you must
 *     not switch the bot off";
 *  2. a how-to question -- "how do I switch a bot off?" (this platform sells bots;
 *     a client asking how to switch off a bot is usually asking about theirs);
 *  3. the client's own bot -- "switch off MY bot", in either language;
 *  4. product talk -- a bot in another place ("from my group"), the AI as an
 *     attribute ("the AI watermark"), a live person or "no bot" inside a
 *     product or price question ("a video with a real person").
 *
 * Wide is only affordable because a wide match is reversible: see `sure` on
 * StopRequest -- the words to the client wait for the owner unless the
 * request cannot mean anything else.
 *
 * Everything else that names this assistant next to a stop verb, asks for a
 * living person or for the owner to write himself, or says "enough" to the
 * messages, is a stop.
 *
 * The word lists are strings on purpose: a regex literal with Cyrillic in it
 * is code, not a string, and the no-cyrillic gate refuses it. Every pattern
 * below is therefore built with `new RegExp` from string literals.
 */

export type StopLanguage = 'ru' | 'en'

export interface StopRequest {
  /** The language to acknowledge in: the client's own. */
  lang: StopLanguage
  /** Which rule matched, for the log line. Our words, never the client's. */
  rule: string
}

/** Lower case, one alphabet for e/yo, punctuation turned into spaces. */
/*
 * Built from strings: a Cyrillic letter inside a regex LITERAL is code to the
 * no-cyrillic gate, inside a string it is text.
 */
const YO = new RegExp('ё', 'g')
const NOT_A_WORD = new RegExp('[^a-z0-9а-я\\x27\\- ]+', 'g')
const CYRILLIC_LETTER = new RegExp('[а-яё]', 'i')

export function normaliseForStop(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(YO, 'е')
    .replace(/[\u2019\u02bc]/g, "'")
    .replace(NOT_A_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const whole = (alternatives: string[]): RegExp =>
  new RegExp('^(?:' + alternatives.join('|') + ')$')

/*
 * WHAT COUNTS AS THIS ASSISTANT. A token (or a two-token phrase) that names
 * the bot, the auto-replies, the assistant, the AI.
 */
const TARGET_ONE = whole([
  '(?:чат-?)?бот(?:а|у|ом|е|ы|ов|ам|ами|ах|ик|ика|ику)?',
  'авто-?ответ(?:ы|ов|а|у|ом|ами|ах)?',
  'автоответчик(?:а|у|ом|е|и|ов|ами)?',
  'ассистент(?:а|у|ом|е|ы|ов)?',
  'робот(?:а|у|ом|е|ы|ов)?',
  'автопилот(?:а|у|ом|е)?',
  'ии',
  'нейросет(?:ь|и|ью|ей)',
  'нейронк(?:а|у|и|ой)',
  '(?:chat)?-?bots?',
  'auto-?repl(?:y|ies|ier|iers)',
  'auto-?respon(?:der|ders|se|ses)',
  'autoresponders?',
  'assistant',
  'ai',
  'robots?',
  'autopilot',
  'gpt',
  'chatgpt',
])

const TARGET_FIRST = whole([
  'автоматическ(?:ие|их|ий|ого|им|ими|ое)',
  'авто',
  'искусственн(?:ый|ого|ому|ым)',
  'automatic',
  'automated',
  'auto',
])
const TARGET_SECOND = whole([
  'ответ(?:ы|ов|а|у|ом|ами|ах)?',
  'сообщени(?:я|й|е|ями|ях)',
  'рассылк(?:а|у|и|ой)',
  'интеллект(?:а|у|ом)?',
  'repl(?:y|ies)',
  'respons(?:e|es)',
  'messages?',
  'answers?',
  'texts?',
])

/** Pronouns that name the assistant only when the message names it elsewhere. */
const PRONOUN = whole(['его', 'ее', 'это', 'их', 'it', 'him', 'this'])

/** The client's own bot: "my bot" and the Russian case forms of "my". */
const OWN = whole([
  'мой',
  'моего',
  'моему',
  'моим',
  'моем',
  'свой',
  'своего',
  'своему',
  'своим',
  'своем',
  'my',
  'mine',
])

/** Words that may sit between a stop verb and its object. */
const FILLER = whole([
  'ваш',
  'вашего',
  'вашему',
  'ваша',
  'вашу',
  'ваши',
  'ваших',
  'этот',
  'этого',
  'эту',
  'эти',
  'этих',
  'все',
  'всех',
  'всю',
  'пожалуйста',
  'плиз',
  'пж',
  'уже',
  'мне',
  'нам',
  'у',
  'меня',
  'нас',
  'наконец',
  'срочно',
  'тут',
  'здесь',
  'же',
  'совсем',
  'вообще',
  'просто',
  'лучше',
  'ка',
  'the',
  'your',
  'that',
  'these',
  'those',
  'all',
  'please',
  'pls',
  'plz',
  'now',
  'already',
  'just',
  'for',
  'me',
  'completely',
  'whole',
])

/** Russian stop verbs: imperative and infinitive ("may I switch it off?"). */
const VERB_RU = whole([
  '(?:вы|от)ключ(?:и|ите|ить|ай|айте|ать)',
  'выруб(?:и|ите|ить|ай|айте|ать)',
  'убер(?:и|ите)',
  'убрать',
  'убирай(?:те)?',
  'удал(?:и|ите|ить)',
  'останов(?:и|ите|ить)',
  'отмен(?:и|ите|ить)',
  'уйми(?:те)?',
  'заткни(?:те)?',
  'отвяж(?:и|ите)',
  'отвязать',
  'деактивир(?:уй|уйте|овать)',
  'стоп',
])
/** English stop verbs that take their object straight after. */
const VERB_EN = whole([
  'disable',
  'deactivate',
  'stop',
  'kill',
  'remove',
  'mute',
  'pause',
  'cancel',
  'unplug',
])
/** "turn off X" and "turn X off". */
const PARTICLE_VERB_EN = whole(['turn', 'switch', 'shut'])

const NEGATOR = whole([
  'не',
  'ни',
  'нельзя',
  'никто',
  'никогда',
  'незачем',
  "don't",
  'dont',
  'never',
  'not',
  'no',
  'nobody',
  "doesn't",
  'doesnt',
  "didn't",
  'didnt',
  "won't",
  'wont',
])
/*
 * A negator that is a politeness, not a refusal: the Russian "could you not
 * switch it off" is "could you switch it off", and "why don't you turn it off"
 * asks for it.
 */
const POLITE_AFTER_NOT = whole([
  'мог(?:ли|ла|ешь|ете|ут)',
  'можете',
  'можешь',
  'сможете',
  'сможешь',
  'трудно',
  'сложно',
])
const WHY = whole(['почему', 'why'])
/** Where a negation stops reaching: a clause break or a conjunction. */
const CLAUSE_BREAK = whole(['\\|', 'и', 'а', 'но', 'and', 'but'])
const HOW = whole(['как', 'how'])
const YOUR = whole(['ваш', 'вашего', 'вашу', 'ваши', 'ваших', 'your'])

/*
 * PRODUCT TALK. This platform sells bots, AI video and AI portraits, so a
 * client talks about "a bot" and "AI" for reasons that have nothing to do with
 * the assistant answering them. Three shapes, each from the review's probes:
 *
 *  - a PLACE that is not this chat: "remove the bot from my group", "switch
 *    off the AI in my channel" -- somebody else's bot, somewhere else;
 *  - the target as an ATTRIBUTE of the next noun: "remove the AI watermark";
 *  - a PRODUCT or a PRICE in the message: "a video with a real person",
 *    "how much is a site without a bot" -- a spec, not a request to stop.
 */
const PLACE = whole([
  'групп[а-я]*',
  'канал[а-я]*',
  'бесед[а-я]*',
  'сайт[а-я]*',
  'приложени[а-я]*',
  'сообществ[а-я]*',
  'паблик[а-я]*',
  'магазин[а-я]*',
  'инстаграм[а-я]*',
  'вк',
  'вконтакте',
  'groups?',
  'channels?',
  'sites?',
  'websites?',
  'apps?',
  'servers?',
  'communit(?:y|ies)',
  'stores?',
  'shops?',
  'discord',
  'slack',
  'whatsapp',
  'instagram',
])
const ATTRIBUTE_OF = whole([
  'озвучк[а-я]*',
  'голос[а-я]*',
  'генераци[а-я]*',
  'watermarks?',
  'logos?',
  'labels?',
  'voices?',
  'filters?',
  'effects?',
  'backgrounds?',
  'captions?',
  'subtitles?',
  'generators?',
  'images?',
  'videos?',
  'photos?',
  'pictures?',
  'avatars?',
  'art',
  'content',
  'features?',
  'marks?',
  'tags?',
  'badges?',
  'stickers?',
  'detectors?',
  'detection',
])
const PRODUCT_OR_PRICE = whole([
  'видео[а-я]*',
  'ролик[а-я]*',
  'клип[а-я]*',
  'фото[а-я]*',
  'фотк[а-я]*',
  'картинк[а-я]*',
  'изображени[а-я]*',
  'аватар[а-я]*',
  'портрет[а-я]*',
  'персонаж[а-я]*',
  'рилс[а-я]*',
  'липсинк[а-я]*',
  'озвучк[а-я]*',
  'сайт[а-я]*',
  'лендинг[а-я]*',
  'приложени[а-я]*',
  'магазин[а-я]*',
  'воронк[а-я]*',
  'канал[а-я]*',
  'групп[а-я]*',
  'сколько',
  'стоит',
  'стоимост[а-я]*',
  'цен[аыуе]',
  'прайс[а-я]*',
  'почем',
  'руб[а-я]*',
  'videos?',
  'photos?',
  'avatars?',
  'portraits?',
  'images?',
  'pictures?',
  'clips?',
  'reels?',
  'websites?',
  'landing',
  'price[sd]?',
  'costs?',
])
/** Words that make "a live person" a person to talk to, not one to film. */
const CONTACT_WORD = new RegExp(
  '^(?:общ|пообщ|говор|поговор|переписыв|разговар|связ|соедин|позов|talk|speak|chat|contact)'
)

/** The tokens of the clause that holds token `i` (clauses split by `|`). */
function clauseOf(tokens: string[], i: number): string[] {
  let from = i
  while (from > 0 && tokens[from - 1] !== '|') from -= 1
  let to = i
  while (to < tokens.length - 1 && tokens[to + 1] !== '|') to += 1
  return tokens.slice(from, to + 1)
}

/** The target at `target` is somewhere else, or a modifier of a product. */
function aboutSomethingElse(
  tokens: string[],
  target: number,
  width: number
): boolean {
  if (ATTRIBUTE_OF.test(tokens[target + width] ?? '')) return true
  return clauseOf(tokens, target).some(t => PLACE.test(t))
}

/** Message tokens, with `|` where the client put a clause break. */
function clauseTokens(raw: string): string[] {
  return raw
    .split(/[,.;:!?\u2026()\n\u2014\u2013]+|\s-\s/)
    .map(normaliseForStop)
    .filter(Boolean)
    .join(' | ')
    .split(' ')
}

/** Messages that are a stop by themselves, with only small words around. */
const ALONE_STOP = whole([
  'стоп',
  'stop',
  'хватит',
  'отстань',
  'отстаньте',
  'отпишите',
  'отпишись',
  'отпишитесь',
  'unsubscribe',
])
const ALONE_FILLER = whole([
  'уже',
  'все',
  'пожалуйста',
  'пж',
  'ну',
  'так',
  'please',
  'it',
  'now',
  'just',
  'ok',
  'okay',
  'ок',
])

/*
 * PHRASES that carry their own meaning, negation included ("I do not want
 * to talk to a bot" is a stop). Matched against " " + normalised + " ", so a space is a
 * word boundary -- `\b` is ASCII-only in JavaScript and would never see a
 * Russian word.
 */
const T_RU =
  '(?:(?:чат-?)?бот(?:а|у|ом|е|ы|ов|ам|ами|ах)?|авто-?ответ\\S*|автоответчик\\S*|ассистент\\S*|робот\\S*|ии|нейросет\\S*|нейронк\\S*|машиной|автоматическ\\S* (?:ответ|сообщени)\\S*)'
const T_EN =
  '(?:(?:chat)?-?bots?|auto-?repl\\S*|auto-?respon\\S*|autoresponders?|assistant|ai|robots?|machine|automat\\S* (?:repl|respon|messag|answer|text)\\S*)'
const W = '(?: \\S+)'

const PHRASES: Array<[string, RegExp]> = [
  [
    'ru-live-person',
    new RegExp(
      ' (?:с )?(?:живым|живой|настоящим|реальным|нормальным) (?:человеком|человек|людьми|оператором|менеджером) '
    ),
  ],
  [
    'ru-live-person',
    new RegExp(
      ' (?:живого|настоящего|реального) (?:человека|оператора|менеджера) '
    ),
  ],
  [
    'ru-call-a-person',
    new RegExp(
      ' (?:позовите|позови|соедините|соедини|переключите|свяжите)' +
        W +
        '{0,2} (?:с )?(?:человек\\S*|хозяин\\S*|владел\\S*|оператор\\S*|менеджер\\S*|автор\\S*) '
    ),
  ],
  [
    'ru-directly',
    new RegExp(
      ' (?:общаться|говорить|переписываться|разговаривать|поговорить|пообщаться|списаться|связаться)' +
        W +
        '{0,3} (?:напрямую|лично|с человеком) '
    ),
  ],
  [
    'ru-not-with-a-bot',
    new RegExp(
      ' не (?:хочу|буду|желаю|собираюсь|хотел|хотела|хотим)' +
        '(?: (?:общаться|говорить|переписываться|разговаривать|болтать|переписку|вести|иметь|дела|дело|чтобы|мне|отвечал|отвечала|писал|писала|тут|здесь))' +
        '{0,3} (?:с |со )?' +
        T_RU +
        ' '
    ),
  ],
  [
    'ru-enough-bot',
    new RegExp(
      ' (?:хватит|довольно)' +
        '(?: (?:ваш\\S*|этого|этих|этот|вот|мне|нам|больше|тут|здесь|пожалуйста|уже))' +
        '{0,2} ' +
        T_RU +
        ' '
    ),
  ],
  [
    'ru-no-bot',
    new RegExp(
      ' (?:не (?:надо|нужно|нужен|нужна|нужны)|без)' +
        '(?: (?:ваш\\S*|этого|этих|этот|вот|мне|нам|больше|тут|здесь|пожалуйста|уже))' +
        '{0,2} ' +
        T_RU +
        ' '
    ),
  ],
  [
    'ru-bot-is-annoying',
    new RegExp(
      ' ' +
        T_RU +
        W +
        '{0,2} (?:достал|достала|достали|достает|надоел|надоела|надоели|надоело|задолбал|задолбала|задолбали|замучил|замучила|замучили|бесит|бесят|раздражает|утомил|утомила|утомили|спамит|хватит) '
    ),
  ],
  [
    'ru-bot-is-annoying',
    new RegExp(
      ' (?:достал|достала|достали|надоел|надоела|надоели|задолбал|задолбала|задолбали|замучил|замучила|замучили|бесит|бесят)' +
        W +
        '{0,2} ' +
        T_RU +
        ' '
    ),
  ],
  [
    'ru-stop-writing',
    new RegExp(
      ' (?:прекрати|прекратите|перестань|перестаньте|хватит|не надо|не нужно|больше не)(?: мне| нам| уже| пожалуйста| так| тут| сюда){0,2} (?:отвечать|писать|присылать|слать|спамить|пиши|пишите|отвечай|отвечайте|присылай|присылайте|шли|шлите) '
    ),
  ],
  [
    'ru-dont-write-me',
    new RegExp(
      ' не (?:пиши|пишите|отвечай|отвечайте|присылай|присылайте|шли|шлите|спамь|спамьте)(?: мне| нам)?(?: больше| сюда| пожалуйста| ничего| сообщения| автоматически| так)* $'
    ),
  ],
  [
    'ru-unsubscribe',
    new RegExp(' отпиш(?:и|ите|ись|итесь)(?: \\S+)? (?:меня|нас) '),
  ],
  ['ru-unsubscribe', new RegExp(' отписаться ')],
  [
    'ru-owner-himself',
    new RegExp(
      ' (?:отвечай|отвечайте|пиши|пишите|ответь|ответьте|напиши|напишите) (?:мне )?(?:сам|сама|сами|лично) '
    ),
  ],
  [
    'en-no-more',
    new RegExp(
      ' no more' +
        W +
        '{0,2} (?:repl\\S*|respons\\S*|messages?|bots?|automat\\S*|auto\\S*|texts?|spam) '
    ),
  ],
  [
    'en-stop-replying',
    new RegExp(
      "(?<! (?:don't|dont|not|never)) stop (?:auto-?|automatically )?(?:replying|responding|answering|messaging|texting|writing|sending|spamming) "
    ),
  ],
  [
    'en-live-person',
    new RegExp(
      ' (?:talk|speak|chat|write|text) (?:to|with) (?:a |an |the )?(?:real|live|actual|human|normal)(?: person| human| being| people)? '
    ),
  ],
  ['en-live-person', new RegExp(' (?:real|live|actual) (?:person|human) ')],
  ['en-live-person', new RegExp(' human please ')],
  [
    'en-directly',
    new RegExp(
      ' (?:talk|speak|chat) (?:to|with) (?:you|him|her|\\S+) (?:directly|personally|in person) '
    ),
  ],
  [
    'en-owner-himself',
    new RegExp(
      ' let (?:him|her|\\S+)' +
        W +
        '{0,1} (?:reply|answer|write|respond|text|message)(?: me)? (?:himself|herself|personally|in person|directly) '
    ),
  ],
  [
    'en-owner-himself',
    new RegExp(
      ' (?:reply|answer|write|respond) (?:yourself|personally|in person) '
    ),
  ],
  [
    'en-not-with-a-bot',
    new RegExp(
      " (?:don't|dont|do not) want (?:to )?(?:talk|chat|speak|write|text) (?:to|with) (?:a |an |the |your )?" +
        T_EN +
        ' '
    ),
  ],
  [
    'en-dont-write-me',
    new RegExp(
      " (?:don't|dont|do not|stop) (?:message|messaging|text|texting|write|writing|contact|contacting|spam|spamming)(?: to)? me "
    ),
  ],
  ['en-leave-me-alone', new RegExp(' leave me alone ')],
  ['en-unsubscribe', new RegExp(' (?:unsubscribe|opt out) ')],
  [
    'en-bot-is-annoying',
    new RegExp(
      ' ' +
        T_EN +
        W +
        '{0,2} (?:is|are) (?:so |really |very )?(?:annoying|spamming|too much) '
    ),
  ],
]

/*
 * Phrases a product or a price in the same message turns into a spec -- "a
 * video with a real person", "a site without a bot" -- unless the client also
 * says they want to TALK to that person.
 */
const PRODUCT_SENSITIVE = new Set([
  'ru-live-person',
  'ru-no-bot',
  'en-live-person',
])

const WRITE_WORD = new RegExp(
  '(?:пиш|напиш|ответ|отвеч|свяж|звон|переписыв|общ)'
)
const SELF_WORD = whole(['сам', 'сама', 'сами', 'лично'])

/** How many tokens starting at `i` name the assistant (0 = none). */
function targetAt(tokens: string[], i: number, pronounOk: boolean): number {
  const t = tokens[i]
  if (t === undefined) return 0
  if (TARGET_ONE.test(t)) return 1
  if (TARGET_FIRST.test(t) && TARGET_SECOND.test(tokens[i + 1] ?? '')) return 2
  if (pronounOk && PRONOUN.test(t)) return 1
  return 0
}

/**
 * Is the verb at `v` negated? Any negator up to four words back, inside the
 * same clause: "don't switch it off", "I am not asking to switch it off",
 * "nobody asked to switch it off", in either language.
 * The review's probes (PR 2849) showed a one-word window missing all of them.
 */
function verbIsNegated(tokens: string[], v: number): boolean {
  for (let n = 1; n <= 4; n++) {
    const t = tokens[v - n]
    if (t === undefined || CLAUSE_BREAK.test(t)) return false
    if (!NEGATOR.test(t)) continue
    if (POLITE_AFTER_NOT.test(tokens[v - n + 1] ?? '')) continue
    const before = tokens[v - n - 1] ?? ''
    if (WHY.test(before)) continue
    if (before === 'бы' && WHY.test(tokens[v - n - 2] ?? '')) continue
    return true
  }
  return false
}

function isHowTo(tokens: string[], v: number): boolean {
  for (let n = 1; n <= 3; n++) if (HOW.test(tokens[v - n] ?? '')) return true
  return false
}

/**
 * The object of a stop verb that starts at `from`: skip up to three filler
 * words, then a target. Returns the target's index, or -1.
 */
function objectAfter(
  tokens: string[],
  from: number,
  pronounOk: boolean
): number {
  let i = from
  for (let skipped = 0; skipped <= 3; skipped++) {
    if (targetAt(tokens, i, pronounOk)) return i
    if (!FILLER.test(tokens[i] ?? '')) return -1
    i += 1
  }
  return -1
}

/** A target that is somebody's own ("my bot") is not this assistant. */
function isOwnBot(tokens: string[], target: number): boolean {
  for (let n = 1; n <= 2; n++)
    if (OWN.test(tokens[target - n] ?? '')) return true
  return false
}

function yoursBefore(tokens: string[], target: number): boolean {
  for (let n = 1; n <= 2; n++)
    if (YOUR.test(tokens[target - n] ?? '')) return true
  return false
}

/** A stop verb with this assistant as its object, not negated. */
function verbRule(tokens: string[]): string | null {
  const named = tokens.some((_, i) => targetAt(tokens, i, false) > 0)
  for (let v = 0; v < tokens.length; v++) {
    const t = tokens[v]
    let objectFrom = -1
    let trailingOff = false
    if (VERB_RU.test(t) || VERB_EN.test(t)) objectFrom = v + 1
    else if (PARTICLE_VERB_EN.test(t)) {
      const next = tokens[v + 1] ?? ''
      if (next === 'off' || next === 'down') objectFrom = v + 2
      else {
        objectFrom = v + 1
        trailingOff = true
      }
    } else if (t === 'get' && tokens[v + 1] === 'rid' && tokens[v + 2] === 'of')
      objectFrom = v + 3
    if (objectFrom < 0) continue

    const target = objectAfter(tokens, objectFrom, named)
    if (target < 0) continue
    if (trailingOff) {
      const after = target + targetAt(tokens, target, named)
      if (tokens[after] !== 'off') continue
    }
    if (verbIsNegated(tokens, v)) continue
    if (isOwnBot(tokens, target)) continue
    if (aboutSomethingElse(tokens, target, targetAt(tokens, target, named)))
      continue
    if (isHowTo(tokens, v) && !yoursBefore(tokens, target)) continue
    return VERB_RU.test(t) ? 'ru-verb' : 'en-verb'
  }
  // The object first: "the bot -- switch it off", in Russian word order.
  for (let i = 0; i < tokens.length; i++) {
    const width = targetAt(tokens, i, false)
    if (!width) continue
    if (isOwnBot(tokens, i)) continue
    if (aboutSomethingElse(tokens, i, width)) continue
    let v = i + width
    for (let skipped = 0; skipped <= 2; skipped++) {
      const t = tokens[v] ?? ''
      if (VERB_RU.test(t) || VERB_EN.test(t)) {
        if (!verbIsNegated(tokens, v)) return 'object-first'
        break
      }
      if (!FILLER.test(t)) break
      v += 1
    }
  }
  return null
}

/** "let him write himself", "let <name> answer himself" -- not "let the bot". */
function letHimWrite(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'пусть') continue
    const window = tokens.slice(i + 1, i + 7)
    const self = window.findIndex(t => SELF_WORD.test(t))
    if (self < 0) continue
    const before = window.slice(0, self)
    if (before.some((_, k) => targetAt(before, k, false) > 0)) continue
    if (window.some(t => WRITE_WORD.test(t))) return true
  }
  return false
}

/**
 * Is this client message a request to switch the automatic replies off?
 * Null when it is not. Pure: no model, no network, no clock.
 */
export function isStopRequest(
  text: string | undefined | null
): StopRequest | null {
  const raw = String(text ?? '')
  const norm = normaliseForStop(raw)
  if (!norm) return null
  const lang: StopLanguage = CYRILLIC_LETTER.test(raw) ? 'ru' : 'en'
  const tokens = norm.split(' ')

  if (
    tokens.some(t => ALONE_STOP.test(t)) &&
    tokens.every(t => ALONE_STOP.test(t) || ALONE_FILLER.test(t))
  )
    return { lang, rule: 'alone' }

  const verb = verbRule(clauseTokens(raw))
  if (verb) return { lang, rule: verb }

  if (letHimWrite(tokens)) return { lang, rule: 'ru-let-him-write' }

  const product = tokens.some(t => PRODUCT_OR_PRICE.test(t))
  const contact = tokens.some(t => CONTACT_WORD.test(t))
  const padded = ` ${norm} `
  for (const [rule, re] of PHRASES) {
    if (!re.test(padded)) continue
    if (product && PRODUCT_SENSITIVE.has(rule) && !contact) continue
    return { lang, rule }
  }
  return null
}

/*
 * THE ONE LINE THE CLIENT GETS BACK.
 *
 * In the owner's voice, because it leaves from the owner's account; short,
 * because the person just asked for fewer messages; no buttons, no link, no
 * offer. It promises exactly one thing -- that a person will write -- and the
 * owner is told in the same minute that he made that promise.
 *
 * Neither line is gendered in Russian (a future-tense "I will answer", never
 * a past tense that carries gender): the farm has owners of both.
 */
export const STOP_ACK: Record<StopLanguage, string> = {
  ru: 'Хорошо, автоответы в этом чате выключены — дальше отвечу вам лично.',
  en: "Okay — automatic replies are off in this chat. I'll answer you personally from here on.",
}

/**
 * Does this owner want the client left without the acknowledgement?
 *
 * `CLIENT_STOP_SILENT_OWNERS` on the bot service: owner telegram ids,
 * comma-separated, or `*` for everybody. Read on every call, so a change
 * needs no code -- the same shape as CLUB_GUESTS.
 *
 * THE DEFAULT IS TO ACKNOWLEDGE, and that is the safer of the two. A client
 * who says "stop the bot" and then hears nothing cannot tell "stopped" from
 * "broken" or "ignored" -- which is precisely the complaint this feature
 * answers -- and usually repeats the request or leaves. One confirmation is
 * how every opt-out people already know behaves (STOP by SMS, unsubscribe by
 * mail). It goes exactly once per stop (the store claims it), carries no
 * pitch, and the owner is told what was said in his name.
 */
export function clientStopIsSilent(
  owner: string | number,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const list = String(env.CLIENT_STOP_SILENT_OWNERS ?? '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
  return list.includes('*') || list.includes(String(owner))
}
