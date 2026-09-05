'use strict'

/**
 * Blank out comments and string bodies so a text matcher counts CODE.
 *
 * Written five times across five probes before it became one file, and it got
 * one of those five wrong in a way nothing noticed: the version in
 * probe-dead-exports replaced a string's CLOSING quote with a space, so every
 * `export { x } from '...'` line stopped matching and the census reported 150
 * re-exports instead of 281. A plausible number, half the truth.
 *
 * So the contract is stated once, here, and pinned by selfCheck below:
 *
 *   - every character is replaced by a space, never deleted, so byte offsets
 *     and line numbers still line up with the original;
 *   - BOTH quotes of a string survive, only the body is blanked, so a matcher
 *     can still see that a string was there;
 *   - line comments, block comments and template literals go the same way.
 *
 * Template literals lose their `${}` expressions too. That is deliberate: an
 * expression inside a template is code, but a matcher that reads it out of
 * context reports a call site that does not exist.
 */

const KEEP = new Set(['\n', '\r'])

function blank(source) {
  // split(''), not Array.from(). Array.from() splits by CODE POINT, so an
  // emoji becomes one element while `source[i]` below indexes UTF-16 units --
  // after the first emoji the two sequences are off by one and the wipe lands
  // on the wrong characters, blanking real code. This repo's comments are full
  // of emoji, and the mismatch silently removed 41 re-exports from the census.
  const out = source.split('')
  const n = out.length
  let i = 0
  const wipe = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (!KEEP.has(out[k])) out[k] = ' '
    }
  }
  while (i < n) {
    const c = source[i]
    const d = source[i + 1]
    if (c === '/' && d === '/') {
      let j = i
      while (j < n && source[j] !== '\n') j++
      wipe(i, j)
      i = j
      continue
    }
    if (c === '/' && d === '*') {
      let j = i + 2
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j++
      wipe(i, Math.min(j + 2, n))
      i = j + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === c) break
        // An unterminated quote must not eat the rest of the file: a line
        // ending inside a '' or "" literal means the source is broken, and
        // swallowing to EOF would blank thousands of real lines.
        if (c !== '`' && source[j] === '\n') break
        j++
      }
      // Body only. The quotes themselves stay.
      wipe(i + 1, j)
      i = j + 1
      continue
    }
    i++
  }
  return out.join('')
}

/**
 * Runs before any caller scans anything, and exits 2 rather than returning
 * false: a blanker that quietly misbehaves produces a smaller number, and a
 * smaller number reads like good news.
 */
