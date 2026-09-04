/**
 * A probe must report what it READ, not what it listed.
 *
 * it.178 found `tri dupes` swallowing every read failure with
 * `catch { continue }`. "No duplicates" and "read nothing at all" printed the
 * same words, so the tool was UNFALSIFIABLE: breaking every read under it
 * changed nothing visible, which is also why the defect survived so long --
 * there was nothing to detect it with.
 *
 * it.179 measured the class across the tool directory by breaking every read
 * and seeing who still answered confidently. Six probes did. The worst was
 * probe-tool-blindness -- the tool whose entire purpose is finding silent
 * blindness -- which printed
 *
 *     инструментов проверено: 540, с признаками слепоты: 0   cyrillic-ok: цитата вывода инструмента
 *
 * having read zero of them. The number described the LIST IT ENUMERATED, not
 * the work it did, and enumeration still worked because it goes through git.
 *
 * A census keeps the three answers apart: found, not found, could not look.
 */

const fs = require('fs')

function census(label) {
  return {
    label,
    read: 0,
    unread: [],

    /** Reads a file, recording failures instead of hiding them. */
    read1(file) {
      try {
        const text = fs.readFileSync(file, 'utf8')
        this.read++
        return text
      } catch (e) {
        this.unread.push(`${file}: ${e.message}`)
        return null
      }
    },

    /**
     * Prints the honest triple and REFUSES when nothing was read.
     *
     * Exits 2 rather than returning a value: a caller that ignores the return
     * would print its clean verdict anyway, which is the defect this file
     * exists to prevent.
     */
    report(total) {
      if (this.unread.length) {
        console.log(
          `  НЕ ПРОЧИТАНО: ${this.unread.length} из ${total} (${this.label})`
        )
        for (const u of this.unread.slice(0, 5)) console.log(`     ${u}`)
      }
      console.log(`  прочитано: ${this.read} из ${total} (${this.label})`)
      if (total > 0 && this.read === 0) {
        console.log(
          '  НИ ОДИН файл не прочитан -- это не чистый результат, а слепота.'
        )
        process.exit(2)
      }
      // Refusing only at zero is too weak: a probe that read 1 file of 1197
      // still printed a confident verdict. The threshold compares the two
      // halves of the SAME census rather than inventing a constant -- if more
      // was missed than learned, the verdict describes a minority.
      if (this.unread.length > this.read) {
        console.log(
          `  ПРОПУЩЕНО БОЛЬШЕ, ЧЕМ ПРОЧИТАНО (${this.unread.length} > ${this.read}) -- ` +
            'вывод ниже описывает меньшинство и не является вердиктом.'
        )
        process.exit(2)
      }
    },
  }
}

/** Both directions, so a broken census cannot report a healthy repository. */
function selfCheck() {
  const c = census('проба')
  const missing = c.read1('/definitely/not/here/xyz.ts')
  if (missing !== null)
    throw new Error('read-census: an unreadable file returned text')
  if (c.unread.length !== 1)
    throw new Error('read-census: failure was not recorded')
  if (c.read !== 0)
    throw new Error('read-census: a failed read was counted as read')
  const self = c.read1(__filename)
  if (typeof self !== 'string')
    throw new Error('read-census: a readable file returned nothing')
  if (c.read !== 1)
    throw new Error('read-census: a successful read was not counted')
}

module.exports = { census, selfCheck }
