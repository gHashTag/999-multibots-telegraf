import { describe, expect, it } from 'vitest'
import {
  confirmFirst,
  factsIn,
  heardFrom,
  unconfirmedFacts,
} from './printed-facts'

const keys = (text: string) => factsIn(text).map(f => f.keys.join('|'))

describe('factsIn: dates, times and prices a picture would print', () => {
  it('reads the poster that went out unconfirmed on 2026-10-05', () => {
    expect(
      keys('noir poster, text: "8 October 11:30, Woody WeedPecker, Ko Phangan"')
    ).toEqual(['t11:30', 'd8.10'])
  })

  it('normalises the same date and time however it is written', () => {
    expect(keys('8 октября в 11.30')).toEqual(['t11:30', 'd8.10'])
    expect(keys('October 8')).toEqual(['d8.10'])
    expect(keys('08.10')).toEqual(['t8:10|d8.10'])
    expect(keys('8/10/2026')).toEqual(['d8.10'])
  })

  it('reads prices with the sign before or after, spaces in thousands', () => {
    expect(keys('вход 1 500 ₽')).toEqual(['p1500'])
    expect(keys('ticket $20')).toEqual(['p20'])
    expect(keys('500 бат')).toEqual(['p500'])
  })

  it('does not read picture vocabulary as facts', () => {
    // aspect ratio, lens, resolution, a version, a material
    expect(
      keys(
        '9:16 vertical, 1:1 crop, 85mm f/1.8, 4k, 8k, GPT Image 2.5, white marble 3 columns'
      )
    ).toEqual([])
    // a price in dollars is not a time
    expect(keys('$2.50 coffee')).toEqual(['p2'])
  })
})

describe('poster formats the first version missed (PR #3679 review)', () => {
  it('reads 12-hour times, ordinals, ISO dates, abbreviations and hours', () => {
    expect(keys('7:30pm')).toEqual(['t19:30'])
    expect(keys('7 pm')).toEqual(['t19:00'])
    expect(keys('7:30 pm')).toEqual(['t19:30'])
    expect(keys('11 a.m.')).toEqual(['t11:00'])
    expect(keys('October 8th')).toEqual(['d8.10'])
    expect(keys('8th of October')).toEqual(['d8.10'])
    expect(keys('2026-10-08')).toEqual(['d8.10'])
    expect(keys('Dec. 25')).toEqual(['d25.12'])
    expect(keys('19 часов, 8-го октября').sort()).toEqual(['d8.10', 't19:00'])
  })

  it('reads currency codes before the amount and thousands separators', () => {
    expect(keys('EUR 15')).toEqual(['p15'])
    expect(keys('1,500 THB')).toEqual(['p1500'])
    expect(keys('1.500 ₽')).toEqual(['p1500'])
    expect(keys('$1,500.50')).toEqual(['p1500'])
    expect(keys('15.00 EUR')).toEqual(['p15'])
  })

  it('"1,500 THB" is confirmed by "1500 бат", and not by "$1"', () => {
    expect(unconfirmedFacts('1,500 THB', '1500 бат')).toEqual([])
    expect(unconfirmedFacts('1,500 THB', 'вход $1').length).toBe(1)
  })
})

