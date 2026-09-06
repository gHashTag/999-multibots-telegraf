import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Дозаполнение обложек правит ЧУЖИЕ записи пачками и жжёт процессорное время
 * на ffmpeg. Поэтому проверяется не «работает ли», а кого оно обязано НЕ
 * пустить: список владельцев — единственное, что стоит между маршрутом и
 * посторонним.
 */
describe('дозаполнение обложек — только владельцу', () => {
  const было = process.env.ADMIN_IDS
  beforeEach(() => {
    process.env.ADMIN_IDS = '144022504,352374518'
  })
  afterEach(() => {
    if (было === undefined) delete process.env.ADMIN_IDS
    else process.env.ADMIN_IDS = было
  })

  it('владельца из ADMIN_IDS пускает', async () => {
    const { владелец } = await import('./src/agent/billing-shared')
    expect(владелец('144022504')).toBe(true)
  })

  it('постороннего не пускает, и подстрока id не помогает', async () => {
    const { владелец } = await import('./src/agent/billing-shared')
    expect(владелец('999999999')).toBe(false)
    expect(владелец('')).toBe(false)
    // Иначе «14402250» открыл бы дверь, которую держит «144022504».
    expect(владелец('14402250')).toBe(false)
    expect(владелец('1440225040')).toBe(false)
  })

  it('пустой ADMIN_IDS не делает владельцем никого', async () => {
    process.env.ADMIN_IDS = ''
    const мод = await import('./src/agent/billing-shared?пусто')
    expect(мод.владелец('144022504')).toBe(false)
  })
})

describe('сторож стоит НА МАРШРУТЕ, а не только в помощнике', () => {
  /*
   * ФАЙЛ ОБЕЩАЛ БОЛЬШЕ, ЧЕМ ПРОВЕРЯЛ.
   *
   * Проверки выше зовут `владелец()` с готовыми идентификаторами — то есть
   * проверяют ПРЕДИКАТ. А обещание в заголовке файла — про МАРШРУТ: «кого он
   * обязан НЕ пустить».
   *
   * Разница не теоретическая. Доказано мутацией: удалить весь блок гварда в
   * render-server.ts — и все три теста остаются зелёными, а
   * `POST /api/feed/backfill-thumbnails` открывается любому. Маршрут
   * массово ПРАВИТ чужие записи в public_templates и запускает ffmpeg на
   * каждой строке.
   *
   * Проверить это поведением нельзя, не подняв сервер, поэтому читаем
   * исходник — но читаем именно СВЯЗЬ предиката с маршрутом, а не наличие
   * слов.
   */
  const СЕРВЕР = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )
  const МАРШРУТ = СЕРВЕР.slice(
    СЕРВЕР.indexOf("'/api/feed/backfill-thumbnails'"),
    СЕРВЕР.indexOf("'/api/feed/backfill-thumbnails'") + 900
  )

  it('маршрут вообще существует — иначе проверка пуста', () => {
    expect(СЕРВЕР).toContain("'/api/feed/backfill-thumbnails'")
  })

  it('личность берётся и сверяется со списком владельцев', () => {
    expect(МАРШРУТ).toContain('generationOwnerId(req)')
    expect(МАРШРУТ).toMatch(/!кто \|\| !владелец\(кто\)/)
  })

  it('посторонний получает 403, а не тихий пропуск', () => {
    expect(МАРШРУТ).toContain('res.writeHead(403')
    expect(МАРШРУТ).toContain('owners only')
  })

  it('отказ стоит ДО работы: сначала return, потом ffmpeg', () => {
    // Гвард после начала работы — не гвард, а комментарий.
    const отказ = МАРШРУТ.indexOf('res.writeHead(403')
    const возврат = МАРШРУТ.indexOf('return', отказ)
    expect(отказ).toBeGreaterThan(-1)
    expect(возврат).toBeGreaterThan(отказ)
  })
})