function selfCheck(label) {
  const fail = why => {
    console.error(`самопроверка бланкера не прошла: ${why}`)
    process.exit(2)
  }
  // matchCode judges the first NON-WHITESPACE character of a match. A
  // line-anchored pattern begins on the INDENT, and an indent is a space in
  // the mask too -- judging m.index alone dropped every such hit as if it sat
  // inside a comment. The failure mode is a silent zero, which reads exactly
  // like a clean repository.
  {
    const src = 'function f() {\n  await pay(1)\n}\n// await pay(9)\n'
    if (matchCode(src, /^[ \t]*await[ \t]+pay\(/gm).length !== 1)
      fail('совпадение с отступом отброшено как комментарий')
    if (matchCode(src, /await[ \t]+pay\(/g).length !== 1)
      fail('совпадение внутри комментария засчитано')
  }

  const cases = [
    // [input, what must survive, what must be gone]
    ["const a = 'hello'", "const a = ''", 'hello'],
    ['const a = "hi there"', 'const a = ""', 'there'],
    ['a // note here', 'a', 'note'],
    ['a /* note */ b', 'a', 'note'],
    ['const t = `x ${y} z`', 'const t = ``', 'y'],
  ]
  for (const [input, mustHave, mustNotHave] of cases) {
    const got = blank(input)
    if (got.length !== input.length) fail(`длина изменилась на ${input}`)
    if (got.includes(mustNotHave)) fail(`не погашено: ${input}`)
    if (!got.replace(/\s+/g, ' ').trim().startsWith(mustHave.split(' ')[0])) {
      fail(`съедено лишнее: ${input}`)
    }
  }
  // The exact bug that cost 131 re-exports: both quotes must survive, so a
  // re-export line still matches after blanking.
  //
  // Assert the property, not a rendering of it. The first version of this
  // check expected `from ''` in the whitespace-collapsed output, but a blanked
  // body collapses to a single space -- `from ' '` -- so it failed on a
  // blanker that was correct. The property is: two quotes survive and the path
  // does not.
  const reexport = blank("export { x } from './some/path'")
  const quotes = (reexport.match(/'/g) || []).length
  if (quotes !== 2) fail(`кавычек осталось ${quotes}, а не 2`)
  if (reexport.includes('some')) fail('тело строки не погашено')
  if (!/export \{ x \} from '\s*'/.test(reexport)) {
    fail('реэкспорт перестал совпадать после гашения')
  }
  // Newlines survive so line numbers still work.
  if (blank('a // x\nb').split('\n').length !== 2) fail('перевод строки съеден')
  // Non-BMP characters must not shift the output. Nothing here had an emoji
  // until a code-point-based split quietly desynchronised the wipe from the
  // scan and took real code with it.
  const withEmoji = "const a = 1 // \u{1F3AF} note\nexport { y } from './p'"
  const blanked = blank(withEmoji)
  if (blanked.length !== withEmoji.length) {
    fail(`эмодзи сдвинуло длину: ${blanked.length} против ${withEmoji.length}`)
  }
  if (!/export \{ y \} from '\s*'/.test(blanked)) {
    fail('строка после эмодзи погашена целиком')
  }
  // matchCode reads what blank() erases, and skips what blank() masked.
  const src =
    "import { exec } from 'child_process'\n// import { x } from 'evil'\n"
  const found = matchCode(src, /from\s*['"]([^'"]+)['"]/g).map(m => m[1])
  if (found.join(',') !== 'child_process') {
    fail(`matchCode вернул ${JSON.stringify(found)}`)
  }
  // Anchored on the code around the literal, per the contract above.
  const commented = matchCode(
    "// import { x } from 'evil'\n",
    /from\s*['"]([^'"]+)['"]/g
  )
  if (commented.length !== 0) fail('закомментированный импорт принят за живой')

  if (label) console.log(`самопроверка бланкера: ${label}`)
}

/**
 * Match on the RAW source while using the blanked copy as a mask.
 *
 * Needed because the two things a probe most often looks for -- a module path
 * and a re-export target -- ARE string bodies, which blank() erases. Written
 * after making that exact mistake twice: a barrel-resolution pass and a
 * shell-caller pass each returned zero with a known positive in hand, both
 * because they matched on blanked code.
 *
 * Works only because blank() preserves offsets byte for byte: if a match
 * starts where the mask holds a space, that match was inside a comment.
 *
 * Returns the matches, so a caller reads real captured text and still skips
 * anything commented out.
 *
 * CONTRACT: the pattern must START outside a string literal. The mask is
 * consulted at the match's first character, so a bare word that lives inside
 * a literal -- /child_process/ against `from 'child_process'` -- starts on a
 * masked space and is dropped every time. Anchor on the code around the
 * literal instead: /from\s*['"]([^'"]+)['"]/.
 *
 * A first version shipped a testCode() convenience alongside this, and its own
 * control immediately failed on exactly that misuse. Removed rather than
 * documented: a helper whose obvious call is wrong is worse than no helper.
 */
function matchCode(raw, regex) {
  const mask = blank(raw)
  const out = []
  for (const m of raw.matchAll(regex)) {
    // Judge the first NON-WHITESPACE character of the match, not the first.
    //
    // Testing m.index alone carried an unwritten contract: the pattern had to
    // begin on a code character. A perfectly ordinary line-anchored pattern
    // like /^[ \t]*await charge\(/gm begins on the INDENT, and an indent is a
    // space in the mask too -- so every hit was dropped as if it sat inside a
    // comment. The failure mode is a silent zero, which reads exactly like a
    // clean repository; it cost a live mutation that survived undetected until
    // the matcher was tested on its own.
    let i = m.index
    const end = m.index + m[0].length
    while (i < end && /\s/.test(m[0][i - m.index])) i++
    if (i >= end) continue
    if (mask[i] === ' ') continue
    out.push(m)
  }
  return out
}

module.exports = { blank, selfCheck, matchCode }
