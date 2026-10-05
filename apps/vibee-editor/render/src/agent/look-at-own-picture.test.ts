import { describe, expect, it, vi } from 'vitest'
import {
  LOOK_MAX_TOKENS,
  LOOK_SIDE,
  LOOK_TIMEOUT_MS,
  READ_TEXT_PROMPT,
  asReadable,
  liveRead,
  lookAtOwnPicture,
  missingFactsNote,
  showsFact,
} from './look-at-own-picture'
import { factsIn } from './printed-facts'

const PNG = Buffer.from('not really a picture')
const PROMPT =
  'Poster: WOODY WEEDPECKER, 8 October 11:30, Ko Phangan, entry 500 THB'

describe('the agent looks at its own picture (#3660)', () => {
  it('names nothing when every fact is on the picture', async () => {
    const read = vi.fn(
      async () => 'WOODY WEEDPECKER\n8 October 11:30\nKo Phangan\nEntry 500 THB'
    )
    const look = await lookAtOwnPicture(PROMPT, PNG, { read })
    expect(read).toHaveBeenCalledTimes(1)
    expect(look.missing).toEqual([])
    expect(missingFactsNote(look)).toBe('')
  })

  it('names the fact the picture misspelled', async () => {
    const look = await lookAtOwnPicture(PROMPT, PNG, {
      read: async () => 'WOODY WEEDPECKER\n8 October 11:80\nEntry 500 THB',
    })
    expect(look.missing).toEqual(['11:30'])
    expect(missingFactsNote(look)).toContain('11:30')
  })

  it('names every fact when the picture carries no text', async () => {
    const look = await lookAtOwnPicture(PROMPT, PNG, {
      read: async () => 'A woodpecker on a palm tree',
    })
    expect(look.missing).toHaveLength(3)
  })

  it('does not call vision when the prompt has no date, time or price', async () => {
    const read = vi.fn(async () => 'x')
    const look = await lookAtOwnPicture('a calm sea at dawn', PNG, { read })
    expect(read).not.toHaveBeenCalled()
    expect(look).toEqual({ seen: null, missing: [] })
  })

  it('gives up at the ceiling and adds nothing', async () => {
    const look = await lookAtOwnPicture(PROMPT, PNG, {
      read: () => new Promise(() => {}),
      timeoutMs: 20,
    })
    expect(look).toEqual({ seen: null, missing: [] })
    expect(missingFactsNote(look)).toBe('')
  })

  it('a failing vision adds nothing', async () => {
    const look = await lookAtOwnPicture(PROMPT, PNG, {
      read: async () => {
        throw new Error('vision answered 503')
      },
    })
    expect(look).toEqual({ seen: null, missing: [] })
  })

  it('an empty reading is nobody looking, not every fact missing', async () => {
    const look = await lookAtOwnPicture(PROMPT, PNG, { read: async () => '' })
    expect(look).toEqual({ seen: null, missing: [] })
  })

  it('vision switched off adds nothing', async () => {
    expect(await lookAtOwnPicture(PROMPT, PNG, { read: null })).toEqual({
      seen: null,
      missing: [],
    })
  })

  it('a price shows by its amount when vision drops the currency', () => {
    const [price] = factsIn('entry 1 500 THB')
    expect(showsFact(price, 'ENTRY 1,500')).toBe(true)
    expect(showsFact(price, 'ENTRY 150')).toBe(false)
  })

  it('a date reads the same written another way', () => {
    const [date] = factsIn('8 October')
    expect(showsFact(date, 'OCT 8')).toBe(true)
    expect(showsFact(date, 'OCT 9')).toBe(false)
  })
})

