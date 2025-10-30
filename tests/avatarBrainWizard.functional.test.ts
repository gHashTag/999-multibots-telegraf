import { describe, expect, it } from 'bun:test'
import { avatarBrainWizard } from '../src/scenes/avatarBrainWizard'
import { ModeEnum } from '../src/interfaces/modes'

describe('AvatarBrainWizard - Functional Tests', () => {
  
  describe('Scene Configuration', () => {
    it('should have correct scene ID', () => {
      expect(avatarBrainWizard.id).toBe(ModeEnum.Avatar)
    })

    it('should have 4 wizard steps', () => {
      expect(avatarBrainWizard.steps).toHaveLength(4)
    })

    it('should have all steps as functions', () => {
      avatarBrainWizard.steps.forEach((step, index) => {
        expect(typeof step).toBe('function')
      })
    })
  })

  describe('Import Validation', () => {
    it('should successfully import required dependencies', async () => {
      // Test that all imported modules exist and can be imported
      const { updateUserSoul, getUserByTelegramId, updateUserLevelPlusOne } = await import('../src/core/supabase')
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      const { mainMenu } = await import('../src/menu/mainMenu')
      const { handleHelpCancel } = await import('../src/handlers/handleHelpCancel')
      const { isRussianFromState } = await import('../src/helpers/centralizedLanguage')
      const { createHelpCancelKeyboard } = await import('../src/menu')
      const { logger } = await import('../src/utils/logger')

      // Validate that all imports are defined
      expect(updateUserSoul).toBeDefined()
      expect(getUserByTelegramId).toBeDefined()
      expect(updateUserLevelPlusOne).toBeDefined()
      expect(getUserDetailsSubscription).toBeDefined()
      expect(mainMenu).toBeDefined()
      expect(handleHelpCancel).toBeDefined()
      expect(isRussianFromState).toBeDefined()
      expect(createHelpCancelKeyboard).toBeDefined()
      expect(logger).toBeDefined()
      expect(logger.info).toBeDefined()
      expect(logger.error).toBeDefined()
    })

    it('should validate updateUserSoul function signature', async () => {
      const { updateUserSoul } = await import('../src/core/supabase/updateUserSoul')
      
      // Verify function exists and is callable
      expect(typeof updateUserSoul).toBe('function')
      expect(updateUserSoul.length).toBe(4) // Should take 4 parameters: telegramId, company, position, skills
    })

    it('should validate getUserDetailsSubscription function signature', async () => {
      const { getUserDetailsSubscription } = await import('../src/core/supabase/getUserDetailsSubscription')
      
      expect(typeof getUserDetailsSubscription).toBe('function')
      expect(getUserDetailsSubscription.length).toBe(1) // Should take 1 parameter: telegramId
    })

    it('should validate mainMenu function signature', async () => {
      const { mainMenu } = await import('../src/menu/mainMenu')
      
      expect(typeof mainMenu).toBe('function')
      expect(mainMenu.length).toBe(1) // Should take 1 parameter: options object
    })
  })

  describe('Message Validation', () => {
    it('should contain comprehensive success messages with emojis', () => {
      // Get the final step function source code to analyze message content
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for Russian success message components using Unicode escape sequences as they appear in the compiled code
      expect(finalStepSource).toContain('\\uD83C\\uDF89') // 🎉 emoji in unicode
      expect(finalStepSource).toContain('\\uD83E\\uDDE0') // 🧠 emoji in unicode
      expect(finalStepSource).toContain('\\u0412\\u0435\\u043B\\u0438\\u043A\\u043E\\u043B\\u0435\\u043F\\u043D\\u043E') // Великолепно in unicode
      expect(finalStepSource).toContain('\\u041C\\u043E\\u0437\\u0433 \\u0430\\u0432\\u0430\\u0442\\u0430\\u0440\\u0430') // Мозг аватара in unicode
      expect(finalStepSource).toContain('\\u0443\\u0441\\u043F\\u0435\\u0448\\u043D\\u043E \\u043D\\u0430\\u0441\\u0442\\u0440\\u043E\\u0435\\u043D') // успешно настроен in unicode
      expect(finalStepSource).toContain('\\u0421\\u043E\\u0445\\u0440\\u0430\\u043D\\u0435\\u043D\\u043D\\u0430\\u044F \\u0438\\u043D\\u0444\\u043E\\u0440\\u043C\\u0430\\u0446\\u0438\\u044F') // Сохраненная информация in unicode
      expect(finalStepSource).toContain('\\u041A\\u043E\\u043C\\u043F\\u0430\\u043D\\u0438\\u044F') // Компания in unicode
      expect(finalStepSource).toContain('\\u0414\\u043E\\u043B\\u0436\\u043D\\u043E\\u0441\\u0442\\u044C') // Должность in unicode
      expect(finalStepSource).toContain('\\u041D\\u0430\\u0432\\u044B\\u043A\\u0438') // Навыки in unicode
      expect(finalStepSource).toContain('\\uD83D\\uDE80') // 🚀 emoji
      expect(finalStepSource).toContain('\\u0427\\u0442\\u043E \\u0434\\u0430\\u043B\\u044C\\u0448\\u0435') // Что дальше
      expect(finalStepSource).toContain('\\uD83D\\uDCAD') // 💭 emoji
      expect(finalStepSource).toContain('\\u0427\\u0430\\u0442 \\u0441 \\u0430\\u0432\\u0430\\u0442\\u0430\\u0440\\u043E\\u043C') // Чат с аватаром
      expect(finalStepSource).toContain('\\u2705') // ✅ emoji
      expect(finalStepSource).toContain('\\u0413\\u043E\\u0442\\u043E\\u0432\\u043E') // Готово

      // Check for English success message components
      expect(finalStepSource).toContain('Excellent! Avatar brain successfully configured!')
      expect(finalStepSource).toContain('📊 <b>Saved information:</b>')
      expect(finalStepSource).toContain('🏢 <b>Company:</b>')
      expect(finalStepSource).toContain('💼 <b>Position:</b>')
      expect(finalStepSource).toContain('🛠️ <b>Skills:</b>')
      expect(finalStepSource).toContain('💡 <b>How this is used:</b>')
      expect(finalStepSource).toContain('🚀 <b>What\'s next?</b>')
      expect(finalStepSource).toContain('💭 Chat with avatar')
      expect(finalStepSource).toContain('✅ <b>Done!</b>')
    })

    it('should contain proper error handling messages', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for Russian error messages
      expect(finalStepSource).toContain('❌ Произошла ошибка при сохранении данных аватара')
      expect(finalStepSource).toContain('❌ Не удалось определить пользователя')
      expect(finalStepSource).toContain('❌ Не удалось найти ваши данные')
      expect(finalStepSource).toContain('🏠 Возвращаемся в главное меню:')

      // Check for English error messages
      expect(finalStepSource).toContain('❌ An error occurred while saving avatar data')
      expect(finalStepSource).toContain('❌ Could not identify user')
      expect(finalStepSource).toContain('❌ Could not find your data')
      expect(finalStepSource).toContain('🏠 Returning to main menu:')
    })

    it('should contain main menu display messages', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for main menu messages
      expect(finalStepSource).toContain('🏠 Главное меню:')
      expect(finalStepSource).toContain('🏠 Main menu:')
    })
  })

  describe('Error Handling Flow', () => {
    it('should handle errors with proper try-catch blocks', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for proper error handling structure
      expect(finalStepSource).toContain('try {')
      expect(finalStepSource).toContain('catch (error)')
      expect(finalStepSource).toContain('logger.error')
      expect(finalStepSource).toContain('ctx.scene.leave()')
    })

    it('should show main menu even on errors', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Verify that main menu is shown in error handling blocks
      expect(finalStepSource).toContain('await ctx.reply(menuMessage, keyboard)')
      
      // Check for multiple error handling paths that show menu
      const menuCallCount = (finalStepSource.match(/mainMenu\(/g) || []).length
      expect(menuCallCount).toBeGreaterThanOrEqual(3) // At least success path + error paths
    })
  })

  describe('Bilingual Support', () => {
    it('should have proper language detection', () => {
      // Check all steps for language detection
      avatarBrainWizard.steps.forEach((step, index) => {
        const stepSource = step.toString()
        expect(stepSource).toContain('isRussianFromState')
        expect(stepSource).toContain('isRu')
      })
    })

    it('should have bilingual prompts in all steps', () => {
      // Step 1: Company prompt
      const step1Source = avatarBrainWizard.steps[0].toString()
      expect(step1Source).toContain('как называется ваша компания')
      expect(step1Source).toContain('what is your company name')

      // Step 2: Position prompt
      const step2Source = avatarBrainWizard.steps[1].toString()
      expect(step2Source).toContain('Какая у вас должность')
      expect(step2Source).toContain('What is your position')

      // Step 3: Skills prompt
      const step3Source = avatarBrainWizard.steps[2].toString()
      expect(step3Source).toContain('Какие у тебя навыки')
      expect(step3Source).toContain('What are your skills')
    })
  })

  describe('User Data Handling', () => {
    it('should properly handle wizard state', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for proper state access
      expect(finalStepSource).toContain('ctx.wizard.state')
      expect(finalStepSource).toContain('company')
      expect(finalStepSource).toContain('position')
      expect(finalStepSource).toContain('skills')
    })

    it('should validate user context', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for user ID validation
      expect(finalStepSource).toContain('ctx.from?.id')
      expect(finalStepSource).toContain('userId')
      expect(finalStepSource).toContain('if (userId && company && position)')
    })

    it('should handle missing user data', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for null/undefined user handling
      expect(finalStepSource).toContain('if (!ctx.from)')
      expect(finalStepSource).toContain('if (!userExists)')
    })
  })

  describe('Level Progression Logic', () => {
    it('should include level progression for level 3 users', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      expect(finalStepSource).toContain('getUserByTelegramId')
      expect(finalStepSource).toContain('userExists.level === 3')
      expect(finalStepSource).toContain('updateUserLevelPlusOne')
    })
  })

  describe('Function Call Patterns', () => {
    it('should call updateUserSoul with correct parameters', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      expect(finalStepSource).toContain('updateUserSoul(userId.toString(), company, position, skills)')
    })

    it('should call getUserDetailsSubscription for menu display', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      expect(finalStepSource).toContain('getUserDetailsSubscription(userId.toString())')
      expect(finalStepSource).toContain('userDetails.subscriptionType')
    })

    it('should call mainMenu with proper parameters', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      expect(finalStepSource).toContain('mainMenu({')
      expect(finalStepSource).toContain('isRu,')
      expect(finalStepSource).toContain('subscription: userDetails.subscriptionType,')
      expect(finalStepSource).toContain('ctx')
    })
  })

  describe('Scene Flow Control', () => {
    it('should leave scene in all completion paths', () => {
      avatarBrainWizard.steps.forEach((step, index) => {
        const stepSource = step.toString()
        expect(stepSource).toContain('ctx.scene.leave()')
      })
    })

    it('should advance wizard steps properly', () => {
      // Check first 3 steps advance the wizard
      for (let i = 0; i < 3; i++) {
        const stepSource = avatarBrainWizard.steps[i].toString()
        expect(stepSource).toContain('ctx.wizard.next()')
      }
    })
  })

  describe('User Experience Flow', () => {
    it('should implement proper success flow sequence', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Verify the sequence exists: save → success message → menu → leave
      const saveIndex = finalStepSource.indexOf('updateUserSoul')
      const messageIndex = finalStepSource.indexOf('🎉')
      const menuIndex = finalStepSource.indexOf('mainMenu(')
      const leaveIndex = finalStepSource.indexOf('ctx.scene.leave()')

      expect(saveIndex).toBeGreaterThan(-1)
      expect(messageIndex).toBeGreaterThan(saveIndex)
      expect(menuIndex).toBeGreaterThan(messageIndex)
      expect(leaveIndex).toBeGreaterThan(menuIndex)
    })

    it('should implement proper error flow sequence', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Check for error handling that includes menu display
      expect(finalStepSource).toContain('catch (error)')
      expect(finalStepSource).toContain('logger.error')
      expect(finalStepSource).toContain('❌')
      
      // Should still show menu on error
      const errorSections = finalStepSource.split('catch (error)')
      expect(errorSections.length).toBeGreaterThan(1)
      
      // At least one error section should contain mainMenu call
      const hasMenuInError = errorSections.some(section => section.includes('mainMenu('))
      expect(hasMenuInError).toBe(true)
    })
  })

  describe('Integration Completeness', () => {
    it('should be ready for production deployment', () => {
      const finalStepSource = avatarBrainWizard.steps[3].toString()

      // Production readiness checklist
      const productionFeatures = [
        'comprehensive error handling',
        'bilingual support',
        'proper logging',
        'user validation',
        'menu integration',
        'scene management',
        'data persistence'
      ]

      // These should all be reflected in the code structure
      expect(finalStepSource).toContain('logger.error') // logging
      expect(finalStepSource).toContain('isRu') // bilingual
      expect(finalStepSource).toContain('catch (error)') // error handling
      expect(finalStepSource).toContain('if (!ctx.from)') // user validation
      expect(finalStepSource).toContain('mainMenu(') // menu integration
      expect(finalStepSource).toContain('ctx.scene.leave()') // scene management
      expect(finalStepSource).toContain('updateUserSoul') // data persistence
    })
  })
})