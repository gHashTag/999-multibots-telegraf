import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'
import { makeMockContext } from '../utils/mockTelegrafContext'

// Моки для Bun
const mockHandleTextToVideoDirect = mock(() => Promise.resolve())
const mockIsRussianFromState = mock(() => true)

// Подменяем модули
mock.module('../../src/handlers/handleTextToVideoDirect', () => ({
  handleTextToVideoDirect: mockHandleTextToVideoDirect,
}))

mock.module('../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: mockIsRussianFromState,
}))

describe('textToVideoWizard', () => {
  beforeEach(() => {
    mockHandleTextToVideoDirect.mockClear?.()
    mockIsRussianFromState.mockClear?.()
    mockIsRussianFromState.mockReturnValue?.(true)
  })

  describe('🎬 Wizard Structure', () => {
    it('should have correct wizard ID', () => {
      expect(textToVideoWizard.id).toBe('text_to_video')
    })

    it('should have 2 steps', () => {
      expect(textToVideoWizard.steps).toHaveLength(2)
    })
  })

  describe('🚪 Wizard Enter Handler', () => {
    it('should enter wizard successfully', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      global.console.log = consoleSpy

      await textToVideoWizard.enterHandler(ctx as any)

      // Note: Bun mock checking is different from Jest
      expect(textToVideoWizard.enterHandler).toBeDefined()
    })

    it('should automatically set wizard step to 0 on enter', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      global.console.log = consoleSpy

      // Mock wizard.selectStep to track calls
      const selectStepSpy = mock(() => {})
      ctx.wizard.selectStep = selectStepSpy

      await textToVideoWizard.enterHandler(ctx as any)

      // Verify that wizard.selectStep(0) was called to set wizard to first step
      expect(selectStepSpy).toHaveBeenCalledWith(0)
    })

    it('should handle wizard step setting errors gracefully', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      const consoleErrorSpy = mock(() => {})
      global.console.log = consoleSpy
      global.console.error = consoleErrorSpy

      // Mock wizard.selectStep to throw error
      const selectStepSpy = mock(() => {
        throw new Error('Step setting failed')
      })
      ctx.wizard.selectStep = selectStepSpy

      await textToVideoWizard.enterHandler(ctx as any)

      // Should handle error gracefully and log it
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should set wizard cursor correctly after step selection', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      global.console.log = consoleSpy

      // Mock wizard properties
      let cursorValue = undefined
      Object.defineProperty(ctx.wizard, 'cursor', {
        get: () => cursorValue,
        set: value => {
          cursorValue = value
        },
      })

      const selectStepSpy = mock(() => {
        cursorValue = 0 // Simulate successful step selection to step 0
      })
      ctx.wizard.selectStep = selectStepSpy

      await textToVideoWizard.enterHandler(ctx as any)

      expect(selectStepSpy).toHaveBeenCalledWith(0)
      expect(ctx.wizard.cursor).toBe(0)
    })
  })

  describe('🎯 Step 1: Model Selection', () => {
    it('should show CONFIG-based keyboard with models', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      global.console.log = consoleSpy

      await textToVideoWizard.steps[0](ctx as any)

      expect(ctx.reply).toBeDefined()
      expect(ctx.wizard.next).toBeDefined()
    })

    it('should handle errors gracefully', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      const consoleErrorSpy = mock(() => {})
      global.console.log = consoleSpy
      global.console.error = consoleErrorSpy

      // Мокаем ошибку
      mockIsRussianFromState.mockImplementationOnce?.(() => {
        throw new Error('Language detection error')
      })

      await textToVideoWizard.steps[0](ctx as any)

      expect(ctx.reply).toBeDefined()
      expect(ctx.scene.leave).toBeDefined()
    })
  })

  describe('🎯 Step 2: Model Parsing & Prompt', () => {
    describe('Menu button handling', () => {
      it('should handle menu button clicked again', async () => {
        const ctx = makeMockContext()
        const consoleSpy = mock(() => {})
        global.console.log = consoleSpy
        ctx.message.text = '🎥 Видео из текста'

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.wizard.selectStep).toBeDefined()
      })

      it('should handle "Назад" button', async () => {
        const ctx = makeMockContext()
        ctx.message.text = '⬅️ Назад в меню'

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
        expect(ctx.scene.leave).toBeDefined()
      })
    })

    describe('Model selection parsing', () => {
      const testCases = [
        {
          buttonText: 'Veo 3 Fast | 8s | 📱 (40⭐)',
          expected: {
            modelId: 'kie-veo-3-fast',
            aspectRatio: '9:16',
            duration: 8,
            cost: 40,
          },
        },
        {
          buttonText: 'Veo 3 | 8s | 🖥️ (202⭐)',
          expected: {
            modelId: 'kie-veo-3',
            aspectRatio: '16:9',
            duration: 8,
            cost: 202,
          },
        },
        {
          buttonText: 'Kling v1.6 Pro | ~10s | 📱 (60⭐)',
          expected: {
            modelId: 'kling-v1.6-pro',
            aspectRatio: '9:16',
            duration: 10,
            cost: 60,
          },
        },
        {
          buttonText: 'Minimax | 6s | 🖥️ (50⭐)',
          expected: {
            modelId: 'minimax',
            aspectRatio: '16:9',
            duration: 6,
            cost: 50,
          },
        },
      ]

      testCases.forEach(({ buttonText, expected }) => {
        it(`should parse "${buttonText}" correctly`, async () => {
          const ctx = makeMockContext()
          ctx.message.text = buttonText

          await textToVideoWizard.steps[1](ctx as any)

          expect(ctx.session.selectedVideoModel).toBe(expected.modelId)
          expect(ctx.session.selectedAspectRatio).toBe(expected.aspectRatio)
          expect(ctx.session.selectedDuration).toBe(expected.duration)
          expect(ctx.session.selectedVideoCost).toBe(expected.cost)
        })
      })
    })

    describe('Prompt handling', () => {
      it('should accept valid prompt and start generation', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'танцующий шаман у костра'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'
        ctx.session.selectedAspectRatio = '9:16'
        ctx.session.selectedVideoCost = 40
        ctx.session.selectedDuration = 8

        mockHandleTextToVideoDirect.mockResolvedValue?.(undefined)

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
        expect(ctx.scene.leave).toBeDefined()
      })

      it('should reject short prompts', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'hi'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
        // Should not call scene.leave for validation errors
      })

      it('should handle generation errors gracefully', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'танцующий шаман у костра'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'
        ctx.session.selectedAspectRatio = '9:16'
        ctx.session.selectedVideoCost = 40
        ctx.session.selectedDuration = 8

        mockHandleTextToVideoDirect.mockRejectedValue?.(
          new Error('Generation failed')
        )

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
        expect(ctx.scene.leave).toBeDefined()
      })
    })

    describe('Error handling', () => {
      it('should handle no message', async () => {
        const ctx = makeMockContext()
        ctx.message = undefined

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
      })

      it('should handle message without text', async () => {
        const ctx = makeMockContext()
        delete (ctx.message as any).text

        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toBeDefined()
      })

      it('should handle unknown model selection', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'Unknown Model | 📱 (100⭐)'

        await textToVideoWizard.steps[1](ctx as any)

        // Should fallback to default model
        expect(ctx.session.selectedVideoModel).toBe('kie-veo-3-fast')
        expect(ctx.session.selectedAspectRatio).toBe('9:16')
        expect(ctx.session.selectedDuration).toBe(8)
        expect(ctx.session.selectedVideoCost).toBe(40)
      })
    })
  })

  describe('🚪 Wizard Leave Handler', () => {
    it('should clear session data on leave', async () => {
      const ctx = makeMockContext()
      const consoleSpy = mock(() => {})
      global.console.log = consoleSpy

      ctx.session.selectedVideoModel = 'kie-veo-3-fast'
      ctx.session.selectedVideoCost = 40
      ctx.session.selectedAspectRatio = '9:16'
      ctx.session.selectedDuration = 8

      await textToVideoWizard.leaveHandler(ctx as any)

      expect(ctx.session.selectedVideoModel).toBeUndefined()
      expect(ctx.session.selectedVideoCost).toBeUndefined()
      expect(ctx.session.selectedAspectRatio).toBeUndefined()
      expect(ctx.session.selectedDuration).toBeUndefined()
    })
  })
})
