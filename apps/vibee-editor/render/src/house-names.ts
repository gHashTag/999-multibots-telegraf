/**
 * The house's names, read in ONE place (crm-story-reel v23, split-reel v7).
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
 * product (HOUSE_PRODUCT, its superscript spelling too).
 *
 * v23 (999#3564): marks are read as a reader reads them. The text and every
 * mark are folded the same way first (foldMarks), and then each mark found is
 * judged by what stands around it -- a name (nameMark), the brand as a code
 * (codeMark), the product as one code token (productMark), the spec's fns.
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

/**
 * Each lower-case Cyrillic letter whose look passes for a Latin one, over the
 * Latin letter it passes for (FOLD_LOOKALIKES; the set of the Latin side is
 * LOOKALIKE_LATIN). One canonical form for both scripts folds both ways: a
 * Latin T in a Russian word and a Cyrillic Te in an English one read alike.
 * Greek is not folded -- the leak is a model writing Russian.
 */
const LOOKALIKE_CYRILLIC = 'авсԁенһіјкморԛѕтԝху' // cyrillic-ok: the look-alikes
const LOOKALIKE_AS_LATIN = 'abcdehhijkmopqstwxy'
const LOOKALIKES = new Map(
  [...LOOKALIKE_CYRILLIC].map((c, i) => [c, LOOKALIKE_AS_LATIN[i]] as const)
)
const LOOKALIKE_ANY = new RegExp(`[${LOOKALIKE_CYRILLIC}]`, 'gu')

/** The Latin letters a Cyrillic one is read as: spec LOOKALIKE_LATIN. */
export const lookalikeLatinSide = (): string =>
  [...new Set(LOOKALIKE_AS_LATIN)].sort().join('')

/**
 * A text as a reader sees it: NFKC (S³AI is s3ai, a full-width letter is its
 * letter), invisible characters dropped (INVISIBLES_DROPPED), one case, yo as
 * ye, and each Cyrillic look-alike as its Latin letter (FOLD_LOOKALIKES).
 */
export function foldMarks(text: unknown): string {
  let s = String(text ?? '').normalize('NFKC')
  if (SPEC.INVISIBLES_DROPPED)
    s = s.replace(/\p{Default_Ignorable_Code_Point}/gu, '')
  s = s.toLowerCase().replace(/ё/g, 'е') // cyrillic-ok: yo and ye are one letter here
  if (!SPEC.FOLD_LOOKALIKES) return s
  return s.replace(LOOKALIKE_ANY, c => LOOKALIKES.get(c) ?? c)
}

/**
 * Spec `name_mark`: a name found is the house -- inside a longer word
 * (TrinityBot, NAME_INSIDE_WORD), before another word (Trinity College,
 * NAME_IN_ANY_CONTEXT: no word after it tells the college from the house),
 * and alone.
 */
export function nameMark(insideWord: boolean, wordAfter: boolean): boolean {
  if (insideWord) return SPEC.NAME_INSIDE_WORD
  if (wordAfter) return SPEC.NAME_IN_ANY_CONTEXT
  return true
}

/**
 * Spec `code_mark`: the brand is a code -- the house when it starts a word
 * (t27, t27ai, t27_ai: CODE_MARK_PREFIX), not after a letter or digit (at27)
 * nor before a digit (T270).
 */
export function codeMark(
  wordBefore: boolean,
  digitAfter: boolean,
  letterAfter: boolean
): boolean {
  if (wordBefore || digitAfter) return false
  if (letterAfter) return SPEC.CODE_MARK_PREFIX
  return true
}

/**
 * Spec `product_mark`: the product is ONE code token (PRODUCT_ONE_TOKEN):
 * S3AI is the house, "our S3 AI pipeline" is S3 the storage and the word AI.
 */
export function productMark(codeOk: boolean, spaceInside: boolean): boolean {
  if (!codeOk) return false
  if (spaceInside) return !SPEC.PRODUCT_ONE_TOKEN
  return true
}

/** The names, folded: the bot as the voice speaks it and the delivery bot. */
const NAMES: readonly string[] = [
  SPEC.BOT_SPOKEN_AS,
  'Тринити', // cyrillic-ok: the name as the voice speaks it, in Russian
  SPEC.HOUSE_DELIVERY_BOT,
].map(foldMarks)
const CODE = foldMarks(SPEC.HOUSE_BRAND)
/** The product's letters, any space between them found -- and then judged. */
const PRODUCT = new RegExp(
  [...foldMarks(SPEC.HOUSE_PRODUCT)].map(escaped).join('\\s*'),
  'gu'
)

/** Every place a folded needle starts in a folded text. */
function placesOf(text: string, needle: string): number[] {
  const at: number[] = []
  if (!needle) return at
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1))
    at.push(i)
  return at
}

/** What stands right before and right after [at, end) of a folded text. */
function around(text: string, at: number, end: number) {
  const before = text.slice(Math.max(0, at - 2), at)
  const after = text.slice(end, end + 3)
  return {
    wordBefore: /[\p{L}\p{N}]$/u.test(before),
    letterAfter: /^\p{L}/u.test(after),
    digitAfter: /^\p{N}/u.test(after),
    wordAfter: /^\s+[\p{L}\p{N}]/u.test(text.slice(end)),
  }
}

/** Where a folded text names the house: [start, end) of every mark judged one. */
function marksIn(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const name of NAMES)
    for (const at of placesOf(text, name)) {
      const end = at + name.length
      const f = around(text, at, end)
      const inside = f.wordBefore || f.letterAfter || f.digitAfter
      if (nameMark(inside, f.wordAfter)) spans.push([at, end])
    }
  for (const at of placesOf(text, CODE)) {
    const end = at + CODE.length
    const f = around(text, at, end)
    if (codeMark(f.wordBefore, f.digitAfter, f.letterAfter))
      spans.push([at, end])
  }
  for (const m of text.matchAll(PRODUCT)) {
    const at = m.index ?? 0
    const end = at + m[0].length
    const f = around(text, at, end)
    const code = codeMark(f.wordBefore, f.digitAfter, f.letterAfter)
    if (productMark(code, /\s/u.test(m[0]))) spans.push([at, end])
  }
  return spans.sort((a, b) => a[0] - b[0])
}

/** Does this text name the house (its bot, its brand or its product)? */
export function namesHouse(text: unknown): boolean {
  return marksIn(foldMarks(text)).length > 0
}

/**
 * A text as words: folded as the detector folds it (foldMarks: one case, one
 * form per letter, yo as ye), punctuation and spaces dropped -- how her
 * message and a line are compared, so a comma, a capital or a look-alike
 * letter never decides whose words they are.
 */
export function wordsOf(text: unknown): string[] {
  return foldMarks(text)
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
  return marksIn(words.join(' ')).map(([start, end]) => [
    wordAt(start),
    wordAt(Math.max(end - 1, start)),
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
