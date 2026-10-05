/*
 * PRINTED FACTS NOBODY CONFIRMED (#3661).
 *
 * 2026-10-05: a poster went out reading "8 October 11:30, Woody WeedPecker,
 * Ko Phangan". The date and the time came from the model, not the person; the
 * person never wrote them and was never asked. A picture with a wrong date on
 * it is worse than no picture: it is printed, shared and believed.
 *
 * The rule: a date, a time or a price that goes into a picture prompt must be
 * one the person wrote in this conversation, or one the agent showed them in
 * its last answer and they then said yes to. Anything else is refused BEFORE
 * the charge, with the list, so the agent asks one confirm question instead.
 *
 * What it does not check, said plainly: places and names. A place has no
 * shape a pattern can find without false alarms ("noir studio", "Bangkok
 * style"), so they stay with the prompt rule.
 *
 * `heard` undefined means the caller has no conversation to judge by (a
 * sweep, an MCP call): nothing is refused, because "unknown" is not "unsaid".
 */

/* Month prefixes as strings: the Cyrillic guard reads regex literals as code. */
const MONTHS: ReadonlyArray<[string, number]> = [
  ['янв|jan', 1],
  ['фев|feb', 2],
  ['мар|mar', 3],
  ['апр|apr', 4],
  ['ма[йя]|may', 5],
  ['июн|jun', 6],
  ['июл|jul', 7],
  ['авг|aug', 8],
  ['сен|sep', 9],
  ['окт|oct', 10],
  ['ноя|nov', 11],
  ['дек|dec', 12],
]

/* Whole month words only: a stem would read "marble 3" as the 3rd of March. */
const MONTH_WORD =
  '(?:январ[ья]|феврал[ья]|марта?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|августа?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]|' +
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

/* Letters on both sides, so "11:30" inside "a11:300" is not a time. */
const L = '(?<![\\p{L}\\d])'
const R = '(?![\\p{L}\\d])'

/* "8th", "8-го": an ordinal suffix after a day number. */
const ORD = '(?:st|nd|rd|th|-?го|-?е)?'
const DAY_MONTH = new RegExp(
  `${L}(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH_WORD}\\.?${R}`,
  'giu'
)
// "October 11:30" is a month then a time, not the 11th. "Dec. 25" is a date.
const MONTH_DAY = new RegExp(
  `${L}${MONTH_WORD}\\.?\\s+(\\d{1,2})${ORD}(?![\\p{L}\\d]|[:.]\\d)`,
  'giu'
)
const ISO_DATE = new RegExp(`${L}\\d{4}-(\\d{2})-(\\d{2})${R}`, 'gu')
/*
 * Not after "/", "." or a currency sign: "f/1.8" is an aperture, "$2.50" a
 * price, "2.5.1" a version. A numeric date needs a two-digit month ("8.10",
 * "08.10"), so "1.8" in a lens line is never the first of August.
 */
const NUM_L = '(?<![\\p{L}\\d/.,$€₽฿])'
const NUMERIC_DATE = new RegExp(
  `${NUM_L}(\\d{1,2})[./](\\d{2})(?:[./](?:\\d{2}|\\d{4}))?(?![\\p{L}\\d]|[./]\\d|\\s?[ap]\\.?m(?![\\p{L}]))`,
  'gu'
)
const CURRENCY_CODE = '(?:usd|eur|gbp|thb|rub|руб|бат|baht)'
const TIME = new RegExp(
  `${NUM_L}([01]?\\d|2[0-3])[:.]([0-5]\\d)(?![\\p{L}\\d]|[./]\\d|\\s?[$€₽฿]|\\s?${CURRENCY_CODE}|\\s?[ap]\\.?m(?![\\p{L}]))`,
  'giu'
)
/* "7pm", "7:30 pm", "7.30pm", "11 a.m." */
const AMPM = new RegExp(
  `${NUM_L}(1[0-2]|0?[1-9])(?:[:.]([0-5]\\d))?\\s?([ap])\\.?m\\.?(?![\\p{L}])`,
  'giu'
)
/* "19 часов", "в 7 ч" */
const HOURS = new RegExp(
  `${NUM_L}([01]?\\d|2[0-3])\\s?(?:час(?:а|ов)?|ч\\.?)(?![\\p{L}])`,
  'giu'
)
/*
 * A number with optional thousands groups ("1 500", "1,500", "1.500") and
 * optional cents; `amount` reads it.
 */
