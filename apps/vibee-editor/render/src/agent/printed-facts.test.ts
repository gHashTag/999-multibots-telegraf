import { describe, expect, it } from 'vitest'
import {
  confirmFirst,
  factsIn,
  heardFrom,
  unconfirmedFacts,
} from './printed-facts'

const keys = (text: string) => factsIn(text).map(f => f.keys.join('|'))
const prices = (text: string) => keys(text).filter(k => k.startsWith('p'))

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
    expect(keys('coffee $2.50')).toEqual(['p2'])
    // A spaced 4+ letter word after "$N" is the bare amount plus a word the
    // person must also have written (#3730 round 6, shape plus echo).
    expect(keys('$2.50 coffee')).toEqual(['p2'])
    expect(factsIn('$2.50 coffee')[0].word).toBe('coffee')
    expect(unconfirmedFacts('$2.50 coffee', '$2.50').length).toBe(1)
    expect(unconfirmedFacts('$2.50 coffee', 'coffee is $2.50')).toEqual([])
    // Glued, it is still an unknown multiplier.
    expect(keys('$2.50coffee')).toEqual(['u2.50coffee'])
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

describe('a yes that changes something is not a yes (PR #3679 round 3)', () => {
  const P = 'poster, 8 октября 11:30, Ko Phangan, entry 500 THB'
  const ask = 'Печатаю 8 октября, 11:30, 500 THB — верно?'
  const heard = (reply: string) =>
    heardFrom([
      { role: 'user', content: 'сделай афишу' },
      { role: 'assistant', content: ask },
      { role: 'user', content: reply },
    ])
  for (const reply of [
    'да, 9 октября',
    'да, в 12:00',
    'да, вход 300 бат',
    'yes - Oct 9',
    'sure, Oct 9 instead',
    'давай поменяем на 9 октября',
    'да, перенеси на 9',
    'отлично, а можно 9 октября?',
    'давай без цены',
    'да, убери цену',
    'да, без времени',
    'давай без даты',
    'верно? ты уверен?',
    'да?',
    'правильно ли это',
  ])
    it(`"${reply}" leaves the agent's values unconfirmed`, () => {
      expect(unconfirmedFacts(P, heard(reply)).length).toBeGreaterThan(0)
    })

  it('"давай без цены" with the price still in the prompt asks about it', () => {
    expect(
      unconfirmedFacts(P, heard('давай без цены')).map(f => f.kind)
    ).toContain('price')
  })

  it('a plain yes still confirms all three', () => {
    expect(unconfirmedFacts(P, heard('да, верно'))).toEqual([])
  })
})

describe('more poster forms (PR #3679 round 3)', () => {
  it('reads "7.30pm" and "7.10 pm" as times, not dates', () => {
    expect(keys('doors 7.30pm')).toEqual(['t19:30'])
    expect(keys('7.30 pm')).toEqual(['t19:30'])
    expect(keys('7.10 pm')).toEqual(['t19:10'])
  })

  it('reads £, GBP, "300р" and rubles', () => {
    expect(keys('£10')).toEqual(['p10'])
    expect(keys('10 GBP')).toEqual(['p10'])
    expect(keys('вход 300р')).toEqual(['p300'])
    expect(keys('вход 500 р')).toEqual(['p500'])
    expect(keys('300 rubles')).toEqual(['p300'])
  })

  it('"2 тыс. руб" is 2000, and "$2" does not confirm it', () => {
    expect(keys('2 тыс. руб')).toEqual(['p2000'])
    expect(unconfirmedFacts('2 тыс. руб', '$2').length).toBe(1)
    expect(unconfirmedFacts('2 тыс. руб', '2000 рублей')).toEqual([])
  })

  it('"3.5 ч видео" is a duration, not five o’clock', () => {
    expect(keys('3.5 ч видео')).toEqual([])
  })
})

describe('a yes is a closed list of yes words (PR #3679 round 4)', () => {
  const P = 'poster, 8 октября 11:30, Ko Phangan, entry 500 THB'
  const heard = (reply: string) =>
    heardFrom([
      { role: 'user', content: 'сделай афишу' },
      {
        role: 'assistant',
        content: 'Печатаю 8 октября, 11:30, 500 THB — верно?',
      },
      { role: 'user', content: reply },
    ])
  for (const reply of [
    'давай другую дату',
    'давай позже',
    'yes, later',
    'ok, a different date',
    'да, девятого',
    'да, в полдень',
    'да, 9-го',
    'давай 9',
    'да, цена 300',
    'да, кроме даты',
    'yes, wrong date though',
  ])
    it(`"${reply}" asks again`, () => {
      expect(unconfirmedFacts(P, heard(reply)).length).toBeGreaterThan(0)
    })

  for (const reply of [
    'go',
    'Perfect',
    'конечно',
    'да, без проблем',
    'yes, no problem',
    'да, печатай',
    'Yes please',
    'ок 👍',
    '👍',
    'давай!',
    'верно, рисуй',
  ])
    it(`"${reply}" confirms`, () => {
      expect(unconfirmedFacts(P, heard(reply))).toEqual([])
    })
})

describe('"тыс" is a price only next to a currency', () => {
  it('"5 тыс просмотров" is not a price, "2 тыс ₽" is', () => {
    expect(keys('5 тыс просмотров')).toEqual([])
    expect(keys('2 тыс ₽')).toEqual(['p2000'])
    expect(keys('вход 3 тыс. рублей')).toEqual(['p3000'])
  })
})

describe('leftovers of the closed yes list and the price reader (#3686)', () => {
  const P = 'poster, 8 октября 11:30, Ko Phangan, entry 500 THB'
  const ask = 'Печатаю 8 октября, 11:30, 500 THB — верно?'
  const heard = (reply: string) =>
    heardFrom([
      { role: 'user', content: 'сделай афишу' },
      { role: 'assistant', content: ask },
      { role: 'user', content: reply },
    ])

  for (const reply of [
    'please correct',
    'yes please correct',
    'please fix it',
    'да 👎',
    '👍👎',
    'ок 😡',
  ])
    it(`"${reply}" is not a yes`, () => {
      expect(unconfirmedFacts(P, heard(reply)).length).toBe(3)
    })

  for (const reply of [
    'хорошо',
    'ладно',
    'да, хорошо',
    'да, именно так',
    'согласен',
    'норм',
    'пойдёт',
    'давай так',
    'yes, go ahead',
    'yes exactly',
    'sounds good',
    "yes that's right",
    'ok thanks',
    'да спасибо',
    '👌',
    'да 👍🏽',
  ])
    it(`"${reply}" confirms`, () => {
      expect(unconfirmedFacts(P, heard(reply))).toEqual([])
    })

  it('"не так" and "хорошо, но 9-го" still ask again', () => {
    expect(unconfirmedFacts(P, heard('не так')).length).toBe(3)
    expect(unconfirmedFacts(P, heard('хорошо, но 9-го')).length).toBe(3)
  })

  it('reads "10 тысяч рублей" and "$5k" as thousands', () => {
    expect(keys('вход 10 тысяч рублей')).toEqual(['p10000'])
    expect(keys('10 тысячи ₽')).toEqual(['p10000'])
    expect(keys('prize $5k')).toEqual(['p5000'])
    expect(keys('prize $5 тыс')).toEqual(['p5000'])
    expect(keys('5k THB')).toEqual(['p5000'])
    expect(keys('5 тыс просмотров')).toEqual([])
  })

  it('"$5" does not confirm a printed "$5k"; "$5000" does', () => {
    expect(unconfirmedFacts('prize $5k', 'приз $5').length).toBe(1)
    expect(unconfirmedFacts('prize $5k', 'приз 5000 долларов')).toEqual([])
  })

  it('the same number in another currency is not a confirmation', () => {
    expect(unconfirmedFacts('entry 300 ₽', 'вход $300').length).toBe(1)
    expect(unconfirmedFacts('entry 300 ₽', 'вход 300 рублей')).toEqual([])
    expect(unconfirmedFacts('entry €15', 'вход 15 евро')).toEqual([])
    expect(unconfirmedFacts('entry €15', 'вход 15 бат').length).toBe(1)
  })
})

