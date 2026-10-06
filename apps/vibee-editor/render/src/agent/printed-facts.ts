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
 * THE MULTIPLIER TABLE, the one home of "how many zeros a word after an
 * amount adds" (#3686, #3730 rounds 5 and 6). A letter run glued to or right
 * after an amount ("$5k", "$5 thousand", "$5M", "₽10кк", "5 млрд ₽") is
 * looked up here FIRST, before anything else: a table word is a multiplier
 * even when the person also wrote it ("$5 crore" is 5e7, never 5). The
 * default is the SAFE side: a run this table does not know, that is no
 * currency word and no FILLER word, makes the reading UNKNOWN (see
 * suffixReading) -- never the bare amount -- except for the one shape the
 * echo rule below allows. The 4+ letter words are the safety margin of that
 * rule, so every multiplier people really write belongs here, slang
 * included. `alsoBare`: the word is also a plain count ("5 штук" is five
 * thousand or five pieces), so the price carries both readings and is asked
 * about again. `thou` is here, not left to echo: as an unknown 4-letter word
 * a person's "$5" plus the word "thou" would have confirmed it as 5.
 * Strings, not regex literals: the Cyrillic guard reads those as code.
 */
const MULTIPLIERS: ReadonlyArray<[string, number, boolean]> = [
  ['hundreds?|сотен|сотни|сотня', 2, false], // cyrillic-ok: multiplier words
  [
    'k|к|тыс|тысяч\\p{L}*|thousands?|thou|thous|grands?|тыщ\\p{L}*|косар\\p{L}*|косых|кусок|куска|кусков', // cyrillic-ok: multiplier words
    3,
    false,
  ], // cyrillic-ok: multiplier words
  ['штук\\p{L}*', 3, true], // cyrillic-ok: a thousand, or pieces
  ['lakhs?|lacs?', 5, false],
  [
    'm|mn|mln|mio|млн|millions?|mills?|миллион\\p{L}*|kk|кк|лям\\p{L}*|лимон\\p{L}*',
    6,
    false,
  ], // cyrillic-ok: multiplier words
  ['crores?', 7, false],
  [
    'b|bn|bln|млрд|billions?|миллиард\\p{L}*|ярд\\p{L}*', // cyrillic-ok: multiplier words
    9,
    false,
  ],
]
const MULTIPLIER_RES: ReadonlyArray<[RegExp, number, boolean]> =
  MULTIPLIERS.map(([words, zeros, alsoBare]) => [
    new RegExp(`^(?:${words})\\.?$`, 'iu'),
    zeros,
    alsoBare,
  ])
/* A currency named as a word after the amount ("$5 usd", "₽10 рублей"). */
const CURRENCY_RUN = new RegExp(
  '^(?:руб\\p{L}*|р|rub\\p{L}*|roubl\\p{L}*|dollars?|доллар\\p{L}*|бакс\\p{L}*|usd|евро|euros?|eur|gbp|бат\\p{L}*|baht|thb)\\.?$', // cyrillic-ok: currency words
  'iu'
)
/* Hedge words (#3746): "about", "or so", "-ish", a Russian "about". */
const HEDGE_WORDS =
  'so|thereabouts|ish|about|around|roughly|approx|approximately|circa|около|примерно|приблизительно|порядка' // cyrillic-ok: hedge words
const HEDGE_RUN = new RegExp(`^(?:${HEDGE_WORDS})$`, 'iu')
/*
 * Words that are never a multiplier: "$5 per person", "$5 и $5000",
 * "$5 за вход". A CLOSED list on the safe side -- a word missing here is read
 * as an unknown multiplier, and the agent asks once more.
 */