/*
 * "$5k", "$5 тыс": a multiplier after a sign-first amount. Without it "$5k"
 * read as 5, and the person's "$5" confirmed a printed "$5k" (#3686).
 */
const KILO = '(?:k|к|тыс(?:яч[аи]?|\\.)?)(?![\\p{L}])'
const NUM =
  '(\\d{1,3}(?:[\\s,.]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)'
const PRICE = new RegExp(
  `(?:(?:[$€₽฿£]|${CURRENCY_CODE}\\.?\\s)\\s?${NUM}(?:\\s?${KILO})?)|(?:${L}${NUM}(?:\\s?k)?\\s?(?:[$€₽฿£]|руб\\S*|р\\.|р(?![\\p{L}])|rouble\\S*|ruble\\S*|${CURRENCY_CODE}|бат\\S*|dollar\\S*|доллар\\S*|евро|тыс(?:яч[аи]?|\\.)?\\s?(?:руб\\S*|р\\.|р(?![\\p{L}])|[$€₽฿£]|бат\\S*|доллар\\S*|евро))${R})`,
  'giu'
)

/*
 * "цена 500", "price 20", "вход: 300": a bare number right after a price word
 * is a price with no currency, which matches the same amount in any currency
 * (#3692). Only when nothing but punctuation or the end follows, so a time
 * ("вход 19:00"), a date ("билет на 8 октября") and "price 20 per person"
 * stay unread: asking once more is the cheap failure.
 */
const PRICE_WORD =
  '(?:цен[аыу]|стоимост[ьи]|вход|билет[ыа]?|price|cost|fee|entry|tickets?)'
const BARE_PRICE = new RegExp(
  `${L}${PRICE_WORD}\\s*[:—-]?\\s*${NUM}(?:\\s?${KILO})?(?!\\s*[\\p{L}\\d]|[:.,/]\\d)`,
  'giu'
)

/**
 * "1,500.50" -> "1500": cents (one or two digits after the last separator)
 * dropped, then every separator. A mutation check showed a separate
 * thousands branch changed nothing, so there is none.
 */
function amount(raw: string): string {
  return raw
    .trim()
    .replace(/[.,]\d{1,2}$/, '')
    .replace(/\D/g, '')
}

/* "2 тыс. руб", "10 тысяч рублей", "$5k" are thousands: "$2" does not confirm them. */
const THOUSANDS = new RegExp('\\d\\s?(?:тыс|k(?![a-z])|к(?![а-яё]))', 'iu')

/*
 * The currency a price names, so "$300" does not confirm "300 ₽" (#3686).
 * Both sides of a comparison always name one: PRICE needs a sign or a word.
 */
const CURRENCIES: ReadonlyArray<[string, RegExp]> = [
  ['usd', new RegExp('[$]|usd|dollar|доллар', 'iu')],
  ['eur', new RegExp('€|eur|евро', 'iu')],
  ['gbp', new RegExp('£|gbp', 'iu')],
  ['thb', new RegExp('฿|thb|бат|baht', 'iu')],
  ['rub', new RegExp('₽|руб|rub|roubl|(?<![\\p{L}])р(?![\\p{L}])', 'iu')],
]
function currencyOf(text: string): string | undefined {
  return CURRENCIES.find(([, re]) => re.test(text))?.[0]
}

/** Aspect ratios look like times and are never printed facts. */
const RATIOS = new Set(['9:16', '16:9', '9.16'])

