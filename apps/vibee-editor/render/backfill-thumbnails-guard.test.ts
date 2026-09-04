import { describe, it, expect, beforeEach, afterEach } from 'vitest'

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