const FILLER_RUN = new RegExp(
  '^(?:и|или|а|за|в|во|на|с|со|по|до|от|для|всего|только|плюс|per|for|each|a|an|and|or|to|from|at|on|in|the|with|all|only|just|until|till|off|plus|total|' + // cyrillic-ok: filler words
    // Hedges (#3746): "$5 or so k", "$5-ish k", a Russian "about". A hedge
    // is never a multiplier, and it does not break the chain to a later one.
    HEDGE_WORDS +
    ')$',
  'iu'
)
/*
 * A LATER MULTIPLIER SPREADS BACK (#3730 round 7, widened in #3746).
 * "$5-10k", "$5 to 10k", "₽5 до 10 тыс", "$5 or 6 million", "₽5 плюс тыс":
 * a reader may scale the FIRST amount by the multiplier printed after the
 * next number. The rule is one shape, not a word per connector: after an
 * amount, a chain of connectors (a dash, a comma right after an amount, or
 * any FILLER_RUN word, hedges included), further numbers and fractions (a
 * half word, or a digit fraction "1/2", "½", "3/4"), inside one clause, that
 * ENDS in a multiplier makes that multiplier a possible reading of every
 * amount before it. The chain must hold a connector or a second number
 * before the multiplier. It stops at anything else -- a noun
 * ("$25 per person, 2k seats"), other punctuation, a line break -- so a
 * range with no multiplier ("$10-15", "$3 until 8") stays the bare amount.
 * A comma is a connector only right after an amount (#3746): "$5, 10k" is a
 * list or a range a reader may take as "$5k".
 * A LOOSE chain -- one that passed a comma or a hedge (#3758) -- keeps
 * spreading its multiplier back UNLESS a COUNTED_NOUNS word follows the
 * multiplier: "$20, 2k seats", "$5 - about 10k people", "₽500, 2 тыс
 * гостей" stay the bare amount. Any other word, a currency, punctuation or
 * the end keeps the multiplier on the price (#3758 round 4, #3769):
 * "$5, 10k", "$5, 10k budget", "$5 about 10k quid", "₽5, 10 тыс сумма" ask.
 * A bare hedge with no comma ("$5 about 10k people") loosens the chain too,
 * but there the counted noun must END the phrase (#3758 rounds 5, 6): no
 * joiner glued to it, and the rest of the clause holds only fillers,
 * counted nouns and "more". "$5 about 10k ticket revenue", "...ticket-revenue",
 * "...ticket and merch revenue", "...followers on insta" ask, as on main.
 * A loose spread is also echoed exactly: the person's identical text
 * confirms it (see Fact.exact).
 * The tight chain of round 7 ("$5-10k tickets", "$5 to 10k fans") keeps
 * spreading: there the dash or "to" binds the two numbers into one range,
 * and the noun is what the whole range prices.
 * A fraction right after the connectors ("$1 and a half million",
 * "₽5 с половиной тысяч", "$1 1/2 million", "$1½ million") adds that
 * fraction of the multiplier to the first amount.
 * A glued or short run the table does not know after the second number
 * ("$5 to 10zorg") is an unknown multiplier. Time words after the second
 * number ("$3 until 8 pm") are a clock, never a multiplier.
 */
/*
 * COUNTED NOUNS (#3758 round 4, #3769): after a LOOSE chain, the one kind of
 * word that leaves the bare price standing -- "$20, 2k seats", "₽500, 2 тыс
 * гостей", "$15, 1k free drinks". A CLOSED list on the SAFE side: money words
 * are an open set (quid, payout, profit, a Russian "sum"...), so the list names what
 * people COUNT instead, and any word missing here keeps the multiplier on the
 * price, so the agent asks once more. Optionally one word from a closed set
 * of adjectives before the noun. Strings: the Cyrillic guard reads regex
 * literals as code.
 */
