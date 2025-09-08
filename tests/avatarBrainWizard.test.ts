import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test'
import { avatarBrainWizard } from '../src/scenes/avatarBrainWizard'
import type { MyContext } from '../src/interfaces'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { ModeEnum } from '../src/interfaces/modes'

// Mock dependencies
mock.module('../src/core/supabase', () => ({
  updateUserSoul: mock(),
  getUserByTelegramId: mock(),
  updateUserLevelPlusOne: mock(),
}))

mock.module('../src/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: mock(),
}))

mock.module('../src/menu/mainMenu', () => ({
  mainMenu: mock(),
}))

mock.module('../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: mock(),
}))

mock.module('../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: mock(),
}))

mock.module('../src/utils/logger', () => ({
  logger: {
    info: mock(),
    error: mock(),
  },
}))

describe('AvatarBrainWizard', () => {
  const mockCtx = {
    reply: mock(),
    from: { id: 12345, language_code: 'en' },
    wizard: {
      next: mock(),
      state: {},
    },
    scene: {
      leave: mock(),
    },
    message: null,
  } as unknown as MyContext

  beforeEach(() => {
    // Reset wizard state
    mockCtx.wizard.state = {}
  })

  describe('Import Validation', () => {
    it('should have valid imports', async () => {
      const { updateUserSoul } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')

      expect(updateUserSoul).toBeDefined()
      expect(getUserDetailsSubscription).toBeDefined()
      expect(mainMenu).toBeDefined()
      expect(handleHelpCancel).toBeDefined()
      expect(isRussianFromState).toBeDefined()
    })
  })

  describe('Initial Step', () => {
    it('should display correct greeting in Russian', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      vi.mocked(isRussianFromState).mockReturnValue(true)

      const step1 = avatarBrainWizard.steps[0]
      await step1(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '👋 Привет, как называется ваша компания?',
        expect.any(Object)
      )
      expect(mockCtx.wizard.next).toHaveBeenCalled()
    })

    it('should display correct greeting in English', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      vi.mocked(isRussianFromState).mockReturnValue(false)

      const step1 = avatarBrainWizard.steps[0]
      await step1(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '👋 Hello, what is your company name?',
        expect.any(Object)
      )
      expect(mockCtx.wizard.next).toHaveBeenCalled()
    })
  })

  describe('Company Input Step', () => {
    it('should store company name and proceed to position', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      
      vi.mocked(isRussianFromState).mockReturnValue(true)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)

      mockCtx.message = { text: 'Tech Corp' } as any

      const step2 = avatarBrainWizard.steps[1]
      await step2(mockCtx)

      expect(mockCtx.wizard.state).toHaveProperty('company', 'Tech Corp')
      expect(mockCtx.reply).toHaveBeenCalledWith(
        '💼 Какая у вас должность?',
        expect.any(Object)
      )
      expect(mockCtx.wizard.next).toHaveBeenCalled()
    })

    it('should handle help/cancel action', async () => {
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      
      vi.mocked(handleHelpCancel).mockResolvedValue(true)
      mockCtx.message = { text: 'cancel' } as any

      const step2 = avatarBrainWizard.steps[1]
      await step2(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })
  })

  describe('Position Input Step', () => {
    it('should store position and proceed to skills', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      
      vi.mocked(isRussianFromState).mockReturnValue(false)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)

      mockCtx.message = { text: 'Software Engineer' } as any

      const step3 = avatarBrainWizard.steps[2]
      await step3(mockCtx)

      expect(mockCtx.wizard.state).toHaveProperty('position', 'Software Engineer')
      expect(mockCtx.reply).toHaveBeenCalledWith(
        '🛠️ What are your skills?',
        expect.any(Object)
      )
      expect(mockCtx.wizard.next).toHaveBeenCalled()
    })
  })

  describe('Final Skills Step - Success Flow', () => {
    beforeEach(() => {
      mockCtx.wizard.state = {
        company: 'Tech Corp',
        position: 'Software Engineer'
      }
      mockCtx.message = { text: 'JavaScript, TypeScript, Node.js' } as any
    })

    it('should show comprehensive success message in Russian and display main menu', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul, getUserByTelegramId, updateUserLevelPlusOne } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(true)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserByTelegramId).mockResolvedValue({ level: 3 })
      vi.mocked(updateUserLevelPlusOne).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 100,
        subscriptionType: SubscriptionType.NEUROVIDEO,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2024-01-01'
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Check success message
      const successCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🎉') && call[0].includes('Великолепно!')
      )
      expect(successCall).toBeDefined()
      expect(successCall![0]).toContain('🧠✨')
      expect(successCall![0]).toContain('📊 <b>Сохраненная информация:</b>')
      expect(successCall![0]).toContain('🏢 <b>Компания:</b> Tech Corp')
      expect(successCall![0]).toContain('💼 <b>Должность:</b> Software Engineer')
      expect(successCall![0]).toContain('🛠️ <b>Навыки:</b> JavaScript, TypeScript, Node.js')
      expect(successCall![0]).toContain('💡 <b>Как это используется:</b>')
      expect(successCall![0]).toContain('🚀 <b>Что дальше?</b>')
      expect(successCall![0]).toContain('"💭 Чат с аватаром"')
      expect(successCall![0]).toContain('✅ <b>Готово!</b>')

      // Check main menu display
      const menuCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🏠 Главное меню:')
      )
      expect(menuCall).toBeDefined()

      // Check functions were called
      expect(updateUserSoul).toHaveBeenCalledWith('12345', 'Tech Corp', 'Software Engineer', 'JavaScript, TypeScript, Node.js')
      expect(getUserDetailsSubscription).toHaveBeenCalledWith('12345')
      expect(mainMenu).toHaveBeenCalledWith({
        isRu: true,
        subscription: SubscriptionType.NEUROVIDEO,
        ctx: mockCtx
      })
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should show comprehensive success message in English and display main menu', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul, getUserByTelegramId, updateUserLevelPlusOne } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(false)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserByTelegramId).mockResolvedValue({ level: 3 })
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 50,
        subscriptionType: SubscriptionType.NEUROPHOTO,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2024-01-01'
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Check English success message
      const successCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🎉') && call[0].includes('Excellent!')
      )
      expect(successCall).toBeDefined()
      expect(successCall![0]).toContain('Avatar brain successfully configured!')
      expect(successCall![0]).toContain('📊 <b>Saved information:</b>')
      expect(successCall![0]).toContain('🏢 <b>Company:</b> Tech Corp')
      expect(successCall![0]).toContain('💼 <b>Position:</b> Software Engineer')
      expect(successCall![0]).toContain('🛠️ <b>Skills:</b> JavaScript, TypeScript, Node.js')
      expect(successCall![0]).toContain('💡 <b>How this is used:</b>')
      expect(successCall![0]).toContain('🚀 <b>What\'s next?</b>')
      expect(successCall![0]).toContain('"💭 Chat with avatar"')
      expect(successCall![0]).toContain('✅ <b>Done!</b>')

      // Check English main menu display
      const menuCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🏠 Main menu:')
      )
      expect(menuCall).toBeDefined()
    })

    it('should handle level progression for level 3 users', async () => {
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul, getUserByTelegramId, updateUserLevelPlusOne } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')

      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserByTelegramId).mockResolvedValue({ level: 3 })
      vi.mocked(updateUserLevelPlusOne).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 25,
        subscriptionType: SubscriptionType.STARS,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      expect(updateUserLevelPlusOne).toHaveBeenCalledWith('12345', 3)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockCtx.wizard.state = {
        company: 'Tech Corp',
        position: 'Software Engineer'
      }
      mockCtx.message = { text: 'JavaScript, Node.js' } as any
    })

    it('should handle updateUserSoul error and show main menu', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(true)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockRejectedValue(new Error('Database error'))
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 0,
        subscriptionType: SubscriptionType.STARS,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Check error message
      const errorCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('❌') && call[0].includes('Произошла ошибка')
      )
      expect(errorCall).toBeDefined()

      // Check main menu is still shown
      const menuCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🏠 Возвращаемся в главное меню:')
      )
      expect(menuCall).toBeDefined()

      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle updateUserSoul error in English', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')

      vi.mocked(isRussianFromState).mockReturnValue(false)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockRejectedValue(new Error('Database error'))
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 0,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      const errorCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('❌') && call[0].includes('An error occurred')
      )
      expect(errorCall).toBeDefined()
    })

    it('should handle missing user context', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')

      vi.mocked(isRussianFromState).mockReturnValue(true)
      
      const contextWithoutFrom = { ...mockCtx, from: null }

      const step4 = avatarBrainWizard.steps[3]
      await step4(contextWithoutFrom as any)

      const errorCall = vi.mocked(contextWithoutFrom.reply).mock.calls.find(call => 
        call[0].includes('❌') && call[0].includes('Не удалось определить пользователя')
      )
      expect(errorCall).toBeDefined()
      expect(contextWithoutFrom.scene.leave).toHaveBeenCalled()
    })

    it('should handle user not found error', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul, getUserByTelegramId } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(false)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserByTelegramId).mockResolvedValue(null)
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 0,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: false,
        subscriptionStartDate: null
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      const errorCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('❌') && call[0].includes('Could not find your data')
      )
      expect(errorCall).toBeDefined()

      const menuCall = vi.mocked(mockCtx.reply).mock.calls.find(call => 
        call[0].includes('🏠 Main menu:')
      )
      expect(menuCall).toBeDefined()
    })

    it('should handle menu display error gracefully', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(true)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockRejectedValue(new Error('Database error'))
      vi.mocked(getUserDetailsSubscription).mockRejectedValue(new Error('Subscription error'))
      vi.mocked(mainMenu).mockRejectedValue(new Error('Menu error'))

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Should still leave the scene
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })
  })

  describe('Type Validation', () => {
    it('should have correct wizard scene configuration', () => {
      expect(avatarBrainWizard.id).toBe(ModeEnum.Avatar)
      expect(avatarBrainWizard.steps).toHaveLength(4)
      expect(typeof avatarBrainWizard.steps[0]).toBe('function')
      expect(typeof avatarBrainWizard.steps[1]).toBe('function')
      expect(typeof avatarBrainWizard.steps[2]).toBe('function')
      expect(typeof avatarBrainWizard.steps[3]).toBe('function')
    })

    it('should properly handle wizard session data interface', () => {
      const wizardState = mockCtx.wizard.state as any
      wizardState.company = 'Test Company'
      wizardState.position = 'Test Position'

      expect(wizardState.company).toBe('Test Company')
      expect(wizardState.position).toBe('Test Position')
    })
  })

  describe('User Flow Validation', () => {
    it('should complete full success flow: Data save → Success notification → Main menu → Scene leave', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul, getUserByTelegramId } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(true)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockResolvedValue({ data: {}, error: null })
      vi.mocked(getUserByTelegramId).mockResolvedValue({ level: 4 })
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 75,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2024-01-01'
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      mockCtx.wizard.state = { company: 'Test Corp', position: 'Developer' }
      mockCtx.message = { text: 'React, Vue' } as any

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Verify the complete flow execution order
      expect(updateUserSoul).toHaveBeenCalledBefore(vi.mocked(mockCtx.reply))
      expect(getUserDetailsSubscription).toHaveBeenCalled()
      expect(mainMenu).toHaveBeenCalled()
      expect(mockCtx.scene.leave).toHaveBeenCalled()

      // Verify success message was sent
      expect(vi.mocked(mockCtx.reply).mock.calls.some(call => 
        call[0].includes('🎉') && call[0].includes('Великолепно!')
      )).toBe(true)

      // Verify main menu was displayed
      expect(vi.mocked(mockCtx.reply).mock.calls.some(call => 
        call[0].includes('🏠 Главное меню:')
      )).toBe(true)
    })

    it('should complete error flow: Error → Error message → Main menu → Scene leave', async () => {
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { updateUserSoul } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')

      vi.mocked(isRussianFromState).mockReturnValue(false)
      vi.mocked(handleHelpCancel).mockResolvedValue(false)
      vi.mocked(updateUserSoul).mockRejectedValue(new Error('Save failed'))
      vi.mocked(getUserDetailsSubscription).mockResolvedValue({
        id: 1,
        created_at: '2024-01-01',
        stars: 0,
        subscriptionType: SubscriptionType.STARS,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })
      vi.mocked(mainMenu).mockResolvedValue({ reply_markup: { keyboard: [] } } as any)

      mockCtx.wizard.state = { company: 'Failed Corp', position: 'Manager' }
      mockCtx.message = { text: 'Management' } as any

      const step4 = avatarBrainWizard.steps[3]
      await step4(mockCtx)

      // Verify error message was sent
      expect(vi.mocked(mockCtx.reply).mock.calls.some(call => 
        call[0].includes('❌') && call[0].includes('An error occurred')
      )).toBe(true)

      // Verify main menu was still displayed
      expect(vi.mocked(mockCtx.reply).mock.calls.some(call => 
        call[0].includes('🏠 Returning to main menu:')
      )).toBe(true)

      // Verify scene was left
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })
  })
})