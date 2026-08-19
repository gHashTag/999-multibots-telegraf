/**
 * Ссылка на обученную модель: `owner/slug:hash` и ничего лишнего.
 *
 * Повод. В базе у трёх человек лежит такое:
 *
 *   jalisawallet-coder/Anneya:jalisawallet-coder/anneya-1773937126432:d365…
 *   ghashtag/Мой аватар:ghashtag/moy-avatar-1766257198919:331e…
 *
 * Две ошибки наложились: брали имя, которое ввёл ЧЕЛОВЕК (с пробелами и
 * кириллицей), и приписывали его к значению `output.version`, которое от
 * Replicate приходит уже полной ссылкой.
 *
 * Модели при этом ЖИВЫ — проверено запросами, отвечают 200. Потеряна ссылка,
 * а не модель.
 *
 * Тест проверяет саму сборку, отдельно от Inngest: логика здесь чистая, и
 * поднимать ради неё функцию незачем.
 */
import { describe, it, expect } from 'vitest'

const { buildModelUrl } = await import('@/core/replicate/buildModelUrl')

describe('сборка ссылки на обученную модель', () => {
  it('готовую ссылку от Replicate берёт как есть', () => {
    const ready = 'jalisawallet-coder/anneya-1773937126432:d365abc'
    expect(buildModelUrl(ready, 'jalisawallet-coder', 'Anneya')).toBe(ready)
  })

  it('не приписывает имя человека к готовой ссылке', () => {
    const ready = 'ghashtag/moy-avatar-1766257198919:331e6b63'
    const out = buildModelUrl(ready, 'ghashtag', 'Мой аватар')
    // Ровно тот мусор, что лежит в базе, — его быть не должно.
    expect(out).not.toContain('Мой аватар')
    expect(out.split(':').length).toBe(2)
  })

  it('из голого хеша собирает owner/slug:hash', () => {
    const out = buildModelUrl('78bd2fda', 'ghashtag', 'tatizaharova')
    expect(out).toBe('ghashtag/tatizaharova:78bd2fda')
  })

  it('приводит имя с пробелами и кириллицей к допустимому слагу', () => {
    // Имена моделей у Replicate — только строчные буквы, цифры и дефис.
    const out = buildModelUrl('abc123', 'ghashtag', 'Мой аватар')
    expect(out).toMatch(/^ghashtag\/[a-z0-9-]+:abc123$/)
    expect(out).not.toContain(' ')
  })

  it('пустое имя не даёт ссылку с пустым слагом', () => {
    const out = buildModelUrl('abc123', 'ghashtag', '')
    expect(out).toBe('ghashtag/model:abc123')
  })

  it('в результате ровно одно двоеточие и один слэш', () => {
    for (const [ver, user, name] of [
      ['abc', 'owner', 'Name'],
      ['owner/slug:abc', 'owner', 'Name'],
      ['abc', 'owner', 'Имя С Пробелами'],
    ] as const) {
      const out = buildModelUrl(ver, user, name)
      expect(out.split(':').length, out).toBe(2)
      expect(out.split('/').length, out).toBe(2)
    }
  })
})
