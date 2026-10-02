/**
 * Product words the ears get wrong, put right after hearing (voice-mode
 * weak spot 12).
 *
 * Measured on 2026-10-02 through the live road -- our mouth spoke each
 * phrase, our ears (GigaAM v3 for Russian) heard it -- see `tri words`:
 *
 *   said        heard
 *   reels       rilz, ril'sa, rels, vilz     (every form of the word)
 *   lipsync     Lipsing, Lepsing, Lifsing    (half of it in Latin)
 *   neurophoto  nerofoto, neirofato
 *   hive (tab)  uli                          (both times)
 *   lead magnet lit-magnit, lidmagnit (no hyphen)
 *   Vibee       Vaibe with a Latin b and e
 *
 * The words are written in Cyrillic in the table below; this comment spells
 * them in Latin only because comments here are English.
 *
 * Synthesized speech is not a person, so the list holds what the engine
 * actually returned, not guesses about what a person might say. Grow it
 * from `tri words`, not from imagination: a fix-up that fires on a real
 * word is worse than the mishearing it was meant to cure.
 *
 * GigaAM also writes a Latin letter inside a Russian word (Vibee came back
 * as a Cyrillic "Vaib" with a LATIN e at the end) -- it looks right and
 * matches nothing. Those
 * look-alikes are turned back into Cyrillic first.
 */
import type { VoiceLang } from './voice'

/**
 * Heard stem (one or more spellings) -> the stem it should have been. The
 * ending the ears gave is kept, so every case of the word is cured by one
 * row. A heard spelling matches only as a whole word (or a word plus a
 * Russian ending), never inside a longer word.
 */
interface Fix {
  heard: readonly string[]
  said: string
  /** Endings that may follow the stem; empty means the word stands alone. */
  endings?: readonly string[]
}

const NOUN_ENDINGS = ['', 'а', 'у', 'ом', 'е', 'ы', 'ов', 'ам', 'ами', 'ах']

const FIXES: Record<VoiceLang, readonly Fix[]> = {
  ru: [
    {
      heard: ['рилз', 'рильс', 'релс', 'вилз'],
      said: 'рилс',
      endings: NOUN_ENDINGS,
    },
    {
      heard: ['lipsing', 'lipsink', 'lepsing', 'липсинг', 'лифсинг', 'лифсинк'],
      said: 'липсинк',
      endings: NOUN_ENDINGS,
    },
    { heard: ['нерофото', 'нейрофато'], said: 'нейрофото', endings: [''] },
    { heard: ['ули'], said: 'улей', endings: [''] },
    {
      heard: ['лит-магнит', 'лит магнит', 'лидмагнит', 'литмагнит'],
      said: 'лид-магнит',
      endings: NOUN_ENDINGS,
    },
    // Vibee, heard half in Latin ("Vaib" in Cyrillic plus a Latin "be" or
    // "e"). A wholly Cyrillic "vaibe" is a real word ("in the vibe") and is
    // left alone, which is why these run BEFORE the look-alikes are mended.
    { heard: ['вайbe', 'вайбe', 'вайbе'], said: 'Вайби', endings: [''] },
  ],
  en: [],
}

/** Latin letters that look like Cyrillic ones, and the Cyrillic they stand for. */
const LOOKALIKE: Record<string, string> = {
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у', // cyrillic-ok: homoglyph table
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М', // cyrillic-ok: homoglyph table
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х', // cyrillic-ok: homoglyph table
}

const CYRILLIC = /\p{Script=Cyrillic}/u
const WORD = /[\p{L}\p{N}]+/gu

/** A word written in two alphabets, mended to Cyrillic where the letter allows. */
function unmix(word: string): string {
  if (!CYRILLIC.test(word) || !/[A-Za-z]/.test(word)) return word
  const mended = [...word].map(ch => LOOKALIKE[ch] ?? ch).join('')
  // A Latin letter with no Cyrillic twin (Lipsing) means a Latin word, not a
  // typo inside a Russian one: leave it whole.
  return /[A-Za-z]/.test(mended) ? word : mended
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const RULES: Record<VoiceLang, readonly [RegExp, string][]> = {
  ru: build(FIXES.ru),
  en: build(FIXES.en),
}

function build(fixes: readonly Fix[]): [RegExp, string][] {
  return fixes.map(f => {
    const stems = f.heard.map(escape).join('|')
    const ends = (f.endings ?? [''])
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(escape)
    const tail = ends.length ? `(${ends.join('|')})?` : '()'
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}-])(?:${stems})${tail}(?![\\p{L}\\p{N}])`,
      'giu'
    )
    return [re, f.said]
  })
}

function applyRules(text: string): string {
  let out = text
  for (const [re, said] of RULES.ru) {
    out = out.replace(
      re,
      (found: string, end: string | undefined, at: number, all: string) =>
        capitalLike(found, said, at, all) + (end ?? '')
    )
  }
  return out
}

/**
 * A name keeps its capital wherever it stands; any other word takes one
 * only where the ears gave it at the start of a sentence.
 */
function capitalLike(
  found: string,
  said: string,
  at: number,
  text: string
): string {
  if (said[0] !== said[0].toLowerCase()) return said
  const starts = at === 0 || /[.!?]\s*$/.test(text.slice(0, at))
  const first = found[0]
  return starts && first && first !== first.toLowerCase()
    ? said[0].toUpperCase() + said.slice(1)
    : said
}

/**
 * The words as they were meant. `lang` is what the person speaks; without
 * it the alphabet decides (any Cyrillic letter means Russian). English has
 * no fix-ups yet: Parakeet heard every product word right.
 */
export function fixWords(text: string, lang?: VoiceLang): string {
  if (!text) return text
  const ru = lang ? lang === 'ru' : CYRILLIC.test(text)
  if (!ru) return text
  // Rules, then the look-alikes, then the rules again: a row written for a
  // two-alphabet spelling must see it before it is mended, and a row written
  // in Cyrillic must see the word after.
  return applyRules(applyRules(text).replace(WORD, unmix))
}
