/**
 * AN ADDRESS THE SERVICE NEVER PRODUCED DOES NOT LEAVE IT.
 *
 * Production, 20.09.2026: a client got
 * `assets/1789924443235674-agent-edit-1789924443235613.png`, a splice of two
 * real uploads from that evening -- the timestamp of one, the tail of the
 * other. The bucket had lost nothing; the address had never existed.
 *
 * The bot grew a floor for its own path the next day. This is the floor under
 * the mini app and iOS, which read their answers straight out of the render's
 * stream and so had none.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  assetUrlsIn,
  createLinkGate,
  isAssetUrl,
  MAX_HELD,
  FABRICATED_LINK_NOTICE,
} from './asset-links'

const BASE = 'https://bucket-production-8259.up.railway.app/vibee-assets'
const REAL_A = `${BASE}/assets/1789924235674-agent-edit-1.png`
const REAL_B = `${BASE}/assets/1789924935613-agent-edit-2.png`
/** The 20.09 address itself: the head of one real key, the tail of another. */
const SPLICED = `${BASE}/assets/1789924443235674-agent-edit-1789924443235613.png`

beforeEach(() => {
  vi.stubEnv('S3_PUBLIC_URL', BASE)
  vi.stubEnv('PUBLIC_URL', 'https://vibee-render-production.up.railway.app')
})
afterEach(() => vi.unstubAllEnvs())

describe('what counts as one of our addresses', () => {
  it('both shapes the service hands out, and nobody else', () => {
    expect(isAssetUrl(REAL_A)).toBe(true)
    expect(
      isAssetUrl(
        'https://vibee-render-production.up.railway.app/s3/assets/x.png'
      )
    ).toBe(true)
    expect(isAssetUrl('https://example.com/assets/x.png')).toBe(false)
    // A link to the docs is a link to the docs. The gate is about files.
    expect(isAssetUrl('https://t.me/t27ai_bot')).toBe(false)
  })

  it('trailing punctuation belongs to the sentence, not the address', () => {
    expect(assetUrlsIn(`Готово: ${REAL_A}.`)).toEqual([REAL_A])
  })
})

describe('a turn that was given the real files', () => {
  it('passes them through untouched, and costs nothing when there is no link', () => {
    const gate = createLinkGate([`files: ${REAL_A} ${REAL_B}`])
    expect(gate.push(`Вот она: ${REAL_A} `)).toBe(`Вот она: ${REAL_A} `)
    expect(gate.push('Как тебе? ')).toBe('Как тебе? ')
    expect(gate.fabricated()).toEqual([])
  })

  it('drops the spliced one and says so in place of it', () => {
    const gate = createLinkGate([`files: ${REAL_A} ${REAL_B}`])
    const out = gate.push(`Держи: ${SPLICED} `) + gate.flush()
    expect(out).not.toContain(SPLICED)
    expect(out).toContain(FABRICATED_LINK_NOTICE.trim())
    expect(gate.fabricated()).toEqual([SPLICED])
  })

  it('a markdown link loses the brackets too, and keeps its label', () => {
    const gate = createLinkGate([REAL_A])
    const out =
      gate.push(`Смотри [твоё фото](${SPLICED}) — нравится?`) + gate.flush()
    expect(out).toContain('Смотри твоё фото')
    expect(out).not.toContain('](')
    expect(out).not.toContain('[твоё фото]')
  })
})

describe('an address that did not exist when the turn started', () => {
  it('is allowed once the tool that made it has returned', () => {
    const gate = createLinkGate(['no files yet'])
    // Before the tool: composed as far as anyone here can tell.
    expect(gate.push(`${REAL_A} `)).not.toContain(REAL_A)

    gate.allow({ url: REAL_B, ok: true })
    expect(gate.push(`Готово: ${REAL_B} `)).toContain(REAL_B)
  })
})

describe('the stream, which is where this has to work', () => {
  it('an address split across chunks is judged whole, not in pieces', () => {
    const gate = createLinkGate([REAL_A])
    let out = ''
    for (const c of [
      `Держи: ${SPLICED.slice(0, 40)}`,
      SPLICED.slice(40),
      ' ок',
    ])
      out += gate.push(c)
    out += gate.flush()

    expect(out).not.toContain(SPLICED)
    expect(gate.fabricated()).toEqual([SPLICED])
    expect(out).toContain('Держи:')
  })

  it('a real address split across chunks arrives whole', () => {
    const gate = createLinkGate([REAL_A])
    let out = ''
    for (const c of ['Вот: ', REAL_A.slice(0, 30), REAL_A.slice(30), '!'])
      out += gate.push(c)
    out += gate.flush()
    expect(out).toBe(`Вот: ${REAL_A}!`)
  })

  it('text with no address in it is never held back', () => {
    const gate = createLinkGate([])
    expect(gate.push('Лена, план на месяц готов. ')).toBe(
      'Лена, план на месяц готов. '
    )
    expect(gate.flush()).toBe('')
  })

  it('prose without whitespace does not stall the stream forever', () => {
    const gate = createLinkGate([])
    const long = 'a'.repeat(MAX_HELD + 10)
    expect(gate.push(`http${long}`).length).toBeGreaterThan(MAX_HELD)
  })

  it('only the address is held back, never the words before it', () => {
    const gate = createLinkGate([REAL_A])
    // The prose goes out at once; what may still be growing into an address
    // waits. A person watching the stream sees the sentence, not a pause.
    expect(gate.push(`Вот ${REAL_A.slice(0, 20)}`)).toBe('Вот ')
    expect(gate.flush()).toBe(REAL_A.slice(0, 20))
    expect(gate.flush()).toBe('')
  })
})