const COUNTED_ADJECTIVES = [
  'free',
  'new',
  'real',
  'active',
  'live',
  'бесплатн(?:ых|ые)', // cyrillic-ok: counted-noun adjectives
  'нов(?:ых|ые)', // cyrillic-ok: counted-noun adjectives
  'жив(?:ых|ые)', // cyrillic-ok: counted-noun adjectives
].join('|')
const COUNTED_NOUN_WORDS = [
  'followers?',
  'subscribers?',
  'fans?',
  'views?',
  'likes?',
  'seats?',
  'guests?',
  'people',
  'persons?',
  'attendees?',
  'visitors?',
  'tickets?',
  'members?',
  'users?',
  'customers?',
  'clients?',
  'students?',
  'participants?',
  'drinks?',
  'posts?',
  'reels?',
  'photos?',
  'downloads?',
  'plays?',
  'streams?',
  'viewers?',
  'readers?',
  'listeners?',
  'players?',
  'подписчик(?:а|ов|и)?', // cyrillic-ok: counted nouns
  'гост(?:ь|я|ей|и)', // cyrillic-ok: counted nouns
  'человек', // cyrillic-ok: counted nouns
  'людей|люди', // cyrillic-ok: counted nouns
  'мест(?:а|о)?', // cyrillic-ok: counted nouns
  'зрител(?:ь|я|ей|и)', // cyrillic-ok: counted nouns
  'просмотр(?:а|ов|ы)?', // cyrillic-ok: counted nouns
  'лайк(?:а|ов|и)?', // cyrillic-ok: counted nouns
  'участник(?:а|ов|и)?', // cyrillic-ok: counted nouns
  'клиент(?:а|ов|ы)?', // cyrillic-ok: counted nouns
  'учеников|ученика|ученики|ученик', // cyrillic-ok: counted nouns
  'билет(?:а|ов|ы)?', // cyrillic-ok: counted nouns
].join('|')
const COUNTED_NOUNS = new RegExp(
  `^[ \\t\\u00a0]*(?:(?:${COUNTED_ADJECTIVES})[ \\t\\u00a0]+)?(?:${COUNTED_NOUN_WORDS})(?![\\p{L}\\d])`,
  'iu'
)
/*
 * The end-of-phrase check after a bare hedge and a counted noun (#3758
 * round 6). NOUN_JOINER: a character glued to the noun that joins it to the
 * next word -- hyphens and dashes, slashes, apostrophes, "&", "+". CLAUSE_END:
 * sentence punctuation and line breaks. CLAUSE_WORD: a word, digits and
 * currency signs included, so "10k fans $" or "10k fans 2026" asks. Both
 * lists are CLOSED on the SAFE side (see countsNoun): a missing joiner or a
 * missing clause end only leaves more words to check, so it asks more.
 */
