import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A BACKTICK INSIDE THE STYLESHEET ENDS THE STYLESHEET.
 *
 * `BRAND_CSS` is a template literal, so a backtick anywhere inside it --
 * including inside a CSS comment explaining a rule -- terminates the string
 * early. This happened three times in one sitting, always the same way: a
 * comment quoting a selector or a keyword in backticks, the way one writes
 * prose in TypeScript.
 *
 * WHY THIS FILE DOES NOT IMPORT THE MODULE. When the stray backtick breaks
 * the syntax, every test that imports `skin.ts` fails to load, and a suite
 * that cannot load a file reports no tests rather than a broken rule. This
 * reads the source as TEXT, so it still runs -- and still fails -- on a file
 * that will not compile.
 */
const source = readFileSync(
  join(__dirname, 'src', 'browser', 'skin.ts'),
  'utf8'
)

function stylesheet(): string {
  const open = 'export const BRAND_CSS = `'
  const from = source.indexOf(open)
  expect(from, 'BRAND_CSS not found').toBeGreaterThan(-1)
  const start = from + open.length
  /* The template ends at the first backtick that closes a line. */
  let i = start
  for (;;) {
    i = source.indexOf('`', i)
    if (i === -1) break
    if (source[i - 1] !== '\\' && source[i + 1] === '\n')
      return source.slice(start, i)
    i += 1
  }
  throw new Error('BRAND_CSS template is never closed')
}

describe('the stylesheet survives being written about', () => {
  it('HAS NO BACKTICK INSIDE IT', () => {
    expect(stylesheet()).not.toContain('`')
  })

  it('is a whole stylesheet even read as text', () => {
    const css = stylesheet()
    expect((css.match(/\{/g) || []).length).toBe(
      (css.match(/\}/g) || []).length
    )
    expect(css.trimEnd().endsWith('}')).toBe(true)
  })

  it('still says what it is for', () => {
    /* A stylesheet with no explanation in it is the other failure. */
    expect(stylesheet()).toContain('/*')
  })
})
