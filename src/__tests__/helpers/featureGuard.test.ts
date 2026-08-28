/**
 * Tests for featureGuard.ts
 *
 * Feature Guard System - Centralized access check for paid features
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { ModeEnum } from '@/interfaces/modes'

// Mock all dependencies before importing the module
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn().mockReturnValue(true),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(),
}))

vi.mock('@/core/supabase/featureViews', () => ({
  hasUserSeenFeature: vi.fn(),
  markFeatureAsSeen: vi.fn(),
}))

vi.mock('@/helpers/featureInfo', () => ({
  FEATURE_INFO: {
    [ModeEnum.NeuroPhoto]: {
      name: { ru: 'Нейрофото', en: 'NeuroPhoto' },
      description: { ru: 'Описание', en: 'Description' },
      minCost: 6,
      maxCost: 6,
      isPaid: true,
    },
    [ModeEnum.TextToVideo]: {
      name: { ru: 'Видео из текста', en: 'Text to Video' },
      description: { ru: 'Описание', en: 'Description' },
      minCost: 38,
      maxCost: 390,
      isPaid: true,
    },
    free_feature: {
      name: { ru: 'Бесплатная', en: 'Free' },
      description: { ru: 'Бесплатно', en: 'Free' },
      minCost: 0,
      isPaid: false,
    },
  },
  formatFeatureHelp: vi.fn().mockReturnValue('<b>Help Message</b>'),
  getFeatureMinCost: vi.fn().mockImplementation((mode: string) => {
    if (mode === ModeEnum.NeuroPhoto) return 6
    if (mode === ModeEnum.TextToVideo) return 38
    return 0
  }),
  isFeaturePaid: vi.fn().mockImplementation((mode: string) => {
    if (mode === 'free_feature') return false
    return true
  }),
}))

import {
  checkFeatureAccess,
  checkBalanceOnly,
  showInsufficientBalanceMessage,
} from '@/helpers/featureGuard'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import {
  hasUserSeenFeature,
  markFeatureAsSeen,
} from '@/core/supabase/featureViews'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces/telegram-bot.interface'

const createMockContext = (overrides = {}): MyContext =>
  ({
    from: { id: 123456789, username: 'testuser' },
    chat: { id: 123456789 },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    session: { wizardData: {}, language: 'ru' },
    ...overrides,
  }) as unknown as MyContext

describe('checkFeatureAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('first-time help display', () => {
    it('should show help on first use', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(false)
      ;(getUserBalance as Mock).mockResolvedValue(100)
      ;(markFeatureAsSeen as Mock).mockResolvedValue(true)

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(true)
      expect(hasUserSeenFeature).toHaveBeenCalledWith(
        '123456789',
        ModeEnum.NeuroPhoto
      )
      expect(ctx.reply).toHaveBeenCalledWith('<b>Help Message</b>', {
        parse_mode: 'HTML',
      })
      expect(markFeatureAsSeen).toHaveBeenCalledWith(
        '123456789',
        ModeEnum.NeuroPhoto
      )
    })

    it('should NOT show help on repeat use', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(100)

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(true)
      expect(hasUserSeenFeature).toHaveBeenCalled()
      expect(markFeatureAsSeen).not.toHaveBeenCalled()
      // Should only be called for insufficient balance, not for help
      expect(ctx.reply).not.toHaveBeenCalled()
    })
  })

  describe('balance check', () => {
    it('should allow access if balance >= minCost', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(10) // >= 6 (minCost for NeuroPhoto)

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(true)
      expect(getUserBalance).toHaveBeenCalledWith('123456789')
    })

    it('should deny access if balance < minCost', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(3) // < 6 (minCost for NeuroPhoto)

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(false)
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.objectContaining({ parse_mode: 'HTML' })
      )
    })

    it('should show insufficient balance message with correct values', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(5)

      await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('5⭐'),
        expect.any(Object)
      )
    })

    it('should show top-up button on insufficient balance', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(1)

      await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  callback_data: 'go_to_balance_topup',
                }),
              ]),
            ]),
          }),
        })
      )
    })
  })

  describe('edge cases', () => {
    it('should return true for unknown features (no info)', async () => {
      const ctx = createMockContext()

      const result = await checkFeatureAccess(
        ctx,
        'unknown_feature' as ModeEnum
      )

      expect(result).toBe(true)
    })

    it('should return false if no telegram ID', async () => {
      const ctx = createMockContext({ from: undefined })

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(false)
    })

    it('should return FALSE on error (fail-closed): отказ по решению владельца продукта', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockRejectedValue(new Error('DB error'))

      const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(result).toBe(false)
    })

    it('should handle English language correctly', async () => {
      const ctx = createMockContext()
      ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
      ;(getUserBalance as Mock).mockResolvedValue(1)
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient funds'),
        expect.any(Object)
      )
    })
  })
})

describe('checkBalanceOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return allowed: true when balance is sufficient', async () => {
    const ctx = createMockContext()
    ;(getUserBalance as Mock).mockResolvedValue(100)

    const result = await checkBalanceOnly(ctx, ModeEnum.NeuroPhoto)

    expect(result.allowed).toBe(true)
    expect(result.balance).toBe(100)
    expect(result.requiredCost).toBe(6)
  })

  it('should return allowed: false when balance is insufficient', async () => {
    const ctx = createMockContext()
    ;(getUserBalance as Mock).mockResolvedValue(3)

    const result = await checkBalanceOnly(ctx, ModeEnum.NeuroPhoto)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('insufficient_balance')
    expect(result.balance).toBe(3)
    expect(result.requiredCost).toBe(6)
  })

  it('should return allowed: true for free features', async () => {
    const ctx = createMockContext()

    const result = await checkBalanceOnly(ctx, 'free_feature' as ModeEnum)

    expect(result.allowed).toBe(true)
    // getUserBalance should not be called for free features
  })

  it('should return error if no telegram ID', async () => {
    const ctx = createMockContext({ from: undefined })

    const result = await checkBalanceOnly(ctx, ModeEnum.NeuroPhoto)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('error')
  })

  it('should return allowed: true on exception (fail-open)', async () => {
    const ctx = createMockContext()
    ;(getUserBalance as Mock).mockRejectedValue(new Error('DB error'))

    const result = await checkBalanceOnly(ctx, ModeEnum.NeuroPhoto)

    expect(result.allowed).toBe(true)
  })
})

describe('showInsufficientBalanceMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show message in Russian', async () => {
    const ctx = createMockContext()
    ;(isRussianFromState as Mock).mockReturnValue(true)

    await showInsufficientBalanceMessage(ctx, 5, 10)

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Недостаточно средств'),
      expect.any(Object)
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('5⭐'),
      expect.any(Object)
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('10⭐'),
      expect.any(Object)
    )
  })

  it('should show message in English', async () => {
    const ctx = createMockContext()
    ;(isRussianFromState as Mock).mockReturnValue(false)

    await showInsufficientBalanceMessage(ctx, 5, 10)

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Insufficient funds'),
      expect.any(Object)
    )
  })

  it('should include top-up button', async () => {
    const ctx = createMockContext()
    ;(isRussianFromState as Mock).mockReturnValue(true)

    await showInsufficientBalanceMessage(ctx, 5, 10)

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ callback_data: 'go_to_balance_topup' }),
            ]),
          ]),
        }),
      })
    )
  })
})

describe('Integration scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('full flow: first-time user with sufficient balance', async () => {
    const ctx = createMockContext()
    ;(hasUserSeenFeature as Mock).mockResolvedValue(false)
    ;(getUserBalance as Mock).mockResolvedValue(50)
    ;(markFeatureAsSeen as Mock).mockResolvedValue(true)

    const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

    expect(result).toBe(true)
    // Should show help
    expect(ctx.reply).toHaveBeenCalledWith('<b>Help Message</b>', {
      parse_mode: 'HTML',
    })
    // Should mark as seen
    expect(markFeatureAsSeen).toHaveBeenCalled()
    // Should check balance
    expect(getUserBalance).toHaveBeenCalled()
  })

  it('full flow: first-time user with insufficient balance', async () => {
    const ctx = createMockContext()
    ;(hasUserSeenFeature as Mock).mockResolvedValue(false)
    ;(getUserBalance as Mock).mockResolvedValue(2)
    ;(markFeatureAsSeen as Mock).mockResolvedValue(true)

    const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

    expect(result).toBe(false)
    // Should show help first
    expect(ctx.reply).toHaveBeenNthCalledWith(1, '<b>Help Message</b>', {
      parse_mode: 'HTML',
    })
    // Should then show insufficient balance
    expect(ctx.reply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Недостаточно'),
      expect.any(Object)
    )
  })

  it('full flow: returning user with sufficient balance', async () => {
    const ctx = createMockContext()
    ;(hasUserSeenFeature as Mock).mockResolvedValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(50)

    const result = await checkFeatureAccess(ctx, ModeEnum.NeuroPhoto)

    expect(result).toBe(true)
    // Should NOT show help (user has seen it before)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(markFeatureAsSeen).not.toHaveBeenCalled()
  })

  // ГРАНИЦА ОТКАЗА ПРИ СБОЕ.
  //
  // checkFeatureAccess теперь возвращает false, если проверка баланса упала
  // (решение владельца продукта). Важно, что это касается ТОЛЬКО платных
  // описанных режимов: ветки `!info` и `!info.isPaid` возвращают true ДО
  // блока try, поэтому бесплатные и неописанные сценарии сбой не блокирует.
  //
  // Из 82 режимов ModeEnum в FEATURE_INFO описаны 13, и все платные. Если бы
  // отказ задевал остальные 69, авария в базе закрывала бы людям вход в
  // меню баланса и смену языка.
  describe('отказ при сбое: границы', () => {
    beforeEach(() => {
      vi.mocked(getUserBalance).mockRejectedValue(new Error('база недоступна'))
    })

    it('платный описанный режим — ОТКАЗ', async () => {
      const ctx = createMockContext()
      const result = await checkFeatureAccess(ctx as any, ModeEnum.NeuroPhoto)
      expect(result).toBe(false)
    })

    it('НЕописанный режим — доступ, сбой его не касается', async () => {
      const ctx = createMockContext()
      // ModeEnum.Balance в мок FEATURE_INFO не входит: ветка `!info` сработает
      // раньше try, и падение getUserBalance до неё просто не дойдёт.
      const result = await checkFeatureAccess(ctx as any, ModeEnum.Balance)
      expect(result).toBe(true)
    })
  })
})
