/**
 * 🧪 Simple Lip-sync Main Menu Button Test
 * Проверяет, что кнопка "✨ Простой Lip-sync" добавлена в главное меню
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ModeEnum } from '../src/interfaces/modes'
import { levels } from '../src/menu/mainMenu'
import handleMenu from '../src/handlers/handleMenu'
import { MyContext } from '../src/interfaces/telegram-bot.interface'

// Мок для ctx
const createMockContext = (text: string): MyContext => {
  const mockScene = {
    enter: vi.fn(),
    current: { id: 'test' },
    session: { sceneStack: [] }
  }

  return {
    message: {
      text,
      message_id: 123,
      date: 1234567890,
      chat: { id: 123456789, type: 'private' }
    },
    from: {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
      language_code: 'ru'
    },
    chat: { id: 123456789, type: 'private' },
    session: {
      mode: undefined,
      userLanguage: 'ru'
    },
    scene: mockScene,
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    editMessageText: vi.fn()
  } as unknown as MyContext
}

describe('✨ Simple Lip-sync Main Menu Button Test', () => {
  describe('📋 Button Configuration', () => {
    it('should have level 112 defined as Simple Lip-sync', () => {
      const simpleLipSyncLevel = levels[112]

      expect(simpleLipSyncLevel).toBeDefined()
      expect(simpleLipSyncLevel.title_ru).toBe('✨ Простой Lip-sync')
      expect(simpleLipSyncLevel.title_en).toBe('✨ Simple Lip-sync')
      expect(simpleLipSyncLevel.admin_only).toBeUndefined()

      console.log('✅ Simple Lip-sync button is configured correctly')
      console.log('   - RU:', simpleLipSyncLevel.title_ru)
      console.log('   - EN:', simpleLipSyncLevel.title_en)
    })

    it('should have SimpleLipSync in ModeEnum', () => {
      expect(ModeEnum.SimpleLipSync).toBe('simple_lipsync')

      console.log('✅ SimpleLipSync mode is defined:', ModeEnum.SimpleLipSync)
    })
  })

  describe('🎯 Button Handler', () => {
    it('should handle Russian Simple Lip-sync button', async () => {
      const ctx = createMockContext('✨ Простой Lip-sync')

      await handleMenu(ctx)

      // Проверяем, что scene.enter был вызван с правильными параметрами
      expect(ctx.scene.enter).toHaveBeenCalledWith('simple_lipsync')

      // Проверяем, что mode установлен правильно
      expect(ctx.session.mode).toBe(ModeEnum.SimpleLipSync)

      console.log('✅ Russian Simple Lip-sync button works correctly')
      console.log('   - Scene entered:', ctx.scene.enter.mock.calls[0][0])
      console.log('   - Mode set:', ctx.session.mode)
    })

    it('should handle English Simple Lip-sync button', async () => {
      const ctx = createMockContext('✨ Simple Lip-sync')

      await handleMenu(ctx)

      // Проверяем, что scene.enter был вызван с правильными параметрами
      expect(ctx.scene.enter).toHaveBeenCalledWith('simple_lipsync')

      // Проверяем, что mode установлен правильно
      expect(ctx.session.mode).toBe(ModeEnum.SimpleLipSync)

      console.log('✅ English Simple Lip-sync button works correctly')
      console.log('   - Scene entered:', ctx.scene.enter.mock.calls[0][0])
      console.log('   - Mode set:', ctx.session.mode)
    })

    it('should handle partial text match "Простой"', async () => {
      const ctx = createMockContext('Простой')

      await handleMenu(ctx)

      // Проверяем, что scene.enter был вызван с правильными параметрами
      expect(ctx.scene.enter).toHaveBeenCalledWith('simple_lipsync')

      console.log('✅ Partial text match "Простой" works correctly')
    })

    it('should handle partial text match "Simple"', async () => {
      const ctx = createMockContext('Simple')

      await handleMenu(ctx)

      // Проверяем, что scene.enter был вызван с правильными параметрами
      expect(ctx.scene.enter).toHaveBeenCalledWith('simple_lipsync')

      console.log('✅ Partial text match "Simple" works correctly')
    })
  })

  describe('🎬 Menu Integration', () => {
    it('should be accessible from main menu for all users', () => {
      const simpleLipSyncLevel = levels[112]

      // Кнопка должна быть доступна всем (не только админам)
      expect(simpleLipSyncLevel.admin_only).toBeUndefined()

      console.log('✅ Simple Lip-sync button is accessible to all users')
    })

    it('should have proper icon and description', () => {
      const simpleLipSyncLevel = levels[112]

      // Проверяем, что иконка есть и понятная
      expect(simpleLipSyncLevel.title_ru).toMatch(/✨/)
      expect(simpleLipSyncLevel.title_en).toMatch(/✨/)

      console.log('✅ Simple Lip-sync button has proper icon')
      console.log('   - Icon: ✨')
      console.log('   - RU name:', simpleLipSyncLevel.title_ru)
      console.log('   - EN name:', simpleLipSyncLevel.title_en)
    })
  })

  describe('🔄 Navigation Flow', () => {
    it('should navigate directly to simple_lipsync wizard', async () => {
      const ctx = createMockContext('✨ Простой Lip-sync')

      await handleMenu(ctx)

      // Проверяем, что пользователь попадает прямо в simple_lipsync
      // (а не в ai_reels_entry с выбором шаблонов)
      expect(ctx.scene.enter).toHaveBeenCalledWith('simple_lipsync')
      expect(ctx.scene.enter).not.toHaveBeenCalledWith('ai_reels_entry')

      console.log('✅ Navigation goes directly to simple_lipsync wizard')
      console.log('   - Target scene: simple_lipsync')
      console.log('   - Bypasses: ai_reels_entry (template selection)')
    })

    it('should set correct mode for tracking', async () => {
      const ctx = createMockContext('✨ Простой Lip-sync')

      await handleMenu(ctx)

      // Проверяем, что mode установлен для аналитики/трекинга
      expect(ctx.session.mode).toBe(ModeEnum.SimpleLipSync)

      console.log('✅ Mode is set for tracking and analytics')
      console.log('   - Mode:', ctx.session.mode)
    })
  })

  describe('📊 Comparison with AI Reels Button', () => {
    it('should have separate button from AI Reels (110)', () => {
      const simpleLipSyncLevel = levels[112]
      const aiReelsLevel = levels[110]

      expect(simpleLipSyncLevel).toBeDefined()
      expect(aiReelsLevel).toBeDefined()

      // Проверяем, что это разные кнопки
      expect(simpleLipSyncLevel).not.toBe(aiReelsLevel)
      expect(simpleLipSyncLevel.title_ru).not.toBe(aiReelsLevel.title_ru)
      expect(simpleLipSyncLevel.title_en).not.toBe(aiReelsLevel.title_en)

      console.log('✅ Simple Lip-sync has separate button from AI Reels')
      console.log('   - Simple Lip-sync (112):', simpleLipSyncLevel.title_ru)
      console.log('   - AI Reels (110):', aiReelsLevel.title_ru)
    })

    it('should have different access permissions than AI Reels', () => {
      const simpleLipSyncLevel = levels[112]
      const aiReelsLevel = levels[110]

      // Simple Lip-sync должен быть доступен всем
      expect(simpleLipSyncLevel.admin_only).toBeUndefined()

      // AI Reels остается только для админов
      expect(aiReelsLevel.admin_only).toBe(true)

      console.log('✅ Access permissions differ correctly')
      console.log('   - Simple Lip-sync: accessible to all')
      console.log('   - AI Reels: admin only')
    })
  })
})

/**
 * 📋 SUMMARY
 * Этот тест проверяет:
 *
 * 1. ✅ Кнопка Simple Lip-sync добавлена в главное меню (уровень 112)
 * 2. ✅ Конфигурация кнопки корректна (иконка, названия)
 * 3. ✅ Обработчик кнопки работает для русского и английского
 * 4. ✅ Навигация идет прямо в simple_lipsync wizard
 * 5. ✅ Кнопка доступна всем пользователям (не только админам)
 * 6. ✅ Mode устанавливается для трекинга
 * 7. ✅ Отдельная кнопка от AI Reels (уровень 110)
 *
 * 🎯 Результат: Кнопка "✨ Простой Lip-sync" готова к использованию!
 */
