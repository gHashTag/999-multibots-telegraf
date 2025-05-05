import { describe, it, expect, vi } from 'vitest'
import { MyContext } from '@/interfaces'
import { TextToVideoWizardDependencies } from '../interfaces/TextToVideoWizardDependencies'
import { processTextToVideoWizardStep } from '../services/textToVideoWizardService'

describe('TextToVideoWizard Module', () => {
  it('should initialize processTextToVideoWizardStep correctly', async () => {
    // Arrange
    const mockCtx = {
      message: { text: 'Test prompt' },
      session: { videoModel: 'modelKey' },
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      scene: { leave: vi.fn() },
    } as unknown as MyContext

    const mockDependencies: TextToVideoWizardDependencies = {
      calculateFinalPrice: vi.fn(() => 10),
      getUserBalance: vi.fn(() => Promise.resolve(20)),
      generateTextToVideo: vi.fn(() => Promise.resolve()),
      sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
      videoModelKeyboard: vi.fn(() => ({ reply_markup: {} })),
      isRussian: vi.fn(() => true),
    }

    // Act
    await processTextToVideoWizardStep(mockCtx, mockDependencies)

    // Assert
    expect(mockDependencies.generateTextToVideo).toHaveBeenCalledWith(
      'Test prompt',
      '123',
      'testUser',
      true,
      'testBot'
    )
    expect(mockCtx.session.prompt).toBe('Test prompt')
    expect(mockCtx.scene.leave).toHaveBeenCalled()
  })
})
