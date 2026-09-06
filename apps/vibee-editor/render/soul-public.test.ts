import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { isPublic } from './auth'
import type { IncomingMessage } from 'http'

/**
 * SOUL ОТКРЫТ НА ЧТЕНИЕ, НО НЕ НА ЗАПИСЬ.
 *
 * На нём строится знакомство: люди находят друг друга по интересам, а агенты
 * a2a — людей. Закрытый SOUL связывать никого не может. Но открытость на
 * чтение и открытость на правку — разные вещи, и путать их здесь дороже
 * всего: чужой SOUL это чужие слова о себе.
 */
const СЕРВЕР = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
const ИНСТРУМЕНТЫ = fs.readFileSync(
  path.join(__dirname, 'src', 'agent', 'tools.ts'),
  'utf8'
)
const запрос = (url: string, method = 'GET') =>
  ({ url, method }) as unknown as IncomingMessage

describe('чтение открыто', () => {
  it('GET /api/soul/<имя> публичен', () => {
    expect(isPublic(запрос('/api/soul/t27_dev'))).toBe(true)
  })

  it('пустой SOUL и отсутствующий человек — разные ответы', () => {
    /*
     * Спутав их, агент пойдёт искать несуществующего человека или решит, что
     * существующему нечего сказать. Оба вывода неверны и оба тихие.
     */
    expect(СЕРВЕР).toMatch(/sendJson\(res, 404, \{ success: false, error: 'not found' \}\)/)
    expect(СЕРВЕР).toContain("soul: r.rows[0].content ?? ''")
  })
})

describe('правка закрыта', () => {
  it('маршрут SOUL отвечает только на GET', () => {
    // Пусть попытка записать по тому же адресу не найдёт обработчика вовсе,
    // а не окажется «почти защищённой».
    expect(СЕРВЕР).toMatch(/req\.url\?\.startsWith\('\/api\/soul\/'\) && req\.method === 'GET'/)
  })

  it('инструмент чужого SOUL — только чтение', () => {
    // `soul_edit` пишет строго по личности вызывающего; отдельного «править
    // чужой» нет и быть не должно.
    expect(ИНСТРУМЕНТЫ).toContain("name: 'soul_of'")
    expect(ИНСТРУМЕНТЫ).not.toContain("name: 'soul_edit_of'")
  })

  it('агент может найти человека по имени, а не только себя', () => {
    // Без этого инструмента внешний агент читал только СВОЙ SOUL — то есть
    // не мог найти никого, ради чего открытость и заводилась.
    expect(ИНСТРУМЕНТЫ).toMatch(/soul_of[\s\S]{0,1600}?FROM profiles p/)
  })
})