export interface Fact {
  kind: 'date' | 'time' | 'price'
  /** As written in the prompt, for the confirm question. */
  text: string
  /**
   * Normalised readings, for comparison with what the person said. "08.10"
   * is the 8th of October or ten past eight: either reading the person wrote
   * confirms it.
   */
  keys: string[]
  /** A price's currency (usd, eur, gbp, thb, rub) when it names one. */
  currency?: string
}

function monthOf(word: string): number | null {
  const w = word.toLowerCase()
  for (const [re, n] of MONTHS) if (new RegExp(`^(${re})`).test(w)) return n
  return null
}

/** Every date, time and price in `text`, normalised. Pure. */
export function factsIn(text: string): Fact[] {
  const out: Fact[] = []
  const seen = new Set<string>()
  const add = (f: Fact) => {
    const id = f.keys.join('|')
    if (seen.has(id)) return
    seen.add(id)
    out.push(f)
  }
  const times = new Set<string>()
  for (const m of text.matchAll(TIME)) {
    if (RATIOS.has(m[0])) continue
    times.add(m[0])
    const t = `t${Number(m[1])}:${m[2]}`
    const mon = Number(m[2])
    // A dot with a second part that can be a month reads both ways.
    const both = m[0].includes('.') && mon >= 1 && mon <= 12
    add({
      kind: 'time',
      text: m[0],
      keys: both ? [t, `d${Number(m[1])}.${mon}`] : [t],
    })
  }
  for (const m of text.matchAll(DAY_MONTH)) {
    const mon = monthOf(m[0].replace(/^\d+\S*\s+(?:of\s+)?/i, ''))
    if (mon)
      add({ kind: 'date', text: m[0], keys: [`d${Number(m[1])}.${mon}`] })
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    const mon = monthOf(m[0])
    const day = Number(m[1])
    if (mon && day >= 1 && day <= 31)
      add({ kind: 'date', text: m[0], keys: [`d${day}.${mon}`] })
  }
  for (const m of text.matchAll(AMPM)) {
    const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)
    add({ kind: 'time', text: m[0], keys: [`t${h}:${m[2] ?? '00'}`] })
  }
  for (const m of text.matchAll(HOURS))
    add({ kind: 'time', text: m[0], keys: [`t${Number(m[1])}:00`] })
  for (const m of text.matchAll(ISO_DATE)) {
    const mon = Number(m[1])
    const day = Number(m[2])
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12)
      add({ kind: 'date', text: m[0], keys: [`d${day}.${mon}`] })
  }
  for (const m of text.matchAll(NUMERIC_DATE)) {
    // "11.30" was already read as a time; a time is not also a date.
    if (times.has(m[0])) continue
    const day = Number(m[1])
    const mon = Number(m[2])
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12)
      add({ kind: 'date', text: m[0], keys: [`d${day}.${mon}`] })
  }
  for (const m of text.matchAll(PRICE)) {
    let digits = amount(m[1] ?? m[2] ?? '')
    if (digits && THOUSANDS.test(m[0])) digits += '000'
    if (digits)
      add({
        kind: 'price',
        text: m[0].trim(),
        keys: [`p${digits}`],
        currency: currencyOf(m[0]),
      })
  }
  for (const m of text.matchAll(BARE_PRICE)) {
    let digits = amount(m[1] ?? '')
    if (digits && THOUSANDS.test(m[0])) digits += '000'
    if (digits) add({ kind: 'price', text: m[0].trim(), keys: [`p${digits}`] })
  }
  return out
}

/*
 * A yes is a CLOSED list (PR #3679 round 4). The reply, lowercased, with
 * a few fixed phrases removed, must be made ONLY of yes words: "да, верно",
 * "Yes please", "ок 👍", "давай!" count. Anything else -- a digit, a date in
 * words ("да, девятого"), a change with no value ("давай позже"), a partial
 * rejection ("да, кроме даты"), a question -- is not a yes, and the agent's
 * values are asked about once more. An open list of change words always
 * missed the next phrasing; asking again is the cheap failure.
 */
