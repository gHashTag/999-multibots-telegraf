import { describe, it, expect } from 'vitest'
import { isBalanceRefusal } from '@/price/helpers/isBalanceRefusal'

/**
 * AN EMPTY WALLET AND A BROKEN DATABASE MUST NOT LOOK THE SAME.
 *
 * `isBalanceRefusal` decides whether the owner is paged. That makes a loose
 * match expensive in one direction only: a false POSITIVE silences an outage
 * as "the customer is poor", and silence is the one failure nobody notices.
 *
 * The generators' own classifier is loose -- `errorMsgLower.includes('balance')`
 * matches "Failed to fetch user balance" -- which is why this predicate exists
 * beside it rather than reusing it. Every false-positive candidate below is a
 * string that loose test WOULD have matched.
 */
describe('a balance refusal is told apart from an outage', () => {
  /** Every wording the repository actually throws or writes for "no money". */
  const REFUSALS = [
    'Insufficient balance',
    'Not enough stars',
    'Insufficient balance: 3 < 10',
    'Insufficient stars for generation',
    '❌ Not enough stars for image editing.',
    'Недостаточно средств на балансе',
    '❌ Недостаточно звезд на балансе.',
    '❌ Недостаточно звёзд для редактирования изображения.',
  ]

  it.each(REFUSALS)('recognises %s', text => {
    expect(isBalanceRefusal(text)).toBe(true)
    expect(isBalanceRefusal(new Error(text))).toBe(true)
  })

  /**
   * Each of these contains a money word. None of them is a customer who cannot
   * pay: every one is our machinery failing, and the owner has to hear about it.
   */
  const NOT_REFUSALS = [
    'Failed to fetch user balance',
    'balance check timed out',
    'Balance check failed: connection refused',
    'ECONNRESET while reading balance',
    'insufficient permissions',
    'not enough memory',
    'not enough data to render',
    'Provider returned 500: insufficient capacity',
    'getUserBalance is not a function',
  ]

  it.each(NOT_REFUSALS)('refuses to call %s a money refusal', text => {
    expect(isBalanceRefusal(text)).toBe(false)
  })

  it('reads the message out of whatever shape the failure arrived in', () => {
    expect(isBalanceRefusal({ message: 'Not enough stars' })).toBe(true)
    expect(isBalanceRefusal({ error: 'Insufficient balance' })).toBe(true)
    expect(isBalanceRefusal({ reason: 'Not enough funds' })).toBe(true)
    expect(isBalanceRefusal({ error: new Error('Not enough stars') })).toBe(
      true
    )
  })

  it('calls nothing a refusal when there is nothing to read', () => {
    // An unknown failure is machinery until proven otherwise. Defaulting the
    // other way would mute the class of error nobody has classified yet.
    for (const empty of [undefined, null, '', {}, 0, new Error('')])
      expect(isBalanceRefusal(empty)).toBe(false)
  })
})

/**
 * THE SITES THAT DECIDE HOW LOUDLY TO COMPLAIN USE IT.
 *
 * The predicate is only worth anything where the decision is made. This reads
 * the four services that paged the owner during the 2026-09-15 08:56 incident
 * and requires each of them to consult it before choosing a log level.
 */
describe('the generators ask it before they page the owner', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const ROOT = path.join(__dirname, '..', '..', '..')

  const SERVICES = [
    'src/services/generateSeeDream45.ts',
    'src/services/generateSeeDream4.ts',
    'src/services/generateFluxKontextMax.ts',
    'src/services/generateFluxKontext.ts',
  ]

  it.each(SERVICES)('%s imports and uses it', file => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
    expect(src, `${file} does not import the predicate`).toContain(
      'isBalanceRefusal'
    )
  })

  it('the two pre-checks no longer page the owner about an empty wallet', () => {
    // These two lines were `logger.error`, alone among seven sibling generators
    // that all used `logger.warn` for the identical condition. They were alerts
    // 1 and 2 of the four.
    for (const file of [
      'src/services/generateSeeDream45.ts',
      'src/services/generateSeeDream4.ts',
    ]) {
      const src: string = fs.readFileSync(path.join(ROOT, file), 'utf8')
      const line = src
        .split('\n')
        .find(l => /insufficient balance'/i.test(l) && /logger\./.test(l))
      expect(line, `${file}: the pre-check log line is gone`).toBeTruthy()
      expect(line, `${file}: the pre-check still pages the owner`).toContain(
        'logger.warn'
      )
    }
  })
})