describe('a yes phrase alone is a yes (#3686)', () => {
  for (const reply of ['без проблем', 'go ahead', 'all good'])
    it(`"${reply}"`, () => {
      const heard = heardFrom([
        { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
        { role: 'user', content: reply },
      ])
      expect(unconfirmedFacts('8 октября 11:30', heard)).toEqual([])
    })
  it('an empty or punctuation-only reply is not', () => {
    for (const reply of ['', '...', '!!'])
      expect(
        unconfirmedFacts(
          '8 октября 11:30',
          heardFrom([
            { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
            { role: 'user', content: reply },
          ])
        ).length
      ).toBe(2)
  })
})

describe('a bare number after a price word is a price (#3692)', () => {
  it('"цена 500" confirms a printed "500 THB", in any currency', () => {
    expect(unconfirmedFacts('Цена 500 THB', 'постер, цена 500')).toEqual([])
    expect(unconfirmedFacts('Вход 300 ₽', 'вход: 300')).toEqual([])
    expect(unconfirmedFacts('Entry $15', 'entry 15')).toEqual([])
    expect(unconfirmedFacts('Ticket 20 €', 'price 20, please')).toEqual([])
    expect(unconfirmedFacts('Стоимость 1 000 бат', 'стоимость 1000')).toEqual(
      []
    )
  })

  it('reads the bare amount, thousands included, with no currency', () => {
    expect(factsIn('билет 300')).toEqual([
      { kind: 'price', text: 'билет 300', keys: ['p300'] },
    ])
    expect(keys('цена 5к')).toEqual(['p5000'])
  })

  it('a different bare number still asks', () => {
    expect(unconfirmedFacts('Цена 500 THB', 'цена 400').length).toBe(1)
  })

  it('dates, times and counts are not prices', () => {
    expect(keys('500 просмотров, 3 колонны')).toEqual([])
    expect(keys('вход 19:00')).toEqual(['t19:00'])
    expect(keys('билет на 8 октября')).toEqual(['d8.10'])
    expect(keys('price 20 per person')).toEqual([])
    expect(keys('цена 500 THB')).toEqual(['p500'])
  })
})

describe('mutants that survived #3691 (#3692)', () => {
  it('the Cyrillic "к" is a thousand', () => {
    expect(unconfirmedFacts('приз $5к', 'приз $5').length).toBe(1)
    expect(unconfirmedFacts('приз $5к', 'приз $5 000')).toEqual([])
  })

  for (const reply of [
    'ладно, но 9-го',
    'хорошо, давай позже',
    'спасибо, но не то',
    'норм, только время другое',
    'да но',
  ])
    it(`"${reply}" is not a yes`, () => {
      const heard = heardFrom([
        { role: 'assistant', content: 'Печатаю 8 октября, 11:30 — верно?' },
        { role: 'user', content: reply },
      ])
      expect(unconfirmedFacts('8 октября 11:30', heard).length).toBe(2)
    })
})

describe('a decimal before a thousands marker is part of the amount (#3697)', () => {
  it('reads "1.5k", "1,5 тыс руб" and "$2.25k" as 1500, 1500 and 2250', () => {
    expect(keys('fee $1.5k')).toEqual(['p1500'])
    expect(keys('вход 1,5 тыс руб')).toEqual(['p1500'])
    expect(keys('prize $2.25k')).toEqual(['p2250'])
    expect(keys('цена 1.5к')).toEqual(['p1500'])
  })

  it('"$1k" no longer confirms "$1.5k", "$1 500" does', () => {
    expect(unconfirmedFacts('fee $1.5k', 'fee $1k').length).toBe(1)
    expect(unconfirmedFacts('fee $1.5k', 'fee $1 500')).toEqual([])
  })

  it('"$2.5k" does not confirm a printed "$2 000", "$2 500" does', () => {
    expect(unconfirmedFacts('prize $2 000', 'prize $2.5k').length).toBe(1)
    expect(unconfirmedFacts('prize $2 500', 'prize $2.5k')).toEqual([])
  })

  it('cents with no thousands marker are still dropped', () => {
    expect(keys('$2.50')).toEqual(['p2'])
    expect(keys('fee $5k')).toEqual(['p5000'])
  })
})

describe('digit groups join only across a space, never a line break (#3706)', () => {
  it('"ENTRY 1" over "500" is not a price of 1500', () => {
    expect(keys('ENTRY 1\n500')).toEqual([])
    expect(keys('вход 1\n500 ₽')).toEqual(['p500'])
    expect(keys('1\n500 THB')).toEqual(['p500'])
  })

  it('a space, a no-break space and a narrow no-break space still join', () => {
    expect(keys('1 500 ₽')).toEqual(['p1500'])
    expect(keys('1\u00A0500 ₽')).toEqual(['p1500'])
    expect(keys('1\u202F500 ₽')).toEqual(['p1500'])
    expect(keys('вход 1 500')).toEqual(['p1500'])
    expect(keys('вход 1\u00A0500')).toEqual(['p1500'])
    expect(keys('вход 1\t500 ₽')).toEqual(['p500'])
  })

  it('a time or a lone digit over a price stays apart (#3710)', () => {
    const prices = (text: string) =>
      factsIn(text)
        .filter(f => f.kind === 'price')
        .map(f => f.keys.join('|'))
    expect(prices('11:30\n500 THB')).toEqual(['p500'])
    expect(prices('1\n500 THB')).toEqual(['p500'])
  })
})

describe('Cyrillic k, millions and a three-digit decimal (#3709)', () => {
  it('reads "10.5к ₽" as 10500 and "1,5 млн руб" as 1 500 000', () => {
    expect(keys('10.5к ₽')).toEqual(['p10500'])
    expect(keys('1,5 млн руб')).toEqual(['p1500000'])
    expect(keys('цена 1,5 млн')).toEqual(['p1500000'])
    expect(keys('prize €2 million')).toEqual(['p2000000'])
  })

  it('"10.5к ₽" is not confirmed by "10 ₽" or "10к ₽"', () => {
    expect(unconfirmedFacts('вход 10.5к ₽', 'вход 10 ₽').length).toBe(1)
    expect(unconfirmedFacts('вход 10.5к ₽', 'вход 10к ₽').length).toBe(1)
    expect(unconfirmedFacts('вход 10.5к ₽', 'вход 10 500 ₽')).toEqual([])
  })

  it('"$1.500k" carries both readings, so it is asked again (#3730 round 4)', () => {
    expect(keys('$1.500k')).toEqual(['p1500|p1500000'])
    // Flipped from "either reading confirms": each reading alone is not enough.
    expect(unconfirmedFacts('fee $1.500k', 'fee $1.5k').length).toBe(1)
    expect(unconfirmedFacts('fee $1.500k', 'fee $1 500 000').length).toBe(1)
    expect(unconfirmedFacts('fee $1.500k', 'fee $1k').length).toBe(1)
    // The person wrote both: then it is confirmed.
    expect(unconfirmedFacts('fee $1.500k', 'fee $1.5k, or $1 500 000')).toEqual(
      []
    )
    // As the person's words it confirms nothing: it is not one amount.
    expect(unconfirmedFacts('fee $1.5k', 'fee $1.500k').length).toBe(1)
  })

  it('"$1,500k" (comma) is only the group: $1500 does not confirm $1.5M (#3719)', () => {
    expect(keys('$1,500k')).toEqual(['p1500000'])
    expect(unconfirmedFacts('fee $1,500k', 'fee $1500').length).toBe(1)
    expect(unconfirmedFacts('fee $1,500k', 'fee $1.5k').length).toBe(1)
    expect(unconfirmedFacts('fee $1,500k', 'fee $1 500 000')).toEqual([])
    // Decision: a comma before three digits is a group in Russian too.
    expect(keys('цена 1,500 млн')).toEqual(['p1500000000'])
  })

  it('a spaced "к" reads both ways unless the end, punctuation or a currency follows (#3730 round 4)', () => {
    const both = (text: string) =>
      new Set(
        factsIn(text)
          .filter(f => f.kind === 'price')
          .flatMap(f => f.keys)
      )
    expect(both('$5 к утру')).toEqual(new Set(['p5', 'p5000']))
    expect(both('$5 к 19:00')).toEqual(new Set(['p5', 'p5000']))
    expect(both('₽10 к 15 к')).toEqual(new Set(['p10', 'p10000']))
    expect(keys('вход 500 ₽ к вечеру')).toEqual(['p500'])
    expect(keys('$10к утру')).toEqual(['p10000'])
    expect(keys('вход 10к ₽')).toEqual(['p10000'])
    expect(keys('вход 10 к ₽')).toEqual(['p10000'])
    expect(keys('цена $10 к')).toEqual(['p10000'])
    expect(keys('10к рублей')).toEqual(['p10000'])
    for (const text of [
      '₽10 к рублей',
      '₽10 к руб',
      '$5 к долларов',
      '$5 к баксов',
      '$5 к usd',
      '€3 к евро',
      '$5 к.',
      '$5 к, 19:00',
      '$5 к. 19:00',
    ])
      expect(prices(text)[0], text).toMatch(/^p\d+000$/)
    // Flipped toward asking: "$5" no longer confirms "$5 <k> by morning", and an
    // ambiguous form the person wrote confirms neither reading.
    expect(unconfirmedFacts('$5 к утру', '$5').length).toBe(1)
    expect(unconfirmedFacts('$5 к утру', '$5000').length).toBe(1)
    expect(unconfirmedFacts('$5', '$5 к утру').length).toBe(1)
    expect(unconfirmedFacts('$5000', '$5 к утру').length).toBe(1)
    expect(unconfirmedFacts('$5 к утру', '$5 к утру').length).toBe(1)
    expect(unconfirmedFacts('$5 к утру', 'до $5 или $5000')).toEqual([])
  })

  it('"$300" does not hide "300 ₽" in the same prompt', () => {
    expect(unconfirmedFacts('$300, 300 ₽', '$300').map(f => f.text)).toEqual([
      '300 ₽',
    ])
  })

  /*
   * THE INVARIANT, by grid (#3730 round 4). Every printed form crossed with
   * every heard form; what each form MEANS is written here from its shape,
   * never read from the code. Confirmed => the printed form means exactly
   * one amount, the heard form means exactly one amount, and they are the
   * same. Liveness too: one amount on both sides, the same, confirms.
   */
  describe('grid: a price is confirmed only by the one amount it can mean', () => {
    type Form = {
      text: string
      means: number[]
      cur: string | undefined
      // The person's identical text confirms it (#3746 exact echo).
      exact?: true
    }
    const ambiguousTails = [
      ' утру',
      ' вечеру',
      ' пятнице',
      ' дедлайну',
      ' 19:00',
      ' 19.00',
      ' 7 вечера',
      ' 9 утра',
      ' 8 марта',
      ' 3 дня',
      ' 2 ночи',
      ' 5 дней',
      ' 5 часов',
      ' 10 ч',
      ' 1 ч',
      ' 7ч',
      ' 12.99',
      ' 1.99',
      ' 9.75',
      ' 15.50',
      ' 2 чел',
      ' 2 шт',
      ' 3 мес',
      ' 2 взрослых',
      ' 5 гостям',
      ' 2',
      ' 2026',
      ' 15 к',
      '\n19:00',
      '\nутру',
      ' 🕖',
      ' - 7 вечера',
      ' 08.10',
    ]
    const thousandTails = [
      '',
      '.',
      ',',
      '!',
      ' )',
      ' рублей',
      ' руб',
      ' долларов',
      ' usd',
      ' евро',
    ]
    const forms = (
      a: number,
      sign: string,
      word: string,
      cur: string
    ): Form[] => [
      { text: `${sign}${a}`, means: [a], cur },
      { text: `${sign}${a} 000`, means: [a * 1000], cur },
      { text: `${sign}${a}к`, means: [a * 1000], cur },
      { text: `${sign}${a}k`, means: [a * 1000], cur },
      { text: `${sign}${a}.5k`, means: [a * 1000 + 500], cur },
      { text: `${sign}${a},500k`, means: [(a * 1000 + 500) * 1000], cur },
      {
        text: `${sign}${a}.500k`,
        means: [a * 1000 + 500, (a * 1000 + 500) * 1000],
        cur,
      },
      // A currency-first dot group is $a.50 or $a 500 (#3746); a trailing
      // currency keeps the group only.
      { text: `${sign}${a}.500`, means: [a * 1000 + 500, a], cur, exact: true },
      { text: `${a}.500 ${word}`, means: [a * 1000 + 500], cur },
      { text: `${a} тыс ${word}`, means: [a * 1000], cur },
      { text: `${a} млн ${word}`, means: [a * 1e6], cur },
      { text: `${a} к ${word}`, means: [a * 1000], cur },
      ...thousandTails.map(t => ({
        text: `${sign}${a} к${t}`,
        means: [a * 1000],
        cur,
      })),
      ...ambiguousTails.map(t => ({
        text: `${sign}${a} к${t}`,
        means: [a, a * 1000],
        cur,
      })),
    ]
    const all: Form[] = []
    for (const a of [5, 10])
      for (const [sign, word, cur] of [
        ['$', 'долларов', 'usd'],
        ['₽', 'рублей', 'rub'],
      ] as const)
        all.push(...forms(a, sign, word, cur))
    all.push(
      { text: 'цена 10', means: [10], cur: undefined },
      { text: 'цена 10 к', means: [10000], cur: undefined }
    )
    const priceOf = (text: string) =>
      factsIn(text).filter(f => f.kind === 'price')

    it('each form reads as exactly what it can mean', () => {
      for (const f of all) {
        const ps = priceOf(f.text)
        expect(ps.length, f.text).toBe(1)
        expect(new Set(ps[0].keys), f.text).toEqual(
          new Set(f.means.map(n => `p${n}`))
        )
      }
      expect(all.length).toBe(
        2 * 2 * (12 + thousandTails.length + ambiguousTails.length) + 2
      )
    })

    it('confirmed <=> one amount on both sides, the same, in a matching currency', () => {
      let confirmed = 0
      let pairs = 0
      for (const printed of all)
        for (const heard of all) {
          pairs++
          const ok =
            unconfirmedFacts(printed.text, heard.text).filter(
              f => f.kind === 'price'
            ).length === 0
          const should =
            (printed.means.length === 1 &&
              heard.means.length === 1 &&
              printed.means[0] === heard.means[0] &&
              (!printed.cur || !heard.cur || printed.cur === heard.cur)) ||
            (printed.exact === true && printed.text === heard.text)
          expect(
            ok,
            `printed ${JSON.stringify(printed.text)} heard ${JSON.stringify(heard.text)}`
          ).toBe(should)
          if (ok) confirmed++
        }
      expect(pairs).toBe(all.length ** 2)
      expect(confirmed).toBeGreaterThan(0)
    })

    it('every line from the three review rounds asks again against either reading', () => {
      const lines = [
        '₽10 к 15 к',
        '$5 к 3 мес',
        '₽10 к 2 шт',
        '₽10 к 2 взрослых',
        'бюджет $5 к 2026',
        '₽10 к 2',
        '$3 к 5 гостям',
        '$5 к 12.99',
        '$5 к 1.99',
        '₽10 к 9.75',
        'аренда ₽10 к 3 дня',
        'аренда ₽10 к 2 ночи',
        '₽10 к 2 ночи в отеле',
        '₽10 к 2 дня',
        '₽10 к 5 дней',
        '$5 к 5 часов',
        '₽10 к 5 часов',
        '$5 к 10 ч',
        '₽10 к 1 ч',
        '₽10 к 2 ч',
        '₽10 к 7ч',
        '₽10 к 2 чел',
        '₽10 к 15.50',
        '₽10 к\n19:00',
        '₽10 к 7 вечера',
        '₽10 к 8 март',
        '$5 к утру',
        '$5 к пятнице',
        '$5 к 19:00',
        '$5 к 7 вечера',
        '$5 к 8 марта',
      ]
      for (const line of lines) {
        const [, sign, n] = line.match(/([$₽])(\d+)/) ?? []
        const unit = Number(n)
        for (const heard of [
          `${sign}${unit}`,
          `${sign}${unit * 1000}`,
          `${sign}${unit} за 2 ч`,
          line,
        ])
          expect(
            unconfirmedFacts(line, heard).filter(f => f.kind === 'price')
              .length,
            `${line} / ${heard}`
          ).toBe(1)
      }
    })
  })

  /*
   * Round 5 (#3730): a multiplier the reader does not know read as the bare
   * unit, so "$5" confirmed "$5 thousand", "$5M", "$5kk" or "$5 bn", and
   * "5 млрд ₽" was not read at all. Now every run after an amount goes
   * through one table; a run it does not know is an UNKNOWN reading, which
   * only the identical text confirms.
   */
  describe('grid: a multiplier the reader does not know never reads as the bare amount', () => {
    type Form = {
      text: string
      means: Array<number | string>
      cur: string
      // What the form means as the PERSON's words, when that differs.
      heardMeans?: Array<number | string>
    }
    // [suffix, zeros] -- null zeros = no factor the reader can know.
    const suffixes: ReadonlyArray<[string, number | null]> = [
      ['k', 3],
      ['K', 3],
      ['к', 3],
      ['тыс', 3],
      ['тыс.', 3],
      ['тысяч', 3],
      ['thousand', 3],
      ['M', 6],
      ['m', 6],
      ['mn', 6],
      ['mln', 6],
      ['million', 6],
      ['млн', 6],
      ['kk', 6],
      ['кк', 6],
      ['КК', 6],
      ['B', 9],
      ['bn', 9],
      ['billion', 9],
      ['млрд', 9],
      ['миллиард', 9],
      ['hundred', 2],
      ['grand', 3],
      ['thou', 3],
      ['тыщ', 3],
      ['косарей', 3],
      ['lakh', 5],
      ['crore', 7],
      ['лямов', 6],
      ['лимонов', 6],
      ['zorg', null],
      ['зорг', null],
      ['гиг', null],
      ['М', null], // a Cyrillic capital: not the Latin "M"
      ['gb', null],
    ]
    const layouts = (
      a: number,
      suf: string,
      sign: string,
      word: string
    ): string[] => {
      const out = [
        `${sign}${a}${suf}`,
        `${a}${suf} ${sign}`,
        `${a} ${suf} ${sign}`,
        `${a} ${suf} ${word}`,
      ]
      // A spaced Cyrillic "k" letter is also "to": its own grid above.
      if (suf !== 'к') out.push(`${sign}${a} ${suf}`)
      return out
    }
    const all: Form[] = []
    const heardOnly: Form[] = []
    for (const a of [5, 10])
      for (const [sign, word, cur] of [
        ['$', 'долларов', 'usd'],
        ['₽', 'рублей', 'rub'],
      ] as const) {
        heardOnly.push({ text: `${sign}${a}`, means: [a], cur })
        for (const z of [2, 3, 5, 6, 7, 9])
          heardOnly.push({
            text: `${sign}${a * 10 ** z}`,
            means: [a * 10 ** z],
            cur,
          })
        for (const [suf, zeros] of suffixes)
          for (const text of layouts(a, suf, sign, word)) {
            // Round 6: "$5 zorg" (sign first, spaced, 4+ letters) is the
            // bare 5 PLUS the word, its own reading: only a person who wrote
            // the word confirms it (the echo grid below crosses that).
            const noun =
              zeros === null &&
              text === `${sign}${a} ${suf}` &&
              [...suf].length >= 4
            all.push({
              text,
              means: [
                zeros !== null
                  ? a * 10 ** zeros
                  : noun
                    ? `w${a}${suf.toLowerCase()}`
                    : `?${a}${suf.toLowerCase()}`,
              ],
              // The person wrote the word, so as heard it is the bare amount.
              heardMeans: noun ? [a, `w${a}${suf.toLowerCase()}`] : undefined,
              cur,
            })
          }
      }
    const priceOf = (text: string) =>
      factsIn(text).filter(f => f.kind === 'price')

    it('every form is read, as exactly one reading', () => {
      for (const f of all) {
        const ps = priceOf(f.text)
        expect(ps.length, f.text).toBe(1)
        expect(ps[0].keys.length, f.text).toBe(1)
        const [m] = f.means
        if (typeof m === 'number') expect(ps[0].keys[0], f.text).toBe(`p${m}`)
        else if (m.startsWith('w')) {
          expect(ps[0].keys[0], f.text).toMatch(/^p\d+$/)
          expect(ps[0].word, f.text).toBe(m.replace(/^w\d+/, ''))
        } else expect(ps[0].keys[0], f.text).toMatch(/^u/)
      }
      expect(all.length).toBe(2 * 2 * (suffixes.length * 5 - 1))
    })

    it('confirmed <=> the same amount, or the identical unknown text, in a matching currency', () => {
      // Crossed within each amount (both currencies): a 5 never equals a 10,
      // and the full cross (327k pairs) is too slow for the hook.
      let pairs = 0
      let confirmed = 0
      const pool = [...all, ...heardOnly]
      const amountOf = (f: Form) => /\d+/.exec(f.text)?.[0].slice(0, 1)
      for (const printed of pool)
        for (const heard of pool) {
          if (amountOf(printed) !== amountOf(heard)) continue
          pairs++
          const ok =
            unconfirmedFacts(printed.text, heard.text).filter(
              f => f.kind === 'price'
            ).length === 0
          const should =
            (heard.heardMeans ?? heard.means).includes(printed.means[0]) &&
            printed.cur === heard.cur
          expect(
            ok,
            `printed ${JSON.stringify(printed.text)} heard ${JSON.stringify(heard.text)}`
          ).toBe(should)
          if (ok) confirmed++
        }
      expect(pairs).toBe(2 * (pool.length / 2) ** 2)
      expect(confirmed).toBeGreaterThan(all.length)
    }, 60_000)

    it('THE INVARIANT: an unknown or larger multiplier is never confirmed by the bare amount', () => {
      for (const printed of all)
        for (const bare of heardOnly.filter(
          h => h.means[0] === 5 || h.means[0] === 10
        ))
          expect(
            unconfirmedFacts(printed.text, bare.text).filter(
              f => f.kind === 'price'
            ).length,
            `${printed.text} / ${bare.text}`
          ).toBe(1)
    })

    it("the reviewer's six round-4 rows ask again", () => {
      const ask = (printed: string, heard: string) =>
        unconfirmedFacts(printed, heard).filter(f => f.kind === 'price').length
      expect(ask('$5 thousand', '$5')).toBe(1)
      expect(ask('$5M', '$5')).toBe(1)
      expect(ask('$5kk', '$5')).toBe(1)
      expect(ask('₽10кк', '₽10')).toBe(1)
      expect(ask('$5 bn', '$5')).toBe(1)
      // "5 billion RUB" is read now, so it is checked, and the bare 5 is no yes.
      expect(keys('5 млрд ₽')).toEqual([`p${5e9}`])
      expect(ask('5 млрд ₽', '5 ₽')).toBe(1)
      expect(ask('5 млрд ₽', '')).toBe(1)
      expect(ask('5 млрд ₽', `${5e9} ₽`)).toBe(0)
      // The identical text of an unknown multiplier confirms it, nothing else does.
      expect(ask('$5 lakh', '$5 lakh')).toBe(0)
      expect(ask('$5 lakh', '$5')).toBe(1)
      expect(ask('$5', '$5 lakh')).toBe(1)
      // A filler word is no multiplier: the amount stays, the word leaves the text.
      expect(unconfirmedFacts('$5 per person', '$5')).toEqual([])
      expect(unconfirmedFacts('$5 за вход', 'вход $5')).toEqual([])
    })
  })

  it('a preposition "к" with no currency is not a price', () => {
    expect(keys('500 к ужину')).toEqual([])
  })
})

/*
 * Round 6 (#3730): SHAPE PLUS ECHO. Round 5 was sound but asked again on 17
 * of 42 ordinary posters, every one "$N word" ("$20 entry", "€15 entrance").
 * A spaced 4+ letter word after a currency-first amount, not in the
 * multiplier table, now takes the bare reading only when the person wrote
 * the same word; the table always wins.
 */
describe('shape plus echo (#3730 round 6)', () => {
  const asks = (printed: string, heard: string) =>
    unconfirmedFacts(printed, heard).filter(f => f.kind === 'price').length

  /*
   * THE USABILITY CORPUS: realistic poster prompts with a price next to a
   * word, each paired with the natural way a person says it. `legit` marks
   * a row where asking again is right (the person never named the currency).
   */
  const corpus: ReadonlyArray<{
    printed: string
    heard: string
    legit?: true
  }> = [
    // The reviewer's 17 round-5 re-asks.
    { printed: '$20 entry', heard: 'Entry is $20' },
    { printed: '$20 entry', heard: '$20' },
    {
      printed: '$15 tickets at the door',
      heard: 'tickets are $15 at the door',
    },
    { printed: '$5 coffee and cake', heard: 'coffee and cake for $5' },
    { printed: '$10 cover charge', heard: 'cover charge is $10' },
    { printed: '$3 beers until 8', heard: 'beers are $3 until 8' },
    { printed: '$35 bottomless mimosas', heard: 'unlimited mimosas, $35' },
    { printed: '$40 only', heard: 'just $40' },
    { printed: '$99 monthly membership', heard: 'membership is $99 a month' },
    { printed: '$2.50 coffee', heard: 'coffee $2.50' },
    { printed: '$45 general admission', heard: 'general admission $45' },
    { printed: '$60 materials included', heard: '$60, everything included' },
    { printed: '$8 lunch special', heard: 'lunch special for $8' },
    { printed: 'Pizza $10 large', heard: 'a large pizza is $10' },
    { printed: '€15 entrance', heard: 'entrance €15' },
    { printed: '£5 pints', heard: 'pints for £5 all night' },
    { printed: '₽500 вход', heard: 'вход 500 ₽' },
    // A trailing currency closes the amount: these confirmed on every head.
    { printed: '500 ₽ вход', heard: 'вход 500 ₽' },
    { printed: 'билет 1500 ₽ на двоих', heard: 'билет на двоих 1500 ₽' },
    { printed: 'Цена: 990 ₽ скидка', heard: 'цена 990 ₽ со скидкой' },
    { printed: 'от 3000 ₽ за урок', heard: 'урок от 3000 ₽' },
    { printed: 'Аренда 3000 ₽ сутки', heard: 'аренда 3000 ₽ в сутки' },
    { printed: '5000 ₽ за ночь', heard: 'ночь 5000 ₽' },
    { printed: 'Билет 1500 ₽', heard: 'билет 1500 рублей' },
    { printed: 'бесплатно от 1500 ₽', heard: 'от 1500', legit: true },
    // More "$N word" posters, English and Russian.
    { printed: 'Entry $20', heard: 'entry is $20' },
    { printed: 'Entry: $10', heard: '$10 entry, doors at 8' },
    { printed: '$10 tickets', heard: '$10 tickets' },
    { printed: '$12 cocktails all night', heard: 'cocktails are $12' },
    { printed: '$30 at the door', heard: '$30 at the door' },
    { printed: '€20 entry', heard: 'entry €20' },
    { printed: 'drinks $5', heard: 'drinks $5, entry free' },
    { printed: '$25 per person', heard: '$25 per person' },
    { printed: '$5 off', heard: 'get $5 off' },
    { printed: '$100 deposit required', heard: 'there is a $100 deposit' },
    { printed: '$50 gift card', heard: 'a gift card worth $50' },
    { printed: '$7 wine', heard: 'wine is $7 a glass' },
    { printed: '$15 ticket', heard: 'tickets are $15' },
    { printed: '$1,500 rent', heard: 'rent is $1,500' },
    { printed: '$5k prize pool', heard: 'prize pool $5000' },
    { printed: '₽1500 билет', heard: 'билет стоит 1500 ₽' },
    { printed: '₽2000 депозит', heard: 'депозит 2000 ₽' },
    { printed: '₽990 месяц', heard: '990 ₽ в месяц' },
    { printed: '₽300 кофе', heard: 'кофе за 300 ₽' },
    { printed: '₽5 тыс за курс', heard: 'курс 5000 ₽' },
    { printed: '₽700 обед', heard: 'Обед за 700 ₽' },
    { printed: '฿500 massage', heard: 'massage 500 baht' },
    { printed: '฿300 entry', heard: 'entry 300 THB' },
    // #3746 shapes written honestly: the same notation, a list of amounts.
    { printed: '€1.500 rent', heard: 'rent is €1.500' },
    { printed: '$1,500 deposit', heard: 'deposit $1,500' },
    { printed: '$5, $10 and $15 tickets', heard: 'tickets $5, $10 and $15' },
    { printed: '$2.50 coffee, $3 cake', heard: 'coffee $2.50, cake $3' },
    { printed: '$20 entry, 2k seats', heard: '$20 entry' },
  ]
  const needless = corpus.filter(r => !r.legit && asks(r.printed, r.heard))
  const counted = corpus.filter(r => !r.legit).length

  it(`usability corpus: ${needless.length}/${counted} needless re-asks (<= 12%)`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(42)
    expect(
      needless.length / counted,
      needless.map(r => `${r.printed} / ${r.heard}`).join('; ')
    ).toBeLessThanOrEqual(0.12)
    // Every remaining ask has a reason the person can see: the word after
    // the amount is one the person never wrote.
    for (const r of needless) {
      const f = unconfirmedFacts(r.printed, r.heard).find(
        x => x.kind === 'price'
      )
      expect(f?.word, `${r.printed} / ${r.heard}`).toBeDefined()
    }
    // The legitimate ask still asks.
    for (const r of corpus.filter(x => x.legit))
      expect(asks(r.printed, r.heard), r.printed).toBe(1)
  })

  /*
   * THE SOUNDNESS GRID, extended with echo. Every table word, every unknown
   * multiplier, and some ordinary nouns, after "$a " and "₽a ", crossed with
   * whether the person wrote the word, the bare number, the full value.
   * What each case MEANS is written here from the word's class, never read
   * from the code.
   */
  describe('grid: echo never lets the bare number confirm a multiplier', () => {
    // [word, zeros]: a number = the table; 'both' = a thousand or a count;
    // 'unknown' = a multiplier the table does not know (short, so no echo);
    // 'noun' = an ordinary 4+ letter word.
    type Cls = number | 'both' | 'unknown' | 'noun'
    const words: ReadonlyArray<[string, Cls]> = [
      ['hundred', 2],
      ['thousand', 3],
      ['thou', 3],
      ['grand', 3],
      ['тысяч', 3],
      ['тыщи', 3],
      ['косарей', 3],
      ['lakh', 5],
      ['lakhs', 5],
      ['million', 6],
      ['миллионов', 6],
      ['лямов', 6],
      ['лимона', 6],
      ['crore', 7],
      ['crores', 7],
      ['billion', 9],
      ['миллиардов', 9],
      ['штук', 'both'],
      ['штуки', 'both'],
      ['гиг', 'unknown'],
      ['gb', 'unknown'],
      ['ярд', 'unknown'],
      ['mil', 'unknown'],
      ['М', 'unknown'],
      ['entry', 'noun'],
      ['вход', 'noun'],
      ['coffee', 'noun'],
      ['zorg', 'noun'],
    ]
    type Row = {
      printed: string
      heard: string
      should: boolean
      cls: Cls
      bare: boolean
      full: boolean
    }
    const rows: Row[] = []
    for (const a of [5, 10])
      for (const sign of ['$', '₽'])
        for (const [w, cls] of words) {
          const printed = `${sign}${a} ${w}`
          const full =
            typeof cls === 'number' ? `${sign}${a * 10 ** cls}` : undefined
          const heards: Array<[string, boolean, boolean, boolean]> = [
            // [heard, wrote word, wrote bare number, wrote full value]
            ['', false, false, false],
            [`${sign}${a}`, false, true, false],
            [`${w} please`, true, false, false],
            [`${sign}${a}, ${w}`, true, true, false],
            [`${w}: ${sign}${a}`, true, true, false],
            [`${sign}${a}. Also ${w.toUpperCase()}`, true, true, false],
            // Another word written is no echo of this one.
            [`${sign}${a}, see you tonight`, false, true, false],
          ]
          if (full)
            heards.push(
              [full, false, false, true],
              [`${w} ${full}`, true, false, true]
            )
          for (const [heard, word, bare, fullHeard] of heards)
            rows.push({
              printed,
              heard,
              cls,
              bare,
              full: fullHeard,
              should:
                typeof cls === 'number'
                  ? fullHeard
                  : cls === 'noun'
                    ? word && bare
                    : false,
            })
        }

    it(`${rows.length} rows: confirmed <=> the table value, or a noun the person wrote with the bare amount`, () => {
      for (const r of rows)
        expect(
          asks(r.printed, r.heard) === 0,
          `printed ${JSON.stringify(r.printed)} heard ${JSON.stringify(r.heard)}`
        ).toBe(r.should)
      expect(rows.filter(r => r.should).length).toBeGreaterThan(0)
    })

    it('THE INVARIANT: a table word or an unknown multiplier is never confirmed by the bare number, echoed or not', () => {
      const guarded = rows.filter(r => r.cls !== 'noun' && r.bare && !r.full)
      expect(guarded.length).toBeGreaterThan(0)
      for (const r of guarded)
        expect(asks(r.printed, r.heard), `${r.printed} / ${r.heard}`).toBe(1)
    })

    it('glued and trailing-currency unknown runs never take an echo', () => {
      expect(asks('$5zorg', '$5, zorg')).toBe(1)
      expect(asks('5 zorg $', '$5, zorg')).toBe(1)
      expect(asks('5 zorgs рублей', '5 рублей zorgs')).toBe(1)
      // ...and their identical text still confirms them.
      expect(asks('$5zorg', '$5zorg')).toBe(0)
    })

    it('the echo is of THAT word', () => {
      expect(asks('$20 entry', '$20 tickets')).toBe(1)
      expect(asks('$20 entry', 'tickets $20')).toBe(1)
      expect(asks('$20 entry', '$20 entrance')).toBe(1)
      expect(asks('$20 entry', 'ENTRY $20')).toBe(0)
      expect(asks('$20 entry', '$20 entry')).toBe(0)
      // A person's own "$5 zorg" is their noun: it reads as 5.
      expect(asks('$5', '$5 zorg')).toBe(0)
      expect(asks('$5', '$5zorg')).toBe(1)
      // Another currency is still another price.
      expect(asks('$20 entry', 'entry 20 ₽')).toBe(1)
      // An echo word is no currency name: "£5 europe" is pounds.
      expect(factsIn('£5 europe')[0].currency).toBe('gbp')
    })

    it('the table wins over echo: "$5 crore" is 5e7 even when the person wrote "crore"', () => {
      expect(prices('$5 crore')).toEqual([`p${5e7}`])
      expect(asks('$5 crore', 'crore, $5')).toBe(1)
      expect(asks('$5 crore', `$${5e7}`)).toBe(0)
      expect(asks('$5 crore', '$5 crore')).toBe(0)
      expect(new Set(factsIn('₽10 штук')[0].keys)).toEqual(
        new Set(['p10', 'p10000'])
      )
    })
  })

  /*
   * The reviewer's 48 round-5 soundness rows, each against the heard forms
   * the review used, plus the bare amount with the word written apart.
   */
  it('every round 1-5 soundness row the reviewer re-checked still asks again', () => {
    const rows: ReadonlyArray<[string, ReadonlyArray<string>]> = [
      ['$5 thousand', ['$5', '$5, thousand']],
      ['$5M', ['$5']],
      ['$5kk', ['$5']],
      ['₽10кк', ['₽10']],
      ['$5 bn', ['$5']],
      ['5 млрд ₽', ['5 ₽', '']],
      ['$5 thousands', ['$5', 'thousands $5']],
      ['$5 million', ['$5', 'million $5']],
      ['$5 billion', ['$5', 'billion $5']],
      ['$5 mln', ['$5']],
      ['$5 mil', ['$5', 'mil $5']],
      ['$5 Mio', ['$5']],
      ['$5 B', ['$5']],
      ['$5 bln', ['$5']],
      ['$5 миллионов', ['$5', 'миллионов $5']],
      ['₽10 тысяч', ['₽10', 'тысяч ₽10']],
      ['10 тысяч рублей', ['10 рублей', '₽10']],
      ['$5 lakh', ['$5', 'lakh $5']],
      ['$5 crore', ['$5', 'crore $5']],
      ['$5 grand', ['$5', 'grand $5']],
      ['$5 лямов', ['$5', 'лямов $5']],
      ['$5 тыщ', ['$5', 'тыщ $5']],
      ['₽10 штук', ['₽10', '₽10000', 'штук ₽10']],
      ['₽10 косарей', ['₽10', 'косарей ₽10']],
      ['$5 thou', ['$5', 'thou $5', '$5, thou']],
      ['₽10 к 3 дня', ['₽10', '₽10000']],
      ['₽10 к 2 ночи', ['₽10', '₽10000']],
      ['$5 к 7 pm', ['$5', '$5000']],
      ['₽10 к — 3 дня', ['₽10', '₽10000']],
      ['₽10 к 2 чел', ['₽10', '₽10000']],
      ['$5 к 5 часов', ['$5', '$5000']],
      ['$5 к 10 ч', ['$5', '$5000']],
      ['₽10 к 7ч', ['₽10', '₽10000']],
      ['₽10 к\n19:00', ['₽10', '₽10000']],
      ['₽10 к 15.50', ['₽10', '₽10000']],
      ['$5 к 3 мес', ['$5', '$5000']],
      ['₽10 к 2 шт', ['₽10', '₽10000']],
      ['бюджет $5 к 2026', ['$5', '$5000']],
      ['₽10 к 15 к', ['₽10000']],
      ['$1,500k', ['$1500']],
      ['$1.500k', ['$1500', `$${1.5e6}`]],
      ['300 ₽', ['$300']],
    ]
    let checked = 0
    for (const [printed, heards] of rows)
      for (const heard of heards) {
        checked++
        expect(asks(printed, heard), `${printed} / ${heard}`).toBe(1)
      }
    expect(rows.length).toBe(42)
    expect(checked).toBeGreaterThanOrEqual(48)
  })
})

describe('a later multiplier spreads back over the first amount (#3730 round 7)', () => {
  const asks = (printed: string, heard: string) =>
    unconfirmedFacts(printed, heard).filter(f => f.kind === 'price').length

  it('the reviewer rows ask against the bare first amount', () => {
    const rows: ReadonlyArray<[string, string, string]> = [
      ['$5-10k', '$5', `p5|p${5e3}`],
      ['$5 to 10k', '$5', `p5|p${5e3}`],
      ['₽5 до 10 тыс', '₽5', `p5|p${5e3}`],
      ['$5 or 6 million', '$5', `p5|p${5e6}`],
      ['$1 and a half million', '$1', `p1|p${1.5e6}`],
      ['₽5 с половиной тысяч', '₽5', `p5|p${5.5e3}`],
      ['$5 till 10k', '$5', `p5|p${5e3}`],
      ['$5 off 10k', '$5', `p5|p${5e3}`],
      ['₽5 плюс тыс', '₽5', `p5|p${5e3}`],
      ['₽5 только тыс', '₽5', `p5|p${5e3}`],
      ['price 5-10k', 'price 5', `p5|p${5e3}`],
      ['$5 tickets to 10k', '$5 tickets', `p5|p${5e3}`],
    ]
    for (const [printed, heard, want] of rows) {
      expect(prices(printed), printed).toEqual([want])
      expect(asks(printed, heard), `${printed} / ${heard}`).toBe(1)
    }
  })

  it('a range with no multiplier still confirms against the same range', () => {
    for (const p of ['$10-15', '$10 – 15', '$10 to 15', '₽500 до 700'])
      expect(asks(p, p), p).toBe(0)
    expect(asks('$3 until 8 pm', 'beers $3 until 8 pm')).toBe(0)
    expect(asks('$25 per person, 2k seats', '$25 per person')).toBe(0)
    expect(asks('£5 all night', 'pints £5 all night')).toBe(0)
  })

  it('a trailing currency closes the amount before the chain', () => {
    expect(prices('500 ₽ - 1000 ₽')).toEqual(['p500', 'p1000'])
  })

  /*
   * THE GRID: {amount} x {connector} x {second: number, none, half} x
   * {multiplier: table, unknown, none} x {heard: bare first, scaled first,
   * both, identical text}. What each cell MEANS is written from the class,
   * never read from the code. The connectors are every dash and every
   * filler word, written out here, plus none.
   */
  describe('grid: a later multiplier is never confirmed by the bare first amount', () => {
    const connectors = [
      '-',
      '–',
      '—',
      ' - ',
      ' – ',
      ' — ',
      ' ',
      ' to ',
      ' till ',
      ' until ',
      ' or ',
      ' and ',
      ' a ',
      ' an ',
      ' the ',
      ' per ',
      ' for ',
      ' each ',
      ' from ',
      ' at ',
      ' on ',
      ' in ',
      ' with ',
      ' all ',
      ' only ',
      ' just ',
      ' off ',
      ' plus ',
      ' total ',
      ' и ',
      ' или ',
      ' а ',
      ' за ',
      ' в ',
      ' во ',
      ' на ',
      ' с ',
      ' со ', // cyrillic-ok: connector words
      ' по ',
      ' до ',
      ' от ',
      ' для ',
      ' всего ',
      ' только ',
      ' плюс ', // cyrillic-ok: connector words
      // #3746: a comma right after an amount, and hedges.
      ', ',
      ' , ',
      ' or so ',
      ' or thereabouts ',
      '-ish ',
      ' about ',
      ' около ',
      ' примерно ', // cyrillic-ok: hedge words
    ]
    // [text, value]: a half word (per sign) or a digit fraction (#3746).
    const fractions: ReadonlyArray<[string | undefined, number]> = [
      [undefined, 0.5],
      ['1/2', 0.5],
      ['½', 0.5],
      ['1/4', 0.25],
      ['¼', 0.25],
      ['3/4', 0.75],
      ['¾', 0.75],
    ]
    // [sign, table [word, zeros, glued], unknown short words, half word]
    const signs: ReadonlyArray<
      [
        string,
        ReadonlyArray<[string, number, boolean]>,
        ReadonlyArray<string>,
        string,
      ]
    > = [
      [
        '$',
        [
          ['k', 3, true],
          ['million', 6, false],
          ['grand', 3, false],
        ],
        ['mil', 'tsd'],
        'half',
      ],
      [
        '₽',
        [
          ['тыс', 3, false],
          ['млн', 6, false],
          ['кк', 6, true],
        ],
        ['тр', 'лр'],
        'половиной',
      ], // cyrillic-ok: multiplier words
    ]
    const amounts = [5, 12]
    let cells = 0
    const cell = (printed: string, heard: string, want: 0 | 1) => {
      cells++
      expect(Math.min(asks(printed, heard), 1), `${printed} / ${heard}`).toBe(
        want
      )
    }
    it('every cell', () => {
      for (const [sign, table, unknowns, halfWord] of signs)
        for (const a of amounts)
          for (const c of connectors)
            for (const [second, [fracText, frac]] of [
              ['number', fractions[0]] as const,
              ['none', fractions[0]] as const,
              ...fractions.map(f => ['half', f] as const),
            ]) {
              const halfText = fracText ?? halfWord
              const glue = (w: string, glued: boolean) =>
                second === 'number'
                  ? `${c}10${glued ? '' : ' '}${w}`
                  : second === 'half'
                    ? `${c}${halfText} ${w}`
                    : `${c}${w}`
              const bare = `${sign}${a}`
              const and = sign === '$' ? ' and ' : ' и ' // cyrillic-ok: conjunction
              const adjacent = second === 'none' && c === ' '
              // No multiplier: the first amount is the bare amount.
              if (c.trim() || second !== 'none') {
                const tail =
                  second === 'number'
                    ? `${c}10`
                    : second === 'half'
                      ? `${c}${halfText}`
                      : c
                const printed = `${bare}${tail}`.trimEnd()
                cell(printed, bare, 0)
                cell(printed, printed, 0)
                cell(printed, `${bare}${and}${sign}${a * 1000}`, 0)
              }
              // A table multiplier: bare AND scaled, unless it is adjacent.
              for (const [w, zeros, glued] of table) {
                const scaled =
                  a * 10 ** zeros + (second === 'half' ? frac * 10 ** zeros : 0)
                const printed = `${bare}${glue(w, glued && second === 'number')}`
                cell(printed, bare, 1)
                cell(printed, `${sign}${scaled}`, adjacent ? 0 : 1)
                cell(printed, `${bare}${and}${sign}${scaled}`, 0)
                cell(printed, printed, adjacent ? 0 : 1)
              }
              // An unknown short multiplier after a second number or a half:
              // no amount confirms it, nor the same ambiguous text. Right
              // after a connector it is out of the rule ("$5 per kg").
              if (second !== 'none')
                for (const w of [
                  ...unknowns,
                  ...(second === 'number' ? ['zorg'] : []),
                ]) {
                  const printed = `${bare}${glue(w, w === 'zorg')}`
                  cell(printed, bare, 1)
                  cell(printed, `${sign}${a * 1000}`, 1)
                  cell(printed, `${bare}${and}${sign}${a * 1000}`, 1)
                  cell(printed, printed, 1)
                }
            }
      expect(cells).toBe(43024)
    })
  })
})

describe('four price shapes that read as another amount (#3746)', () => {
  const asks = (printed: string, heard: string) =>
    unconfirmedFacts(printed, heard).filter(f => f.kind === 'price').length

  it('the issue rows ask, each with both readings', () => {
    const rows: ReadonlyArray<[string, string, string[]]> = [
      ['$1.500', '$1,500', ['p1500', 'p1']],
      ['$5, 10k', '$5', ['p5', `p${5e3}`]],
      ['$5 or so k', '$5', ['p5', `p${5e3}`]],
      ['$1 1/2 million', '$1', ['p1', `p${1.5e6}`]],
    ]
    for (const [printed, heard, want] of rows) {
      expect(new Set(factsIn(printed)[0].keys), printed).toEqual(new Set(want))
      expect(asks(printed, heard), `${printed} / ${heard}`).toBe(1)
    }
  })

  it('each shape by class, not by string', () => {
    // (a) a currency-first dot group, any sign or code.
    for (const p of ['€2.000', '£1.500', '₽3.000', 'USD 1.500'])
      expect(factsIn(p)[0].keys.length, p).toBe(2)
    // ...a trailing currency or more groups keep the one reading.
    expect(prices('1.500 ₽')).toEqual(['p1500'])
    expect(prices('$1.500.000')).toEqual([`p${1.5e6}`])
    expect(prices('$1.500,50')).toEqual(['p1500'])
    // (b) a comma right after an amount, also after a second amount.
    expect(asks('₽5, 10 тыс', '₽5')).toBe(1)
    expect(asks('$5 to 6, 10k', '$5')).toBe(1)
    // (c) digit fractions and glyphs, glued or spaced.
    expect(prices('$1½ million')).toEqual([`p1|p${1.5e6}`])
    expect(prices('$2 3/4k')).toEqual([`p2|p${2750}`])
    expect(prices('$2 and ¼ million')).toEqual([`p2|p${2.25e6}`])
    // ...an improper "fraction" is no fraction and no chain.
    expect(prices('$2 5/4 million')).toEqual(['p2'])
    // (d) hedges, English and Russian, glued with a dash too.
    for (const p of [
      '$5 or thereabouts k',
      '$5-ish k',
      '$5 about 10k',
      '₽5 около тыс',
      '₽5 примерно 10 тыс', // cyrillic-ok: hedge word
    ])
      expect(asks(p, p.slice(0, 2)), p).toBe(1)
  })

  it('honest prints still confirm', () => {
    expect(asks('$1,500', '$1,500')).toBe(0)
    expect(asks('$1.50', '$1.50')).toBe(0)
    expect(asks('$1.5', '$1.50')).toBe(0)
    expect(asks('$5, 10', '$5, 10')).toBe(0)
    expect(asks('$5, then $10', '$5 then $10')).toBe(0)
    expect(asks('$5 or so', '$5')).toBe(0)
    expect(asks('$1 1/2', '$1')).toBe(0)
    expect(asks('$5, 10k', `$5 and $${5e3}`)).toBe(0)
    expect(asks('$1 1/2 million', `$1 and $${1.5e6}`)).toBe(0)
    expect(asks('$1.500', '$1 and $1500')).toBe(0)
  })

  /*
   * EXACT ECHO, decided here: a printed "€1.500" the person wrote as
   * "€1.500" confirms. It is their own notation, not a fact the agent made
   * up, and asking could never end -- the agent's "Печатаю €1.500?" and the
   * person's yes re-read the same two readings. The heard side stays narrow:
   * a heard "€1.500" confirms no other form, and no single amount.
   */
  it('exact echo: the identical dot group confirms, nothing else does', () => {
    expect(asks('€1.500', '€1.500')).toBe(0)
    expect(asks('€1.500 entry', 'entry €1.500')).toBe(0)
    expect(asks('€1.500', 'Price: €1.500 per night')).toBe(0)
    // Another sign, another form, another amount: each asks.
    expect(asks('€1.500', '$1.500')).toBe(1)
    expect(asks('€1.500', 'EUR 1.500')).toBe(1)
    expect(asks('€1.500', '€1500')).toBe(1)
    expect(asks('€1500', '€1.500')).toBe(1)
    expect(asks('€1.50', '€1.500')).toBe(1)
    expect(asks('€1.500k', '€1.500k')).toBe(1)
    expect(asks('€1.500 to 2k', '€1.500 to 2k')).toBe(1)
    // A word the person did not write still needs its echo.
    expect(asks('€1.500 entry', '€1.500')).toBe(1)
    // A yes to the agent's own confirm question ends the ask.
    const history = [
      { role: 'user', content: 'a poster, rent 1500 euro' },
      { role: 'assistant', content: 'Печатаю €1.500 — верно?' },
      { role: 'user', content: 'да' },
    ]
    expect(asks('€1.500', heardFrom(history))).toBe(0)
  })
})