describe('no false "missing" for a fact that is on the picture (#3699)', () => {
  const shown = (prompt: string, seen: string) =>
    factsIn(prompt).map(f => showsFact(f, seen))

  it('a line break is not a digit separator: the price below a time shows', () => {
    expect(shown('entry 500 THB', '11:30\n500 B')).toEqual([true])
    expect(shown('entry 500 THB', '11:30\r\n500')).toEqual([true])
    // a thin space still joins groups, a line break never
    expect(shown('entry 1 500 THB', 'ENTRY 1\u202f500')).toEqual([true])
    expect(shown('entry 1 500 THB', 'ROOM 1\n500 GUESTS')).toEqual([false])
  })

  it('a Russian short month on the poster is the month', () => {
    expect(shown('8 October', '8 окт')).toEqual([true])
    expect(shown('8 октября', '8 ОКТ.')).toEqual([true])
    expect(shown('3 сентября', '3 СЕНТ')).toEqual([true])
    expect(shown('8 October', '8 ноя')).toEqual([false])
    // a full word stays the reader's business, not the rewrite's
    expect(asReadable('8 октября')).toBe('8 октября')
  })

  it('an English month first reads as the same date', () => {
    expect(shown('8 October', 'Oct 8')).toEqual([true])
    expect(shown('8 октября', 'October 8th')).toEqual([true])
    expect(shown('8 October', 'October 9th')).toEqual([false])
  })

  it('"11:30h", "11h30" and "11.30 ч" are 11:30', () => {
    expect(shown('at 11:30', '11:30h')).toEqual([true])
    expect(shown('at 11:30', 'START 11h30')).toEqual([true])
    expect(shown('at 11:30', 'в 11.30 ч.')).toEqual([true])
    expect(shown('at 11:30', '11h45')).toEqual([false])
    // a word that merely ends in h is not an hour mark
    expect(asReadable('room 4h30x')).toBe('room 4h30x')
  })

  it('"11.30 ч" over "500 THB" leaves the price 500 (#3710)', () => {
    const prices = factsIn(asReadable('11.30 ч\n500 THB')).filter(
      f => f.kind === 'price'
    )
    expect(prices.map(f => f.keys)).toEqual([['p500']])
    // the shared joiner list: a no-break space joins, as in the fact reader
    expect(shown('entry 1 500 THB', 'ENTRY 1\u00a0500')).toEqual([true])
  })

  it('the note says what vision could not find and asks before a redraw', () => {
    const note = missingFactsNote({ seen: 'x', missing: ['11:30'] })
    expect(note).toContain('не нашло') // cyrillic-ok: the tool's answer text
    expect(note).toContain('спроси') // cyrillic-ok: the tool's answer text
    expect(note).not.toMatch(/НЕ видно/) // cyrillic-ok: the old certainty
  })
})

describe('the real reader: 448 px, live lane, the read prompt', () => {
  it('shrinks to LOOK_SIDE and asks vision on the live lane', async () => {
    const cfg = { base: 'http://vision', key: 'k', model: 'm' }
    const shrink = vi.fn(async (_b: Buffer, _side?: number) =>
      Buffer.from('small')
    )
    const ask = vi.fn(async (..._a: unknown[]) => '8 October 11:30')
    const read = liveRead({ config: () => cfg, shrink, ask: ask as never })
    expect(read).not.toBeNull()
    expect(await read!(PNG)).toBe('8 October 11:30')
    expect(shrink).toHaveBeenCalledWith(PNG, LOOK_SIDE)
    expect(LOOK_SIDE).toBe(448)
    expect(ask).toHaveBeenCalledWith(
      cfg,
      READ_TEXT_PROMPT,
      [`data:image/jpeg;base64,${Buffer.from('small').toString('base64')}`],
      LOOK_TIMEOUT_MS,
      LOOK_MAX_TOKENS,
      'live'
    )
    expect(LOOK_MAX_TOKENS).toBeGreaterThanOrEqual(200)
  })

  it('no vision key -> no reader', () => {
    expect(liveRead({ config: () => null })).toBeNull()
  })
})

describe('image_generate carries the look into its answer', () => {
  it('the success path looks and puts the note first', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('./tools.ts', import.meta.url), 'utf8')
    expect(src).toMatch(
      /const look = await lookAtOwnPicture\(String\(args\.prompt\), bytes\)/
    )
    expect(src).toMatch(/notOnPicture: look\.missing/)
    expect(src).toMatch(/подсказка: `\$\{unseenFacts \? unseenFacts/) // cyrillic-ok: the tool's answer field
  })
})
