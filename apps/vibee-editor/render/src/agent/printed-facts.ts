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
 * "$5k", "$5 thousand", "1,5 million": a multiplier after the amount. Without it "$5k"
 * read as 5, and the person's "$5" confirmed a printed "$5k" (#3686). Glued
 * ("$5k", "RUB10<k>") it is always the multiplier. A SPACED Cyrillic "k" letter
 * is also the preposition "to" ("$5 <k> 7 pm"), so it is read both ways
 * unless K_THOUSAND_NEXT follows -- see priceFact.
 */
const KILO = `(?:k|к|тыс(?:яч[аи]?|\\.)?|млн\\.?|mln|million)(?![\\p{L}])` // cyrillic-ok: multiplier words
/* A spaced Cyrillic "k" letter closing a price match. */
const SPACED_K = new RegExp('\\s[кК]$', 'u')
/*
 * What may follow a spaced Cyrillic "k" letter for it to be ONLY a thousand:
 * the end of the text, closing punctuation, or a currency. A CLOSED list on
 * the safe side: anything else -- a word, a digit, a line break and then a
 * word -- leaves both readings. Four review rounds of #3730 patched the other
 * side (a list of time words that made the letter a preposition), and every
 * round a word was missing: "3 days" and "2 nights" are rental durations,
 * "12.99" is no clock, "2 people" is a count. Reading both ways needs no such list.
 */
const K_THOUSAND_NEXT = new RegExp(
  '^\\s*(?:$|[.,;!?)\\]»"”…$€₽฿£]|(?:руб|р\\.|р(?![\\p{L}])|rub|rouble|ruble|доллар|dollar|бакс|usd|евро|eur|gbp|бат|baht|thb))', // cyrillic-ok: currency words
  'iu'
)
/**
 * The spaces that join digit groups, as a regex character-class body: a
 * space, a no-break space, a narrow no-break space. A CLOSED list, never
 * `\s` -- a line break glued a poster's "ENTRY 1" over "500" into 1500
 * (#3706) and "11:30" over "500" into 30500 (#3699). The one home of the
 * rule; look-at-own-picture reads it too.
 */
export const DIGIT_JOINERS = ' \\u00A0\\u202F'
/* A number with optional thousands groups ("1 500", "1,500", "1.500") and
 * optional cents; `amount` reads it. */
