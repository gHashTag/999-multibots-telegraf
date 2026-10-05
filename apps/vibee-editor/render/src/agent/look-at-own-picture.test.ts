import { describe, expect, it, vi } from 'vitest'
import {
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
