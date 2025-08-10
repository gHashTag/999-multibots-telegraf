import { describe, it, expect } from 'bun:test'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'

/**
 * Интеграционные тесты для обработки реферальных ссылок в AvatarTransformScene
 */
describe('AvatarTransformScene Referral Integration', () => {
  it('должна корректно обрабатывать функцию checkAvatarTransformUsage с реферальным кодом', async () => {
    // Тестируем с несуществующим пользователем и несуществующим реферальным кодом
    const testTelegramId = '999999999999999'
    const testInviteCode = '888888888888888'

    const result = await checkAvatarTransformUsage(
      testTelegramId,
      testInviteCode
    )

    // Проверяем, что функция возвращает корректные значения
    expect(result).toHaveProperty('canUse')
    expect(result).toHaveProperty('isAdmin')
    expect(result).toHaveProperty('hasUsedBefore')

    expect(typeof result.canUse).toBe('boolean')
    expect(typeof result.isAdmin).toBe('boolean')
    expect(typeof result.hasUsedBefore).toBe('boolean')
  })

  it('должна корректно обрабатывать функцию checkAvatarTransformUsage без реферального кода', async () => {
    const testTelegramId = '999999999999998'

    const result = await checkAvatarTransformUsage(testTelegramId)

    // Проверяем, что функция работает и без реферального кода
    expect(result).toHaveProperty('canUse')
    expect(result).toHaveProperty('isAdmin')
    expect(result).toHaveProperty('hasUsedBefore')

    expect(typeof result.canUse).toBe('boolean')
    expect(typeof result.isAdmin).toBe('boolean')
    expect(typeof result.hasUsedBefore).toBe('boolean')
  })

  it('должна корректно обрабатывать пустую строку как реферальный код', async () => {
    const testTelegramId = '999999999999997'
    const emptyInviteCode = ''

    const result = await checkAvatarTransformUsage(
      testTelegramId,
      emptyInviteCode
    )

    // Функция должна обрабатывать пустую строку как отсутствие реферального кода
    expect(result.canUse).toBe(true)
    expect(result.isAdmin).toBe(false)
  })

  it('должна возвращать canUse true для новых пользователей', async () => {
    const testTelegramId = '999999999999996'

    const result = await checkAvatarTransformUsage(testTelegramId)

    // Новые пользователи должны иметь возможность использовать функцию
    expect(result.canUse).toBe(true)
    expect(result.hasUsedBefore).toBe(false)
  })
})
