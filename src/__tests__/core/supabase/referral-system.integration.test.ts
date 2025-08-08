import { describe, it, expect } from 'bun:test'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { SubscriptionType } from '@/interfaces/subscription.interface'

/**
 * Интеграционные тесты для реферальной системы
 * Эти тесты проверяют, что функция корректно обрабатывает
 * различные сценарии с несуществующими пользователями
 */
describe('Referral System Integration Tests', () => {
  it('должна корректно обрабатывать несуществующий telegram_id', async () => {
    // Используем заведомо несуществующий ID
    const nonExistentId = '999999999999999'

    const result = await getReferalsCountAndUserData(nonExistentId)

    // Проверяем, что функция корректно возвращает значения по умолчанию
    expect(result.count).toBe(0)
    expect(result.level).toBe(0)
    expect(result.subscriptionType).toBe(SubscriptionType.STARS)
    expect(result.userData).toBe(null)
    expect(result.isExist).toBe(false)
  })

  it('должна корректно обрабатывать пустую строку как telegram_id', async () => {
    const result = await getReferalsCountAndUserData('')

    expect(result.count).toBe(0)
    expect(result.level).toBe(0)
    expect(result.subscriptionType).toBe(SubscriptionType.STARS)
    expect(result.userData).toBe(null)
    expect(result.isExist).toBe(false)
  })

  it('должна корректно обрабатывать невалидный telegram_id', async () => {
    const result = await getReferalsCountAndUserData('invalid_id')

    expect(result.count).toBe(0)
    expect(result.level).toBe(0)
    expect(result.subscriptionType).toBe(SubscriptionType.STARS)
    expect(result.userData).toBe(null)
    expect(result.isExist).toBe(false)
  })

  it('функция должна возвращать все обязательные поля', async () => {
    const result = await getReferalsCountAndUserData('123456789')

    // Проверяем, что все поля присутствуют
    expect(result).toHaveProperty('count')
    expect(result).toHaveProperty('level')
    expect(result).toHaveProperty('subscriptionType')
    expect(result).toHaveProperty('userData')
    expect(result).toHaveProperty('isExist')

    // Проверяем типы
    expect(typeof result.count).toBe('number')
    expect(typeof result.level).toBe('number')
    expect(typeof result.isExist).toBe('boolean')

    // count должен быть неотрицательным
    expect(result.count).toBeGreaterThanOrEqual(0)
    expect(result.level).toBeGreaterThanOrEqual(0)
  })
})
