import { describe, it, expect } from 'bun:test'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'

describe('Avatar User Creation Integration', () => {
  it('should handle missing user gracefully', async () => {
    // Используем фиктивный ID, который точно не существует в тестовой БД
    const fakeUserId = '999999999999'

    const result = await checkAvatarTransformUsage(fakeUserId)

    // Функция должна либо создать пользователя и вернуть canUse: true,
    // либо вернуть safe default (canUse: true) при ошибке
    expect(result).toMatchObject({
      canUse: true,
      isAdmin: false,
      hasUsedBefore: false,
    })
  })

  it('should correctly identify admin users', async () => {
    // Используем первый admin ID из конфига
    const adminId = '144022504' // Первый ID из ADMIN_IDS_ARRAY

    const result = await checkAvatarTransformUsage(adminId)

    expect(result).toEqual({
      canUse: true,
      isAdmin: true,
      hasUsedBefore: false,
    })
  })

  it('should handle numeric telegram IDs', async () => {
    const numericId = 999999999999

    const result = await checkAvatarTransformUsage(numericId)

    expect(result).toMatchObject({
      canUse: expect.any(Boolean),
      isAdmin: expect.any(Boolean),
      hasUsedBefore: expect.any(Boolean),
    })
  })
})