const NUM = `(\\d{1,3}(?:[${DIGIT_JOINERS},.]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)`
const PRICE = new RegExp(
  `(?:(?:[$€₽฿£]|${CURRENCY_CODE}\\.?\\s)\\s?${NUM}(?:\\s?${KILO})?)|(?:${L}${NUM}(?:\\s?(?:[kк]|млн\\.?|mln|million))?\\s?(?:[$€₽฿£]|руб\\S*|р\\.|р(?![\\p{L}])|rouble\\S*|ruble\\S*|${CURRENCY_CODE}|бат\\S*|dollar\\S*|доллар\\S*|евро|тыс(?:яч[аи]?|\\.)?\\s?(?:руб\\S*|р\\.|р(?![\\p{L}])|[$€₽฿£]|бат\\S*|доллар\\S*|евро))${R})`,
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
const MILLIONS = new RegExp('\\d\\s?(?:млн|mln|million)', 'iu')

/*
 * The readings of a price, scaled when it names thousands or millions.
 * Before a multiplier the decimal is part of the amount, not cents: "1.5k"
 * and "1,5 тыс" are 1500, so "$1k" does not confirm "$1.5k" (#3697), and
 * "1,5 млн" is 1 500 000 (#3709). One separator before exactly three digits
 * ("$1.500k") reads both ways -- a decimal (1500, like "$1.5k") or a
 * thousands group (1 500 000) -- so it carries both readings, and as a price
 * with two readings it is asked about again (#3730 round 4). A COMMA there is only the
 * group: an English reader takes "$1,500k" as $1.5 million, so "$1500" must
 * not confirm it (#3719). "1,500 mln" reads as 1.5 billion too; the rare
 * Russian decimal-comma intent is then asked again, the safe failure. Without a multiplier cents
 * are dropped: "$2.50" is 2, which a person's "$2.50" or "$2" confirms.
 */
function priceReadings(raw: string, matched: string): string[] {
  const zeros = MILLIONS.test(matched) ? 6 : THOUSANDS.test(matched) ? 3 : 0
  if (!zeros) {
    const digits = amount(raw)
    return digits ? [digits] : []
  }
  const scale = 10 ** zeros
  const t = raw.trim()
  const ambiguous = t.match(/^(\d{1,3})\.(\d{3})$/)
  if (ambiguous) {
    const asDecimal =
      Number(ambiguous[1]) * scale + Number(ambiguous[2].padEnd(zeros, '0'))
    const asGroup = Number(ambiguous[1] + ambiguous[2]) * scale
    return [String(asDecimal), String(asGroup)]
  }
  const dec = t.match(/^(.*\d)[.,](\d{1,2})$/)
  if (!dec) {
    const digits = amount(raw)
    return digits ? [String(Number(digits) * scale)] : []
  }
  const whole = Number(dec[1].replace(/\D/g, ''))
  return [String(whole * scale + Number(dec[2].padEnd(zeros, '0')))]
}

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
   * confirms it. A price with several readings needs all of them (see
   * confirmedBy).
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

/*
 * A price match as a Fact. A spaced Cyrillic "k" letter that is not followed
 * by K_THOUSAND_NEXT is "to" or a thousand, so the fact carries BOTH
 * readings: "$5 <k> 7 pm" is 5 or 5000. unconfirmedFacts then needs the
 * person to have written every reading, and never lets such a form confirm
 * anything -- an ambiguous price is asked about once more (#3730 round 4).
 */
function priceFact(
  text: string,
  m: RegExpMatchArray,
  raw: string
): Fact | undefined {
  const readings = new Set(priceReadings(raw, m[0]))
  const next = text.slice((m.index ?? 0) + m[0].length)
  if (SPACED_K.test(m[0]) && !K_THOUSAND_NEXT.test(next))
    for (const r of priceReadings(raw, m[0].replace(SPACED_K, '')))
      readings.add(r)
  if (!readings.size) return undefined
  return {
    kind: 'price',
    text: m[0].trim(),
    keys: [...readings].map(d => `p${d}`),
  }
}

/** Every date, time and price in `text`, normalised. Pure. */
export function factsIn(text: string): Fact[] {
  const out: Fact[] = []
  const seen = new Set<string>()
  const add = (f: Fact) => {
    // The currency is part of the id: "$300" must not hide "300 ₽". A
    // price with no currency ("entry 500" inside "entry 500 RUB") adds nothing
    // to the same readings with one, and would confirm any currency.
    const bare = `${f.keys.join('|')}|`
    const id = `${bare}${f.currency ?? ''}`
    if (seen.has(id)) return
    if (!f.currency && [...seen].some(s => s.startsWith(bare))) return
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
    const f = priceFact(text, m, m[1] ?? m[2] ?? '')
    if (f) add({ ...f, currency: currencyOf(m[0]) })
  }
  for (const m of text.matchAll(BARE_PRICE)) {
    const f = priceFact(text, m, m[1] ?? '')
    if (f) add(f)
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

const sameCurrency = (a: Fact, b: Fact) =>
  !a.currency || !b.currency || a.currency === b.currency

/*
 * Is `f` confirmed by what the person said? A date or a time: any reading
 * the person wrote ("08.10" is a date or a time). A price is judged
 * asymmetrically (#3730 round 4): a printed price with several readings
 * ("$1.500k", "$5 <k> 7 pm") needs EVERY reading confirmed, and only a
 * price the person wrote with ONE reading confirms anything. An ambiguous
 * form on either side therefore asks again, and no list of words decides
 * which reading is "really" meant.
 */
function confirmedBy(f: Fact, known: Fact[]): boolean {
  if (f.kind !== 'price')
    return known.some(h => h.keys.some(k => f.keys.includes(k)))
  const sure = known.filter(
    h => h.kind === 'price' && h.keys.length === 1 && sameCurrency(h, f)
  )
  return f.keys.length > 0 && f.keys.every(k => sure.some(h => h.keys[0] === k))
}

/** Facts in `prompt` that `heard` does not contain. Empty = print freely. */
export function unconfirmedFacts(
  prompt: string,
  heard: string | undefined
): Fact[] {
  if (heard === undefined) return []
  const known = factsIn(heard)
  return factsIn(prompt).filter(f => !confirmedBy(f, known))
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
