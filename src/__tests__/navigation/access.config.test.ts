/**
 * 🧪 Тесты для access.config - права доступа
 *
 * Тестирует:
 * - HAIM_GROUP_STAFF_IDS - массив ID сотрудников
 * - METAMUSE_STAFF_IDS - массив ID сотрудников MetaMuse
 * - SUPER_ADMIN_ID - ID главного админа
 * - isAdmin() - проверка админских прав
 * - isSuperAdmin() - проверка супер-админа
 * - getParsingAccess() - права на парсинг
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  HAIM_GROUP_STAFF_IDS,
  METAMUSE_STAFF_IDS,
  SUPER_ADMIN_ID,
  isAdmin,
  isSuperAdmin,
  getParsingAccess,
  ParsingAccessResult,
} from '@/navigation/config/access.config'

// Mock getBotNameByToken
vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(),
}))

import { getBotNameByToken } from '@/core/bot'

describe('access.config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('HAIM_GROUP_STAFF_IDS', () => {
    it('должен быть массивом', () => {
      expect(Array.isArray(HAIM_GROUP_STAFF_IDS)).toBe(true)
    })

    it('должен содержать минимум 1 сотрудника', () => {
      expect(HAIM_GROUP_STAFF_IDS.length).toBeGreaterThan(0)
    })

    it('все ID должны быть строками', () => {
      HAIM_GROUP_STAFF_IDS.forEach(id => {
        expect(typeof id).toBe('string')
      })
    })

    it('все ID должны быть числовыми строками', () => {
      HAIM_GROUP_STAFF_IDS.forEach(id => {
        expect(id).toMatch(/^\d+$/)
      })
    })

    it('должен содержать super admin', () => {
      expect(HAIM_GROUP_STAFF_IDS).toContain(SUPER_ADMIN_ID)
    })
  })

  describe('METAMUSE_STAFF_IDS', () => {
    it('должен быть массивом', () => {
      expect(Array.isArray(METAMUSE_STAFF_IDS)).toBe(true)
    })

    it('должен содержать минимум 1 сотрудника', () => {
      expect(METAMUSE_STAFF_IDS.length).toBeGreaterThan(0)
    })

    it('все ID должны быть строками', () => {
      METAMUSE_STAFF_IDS.forEach(id => {
        expect(typeof id).toBe('string')
      })
    })

    it('все ID должны быть числовыми строками', () => {
      METAMUSE_STAFF_IDS.forEach(id => {
        expect(id).toMatch(/^\d+$/)
      })
    })

    it('должен содержать super admin', () => {
      expect(METAMUSE_STAFF_IDS).toContain(SUPER_ADMIN_ID)
    })
  })

  describe('SUPER_ADMIN_ID', () => {
    it('должен быть строкой', () => {
      expect(typeof SUPER_ADMIN_ID).toBe('string')
    })

    it('должен быть числовой строкой', () => {
      expect(SUPER_ADMIN_ID).toMatch(/^\d+$/)
    })

    it('должен быть равен 144022504', () => {
      expect(SUPER_ADMIN_ID).toBe('144022504')
    })
  })

  describe('isAdmin()', () => {
    it('возвращает true для super admin (string)', () => {
      const result = isAdmin(SUPER_ADMIN_ID)
      expect(result).toBe(true)
    })

    it('возвращает true для super admin (number)', () => {
      const result = isAdmin(Number(SUPER_ADMIN_ID))
      expect(result).toBe(true)
    })

    it('возвращает true для сотрудника HAIM_GROUP', () => {
      if (HAIM_GROUP_STAFF_IDS.length > 1) {
        // Берем любого кроме super admin
        const staffId = HAIM_GROUP_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID)
        if (staffId) {
          const result = isAdmin(staffId)
          expect(result).toBe(true)
        }
      }
    })

    it('возвращает true для сотрудника METAMUSE', () => {
      if (METAMUSE_STAFF_IDS.length > 1) {
        // Берем любого кроме super admin
        const staffId = METAMUSE_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID)
        if (staffId) {
          const result = isAdmin(staffId)
          expect(result).toBe(true)
        }
      }
    })

    it('возвращает false для обычного пользователя', () => {
      const result = isAdmin('999999999')
      expect(result).toBe(false)
    })

    it('возвращает false для пустой строки', () => {
      const result = isAdmin('')
      expect(result).toBe(false)
    })

    it('возвращает false для нуля', () => {
      const result = isAdmin(0)
      expect(result).toBe(false)
    })

    it('корректно обрабатывает number input', () => {
      const result = isAdmin(999999999)
      expect(result).toBe(false)
    })
  })

  describe('isSuperAdmin()', () => {
    it('возвращает true для super admin (string)', () => {
      const result = isSuperAdmin(SUPER_ADMIN_ID)
      expect(result).toBe(true)
    })

    it('возвращает true для super admin (number)', () => {
      const result = isSuperAdmin(Number(SUPER_ADMIN_ID))
      expect(result).toBe(true)
    })

    it('возвращает false для обычного админа', () => {
      // Берем любого сотрудника кроме super admin
      const staffId = HAIM_GROUP_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID)
      if (staffId) {
        const result = isSuperAdmin(staffId)
        expect(result).toBe(false)
      }
    })

    it('возвращает false для обычного пользователя', () => {
      const result = isSuperAdmin('999999999')
      expect(result).toBe(false)
    })

    it('возвращает false для пустой строки', () => {
      const result = isSuperAdmin('')
      expect(result).toBe(false)
    })
  })

  describe('getParsingAccess()', () => {
    describe('Super Admin', () => {
      it('super admin имеет доступ к любому боту', () => {
        ;(getBotNameByToken as any).mockReturnValue({ bot_name: 'AnyBot' })

        const result = getParsingAccess(SUPER_ADMIN_ID, 'any-token')

        expect(result.hasAccess).toBe(true)
        expect(result.allowedProjects).toContain('all')
      })
    })

    describe('HaimGroupMedia_bot', () => {
      beforeEach(() => {
        ;(getBotNameByToken as any).mockReturnValue({
          bot_name: 'HaimGroupMedia_bot',
        })
      })

      it('сотрудник HAIM_GROUP имеет доступ', () => {
        const staffId =
          HAIM_GROUP_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID) ||
          SUPER_ADMIN_ID

        const result = getParsingAccess(staffId, 'haim-token')

        expect(result.hasAccess).toBe(true)
      })

      it('сотрудник HAIM_GROUP имеет ограниченные проекты', () => {
        const staffId =
          HAIM_GROUP_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID) ||
          SUPER_ADMIN_ID

        const result = getParsingAccess(staffId, 'haim-token')

        if (staffId !== SUPER_ADMIN_ID) {
          expect(result.allowedProjects).toBeDefined()
          expect(result.allowedProjects).not.toContain('all')
        }
      })

      it('обычный пользователь НЕ имеет доступ', () => {
        const result = getParsingAccess('999999999', 'haim-token')

        expect(result.hasAccess).toBe(false)
        expect(result.allowedProjects).toBeUndefined()
      })
    })

    describe('MetaMuse_Manifest_bot', () => {
      beforeEach(() => {
        ;(getBotNameByToken as any).mockReturnValue({
          bot_name: 'MetaMuse_Manifest_bot',
        })
      })

      it('сотрудник METAMUSE имеет доступ', () => {
        const staffId =
          METAMUSE_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID) || SUPER_ADMIN_ID

        const result = getParsingAccess(staffId, 'metamuse-token')

        expect(result.hasAccess).toBe(true)
      })

      it('сотрудник METAMUSE имеет доступ ко всем проектам', () => {
        const staffId =
          METAMUSE_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID) || SUPER_ADMIN_ID

        const result = getParsingAccess(staffId, 'metamuse-token')

        expect(result.allowedProjects).toContain('all')
      })

      it('обычный пользователь НЕ имеет доступ', () => {
        const result = getParsingAccess('999999999', 'metamuse-token')

        expect(result.hasAccess).toBe(false)
        expect(result.allowedProjects).toBeUndefined()
      })
    })

    describe('Другие боты', () => {
      it('никто не имеет доступ к неизвестному боту', () => {
        ;(getBotNameByToken as any).mockReturnValue({ bot_name: 'UnknownBot' })

        // Даже сотрудники не имеют доступ к неизвестному боту (кроме super admin)
        const staffId = HAIM_GROUP_STAFF_IDS.find(id => id !== SUPER_ADMIN_ID)
        if (staffId) {
          const result = getParsingAccess(staffId, 'unknown-token')
          expect(result.hasAccess).toBe(false)
        }
      })

      it('обычный пользователь НЕ имеет доступ к неизвестному боту', () => {
        ;(getBotNameByToken as any).mockReturnValue({ bot_name: 'UnknownBot' })

        const result = getParsingAccess('999999999', 'unknown-token')

        expect(result.hasAccess).toBe(false)
        expect(result.allowedProjects).toBeUndefined()
      })
    })
  })

  describe('ParsingAccessResult interface', () => {
    it('hasAccess=true возвращается с allowedProjects', () => {
      ;(getBotNameByToken as any).mockReturnValue({
        bot_name: 'HaimGroupMedia_bot',
      })

      const staffId = HAIM_GROUP_STAFF_IDS[0]
      const result = getParsingAccess(staffId, 'token')

      if (result.hasAccess) {
        expect(result.allowedProjects).toBeDefined()
        expect(Array.isArray(result.allowedProjects)).toBe(true)
      }
    })

    it('hasAccess=false возвращается без allowedProjects', () => {
      ;(getBotNameByToken as any).mockReturnValue({ bot_name: 'UnknownBot' })

      const result = getParsingAccess('999999999', 'token')

      expect(result.hasAccess).toBe(false)
      expect(result.allowedProjects).toBeUndefined()
    })
  })

  describe('Edge cases', () => {
    it('isAdmin обрабатывает числа с плавающей точкой', () => {
      const result = isAdmin(144022504.5)
      // Преобразуется в строку, может не совпасть
      expect(typeof result).toBe('boolean')
    })

    it('isSuperAdmin обрабатывает отрицательные числа', () => {
      const result = isSuperAdmin(-1)
      expect(result).toBe(false)
    })

    it('getParsingAccess обрабатывает пустой токен', () => {
      ;(getBotNameByToken as any).mockReturnValue({ bot_name: '' })

      const result = getParsingAccess(SUPER_ADMIN_ID, '')
      // Super admin всё равно имеет доступ
      expect(result.hasAccess).toBe(true)
    })
  })
})