const NOUN_JOINER =
  /^[-\u2010-\u2015\u2212\uFE63\uFF0D/\u2044\u2215\uFF0F'\u2019\u02BC\u2032&\uFF06+\uFF0B]/u
const CLAUSE_END = /[\n\r\u2028\u2029.,;:!?()]/u
const CLAUSE_WORD = /[\p{L}\p{M}\p{N}$€₽฿£]+/gu
const MORE_RUN = new RegExp('^(?:more|больше|ещё|еще)$', 'iu') // cyrillic-ok: "more" words
/*
 * RATE_RUN: FILLER_RUN words that make the price a rate ("10k people per
 * seat", a Russian "from each person"); after the noun they always ask. The
 * one list here where a MISSING entry is unsafe -- such a word would pass
 * as a filler and confirm -- so it lists every FILLER_RUN word that can mean
 * "for each", and some that only might ("for", "at", "with").
 */
const RATE_RUN = new RegExp(
  '^(?:per|each|a|an|for|за|с|со|по|на|в|во|from|от|with|at)$', // cyrillic-ok: rate words
  'iu'
)
const HALF_RUN = new RegExp('^(?:half|halves|половин\\p{L}*)$', 'iu') // cyrillic-ok: half words
const TIME_RUN = new RegExp(
  '^(?:[ap]\\.?m\\.?|h|hrs?|hours?|min|mins|ч|час\\p{L}*|мин\\p{L}*)$', // cyrillic-ok: time words
  'iu'
)
/* A digit fraction: "1/2", "3/4", or a vulgar fraction glyph (#3746). */
const GLYPH_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
}
const FRACTION = '([½¼¾]|[1-9]\\/[1-9]\\d?)(?![\\d/])'
/** The value of a FRACTION match; undefined when it is no proper fraction. */
function fractionValue(f: string): number | undefined {
  if (f in GLYPH_FRACTIONS) return GLYPH_FRACTIONS[f]
  const [n, d] = f.split('/').map(Number)
  return n < d ? n / d : undefined
}
type Spread = {
  zeros: number | 'unknown'
  alsoBare: boolean
  /** The fraction of the multiplier added to the FIRST amount, 0 for none. */
  fractionOnFirst: number
  text: string
  /** The chain passed a comma or a hedge: its exact echo confirms it. */
  loose: boolean
}
function laterMultiplier(
  tail: string,
  joined: boolean,
  atAmount: boolean
): Spread | undefined {
  const token = new RegExp(
    `^[${DIGIT_JOINERS}\\t]*(?:([-–—])|(,)|${FRACTION}|([$€₽฿£]\\s?)?${NUM}|(\\p{L}+\\.?))`,
    'iu'
  )
  let rest = tail
  let used = ''
  let second = false
  let fractionOnFirst = 0
  let afterNumber = false
  let loose = false
  // A dash before the chain's hedge, or a comma: then it is no bare hedge.
  let dashed = false
  // The chain was loosened only by a bare hedge ("$5 about 10k", #3758
  // round 5): no comma, no dash before the hedge.
  let hedgeOnly = false
  // A loose chain ends at a multiplier that a counted noun follows (see
  // above). Closed on the safe side (#3758 round 4, #3769): only a word in
  // COUNTED_NOUNS leaves the bare price; any other word, a currency or a
  // filler keeps the multiplier on the price, so it asks. After a bare
  // hedge the noun must also END the phrase (#3758 rounds 5, 6): in "$5
  // about 10k ticket revenue" the noun only modifies a money word, and main
  // asks there.
  const countsNoun = () => {
    if (!loose) return false
    const m = rest.match(COUNTED_NOUNS)
    if (!m) return false
    if (!hedgeOnly) return true
    // After a bare hedge the noun must END the phrase (#3758 round 6). No
    // list of spaces decides that: every character that is no word
    // character (any space, an emoji) is skipped, and only the WORDS left
    // in the clause count.
    const after = rest.slice(m[0].length)
    // A joiner glued to the noun ("ticket-revenue", "ticket/revenue",
    // "people's budget", "ticket&bar") makes the noun part of a longer
    // word: ask. A CLOSED list on the SAFE side: a joiner missing here only
    // falls through to the word check below, which asks unless every word
    // that follows is a filler, a counted noun or "more".
    if (NOUN_JOINER.test(after)) return false
    // The rest of the clause, up to sentence punctuation or a line break,
    // may hold ONLY fillers, "more" and counted nouns ("$5 about 10k
    // tickets and more", "10k people and fans", "10k followers. On
    // insta"). Any other word -- a money word ("ticket and merch revenue"),
    // an unknown word ("followers on insta"), a number -- asks, and so does
    // a rate word ("10k people per seat", "10k people each": the price is
    // per head). A clause end missing from CLAUSE_END only makes the clause
    // longer, so it asks more, never less.
    const clause = after.split(CLAUSE_END)[0]
    for (const word of clause.match(CLAUSE_WORD) ?? [])
      if (
        RATE_RUN.test(word) ||
        (!COUNTED_NOUNS.test(word) &&
          !FILLER_RUN.test(word) &&
          !MORE_RUN.test(word))
      )
        return false
    return true
  }
  for (let i = 0; i < 16; i++) {
    const t = rest.match(token)
    if (!t) return undefined
    // A comma joins only right after an amount: "$5, 10k", "$5 to 6, 10k".
    // After a noun ("$20 entry, 2k seats") the clause is a new one.
    if (t[2] && !afterNumber && !(atAmount && !used.trim())) return undefined
    used += t[0]
    rest = rest.slice(t[0].length)
    if (t[2]) loose = true
    if (t[1]) dashed = true
    if (t[1] || t[2]) {
      joined = true
      afterNumber = false
      continue
    }
    const fraction = t[3] === undefined ? undefined : fractionValue(t[3])
    if (t[3] !== undefined && fraction === undefined) return undefined
    if (fraction !== undefined || HALF_RUN.test(t[6] ?? '')) {
      if (!second) fractionOnFirst = fraction ?? 0.5
      second = true
      afterNumber = true
      continue
    }
    if (t[5] !== undefined) {
      second = true
      afterNumber = true
      continue
    }
    const word = t[6]
    const spaced = /^\s/u.test(t[0])
    const s = suffixReading(word)
    if (s !== 'unknown' && s.zeros) {
      if (!joined && !second) return undefined
      if (countsNoun()) return undefined
      return {
        zeros: s.zeros,
        alsoBare: s.alsoBare,
        fractionOnFirst,
        text: used,
        loose,
      }
    }
    if (afterNumber && TIME_RUN.test(word)) return undefined
    if (FILLER_RUN.test(word)) {
      if (HEDGE_RUN.test(word)) {
        if (!dashed && !loose) hedgeOnly = true
        loose = true
      }
      joined = true
      afterNumber = false
      continue
    }
    if (CURRENCY_RUN.test(word)) {
      afterNumber = false
      continue
    }
    if (
      afterNumber &&
      (!spaced || [...normalWord(word)].length < ECHO_MIN_LETTERS) &&
      !countsNoun()
    )
      return {
        zeros: 'unknown',
        alsoBare: false,
        fractionOnFirst,
        text: used,
        loose,
      }
    return undefined
  }
  return undefined
}

