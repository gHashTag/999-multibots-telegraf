/**
 * The house's names, read in ONE place (crm-story-reel v22, split-reel v7).
 *
 * A reel made for a client never names the house -- not in a spoken line,
 * so not in a caption, not in the call, not on the end card's button --
 * unless that line is the person's own words, typed this turn (own_words,
 * judged per line: her message naming the bot is not enough). Every reel that
 * refuses a house name reads this detector, so a new spelling is one entry
 * here and not a fix in each tool that happened to keep its own copy (the
 * recorded defect: a rule in three files, two of which knew it).
 *
 * The marks (crm-story-reel HOUSE_MARKS): the bot as the voice speaks it
 * (BOT_SPOKEN_AS, and its Russian spelling), the delivery bot with or
 * without its at-sign (HOUSE_DELIVERY_BOT), the brand (HOUSE_BRAND) and the
 * product (HOUSE_PRODUCT, also with a superscript three or a space).
 */
import * as SPEC from './spec/crm-story-reel.gen'

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The marks as words, one per spec mark: what a test feeds the detector. */
export const HOUSE_MARKS: readonly string[] = [
  SPEC.BOT_SPOKEN_AS,
  'Тринити', // cyrillic-ok: the brand as the voice speaks it
  SPEC.HOUSE_DELIVERY_BOT,
  SPEC.HOUSE_BRAND,
  SPEC.HOUSE_PRODUCT,
]

/** One pattern for every mark, in any case. */
export const HOUSE_NAMES = new RegExp(
  [
    escaped(SPEC.HOUSE_DELIVERY_BOT),
    `\\b${escaped(SPEC.BOT_SPOKEN_AS)}\\b`,
    'тринити', // cyrillic-ok: the brand as the voice speaks it
    `\\b${escaped(SPEC.HOUSE_BRAND)}\\b`,
    '\\bs\\s*[³3]\\s*ai\\b',
  ].join('|'),
  'i'
)

/** Does this text name the house (its bot, its brand or its product)? */
export function namesHouse(text: unknown): boolean {
  return HOUSE_NAMES.test(String(text ?? ''))
}

/**
 * A text as words: one case, one form per letter (NFKC, so S³AI is s3ai;
 * yo as ye), punctuation and spaces dropped -- how her message and a line
 * are compared, so a comma or a capital never decides whose words they are.
 */
export function wordsOf(text: unknown): string[] {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е') // cyrillic-ok: yo and ye are one letter here
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
}

/** Where the house is named among these words: [first, last] word of each name. */
function houseSpans(words: readonly string[]): Array<[number, number]> {
  const starts: number[] = []
  let at = 0
  for (const w of words) {
    starts.push(at)
    at += w.length + 1
  }
  const wordAt = (offset: number) => {
    let i = 0
    while (i + 1 < starts.length && starts[i + 1] <= offset) i++
    return i
  }
  const all = new RegExp(HOUSE_NAMES.source, 'gi')
  return [...words.join(' ').matchAll(all)].map(m => [
    wordAt(m.index ?? 0),
    wordAt((m.index ?? 0) + Math.max(m[0].length - 1, 0)),
  ])
}

/** Are these words, in this order and side by side, among what she typed? */
const runIn = (heard: readonly string[], run: readonly string[]): boolean =>
  run.length > 0 && ` ${heard.join(' ')} `.includes(` ${run.join(' ')} `)

/**
 * The facts spec `own_words` reads, for ONE line against what she typed this
 * turn: the whole line is in it (lineInSaid), or each house name in the line
 * is, with up to OWN_WORDS_REACH of the line's words either side
 * (phraseInSaid). Either run must hold a word that is not a house name, so
 * the bot's name alone is never her line. saidNamesHouse is only that her
 * message names the house somewhere -- which lends no line anything.
 */
export function ownWordsFacts(
  said: unknown,
  line: unknown
): { lineInSaid: boolean; phraseInSaid: boolean; saidNamesHouse: boolean } {
  const heard = wordsOf(said)
  const words = wordsOf(line)
  const spans = houseSpans(words)
  const house = new Set<number>()
  for (const [first, last] of spans)
    for (let i = first; i <= last; i++) house.add(i)
  const hers = (first: number, last: number): boolean => {
    let own = false
    for (let i = first; i <= last; i++) own ||= !house.has(i)
    return own && runIn(heard, words.slice(first, last + 1))
  }
  const reach = SPEC.OWN_WORDS_REACH
  return {
    lineInSaid: words.length > 0 && hers(0, words.length - 1),
    phraseInSaid:
      spans.length > 0 &&
      spans.every(([first, last]) =>
        hers(
          Math.max(0, first - reach),
          Math.min(words.length - 1, last + reach)
        )
      ),
    saidNamesHouse: namesHouse(said),
  }
}

/**
 * Spec `own_words`: a line naming the house is the person's own words when
 * the line, or its house-name words, are in what she typed -- judged for that
 * line. Her message naming the house anywhere is not enough
 * (NAMING_THE_BOT_LENDS): sellers address the bot by name.
 */
export function ownWords(
  lineInSaid: boolean,
  phraseInSaid: boolean,
  saidNamesHouse: boolean
): boolean {
  if (lineInSaid || phraseInSaid) return true
  return saidNamesHouse && SPEC.NAMING_THE_BOT_LENDS
}

/** Did she type this line herself this turn (own_words, for this one line)? */
export function typedByHer(said: unknown, line: unknown): boolean {
  const f = ownWordsFacts(said, line)
  return ownWords(f.lineInSaid, f.phraseInSaid, f.saidNamesHouse)
}

/**
 * A house name nobody typed: the text names the house, and it is not the
 * person's own words this turn (`personSaid`, set only by code --
 * ToolContext.ownerSaid), judged line by line (typedByHer). The model, a
 * writer or an edit naming the house is refused on a client's reel; a line
 * she typed herself is hers to say, and naming the bot lends no other line.
 */
export function houseNameByAgent(text: unknown, personSaid?: string): boolean {
  return namesHouse(text) && !typedByHer(personSaid, text)
}
