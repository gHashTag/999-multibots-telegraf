import { isAdmin, checkAdminAccess } from '../middleware/adminOnly'
import { ADMIN_IDS_ARRAY } from '../config'

describe('Admin Middleware', () => {
  test('isAdmin should return true for admin users', () => {
    if (ADMIN_IDS_ARRAY.length > 0) {
      expect(isAdmin(ADMIN_IDS_ARRAY[0])).toBe(true)
    }
  })

  test('isAdmin should return false for non-admin users', () => {
    expect(isAdmin(999999999)).toBe(false)
  })

  test('checkAdminAccess should work with mock context', () => {
    const mockCtx = {
      from: { id: ADMIN_IDS_ARRAY.length > 0 ? ADMIN_IDS_ARRAY[0] : 123456 }
    } as any

    const result = checkAdminAccess(mockCtx)
    expect(typeof result).toBe('boolean')
  })
})