/* A letter run glued to or right after an amount, captured for the table. */
const RUN = '(\\p{L}+\\.?)'

/** How a run after an amount scales it, or "unknown". */
type Suffix = { zeros: number; alsoBare: boolean } | 'unknown'
const NO_SUFFIX: Suffix = { zeros: 0, alsoBare: false }
function suffixReading(run: string | undefined): Suffix {
  if (!run) return NO_SUFFIX
  for (const [re, zeros, alsoBare] of MULTIPLIER_RES)
    if (re.test(run)) return { zeros, alsoBare }
  if (CURRENCY_RUN.test(run) || FILLER_RUN.test(run) || HALF_RUN.test(run))
    return NO_SUFFIX
  return 'unknown'
}

/*
 * SHAPE PLUS ECHO (#3730 round 6). Round 5 read every unknown word after
 * "$N" as an unknown multiplier, so "$20 entry" and "$5 coffee and cake"
 * asked again on 17 of 42 ordinary posters. A word is a noun the person
 * used, not a multiplier, only when BOTH hold:
 * - shape: a currency-first amount, a space, then a run of ECHO_MIN_LETTERS
 *   or more letters the table does not know (glued "$5zorg" and short
 *   "$5 гиг" stay unknown);
 * - echo: the person wrote that same word (normalised, any position)
 *   somewhere in the conversation.
 * Shape alone is not enough: the reviewer measured that it lets "$5" confirm
 * any 4+ letter multiplier missing from the table. Echo alone is not enough
 * either: the table is consulted first, so "$5 crore" stays 5e7 even when
 * the person wrote "crore". The residual risk, said plainly: a person who
 * writes an amount and an unlisted multiplier word apart.
 * Four letters, not five: with `thou` in the table both are sound on the
 * soundness grid, and five letters re-asks every "₽500 вход" (see the
 * usability corpus in the test).
 */
