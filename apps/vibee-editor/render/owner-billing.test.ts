import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Обход оплаты для владельцев — самая опасная строка в биллинге.
 *
 * Ошибка в списке означает бесплатную генерацию постороннему за счёт кредитов
 * владельца. Поэтому проверяется не «работает ли», а обе стороны: кого
 * пускает И кого обязан не пустить.
 */
describe('владельцы не платят внутренней квотой', () => {
  const было = process.env.ADMIN_IDS
  beforeEach(() => {
    process.env.ADMIN_IDS = '144022504,352374518'
  })
  afterEach(() => {
    if (было === undefined) delete process.env.ADMIN_IDS
    else process.env.ADMIN_IDS = было
  })

  it('узнаёт владельца из ADMIN_IDS — той же переменной, что у бота', async () => {
    const { владелец } = await import('./src/agent/billing-shared')
    expect(владелец('144022504')).toBe(true)
    expect(владелец('352374518')).toBe(true)
  })

  it('НЕ пускает того, кого нет в списке', async () => {
    const { владелец } = await import('./src/agent/billing-shared')
    expect(владелец('999999999')).toBe(false)
    expect(владелец('')).toBe(false)
    // Подстрока чужого id не делает владельцем: список сверяется целиком,
    // иначе «14402250» открыл бы дверь за «144022504».
    expect(владелец('14402250')).toBe(false)
    expect(владелец('1440225040')).toBe(false)
  })

  it('число и строка означают одного человека', async () => {
    const { владелец } = await import('./src/agent/billing-shared')
    expect(владелец(144022504 as unknown as string)).toBe(true)
  })
})