const YES_PHRASES = new RegExp(
  "(?<![\\p{L}])(?:без проблем|всё так|все так|именно так|давай так|no problem|all good|looks good|sounds good|go ahead|that's right|that is right)(?![\\p{L}])",
  'giu'
)
const YES_WORDS = new Set(
  (
    'да ага угу ок окей ok okay yes yep yeah sure верно правильно точно всё все ' +
    'давай печатай рисуй делай отлично супер конечно подтверждаю го go perfect ' +
    'great please correct right fine good хорошо ладно согласен согласна ' +
    'норм пойдёт пойдет именно exactly спасибо thanks'
  ).split(' ')
)
/* Pictures that agree; any other emoji ("да 👎") is not a yes (#3686). */
const YES_EMOJI = /[👍✅👌🙏]/gu
const ONLY_YES_EMOJI = /[👍✅👌🙏]/u
const YES_PHRASE_ALONE = new RegExp(YES_PHRASES.source, 'iu')
const PICTOGRAPH = /\p{Extended_Pictographic}/u
/* "please correct" asks for a fix: "correct" is a verb there (#3686). */
const FIX_REQUEST = /\bplease\s+(?:correct|fix|change)\b/i
const isYes = (text: string) => {
  if (text.length > 80 || /\?\s*$/.test(text)) return false
  if (FIX_REQUEST.test(text)) return false
  if (PICTOGRAPH.test(text.replace(YES_EMOJI, ''))) return false
  const words = text
    .toLowerCase()
    .replace(YES_PHRASES, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  // Nothing left: a yes phrase alone ("sounds good") or a yes emoji alone.
  if (words.length === 0)
    return ONLY_YES_EMOJI.test(text) || YES_PHRASE_ALONE.test(text)
  return words.every(w => YES_WORDS.has(w))
}

export interface Turn {
  role?: string
  content?: unknown
}

/**
 * What a picture prompt may print: the person's own words in this
 * conversation, and the agent's last answer if the person replied yes to it.
 * Pure; the caller passes the request's message history.
 */
export function heardFrom(history: ReadonlyArray<Turn>): string {
  const said: string[] = []
  for (const t of history)
    if (t.role === 'user' && typeof t.content === 'string') said.push(t.content)
  const last = history[history.length - 1]
  if (
    last?.role === 'user' &&
    typeof last.content === 'string' &&
    isYes(last.content)
  ) {
    for (let i = history.length - 2; i >= 0; i--) {
      const t = history[i]
      if (t.role === 'user') break
      if (
        t.role === 'assistant' &&
        typeof t.content === 'string' &&
        t.content
      ) {
        said.push(t.content)
        break
      }
    }
  }
  return said.join('\n')
}

/** Facts in `prompt` that `heard` does not contain. Empty = print freely. */
export function unconfirmedFacts(
  prompt: string,
  heard: string | undefined
): Fact[] {
  if (heard === undefined) return []
  const known = factsIn(heard)
  return factsIn(prompt).filter(
    f =>
      !known.some(
        h =>
          h.keys.some(k => f.keys.includes(k)) &&
          (!h.currency || !f.currency || h.currency === f.currency)
      )
  )
}

/** The tool's refusal: Russian, because the model relays it to the person. */
export function confirmFirst(missing: Fact[]): string {
  return (
    'НЕ РИСУЮ: в картинке будут ' +
    missing.map(f => `«${f.text}»`).join(', ') +
    ' — человек этого не писал и не подтверждал. Спроси ОДНИМ вопросом: ' +
    '«Печатаю ' +
    missing.map(f => f.text).join(', ') +
    ' — верно?» и рисуй после «да» (или с его исправлением). Токены не списаны.'
  )
}