const ECHO_MIN_LETTERS = 4
/* Lowercase, a trailing dot off, the Cyrillic yo read as ye. */
const normalWord = (w: string) =>
  w
    .replace(/\.$/, '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
function echoCandidate(
  m0: string,
  run: string | undefined
): string | undefined {
  if (!run) return undefined
  const word = normalWord(run)
  if ([...word].length < ECHO_MIN_LETTERS) return undefined
  if (!/\s$/u.test(m0.slice(0, m0.length - run.length))) return undefined
  return word
}
/** Did the person write `word` anywhere? Whole words, normalised. */
function wordWritten(heard: string, word: string): boolean {
  for (const [w] of heard.matchAll(/\p{L}+/gu))
    if (normalWord(w) === word) return true
  return false
}
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
/*
 * Group 1/2: a sign or code, the amount, an optional run. Group 3/4: the
 * amount, an optional run, then a currency ("5 млрд ₽", "10 тысяч рублей").
 * The run in the second branch is any letters, so a multiplier the table
 * does not know is still READ (as unknown) instead of skipping the price.
 */
const PRICE = new RegExp(
  `(?:(?:[$€₽฿£]|${CURRENCY_CODE}\\.?\\s)\\s?${NUM}(?:\\s?${RUN})?)|(?:${L}${NUM}(?:\\s?${RUN})?\\s?(?:[$€₽฿£]|руб\\S*|р\\.|р(?![\\p{L}])|rouble\\S*|ruble\\S*|${CURRENCY_CODE}|бат\\S*|dollar\\S*|доллар\\S*|евро)${R})`,
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
  `${L}${PRICE_WORD}\\s*[:—-]?\\s*${NUM}(?:\\s?${RUN})?(?!\\s*[\\p{L}\\d]|[:.,/]\\d)`,
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

/*
 * A CURRENCY-FIRST DOT GROUP (#3746). "$1.500" is $1500 to a European reader
 * and $1.50 to an English one, so a printed "$1.500", "€2.000" carries both
 * readings, 1500 and 1 (cents are dropped, as for "$1.50"), and only a person
 * who confirmed both, or wrote that exact text, confirms it. A heard "€1.500"
 * is just as ambiguous, so it confirms no single amount ("€1500" asks once).
 * A trailing currency ("1.500 ₽") stays the group: that is how Russian and
 * Thai posters write thousands, and no English reader starts a price there.
 */
const DOT_GROUP = /^(\d{1,3})\.\d{3}$/

/*
 * The readings of a price, scaled by `zeros` from the multiplier table.
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
function priceReadings(raw: string, zeros: number): string[] {
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
  /**
   * A price read by SHAPE PLUS ECHO ("$20 entry"): the normalised word after
   * the amount. The bare reading holds only if the person wrote this word.
   */
  word?: string
  /**
   * A price with more than one reading, as written, whitespace dropped: a
   * currency-first dot group with no multiplier ("€1.500", #3746) or a price
   * a LOOSE chain scaled ("$5, 10k", "$5 about 10k budget", #3758 round 4).
   * The person's identical text confirms it, ambiguity and all; a reordered
   * or other form does not. Tight chains ("$5-10k") and adjacent multipliers
   * ("€1.500k") carry no exact echo and still ask (rounds 4 and 7).
   */
  exact?: string
}

function monthOf(word: string): number | null {
  const w = word.toLowerCase()
  for (const [re, n] of MONTHS) if (new RegExp(`^(${re})`).test(w)) return n
  return null
}

/*
 * A price match as a Fact. `run` is the letter run after the amount, looked
 * up in the multiplier table:
 * - a known multiplier scales the amount ("$5M" is 5 000 000);
 * - a spaced Cyrillic "k" letter not followed by K_THOUSAND_NEXT is "to" or a
 *   thousand, so the fact carries BOTH readings ("$5 <k> 7 pm" is 5 or 5000),
 *   and an ambiguous price is asked about once more (#3730 round 4);
 * - a table word that is also a count ("5 штук") carries both readings;
 * - an UNKNOWN run after a currency-first amount, spaced, of 4+ letters
 *   ("$20 entry") is the bare amount plus `word`: SHAPE PLUS ECHO, see
 *   echoCandidate (#3730 round 6);
 * - any other UNKNOWN run ("$5zorg", "$5 гиг", "5 zorg RUB") gives the one
 *   reading "u" + the normalised text (#3730 round 5). No amount the person
 *   said confirms it -- only the same text, written by the person, does; and
 *   as the person's words it confirms nothing else.
 * A currency or filler word is no multiplier and is left out of the text.
 */
function priceFact(
  text: string,
  m: RegExpMatchArray,
  raw: string,
  run: string | undefined,
  lead: boolean,
  closed = false
): Fact | undefined {
  const suffix = suffixReading(run)
  let shown = m[0]
  if (suffix !== 'unknown' && !suffix.zeros && run && FILLER_RUN.test(run))
    shown = shown.slice(0, shown.length - run.length)
  const next = text.slice((m.index ?? 0) + m[0].length)
  const keys = (readings: Set<string>, unknown: string[]) => [
    ...[...readings].map(d => `p${d}`),
    ...unknown.map(u => u.replace(/\s/g, '').toLowerCase()),
  ]
  // A currency-first dot group ("$1.500") is $1.50 or $1500 (see DOT_GROUP).
  const dot = lead ? raw.trim().match(DOT_GROUP) : null
  const bare = () => {
    const r = priceReadings(raw, 0)
    if (dot) r.push(String(Number(dot[1])))
    return r
  }
  let scaled = false
  let looseSpread = false
  // The price as written, for the exact echo (see Fact.exact): an unscaled
  // dot group, or a price a loose chain scaled ("$5, 10k").
  const exact = () => {
    const as = (t: string) => t.replace(/\s/g, '').toLowerCase()
    if (dot && !scaled)
      return as(m[0].slice(0, m[0].length - (run?.length ?? 0)))
    return looseSpread ? as(shown) : undefined
  }
  /*
   * A later multiplier may scale this amount too (see laterMultiplier). A
   * trailing currency ("500 ₽ - 1000 ₽") closes the amount first; a run
   * that is itself a multiplier is the adjacent case, read above.
   */
  const spreadInto = (
    readings: Set<string>,
    unknown: string[],
    echoed: boolean
  ) => {
    // The chain starts AT a connector or half run ("$5 to", "$5 half"),
    // and after an echoed noun, which joins like a connector.
    const own = !echoed && run ? run : ''
    const head = m[0].slice(0, m[0].length - own.length)
    const spread = closed
      ? undefined
      : laterMultiplier(own + next, echoed, !echoed && !own)
    if (!spread) return
    scaled = true
    looseSpread = spread.loose
    shown = (head + spread.text).replace(/\s+$/u, '')
    if (spread.zeros === 'unknown') {
      unknown.push(`u${raw}${run ?? ''}${spread.text}`)
      return
    }
    const part = Math.round(spread.fractionOnFirst * 10 ** spread.zeros)
    for (const r of priceReadings(raw, spread.zeros))
      readings.add(String(Number(r) + part))
    if (spread.alsoBare) for (const r of bare()) readings.add(r)
  }
  if (suffix === 'unknown') {
    const word = lead ? echoCandidate(m[0], run) : undefined
    if (word) {
      // An echoed noun is no multiplier, and no wall either: in
      // "$5 tickets to 10k" the later "k" may still scale the $5.
      const readings = new Set(bare())
      if (!readings.size) return undefined
      const unknown: string[] = []
      spreadInto(readings, unknown, true)
      return {
        kind: 'price',
        text: shown.trim(),
        keys: keys(readings, unknown),
        word,
        exact: exact(),
      }
    }
    const key = `u${raw}${run}`.replace(/\s/g, '').toLowerCase()
    return { kind: 'price', text: shown.trim(), keys: [key] }
  }
  const readings = new Set(priceReadings(raw, suffix.zeros))
  if (suffix.alsoBare) for (const r of bare()) readings.add(r)
  if (SPACED_K.test(m[0]) && !K_THOUSAND_NEXT.test(next))
    for (const r of bare()) readings.add(r)
  const unknown: string[] = []
  if (!suffix.zeros) {
    for (const r of bare()) readings.add(r)
    spreadInto(readings, unknown, false)
  } else scaled = true
  if (!readings.size) return undefined
  return {
    kind: 'price',
    text: shown.trim(),
    keys: keys(readings, unknown),
    exact: exact(),
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
    const bare = `${f.keys.join('|')}|${f.word ?? ''}|`
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
    const lead = m[1] !== undefined
    const run = lead ? m[2] : m[4]
    const f = priceFact(text, m, (lead ? m[1] : m[3]) ?? '', run, lead, !lead)
    // An echo word is no currency: "£5 europe" is pounds, not euros.
    const named = f?.word
      ? m[0].slice(0, m[0].length - (run?.length ?? 0))
      : f?.text
    if (f) add({ ...f, currency: currencyOf(named ?? '') })
  }
  for (const m of text.matchAll(BARE_PRICE)) {
    const f = priceFact(text, m, m[1] ?? '', m[2], false)
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
 * SHAPE PLUS ECHO (#3730 round 6): a printed "$20 entry" also needs the word
 * "entry" in what the person wrote. A heard "$10 entry" is the person's own
 * word, so it is echoed by definition and reads as the bare 10 -- for
 * "Entry: $10" too. The table is read first on both sides, so a heard
 * "$5 crore" is 5e7 and never confirms "$5".
 */
function confirmedBy(f: Fact, known: Fact[], heard: string): boolean {
  if (f.kind !== 'price')
    return known.some(h => h.keys.some(k => f.keys.includes(k)))
  if (f.word && !wordWritten(heard, f.word)) return false
  /*
   * EXACT ECHO (#3746, widened in #3758 round 4): a printed "€1.500" or
   * "$5, 10k" the person wrote in the identical form is their own notation,
   * not an invented fact -- and an ask could never end, since every "yes"
   * re-reads the same two readings. Any other form of it asks, a reordered
   * one too ("$10, 5k"); a heard one confirms no other price.
   */
  if (f.exact && known.some(h => h.exact === f.exact)) return true
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
  return factsIn(prompt).filter(f => !confirmedBy(f, known, heard))
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
