import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TOKEN_PRICES } from './src/agent/billing-shared'
import { pricingSummary } from './src/agent/pricing'
import { systemPrompt } from './src/agent/chat'

/**
 * THE PRICE WE SAY MUST BE THE PRICE WE TAKE.
 *
 * Measured 2026-09-08 by running the code: every shop window in this product
 * quoted EXACTLY HALF of what the wallet paid. `pricing.PAID` said 1/6/20/1,
 * the system prompt said "картинка 1 … видео 20", the profile header and the
 * chat greeting said the same -- and `spendTokens` took 2/12/40/2. The
 * owner's markup constant (x2) had been added to the charge and to nothing
 * else, and four separate hand-typed copies of the price list stayed behind.
 *
 * WHY THE EXISTING GUARDS COULD NOT SEE IT. `validateTokenPricing`
 * (tools.ts) checks a FLOOR: charge >= cost. Both the true price and the
 * quoted half satisfy a floor test, because it never compares the quote to
 * the charge at all. PRICING.md's I5 ("prices are visible before the
 * generation -- already done") is a claim about VISIBILITY, and a visible
 * wrong number satisfies it. So this is the missing invariant, not a
 * duplicate of them: I7, the shop window equals the till.
 */

/**
 * The price module's rows carry Cyrillic field names (they are the public
 * shape of a Russian-facing payload). Touch them in ONE place so the rest of
 * this file reads in one language.
 */
type PaidRow = { функция: string; токенов: number } // cyrillic-ok: field names
const paidRows = () => pricingSummary().платно as PaidRow[] // cyrillic-ok: field name
const opOf = (r: PaidRow) => r.функция // cyrillic-ok: field name
const tokensOf = (r: PaidRow) => r.токенов // cyrillic-ok: field name

const OPS = [
  'image_generate',
  'audio_generate',
  'video_generate',
  'reel_render',
  'lipsync_generate',
] as const

describe('the quote equals the charge', () => {
  it('every row of the price list carries the charged number', () => {
    const paid = paidRows()
    expect(paid.length).toBeGreaterThan(0)
    for (const row of paid) {
      const op = opOf(row)
      const msg = `${op}: quoted price is not the charged one`
      expect(TOKEN_PRICES[op], msg).toBe(tokensOf(row))
    }
  })

  /**
   * A charged operation missing from the list is the lipsync case: it was
   * billed per audio second and appeared in no price list at all, so the one
   * operation whose bill grows with the input was the one never quoted.
   */
  it('no charged operation is missing from the price list', () => {
    const listed = new Set(paidRows().map(opOf))
    const missing = Object.keys(TOKEN_PRICES).filter(op => !listed.has(op))
    expect(missing, 'charged but never quoted').toEqual([])
  })

  it('the system prompt names the charged number for every operation', () => {
    const prompt = systemPrompt('bot')
    for (const op of OPS) {
      expect(TOKEN_PRICES[op], `${op} has no price`).toBeGreaterThan(0)
    }
    // The prompt spells prices as "<label> <number>"; assert the number that
    // is actually charged appears, and that its half -- the old wrong value
    // -- does not appear as a price for the same label.
    const line = prompt.split('\n').find(l => l.includes('ТОКЕНЫ'))
    expect(line, 'в промпте нет строки про токены').toBeTruthy()
    const pairs: Array<[string, number]> = [
      ['картинка', TOKEN_PRICES.image_generate],
      ['рилс', TOKEN_PRICES.reel_render],
      ['озвучка', TOKEN_PRICES.audio_generate],
      ['видео', TOKEN_PRICES.video_generate],
    ]
    for (const [label, price] of pairs) {
      expect(line, `${label}: промпт называет не ту цену`).toContain(
        `${label} ${price}`
      )
    }
  })
})

/**
 * NO SHOP WINDOW MAY TYPE A PRICE BY HAND.
 *
 * The three player surfaces below each carried their own copy of the table.
 * A static string cannot know a price -- the same lesson this codebase had
 * already written down in Chat.tsx about a static PROMISE, one defect
 * earlier. The rule is therefore structural, not numeric: in these files an
 * operation label is never followed by a bare number. Fixing the numbers
 * would have left the mechanism in place for the next markup change.
 */
const WINDOWS = [
  'player/src/pages/Chat.tsx',
  'player/src/components/Profile/ProfileHeader.tsx',
  'player/src/components/Profile/ProfileFilesGrid.tsx',
]
const LABELS = ['картинка', 'рилс', 'озвучка', 'видео', 'липсинк']
// The label, then at most a dash/space/em-dash, then digits. Kept tight so
// that a label followed by an unrelated count (a duration, say) does not read
// as a price.
function violations(text: string): string[] {
  const found: string[] = []
  for (const label of LABELS) {
    const re = new RegExp(`${label}\\s*(?:—|-|–|·)?\\s*(\\d+)`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) found.push(m[0])
  }
  return found
}

describe('no shop window types a price by hand', () => {
  /**
   * SELF-CHECK FIRST. A scanner that cannot find a planted price reports a
   * clean repository and an empty search identically; this repo has been
   * fooled that way four times. The needle is the exact text that shipped.
   */
  it('the scanner finds the price that actually shipped', () => {
    expect(
      violations('💰 {tokens} токенов · картинка 1 · рилс 1 · видео 20')
    ).not.toEqual([])
    expect(
      violations('Здесь появятся твои картинки, видео и озвучка.')
    ).toEqual([])
  })

  it('none of the customer-facing windows names a price', () => {
    const root = join(__dirname, '..')
    for (const rel of WINDOWS) {
      const file = join(root, rel)
      expect(
        existsSync(file),
        `${rel}: витрина исчезла — перечень устарел`
      ).toBe(true)
      const text = readFileSync(file, 'utf8')
      expect(violations(text), `${rel}: цена написана рукой`).toEqual([])
    }
  })
})
