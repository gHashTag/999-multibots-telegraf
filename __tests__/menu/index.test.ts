// Test that menu module exports all required functions
import * as menu from '../../src/menu'

describe('menu index exports', () => {
  it('should export all menu builder and send functions', () => {
    const expectedExports = [
      'mainMenu',
      'imageModelMenu',
      'startMenu',
      'videoModelKeyboard',
      'cancelMenu',
      'getStepSelectionMenu',
      'getStepSelectionMenuV2',
      'sendGenerationCancelledMessage',
      'sendGenerationErrorMessage',
      'sendPromptImprovementFailureMessage',
      'sendPromptImprovementMessage',
      'sendGenericErrorMessage',
      'sendPhotoDescriptionRequest',
      'createHelpCancelKeyboard',
      'cancelHelpArray',
      'createGenerateImageKeyboard',
    ]
    for (const key of expectedExports) {
      expect(typeof (menu as any)[key]).toBe('function')
    }
  })
})
