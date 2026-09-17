import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { удалитьСвоёФото } from './src/assets/delete-own-photo'

/**
 * «УДАЛИТЬ ЧУЖОЕ» — СВОЙСТВО, КОТОРОЕ НИКТО НЕ ИСПОЛНЯЛ.
 *
 * `DELETE /api/assets` удаляет файлы людей. Вся защита — одно условие в
 * запросе: `AND telegram_id = $2`. Рядом стоял текстовый сторож
 * `assets-identity-order.test.ts`, и он честно писал о себе: «проверяет
 * ПОРЯДОК — личность устанавливается раньше тела и базы; НЕ проверяет, что
 * функция личности верна».
 *
 * Порядок был закреплён, свойство — нет, и исполнить его было нечем:
 * `render-server.ts` не импортирует ни один тест, потому что импорт поднимает
 * сервер. Условие вынесено в отдельный модуль ради этого файла.
 *
 * ПОДДЕЛЬНЫЙ ПУЛ БЕРЁТ УСЛОВИЯ ИЗ САМОГО ЗАПРОСА, а не повторяет их своими
 * словами. Подделка с собственной копией WHERE зеленеет ровно тогда, когда
 * условие из настоящего кода убрали, — в этом проекте так уже однажды выжила
 * удалённая одноразовость кода спаривания.
 */

interface Строка {
  id: number
  telegram_id: string
  type: string
}

function пул(строки: Строка[]) {
  const запросы: { sql: string; params: unknown[] }[] = []
  return {
    запросы,
    async query(sql: string, params: unknown[]) {
      запросы.push({ sql, params })
      const s = sql.replace(/\s+/g, ' ')
      if (!s.startsWith('DELETE FROM assets')) return { rowCount: 0 }

      const [id, кто] = params as [number, string]
      const сверяетВладельца = s.includes('telegram_id = $2')
      const сверяетТип = s.includes("type = 'avatar_photo'")
      const сверяетId = s.includes('id = $1')

      const подходят = строки.filter(
        r =>
          (!сверяетId || r.id === id) &&
          (!сверяетВладельца || r.telegram_id === String(кто)) &&
          (!сверяетТип || r.type === 'avatar_photo')
      )
      for (const r of подходят) строки.splice(строки.indexOf(r), 1)
      return { rowCount: подходят.length }
    },
  }
}

const мои = (): Строка[] => [
  { id: 1, telegram_id: '111', type: 'avatar_photo' },
  { id: 2, telegram_id: '222', type: 'avatar_photo' },
  { id: 3, telegram_id: '111', type: 'generation' },
]

describe('удаляется только своё фото аватара', () => {
  it('своё — удаляется', () => {
    // Опорный тест. Без него «чужое не удаляется» выполняется и тем, что не
    // удаляется вообще ничего и никогда.
    const строки = мои()
    const p = пул(строки)
    return удалитьСвоёФото(p, { кто: '111', id: 1 }).then(итог => {
      expect(итог).toBe('удалено')
      expect(строки.some(r => r.id === 1)).toBe(false)
    })
  })

  it('ЧУЖОЕ — НЕ УДАЛЯЕТСЯ, и ответ честный', async () => {
    /*
     * Ради этой строки существует файл. Номер id называет ФАЙЛ, а не
     * владельца: без сверки владельца любой перебор чисел стирает чужие фото.
     */
    const строки = мои()
    const итог = await удалитьСвоёФото(пул(строки), { кто: '111', id: 2 })
    expect(итог).toBe('не найдено')
    expect(
      строки.some(r => r.id === 2),
      'чужая строка исчезла'
    ).toBe(true)
  })

  it('свой файл ДРУГОГО типа не удаляется этим маршрутом', async () => {
    // Иначе тем же адресом вычищаются генерации и всё, что когда-нибудь ляжет
    // в `assets` с другим типом.
    const строки = мои()
    const итог = await удалитьСвоёФото(пул(строки), { кто: '111', id: 3 })
    expect(итог).toBe('не найдено')
    expect(строки.some(r => r.id === 3)).toBe(true)
  })

  it('несуществующий id — «не найдено», а не «удалено»', async () => {
    // Клиент, услышавший «удалено», покажет человеку исчезнувший файл,
    // которого никто не трогал.
    expect(await удалитьСвоёФото(пул(мои()), { кто: '111', id: 999 })).toBe(
      'не найдено'
    )
  })

  it('владелец идёт ПАРАМЕТРОМ, а не склейкой в текст запроса', async () => {
    // Склейка — это внедрение SQL там, где значение приходит снаружи.
    const p = пул(мои())
    await удалитьСвоёФото(p, { кто: "111' OR '1'='1", id: 1 })
    const { sql, params } = p.запросы[0]
    expect(sql).not.toContain("OR '1'='1")
    expect(params[1]).toBe("111' OR '1'='1")
  })

  it('в запросе есть все три условия', async () => {
    /*
     * Проверка текста нужна ВМЕСТЕ с поведенческими: подделка выше берёт
     * условия из запроса, поэтому запрос без `telegram_id` она послушно
     * исполнит как «удалить у всех» — и поведенческий тест это поймает.
     * А эта строка называет, ЧЕГО не хватает, вместо «ожидалось 0».
     */
    const p = пул(мои())
    await удалитьСвоёФото(p, { кто: '111', id: 1 })
    const s = p.запросы[0].sql.replace(/\s+/g, ' ')
    expect(s).toContain('id = $1')
    expect(s).toContain('telegram_id = $2')
    expect(s).toContain("type = 'avatar_photo'")
  })
})

describe('маршрут пользуется вынесенным условием, а не своей копией', () => {
  const СЕРВЕР = fs
    .readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  /*
   * BY NAME, NOT BY SIGNATURE.
   *
   * It used to match the call together with its first argument, so changing
   * that argument turned the guard red while the wiring was intact -- and
   * passing the WRONG pool without touching those characters left it silent.
   * Red on the harmless, quiet on the dangerous (form 87).
   *
   * It cannot simply go. Its neighbour below guards the ABSENCE of a second
   * copy of the query; this one guards the PRESENCE of the call. Lose the
   * call and deletion stops working with nobody noticing.
   *
   * The real cure is elsewhere: five of the eight source-reading guards in
   * this repository read render-server.ts, because its routes cannot be
   * called from a test -- eleven thousand lines with no seam. Until that seam
   * exists, reading the source is the lesser evil, and the job is to be
   * brittle exactly as much as necessary.
   */
  it('обработчик зовёт удалитьСвоёФото', () => {
    expect(СЕРВЕР).toContain('удалитьСвоёФото(')
  })

  it('второй копии запроса на удаление в сервере не осталось', () => {
    // Две копии разойдутся: одну поправят, вторую забудут — и она удалит
    // чужое.
    expect(СЕРВЕР).not.toMatch(/DELETE FROM assets/)
  })
})
