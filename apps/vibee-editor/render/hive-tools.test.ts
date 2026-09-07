import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HIVE_TOOLS } from './src/agent/hive-tools'
import { записать, забытьТаблицу } from './src/hive/journal'

/**
 * ПУЛЬС В ЧАТЕ АГЕНТА — ПРОВЕРКИ ГРАНИЦЫ.
 *
 * Инструмент агента опаснее обычного маршрута: аргументы к нему сочиняет
 * ЯЗЫКОВАЯ МОДЕЛЬ по тексту человека. Если бы личность бралась из аргумента,
 * достаточно было бы написать в чат «покажи события пользователя 144022504»,
 * и модель послушно подставила бы чужой id.
 *
 * Поэтому здесь проверяется ровно одно: личность берётся ТОЛЬКО из
 * подтверждённого контекста, и никакой аргумент на неё не влияет.
 */

const инструмент = (имя: string) => {
  const т = HIVE_TOOLS.find(t => t.name === имя)
  if (!т) throw new Error(`нет инструмента ${имя}`)
  return т
}

function поддельныйПул() {
  const строки: any[] = []
  let n = 1
  return {
    строки,
    async query(sql: string, params: any[] = []) {
      if (/^\s*(CREATE)/i.test(sql)) return { rows: [] }
      if (/INSERT INTO hive_events/i.test(sql)) {
        const [вид, кого, бот, сколько, чем, важность] = params
        строки.push({
          id: n++,
          вид,
          кого,
          бот,
          сколько,
          чем,
          важность,
          когда: new Date().toISOString(),
        })
        return { rows: [] }
      }
      // Читаем как настоящая лента: только то, что подходит под параметры.
      const кто = params[1]
      const боты: string[] = params[2] ?? []
      const всё = /WHERE true/i.test(sql)
      return {
        rows: строки
          .filter(с => всё || с.кого === кто || (с.бот && боты.includes(с.бот)))
          .sort((а, б) => б.id - а.id)
          .slice(0, Number(params[0])),
      }
    },
  }
}

const ЛЮДИ: Record<string, string[]> = { '2': ['bot_a'], '3': [] }

beforeEach(() => {
  забытьТаблицу()
  process.env.HIVE_KEEPERS = '1'
  process.env.SUPABASE_URL = 'https://пример.invalid'
  process.env.SUPABASE_SERVICE_KEY = 'ключ'
  vi.stubGlobal('fetch', async (url: string) => {
    const м = String(url).match(/telegram_id=eq\.(\d+)/)
    const боты = ЛЮДИ[м?.[1] ?? ''] ?? []
    return {
      ok: true,
      json: async () => боты.map(b => ({ bot_name: b })),
    } as any
  })
})

async function наполнить(pool: any) {
  await записать(pool, { вид: 'вход', кого: '3', бот: 'bot_a' })
  await записать(pool, { вид: 'оплата', кого: '9', бот: 'bot_b', сколько: 500 })
  await записать(pool, { вид: 'код-отказ', важность: 'тревога' })
}

describe('пульс улья: личность', () => {
  it('без подтверждённой личности — отказ, а не «покажем общее»', async () => {
    const pool = поддельныйПул()
    await expect(
      инструмент('hive_pulse').handler({}, { pool, telegramId: '' } as any)
    ).rejects.toThrow(/подтверждённой личности/)
  })

  /*
   * ОБА инструмента проверяются отдельно, а не «один за оба».
   *
   * Первый заход покрывал только `hive_events`. Мутация, подставляющая
   * `telegram_id` из аргумента в `hive_pulse`, ВЫЖИЛА — то есть подмена
   * личности в пульсе прошла бы незамеченной. Общий вывод: свойство
   * проверяется на каждой двери, а не на одной из двух.
   */
  it('hive_events: id из аргумента НЕ подменяет личность', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    // Модель «поверила» человеку и подставила чужой id в аргументы.
    const о: any = await инструмент('hive_events').handler(
      { telegram_id: '1', кого: '1', сколько: 50 } as any,
      { pool, telegramId: '3' } as any
    )
    expect(о.показаны_события).toMatch(/только ваши собственные/)
    expect(о.события.every((с: any) => с.у_кого === '3')).toBe(true)
  })

  it('hive_pulse: id из аргумента НЕ делает пчелу смотрителем', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    const о: any = await инструмент('hive_pulse').handler(
      { telegram_id: '1', кого: '1' } as any,
      { pool, telegramId: '3' } as any
    )
    expect(о.показаны_события).toMatch(/только ваши собственные/)
    expect(о.показаны_события).not.toMatch(/вся ферма/)
    // У пчелы одно своё событие; чужая оплата и ничья тревога — не её.
    expect(о.всего_событий).toBe(1)
    expect(о.тревог).toBe(0)
  })
})

describe('пульс улья: область видимости названа в ответе', () => {
  it('смотрителю сказано, что это вся ферма', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    const о: any = await инструмент('hive_pulse').handler(
      {},
      { pool, telegramId: '1' } as any
    )
    expect(о.показаны_события).toMatch(/вся ферма/)
    expect(о.всего_событий).toBe(3)
    expect(о.тревог).toBe(1)
  })

  it('владельцу перечислены ЕГО боты, и чужих событий нет', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    const о: any = await инструмент('hive_events').handler(
      {},
      { pool, telegramId: '2' } as any
    )
    expect(о.показаны_события).toMatch(/bot_a/)
    expect(о.показаны_события).not.toMatch(/bot_b/)
    expect(о.события.some((с: any) => с.бот === 'bot_b')).toBe(false)
  })

  it('пчеле не видно ничьих тревог — они дело смотрителя', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    const о: any = await инструмент('hive_pulse').handler(
      {},
      { pool, telegramId: '3' } as any
    )
    expect(о.тревог).toBe(0)
  })
})

describe('пульс улья: форма', () => {
  it('все инструменты названы с приставкой hive_', () => {
    for (const т of HIVE_TOOLS) expect(т.name).toMatch(/^hive_/)
  })

  it('только_тревоги отбирает, а не расширяет выдачу', async () => {
    const pool = поддельныйПул()
    await наполнить(pool)
    const о: any = await инструмент('hive_events').handler(
      { только_тревоги: true },
      { pool, telegramId: '1' } as any
    )
    expect(о.события).toHaveLength(1)
    expect(о.события[0].что).toBe('код-отказ')
    // Событие без субъекта названо словами, а не пустотой: пустое поле
    // читается как поломка, а это законный случай.
    expect(о.события[0].у_кого).toMatch(/без субъекта/)
  })
})
