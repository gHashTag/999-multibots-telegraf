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
    type Form = { text: string; means: number[]; cur: string | undefined }
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
      { text: `${a} тыс ${word}`, means: [a * 1000], cur },
      { text: `${a} млн ${word}`, means: [a * 1000000], cur },
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
        2 * 2 * (10 + thousandTails.length + ambiguousTails.length) + 2
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
            printed.means.length === 1 &&
            heard.means.length === 1 &&
            printed.means[0] === heard.means[0] &&
            (!printed.cur || !heard.cur || printed.cur === heard.cur)
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

  it('a preposition "к" with no currency is not a price', () => {
    expect(keys('500 к ужину')).toEqual([])
  })
})