describe('heardFrom: what the person stands behind', () => {
  it('is every user message, and nothing the agent said on its own', () => {
    const heard = heardFrom([
      { role: 'user', content: 'сделай афишу на 8 октября' },
      { role: 'assistant', content: 'Во сколько? Предлагаю 11:30.' },
      { role: 'user', content: 'и добавь моё фото' },
    ])
    expect(unconfirmedFacts('8 октября 11:30', heard).map(f => f.text)).toEqual(
      ['11:30']
    )
  })

  it('adds the agent’s last answer once the person replies yes to it', () => {
    const heard = heardFrom([
      { role: 'user', content: 'сделай афишу' },
      { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
      { role: 'user', content: 'Да!' },
    ])
    expect(unconfirmedFacts('8 October 11:30', heard)).toEqual([])
  })

  it('a correction is not a yes: the agent’s value stays unconfirmed', () => {
    const heard = heardFrom([
      { role: 'user', content: 'сделай афишу' },
      { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
      { role: 'user', content: 'нет, 9 октября в 12:00' },
    ])
    expect(unconfirmedFacts('8 октября 11:30', heard).length).toBe(2)
    expect(unconfirmedFacts('9 октября 12:00', heard)).toEqual([])
  })

  it('a yes reaches back only to the agent answer right before it', () => {
    const heard = heardFrom([
      { role: 'assistant', content: 'Старое предложение: 7 октября' },
      { role: 'user', content: 'ок, подумаю' },
      { role: 'assistant', content: 'Рисую?' },
      { role: 'user', content: 'да' },
    ])
    expect(unconfirmedFacts('7 октября', heard).length).toBe(1)
  })
})

describe('a yes in ordinary words (PR #3679 review)', () => {
  const asked = (reply: string) =>
    heardFrom([
      { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
      { role: 'user', content: reply },
    ])
  for (const reply of [
    'да, верно',
    'Да, всё верно',
    'yes, correct',
    'ок, давай',
    'да 👍',
  ])
    it(`"${reply}" confirms`, () => {
      expect(unconfirmedFacts('8 октября 11:30', asked(reply))).toEqual([])
    })

  for (const reply of ['да, но в 12:00', 'нет', 'да не то'])
    it(`"${reply}" does not confirm the agent's values`, () => {
      expect(unconfirmedFacts('8 октября 11:30', asked(reply)).length).toBe(2)
    })
})

describe('a yes after the person’s own message', () => {
  it('does not reach past that message to an older proposal', () => {
    const heard = heardFrom([
      { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
      { role: 'user', content: 'нет, подожди' },
      { role: 'user', content: 'да' },
    ])
    expect(unconfirmedFacts('8 октября 11:30', heard).length).toBe(2)
  })
})

describe('unconfirmedFacts and the refusal', () => {
  it('without a conversation (a sweep, MCP) nothing is refused', () => {
    expect(unconfirmedFacts('8 October 11:30', undefined)).toEqual([])
  })

  it('a prompt with no facts prints freely', () => {
    expect(unconfirmedFacts('noir portrait, 9:16', '')).toEqual([])
  })

  it('the refusal names every fact and says nothing was charged', () => {
    const why = confirmFirst(factsIn('8 October 11:30'))
    expect(why).toContain('«11:30»')
    expect(why).toContain('«8 October»')
    expect(why).toContain('не списаны')
  })
})

describe('the image tools refuse unconfirmed facts BEFORE any charge', () => {
  // A pool that fails the test if touched: the daily cap and the charge both
  // read the database, so a refusal that reached them would throw here.
  const untouchable = {
    query: () => {
      throw new Error('the database was reached: a charge could follow')
    },
  }
  const ctx = (heard?: string) =>
    ({ telegramId: '1', pool: untouchable, heard }) as never

  for (const name of ['image_generate', 'image_edit']) {
    it(`${name}: an invented date and time are asked about, not drawn`, async () => {
      const { TOOLS_BY_NAME } = await import('./tools')
      const out: any = await TOOLS_BY_NAME.get(name)!.handler(
        { prompt: 'noir poster "8 October 11:30, Ko Phangan"' },
        ctx('сделай афишу с моим фото')
      )
      const why = String(out['причина'] ?? out.reason)
      expect(out['сделано'] ?? out.done).toBe(false)
      expect(why).toContain('«11:30»')
      expect(why).toContain('«8 October»')
    })
  }

  it('the same prompt goes on to the charge once the person wrote the facts', async () => {
    const { TOOLS_BY_NAME } = await import('./tools')
    await expect(
      TOOLS_BY_NAME.get('image_generate')!.handler(
        { prompt: 'noir poster "8 October 11:30"' },
        ctx('афиша на 8 октября, начало в 11:30')
      )
    ).rejects.toThrow(/database was reached/)
  })
})

describe('the chat route hands the conversation to the tools', () => {
  it('routes.ts sets heard from the request history', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./routes.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/^\s*heard: heardFrom\(history\),$/m)
  })
})
